import io
import json
import os
import re
import uuid

from google.cloud import storage
from google import genai
from google.genai import types


_ANNOTATION_PROMPT = """Analyze this image and identify the single most prominent object.

Return ONLY a JSON object with exactly these fields — no explanation, no markdown:
{{
  "class_name": "snake_case category name (e.g. gaming_mouse, coffee_cup)",
  "bbox": {{"x": left_pixel, "y": top_pixel, "w": width_pixels, "h": height_pixels}},
  "confidence": <float 0.0-1.0>,
  "description": "one sentence describing the object"
}}

The bbox must be in pixel coordinates relative to the full image dimensions.
If no clear object is present, return: {{"class_name": null, "confidence": 0}}"""

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
    """Send an image to Gemini Vision to generate a bounding box and class label.

    Args:
        job_id: The pipeline job this image belongs to.
        image_id: The MongoDB document ID for this image.
        gcs_uri: GCS URI of the image, e.g. gs://visionforge-raw/job_id/uuid.jpg.

    Returns:
        A dict with annotation_id, class_name, bbox coordinates, confidence,
        and status. Returns status 'skipped' if Gemini finds no object.
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
            "annotation_id": None,
            "job_id": job_id,
            "image_id": image_id,
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
            "annotation_id": None,
            "job_id": job_id,
            "image_id": image_id,
            "message": "Gemini returned non-JSON response",
        }
    except Exception as e:
        return {
            "status": "error",
            "annotation_id": None,
            "job_id": job_id,
            "image_id": image_id,
            "message": str(e),
        }

    if not result.get("class_name"):
        return {
            "status": "skipped",
            "annotation_id": None,
            "job_id": job_id,
            "image_id": image_id,
            "class_name": None,
            "bbox": None,
            "confidence": 0,
            "message": "No object detected",
        }

    return {
        "status": "ok",
        "annotation_id": str(uuid.uuid4()),
        "job_id": job_id,
        "image_id": image_id,
        "class_name": result["class_name"],
        "bbox": result.get("bbox"),
        "confidence": result.get("confidence", 0),
        "description": result.get("description", ""),
    }
