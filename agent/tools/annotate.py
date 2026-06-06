import io
import json
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor

from PIL import Image
from google.cloud import storage
from google import genai
from google.genai import types

from .cache import _raw_annotations

_mongo_db = None


def _get_db():
    global _mongo_db
    if _mongo_db is None:
        from pymongo import MongoClient
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            return None
        _mongo_db = MongoClient(uri, serverSelectionTimeoutMS=4000)["visionforge"]
    return _mongo_db


def _annotation_prompt(width: int, height: int, subject: str) -> str:
    return f"""You are annotating images for a computer vision dataset about "{subject}".

The image is exactly {width}×{height} pixels. All bbox coordinates must use this pixel space:
  x ranges from 0 to {width}, y ranges from 0 to {height}.

Find ALL clearly visible instances of "{subject}" in this image and draw a tight bounding box around each one.

Return ONLY a JSON array — no explanation, no markdown:
[
  {{
    "class_name": "{subject}",
    "bbox": {{"x": left_pixel, "y": top_pixel, "w": width_pixels, "h": height_pixels}},
    "confidence": <float 0.0-1.0>
  }}
]

Rules:
- class_name MUST always be exactly "{subject}" — never use sub-classes, parts, or variations (e.g. for "chess piece" do NOT write "knight" or "rook"; for "cat" do NOT write "cat paw").
- Include every clearly visible instance, even if multiples appear in one image.
- Each bbox must be tight around the full object instance.
- x + w must not exceed {width}. y + h must not exceed {height}.
- Only include instances with confidence >= 0.5.
- If no instance of "{subject}" is present, return an empty array: []"""

# Module-level singletons — created once to avoid async cleanup errors
_gemini_client: genai.Client | None = None
_gcs_client: storage.Client | None = None


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
        )
    return _gemini_client


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def annotate_image(job_id: str, image_id: str, gcs_uri: str, query: str = "") -> dict:
    """Send an image to Gemini Vision to detect object instances with bounding boxes.

    Args:
        job_id: The pipeline job this image belongs to.
        image_id: The MongoDB document ID for this image.
        gcs_uri: GCS URI of the image, e.g. gs://visionforge-raw/job_id/uuid.jpg.
        query: The dataset subject (e.g. "chess piece"). Used to constrain class names
            so Gemini only labels the target object, never sub-parts or variations.

    Returns:
        A dict with status and an annotations list. Each annotation has annotation_id,
        class_name, bbox (x/y/w/h pixel coordinates), and confidence.
        Returns status 'skipped' with empty annotations list if no objects found.
    """
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")

    try:
        gcs = _get_gcs_client()
        bucket_name = gcs_uri[len("gs://"):].split("/")[0]
        blob_path = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
        img_bytes = gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
        img = Image.open(io.BytesIO(img_bytes))
        width, height = img.size
    except Exception as e:
        return {
            "status": "error",
            "job_id": job_id,
            "image_id": image_id,
            "annotations": [],
            "message": f"GCS download failed: {e}",
        }

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                _annotation_prompt(width, height, query or "object"),
            ],
        )
        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
        result = json.loads(text)
    except json.JSONDecodeError:
        return {
            "status": "error",
            "job_id": job_id,
            "image_id": image_id,
            "annotations": [],
            "message": "Gemini returned non-JSON response",
        }
    except Exception as e:
        return {
            "status": "error",
            "job_id": job_id,
            "image_id": image_id,
            "annotations": [],
            "message": str(e),
        }

    # Gemini should return a list; handle the case where it returns a single object
    if isinstance(result, dict):
        result = [result] if result.get("class_name") else []

    annotations = []
    for item in result:
        if not item.get("class_name"):
            continue
        raw_bbox = item.get("bbox")
        if isinstance(raw_bbox, list) and len(raw_bbox) >= 4:
            raw_bbox = {"x": raw_bbox[0], "y": raw_bbox[1], "w": raw_bbox[2], "h": raw_bbox[3]}
        elif not isinstance(raw_bbox, dict):
            raw_bbox = None
        annotations.append({
            "annotation_id": str(uuid.uuid4()),
            "image_id": image_id,
            "gcs_uri": gcs_uri,
            "class_name": item["class_name"],
            "bbox": raw_bbox,
            "confidence": item.get("confidence", 0),
        })

    if not annotations:
        return {
            "status": "skipped",
            "job_id": job_id,
            "image_id": image_id,
            "width": width,
            "height": height,
            "annotations": [],
            "message": "No objects detected",
        }

    return {
        "status": "ok",
        "job_id": job_id,
        "image_id": image_id,
        "width": width,
        "height": height,
        "annotations": annotations,
    }


def annotate_images(job_id: str, images: list, query: str = "") -> dict:
    """Annotate a batch of images in parallel using Gemini Vision.

    Args:
        job_id: The pipeline job this batch belongs to.
        images: List of image dicts from search_images, each containing
            image_id and gcs_uri.
        query: The dataset subject (e.g. "chess piece"). Constrains Gemini to only
            label the target object — no sub-classes or parts.

    Returns:
        A dict with processed count and skipped count. Annotations are cached
        internally and read automatically by validate_annotations.
    """
    uri_by_id = {img["image_id"]: img["gcs_uri"] for img in images}

    def _one(img: dict) -> dict:
        return annotate_image(job_id, img["image_id"], img["gcs_uri"], query)

    all_annotations: list = []
    image_docs: list = []
    skipped = 0

    with ThreadPoolExecutor(max_workers=10) as executor:
        for result in executor.map(_one, images):
            image_docs.append({
                "image_id": result["image_id"],
                "job_id": job_id,
                "gcs_uri": uri_by_id.get(result["image_id"], ""),
                "width": result.get("width", 0),
                "height": result.get("height", 0),
                "status": "annotated",
            })
            if result["status"] == "ok":
                all_annotations.extend(result["annotations"])
            else:
                skipped += 1

    # Store annotations in process-level cache so validate_annotations can read
    # them without the agent having to pass the full list through the model context.
    _raw_annotations[job_id] = all_annotations

    # Write image records to MongoDB directly so the agent doesn't have to
    # generate a large insert-many payload.
    try:
        db = _get_db()
        if db is not None and image_docs:
            db["images"].insert_many(image_docs, ordered=False)
    except Exception:
        pass

    return {
        "status": "ok",
        "job_id": job_id,
        "processed": len(images),
        "skipped": skipped,
        "annotation_count": len(all_annotations),
        # all_annotations intentionally omitted — agent reads via job_id in next steps
    }
