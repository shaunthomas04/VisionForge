import io
import os

import imagehash
from google.cloud import storage
from PIL import Image


_gcs_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def deduplicate(
    job_id: str,
    image_records: list | None = None,
    hamming_threshold: int = 8,
) -> dict:
    """Remove near-duplicate images from a job using perceptual hashing.

    Computes a pHash for each validated image and removes duplicates within
    the job. When duplicates are found, the highest-resolution copy is kept.

    Args:
        job_id: The pipeline job to deduplicate.
        image_records: List of image dicts from search_images, each containing
            image_id, gcs_uri, width, and height.
        hamming_threshold: Maximum Hamming distance to consider two images
            duplicates. Lower = stricter. Default 8 works well in practice.

    Returns:
        A dict with kept count, removed count, and list of kept image records.
    """
    # Normalize: agent may pass the full search_images response dict instead of the list
    if isinstance(image_records, dict):
        image_records = (
            image_records.get("images")
            or image_records.get("kept_records")
            or []
        )
    if not image_records:
        return {
            "status": "ok",
            "job_id": job_id,
            "kept": 0,
            "removed": 0,
            "removed_ids": [],
            "kept_records": [],
            "message": "No image records provided — pass image_records from search_images result.",
        }

    gcs = _get_gcs_client()
    hashes: list[tuple] = []  # (phash, image_record)

    for record in image_records:
        gcs_uri = record.get("gcs_uri", "")
        try:
            bucket_name = gcs_uri[len("gs://"):].split("/")[0]
            blob_path = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
            img_bytes = gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            phash = imagehash.phash(img)
            hashes.append((phash, record))
        except Exception:
            continue

    kept: list[dict] = []
    removed_ids: list[str] = []
    used: set[int] = set()

    for i, (hash_i, record_i) in enumerate(hashes):
        if i in used:
            continue
        duplicates = [i]
        for j, (hash_j, _) in enumerate(hashes):
            if j != i and j not in used and abs(hash_i - hash_j) < hamming_threshold:
                duplicates.append(j)
        # Keep highest resolution copy
        best = max(duplicates, key=lambda idx: hashes[idx][1].get("width", 0) * hashes[idx][1].get("height", 0))
        for idx in duplicates:
            used.add(idx)
            if idx == best:
                kept.append(hashes[idx][1])
            else:
                removed_ids.append(hashes[idx][1].get("image_id", ""))

    return {
        "status": "ok",
        "job_id": job_id,
        "kept": len(kept),
        "removed": len(removed_ids),
        "kept_image_ids": [r.get("image_id", "") for r in kept],
    }
