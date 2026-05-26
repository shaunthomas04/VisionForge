import io
import json
import os
import re
import uuid

from google.cloud import storage
from google import genai
from google.genai import types


_ANNOTATION_PROMPT = """Analyze this image and identify ALL distinct object instances that could be useful in a computer vision dataset.

Return ONLY a JSON array — no explanation, no markdown:
[
  {{
    "class_name": "snake_case category name (e.g. gaming_mouse, coffee_cup)",
    "bbox": {{"x": left_pixel, "y": top_pixel, "w": width_pixels, "h": height_pixels}},
    "confidence": <float 0.0-1.0>,
    "description": "one sentence describing this specific instance"
  }}
]

Rules:
- Include every clearly visible instance, even if multiple of the same class appear.
- Each bbox must be tight around that specific instance, in pixel coordinates relative to the full image.
- Only include objects with confidence >= 0.5.
- If no clear objects are present, return an empty array: []"""

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


def annotate_image(job_id: str, image_id: str, gcs_uri: str) -> dict:
    """Send an image to Gemini Vision to detect all object instances with bounding boxes.

    Args:
        job_id: The pipeline job this image belongs to.
        image_id: The MongoDB document ID for this image.
        gcs_uri: GCS URI of the image, e.g. gs://visionforge-raw/job_id/uuid.jpg.

    Returns:
        A dict with status and an annotations list. Each annotation has annotation_id,
        class_name, bbox (x/y/w/h pixel coordinates), confidence, and description.
        Multiple annotations are returned when multiple instances appear in the image.
        Returns status 'skipped' with empty annotations list if no objects found.
    """
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")

    try:
        gcs = _get_gcs_client()
        bucket_name = gcs_uri[len("gs://"):].split("/")[0]
        blob_path = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
        img_bytes = gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
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
                _ANNOTATION_PROMPT,
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
        annotations.append({
            "annotation_id": str(uuid.uuid4()),
            "job_id": job_id,
            "image_id": image_id,
            "gcs_uri": gcs_uri,
            "class_name": item["class_name"],
            "bbox": item.get("bbox"),
            "confidence": item.get("confidence", 0),
            "description": item.get("description", ""),
        })

    if not annotations:
        return {
            "status": "skipped",
            "job_id": job_id,
            "image_id": image_id,
            "annotations": [],
            "message": "No objects detected",
        }

    return {
        "status": "ok",
        "job_id": job_id,
        "image_id": image_id,
        "annotations": annotations,
    }
