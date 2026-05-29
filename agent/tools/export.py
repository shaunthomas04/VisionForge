import io
import json
import math
import os
import uuid
import zipfile

import requests
from google.cloud import storage


_gcs_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def _split(items: list, train=0.8, val=0.1) -> tuple[list, list, list]:
    n = len(items)
    n_train = math.floor(n * train)
    n_val = math.floor(n * val)
    return items[:n_train], items[n_train:n_train + n_val], items[n_train + n_val:]


def _download_image(gcs_uri: str, gcs: storage.Client) -> bytes | None:
    try:
        bucket_name = gcs_uri[len("gs://"):].split("/")[0]
        blob_path = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
        return gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
    except Exception:
        return None


def _build_yolo_zip(annotations: list, class_names: list) -> bytes:
    buf = io.BytesIO()
    gcs = _get_gcs_client()
    train, val, test = _split(annotations)

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # data.yaml
        yaml_lines = [
            f"nc: {len(class_names)}",
            f"names: {class_names}",
            "train: images/train",
            "val: images/val",
            "test: images/test",
        ]
        zf.writestr("data.yaml", "\n".join(yaml_lines))

        for split_name, split_items in [("train", train), ("val", val), ("test", test)]:
            for ann in split_items:
                image_id = ann.get("image_id", str(uuid.uuid4()))
                gcs_uri = ann.get("gcs_uri", "")
                class_name = ann.get("class_name", "object")
                bbox = ann.get("bbox") or {}
                width = ann.get("width", 1)
                height = ann.get("height", 1)

                class_idx = class_names.index(class_name) if class_name in class_names else 0

                # Normalize bbox to YOLO format (cx, cy, w, h) 0-1
                x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", width), bbox.get("h", height)
                cx = (x + w / 2) / width
                cy = (y + h / 2) / height
                nw = w / width
                nh = h / height
                cx, cy, nw, nh = (max(0, min(1, v)) for v in (cx, cy, nw, nh))

                label_line = f"{class_idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}"
                zf.writestr(f"labels/{split_name}/{image_id}.txt", label_line)

                img_bytes = _download_image(gcs_uri, gcs)
                if img_bytes:
                    zf.writestr(f"images/{split_name}/{image_id}.jpg", img_bytes)

    buf.seek(0)
    return buf.read()


def _build_coco_zip(annotations: list, class_names: list) -> bytes:
    buf = io.BytesIO()
    gcs = _get_gcs_client()
    train, val, test = _split(annotations)

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        categories = [{"id": i, "name": name, "supercategory": "object"}
                      for i, name in enumerate(class_names)]

        for split_name, split_items in [("train", train), ("val", val), ("test", test)]:
            coco_images, coco_annotations = [], []
            ann_id = 1

            for img_idx, ann in enumerate(split_items):
                image_id = ann.get("image_id", str(uuid.uuid4()))
                gcs_uri = ann.get("gcs_uri", "")
                class_name = ann.get("class_name", "object")
                bbox = ann.get("bbox") or {}
                width = ann.get("width", 640)
                height = ann.get("height", 480)

                class_idx = class_names.index(class_name) if class_name in class_names else 0
                x = bbox.get("x", 0)
                y = bbox.get("y", 0)
                w = bbox.get("w", width)
                h = bbox.get("h", height)

                coco_images.append({
                    "id": img_idx,
                    "file_name": f"{image_id}.jpg",
                    "width": width,
                    "height": height,
                })
                coco_annotations.append({
                    "id": ann_id,
                    "image_id": img_idx,
                    "category_id": class_idx,
                    "bbox": [x, y, w, h],
                    "area": w * h,
                    "iscrowd": 0,
                })
                ann_id += 1

                img_bytes = _download_image(gcs_uri, gcs)
                if img_bytes:
                    zf.writestr(f"images/{split_name}/{image_id}.jpg", img_bytes)

            coco_json = {
                "images": coco_images,
                "annotations": coco_annotations,
                "categories": categories,
            }
            zf.writestr(f"annotations/{split_name}.json", json.dumps(coco_json, indent=2))

    buf.seek(0)
    return buf.read()


def export_dataset(
    job_id: str,
    annotations: list | None = None,
    formats: list[str] | None = None,
    target_count: int | None = None,
) -> dict:
    """Export the validated dataset as YOLO and/or COCO format zip archives in GCS.

    Args:
        job_id: The pipeline job to export.
        annotations: List of validated annotation dicts from validate_annotations,
            each containing image_id, gcs_uri, class_name, bbox (x/y/w/h pixels),
            width, height, confidence.
        formats: List of export formats. Supported: 'yolo', 'coco'. Defaults to both.
        target_count: If set, keep only the top N annotations by confidence so the
            final dataset matches the user's requested size exactly.

    Returns:
        A dict with image_count, class_counts, split sizes, and GCS URIs for each format.
    """
    if formats is None:
        formats = ["yolo", "coco"]
    # Normalize: agent may pass the full validate_annotations response dict instead of the list
    if isinstance(annotations, dict):
        annotations = (
            annotations.get("validated_annotations")
            or annotations.get("annotations")
            or []
        )
    if not annotations:
        return {
            "status": "error",
            "job_id": job_id,
            "message": "No annotations provided. Pass the validated annotation list from previous steps.",
        }

    # Cap to target_count, keeping highest-confidence annotations
    if target_count and len(annotations) > target_count:
        annotations = sorted(annotations, key=lambda a: a.get("confidence", 0), reverse=True)[:target_count]

    gcs = _get_gcs_client()
    export_bucket = os.environ.get("GCS_BUCKET_EXPORTS", "visionforge-exports")
    version = 1

    # Collect unique class names
    class_names = sorted({ann.get("class_name", "object") for ann in annotations if ann.get("class_name")})
    if not class_names:
        class_names = ["object"]

    train, val, test = _split(annotations)
    exports = {}

    for fmt in formats:
        try:
            if fmt == "yolo":
                zip_bytes = _build_yolo_zip(annotations, class_names)
            elif fmt == "coco":
                zip_bytes = _build_coco_zip(annotations, class_names)
            else:
                continue

            gcs_path = f"{job_id}/v{version}/{fmt}.zip"
            blob = gcs.bucket(export_bucket).blob(gcs_path)
            blob.upload_from_string(zip_bytes, content_type="application/zip")
            exports[fmt] = f"gs://{export_bucket}/{gcs_path}"
        except Exception as e:
            exports[fmt] = f"error: {e}"

    class_counts = {}
    for ann in annotations:
        cn = ann.get("class_name", "object")
        class_counts[cn] = class_counts.get(cn, 0) + 1

    return {
        "status": "ok",
        "job_id": job_id,
        "version": version,
        "image_count": len(annotations),
        "class_counts": class_counts,
        "splits": {"train": len(train), "val": len(val), "test": len(test)},
        "exports": exports,
    }
