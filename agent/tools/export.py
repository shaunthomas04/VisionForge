import io
import json
import math
import os
import zipfile
from collections import defaultdict

from google.cloud import storage

from .cache import _validated_annotations


_gcs_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def _split(items: list, train=0.8, val=0.1) -> tuple[list, list, list]:
    n = len(items)
    n_train = math.floor(n * train)
    n_val   = math.floor(n * val)
    return items[:n_train], items[n_train:n_train + n_val], items[n_train + n_val:]


def _download_image(gcs_uri: str, gcs: storage.Client) -> bytes | None:
    try:
        bucket_name = gcs_uri[len("gs://"):].split("/")[0]
        blob_path   = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
        return gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
    except Exception:
        return None


def _build_yolo_zip(
    images_map: dict[str, list],
    train_ids: list, val_ids: list, test_ids: list,
    class_names: list,
    gcs: storage.Client,
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        yaml_lines = [
            f"nc: {len(class_names)}",
            f"names: {class_names}",
            "train: images/train",
            "val:   images/val",
            "test:  images/test",
        ]
        zf.writestr("data.yaml", "\n".join(yaml_lines))

        for split_name, iids in [("train", train_ids), ("val", val_ids), ("test", test_ids)]:
            for image_id in iids:
                anns   = images_map[image_id]
                first  = anns[0]
                gcs_uri = first.get("gcs_uri", "")
                width  = first.get("width", 1) or 1
                height = first.get("height", 1) or 1

                # One label file per image containing ALL bboxes
                label_lines = []
                for ann in anns:
                    cn  = ann.get("class_name", "object")
                    idx = class_names.index(cn) if cn in class_names else 0
                    bbox = ann.get("bbox") or {}
                    x, y, w, h = (
                        bbox.get("x", 0), bbox.get("y", 0),
                        bbox.get("w", width), bbox.get("h", height),
                    )
                    cx = (x + w / 2) / width
                    cy = (y + h / 2) / height
                    nw = w / width
                    nh = h / height
                    cx, cy, nw, nh = (max(0.0, min(1.0, v)) for v in (cx, cy, nw, nh))
                    label_lines.append(f"{idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

                zf.writestr(f"labels/{split_name}/{image_id}.txt", "\n".join(label_lines))
                img_bytes = _download_image(gcs_uri, gcs)
                if img_bytes:
                    zf.writestr(f"images/{split_name}/{image_id}.jpg", img_bytes)

    buf.seek(0)
    return buf.read()


def _build_coco_zip(
    images_map: dict[str, list],
    train_ids: list, val_ids: list, test_ids: list,
    class_names: list,
    gcs: storage.Client,
) -> bytes:
    buf = io.BytesIO()
    categories = [
        {"id": i, "name": name, "supercategory": "object"}
        for i, name in enumerate(class_names)
    ]

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for split_name, iids in [("train", train_ids), ("val", val_ids), ("test", test_ids)]:
            coco_images, coco_annotations = [], []
            ann_id = 1

            for img_idx, image_id in enumerate(iids):
                anns   = images_map[image_id]
                first  = anns[0]
                gcs_uri = first.get("gcs_uri", "")
                width  = first.get("width", 640) or 640
                height = first.get("height", 480) or 480

                coco_images.append({
                    "id":        img_idx,
                    "file_name": f"{image_id}.jpg",
                    "width":     width,
                    "height":    height,
                })

                for ann in anns:
                    cn  = ann.get("class_name", "object")
                    idx = class_names.index(cn) if cn in class_names else 0
                    bbox = ann.get("bbox") or {}
                    x = bbox.get("x", 0)
                    y = bbox.get("y", 0)
                    w = bbox.get("w", width)
                    h = bbox.get("h", height)
                    coco_annotations.append({
                        "id":          ann_id,
                        "image_id":    img_idx,
                        "category_id": idx,
                        "bbox":        [x, y, w, h],
                        "area":        w * h,
                        "iscrowd":     0,
                    })
                    ann_id += 1

                img_bytes = _download_image(gcs_uri, gcs)
                if img_bytes:
                    zf.writestr(f"images/{split_name}/{image_id}.jpg", img_bytes)

            zf.writestr(
                f"annotations/{split_name}.json",
                json.dumps({"images": coco_images, "annotations": coco_annotations, "categories": categories}, indent=2),
            )

    buf.seek(0)
    return buf.read()


def export_dataset(
    job_id: str,
    formats: list[str] | None = None,
    target_count: int | None = None,
    query: str = "",
    kept_image_ids: list[str] | None = None,
) -> dict:
    """Export the validated dataset as YOLO and/or COCO format zip archives in GCS.

    Reads validated annotations from the in-process cache written by validate_annotations.
    All splitting and counting is IMAGE-centric: target_count means N images, splits are
    by image count, and each image's label file contains all its bounding boxes.

    Args:
        job_id: The pipeline job to export.
        formats: Export formats — 'yolo', 'coco'. Defaults to both.
        target_count: Maximum number of IMAGES to include (not annotations).
        query: Original search query — used to generate the dataset name.
        kept_image_ids: Image IDs surviving deduplication (from deduplicate tool).

    Returns:
        A dict with name, image_count, class_counts, splits (by image), and GCS URIs.
    """
    if formats is None:
        formats = ["yolo", "coco"]

    annotations = _validated_annotations.get(job_id, [])

    # Fallback: if cache is empty (e.g. server restarted mid-job), read from MongoDB
    if not annotations:
        try:
            from pymongo import MongoClient
            uri = os.environ.get("MONGODB_URI")
            if uri:
                db = MongoClient(uri, serverSelectionTimeoutMS=4000)["visionforge"]
                docs = list(db["annotations"].find(
                    {"job_id": job_id, "validated": True},
                    {"_id": 0, "annotation_id": 1, "image_id": 1, "job_id": 1,
                     "class_name": 1, "bbox": 1, "confidence": 1},
                ))
                if docs:
                    annotations = docs
        except Exception:
            pass

    if not annotations:
        return {
            "status": "error",
            "job_id": job_id,
            "message": "No validated annotations found in cache or MongoDB for this job.",
        }

    # Group annotations by image_id
    images_map: dict[str, list] = defaultdict(list)
    for ann in annotations:
        iid = ann.get("image_id")
        if iid:
            images_map[iid].append(ann)

    # Filter to deduplicated images
    if kept_image_ids:
        kept_set = set(kept_image_ids)
        images_map = {k: v for k, v in images_map.items() if k in kept_set}

    # Sort images by best annotation confidence, then cap to target_count IMAGES
    image_ids_sorted = sorted(
        images_map.keys(),
        key=lambda iid: max((a.get("confidence", 0) for a in images_map[iid]), default=0),
        reverse=True,
    )
    if target_count and len(image_ids_sorted) > target_count:
        image_ids_sorted = image_ids_sorted[:target_count]
        images_map = {k: images_map[k] for k in image_ids_sorted}

    if not image_ids_sorted:
        return {
            "status": "error",
            "job_id": job_id,
            "message": "No images remain after filtering.",
        }

    # Dataset name — generated server-side so the model can't hallucinate
    title      = " ".join(w.capitalize() for w in query.split()) if query else "Dataset"
    hash_id    = job_id.split("-")[0]
    dataset_name = f"{title} Dataset-{hash_id}"

    # class_counts across all selected images
    class_counts: dict[str, int] = {}
    for iid in image_ids_sorted:
        for ann in images_map[iid]:
            cn = ann.get("class_name", "object")
            class_counts[cn] = class_counts.get(cn, 0) + 1

    class_names = sorted(class_counts.keys()) or ["object"]

    # Split by IMAGE, not by annotation
    train_ids, val_ids, test_ids = _split(image_ids_sorted)

    gcs = _get_gcs_client()
    export_bucket = os.environ.get("GCS_BUCKET_EXPORTS", "visionforge-exports")
    version = 1
    exports = {}

    for fmt in formats:
        try:
            if fmt == "yolo":
                zip_bytes = _build_yolo_zip(images_map, train_ids, val_ids, test_ids, class_names, gcs)
            elif fmt == "coco":
                zip_bytes = _build_coco_zip(images_map, train_ids, val_ids, test_ids, class_names, gcs)
            else:
                continue
            gcs_path = f"{job_id}/v{version}/{fmt}.zip"
            gcs.bucket(export_bucket).blob(gcs_path).upload_from_string(zip_bytes, content_type="application/zip")
            exports[fmt] = f"gs://{export_bucket}/{gcs_path}"
        except Exception as e:
            exports[fmt] = f"error: {e}"

    return {
        "status": "ok",
        "job_id": job_id,
        "name":        dataset_name,
        "version":     version,
        "image_count": len(image_ids_sorted),
        "image_ids":   image_ids_sorted,
        "class_counts": class_counts,
        "splits": {
            "train": len(train_ids),
            "val":   len(val_ids),
            "test":  len(test_ids),
        },
        "exports": exports,
    }
