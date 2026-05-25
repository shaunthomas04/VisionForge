import io
import json
import os
import re

from google.cloud import storage
from google import genai
from google.genai import types
from PIL import Image


_VALIDATION_PROMPT = """This is a cropped region from a larger image.

Does this crop clearly show a {class_name}?

Return ONLY a JSON object — no explanation, no markdown:
{{"confirmed": true_or_false, "confidence": <float 0.0-1.0>, "reason": "one sentence"}}"""

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


def validate_annotation(
    job_id: str,
    annotation_id: str,
    confidence_threshold: float = 0.75,
    image_id: str = "",
    gcs_uri: str = "",
    class_name: str = "",
    bbox: dict = None,
) -> dict:
    """Run a second Gemini pass on the cropped bounding box region to verify the label.

    Args:
        job_id: The pipeline job this annotation belongs to.
        annotation_id: The MongoDB document ID for the annotation to verify.
        confidence_threshold: Minimum confidence score to accept (0.0-1.0).
        image_id: The image document ID (passed through from annotate step).
        gcs_uri: GCS URI of the source image.
        class_name: The predicted class label to verify.
        bbox: Bounding box dict with x, y, w, h in pixel coordinates.

    Returns:
        A dict with passed bool, confidence score, rejection_reason (if any),
        and updated annotation status.
    """
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")

    if not gcs_uri or not class_name:
        return {
            "status": "error",
            "annotation_id": annotation_id,
            "job_id": job_id,
            "passed": False,
            "message": "gcs_uri and class_name are required",
        }

    try:
        gcs = _get_gcs_client()
        bucket_name = gcs_uri[len("gs://"):].split("/")[0]
        blob_path = "/".join(gcs_uri[len("gs://"):].split("/")[1:])
        img_bytes = gcs.bucket(bucket_name).blob(blob_path).download_as_bytes()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        width, height = img.size
    except Exception as e:
        return {
            "status": "error",
            "annotation_id": annotation_id,
            "job_id": job_id,
            "passed": False,
            "message": f"GCS download failed: {e}",
        }

    if bbox:
        x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
        bbox_area = w * h
        image_area = width * height
        if image_area > 0 and bbox_area / image_area < 0.05:
            return {
                "status": "rejected",
                "annotation_id": annotation_id,
                "job_id": job_id,
                "passed": False,
                "confidence": 0,
                "rejection_reason": "bbox covers less than 5% of image",
            }
        margin = 5
        if x <= margin and y <= margin and (x + w) >= width - margin and (y + h) >= height - margin:
            return {
                "status": "rejected",
                "annotation_id": annotation_id,
                "job_id": job_id,
                "passed": False,
                "confidence": 0,
                "rejection_reason": "bbox covers entire image (likely false positive)",
            }
        left = max(0, x)
        top = max(0, y)
        right = min(width, x + w)
        bottom = min(height, y + h)
        if right <= left or bottom <= top:
            return {
                "status": "rejected",
                "annotation_id": annotation_id,
                "job_id": job_id,
                "passed": False,
                "confidence": 0,
                "rejection_reason": "bbox has zero or negative dimensions after clamping",
            }
        crop = img.crop((left, top, right, bottom))
    else:
        crop = img

    buf = io.BytesIO()
    crop.save(buf, format="JPEG")
    crop_bytes = buf.getvalue()

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(data=crop_bytes, mime_type="image/jpeg"),
                _VALIDATION_PROMPT.format(class_name=class_name),
            ],
        )
        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
        result = json.loads(text)
    except Exception as e:
        return {
            "status": "error",
            "annotation_id": annotation_id,
            "job_id": job_id,
            "passed": False,
            "message": f"Gemini validation error: {e}",
        }

    confidence = result.get("confidence", 0)
    confirmed = result.get("confirmed", False)
    passed = confirmed and confidence >= confidence_threshold

    out = {
        "status": "validated" if passed else "rejected",
        "annotation_id": annotation_id,
        "job_id": job_id,
        "image_id": image_id,
        "passed": passed,
        "confidence": confidence,
        "rejection_reason": None if passed else (result.get("reason") or f"confidence {confidence:.2f} below threshold {confidence_threshold}"),
    }
    if passed:
        out.update({
            "gcs_uri": gcs_uri,
            "class_name": class_name,
            "bbox": bbox,
            "width": width,
            "height": height,
        })
    return out
