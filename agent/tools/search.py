import io
import os
import uuid

import requests
from google.cloud import storage
from PIL import Image


def search_images(query: str, count: int = 100, min_resolution: int = 300) -> dict:
    """Search for and collect images matching a query, uploading them to GCS.

    Args:
        query: Natural language search query, e.g. 'gaming mice'.
        count: Target number of images to collect before validation loss.
        min_resolution: Minimum pixel dimension (width or height) to accept.

    Returns:
        A dict with job_id, collected image count, list of image records, and status.
    """
    access_key = os.environ.get("UNSPLASH_ACCESS_KEY")
    bucket_name = os.environ.get("GCS_BUCKET_RAW", "visionforge-raw")

    if not access_key:
        return {"status": "error", "message": "UNSPLASH_ACCESS_KEY not configured"}

    job_id = str(uuid.uuid4())
    gcs_client = storage.Client()
    bucket = gcs_client.bucket(bucket_name)

    collected = []
    page = 1
    per_page = 30  # Unsplash max per page

    while len(collected) < count:
        try:
            resp = requests.get(
                "https://api.unsplash.com/search/photos",
                headers={"Authorization": f"Client-ID {access_key}"},
                params={
                    "query": query,
                    "per_page": per_page,
                    "page": page,
                    "content_filter": "high",
                },
                timeout=10,
            )
            resp.raise_for_status()
        except Exception as e:
            return {
                "status": "error",
                "job_id": job_id,
                "message": f"Unsplash API error: {e}",
                "collected": len(collected),
                "images": collected,
            }

        results = resp.json().get("results", [])
        if not results:
            break

        for item in results:
            if len(collected) >= count:
                break
            image_url = item.get("urls", {}).get("regular")
            if not image_url:
                continue
            try:
                img_resp = requests.get(image_url, timeout=15)
                img_resp.raise_for_status()
                img = Image.open(io.BytesIO(img_resp.content))
                width, height = img.size

                if width < min_resolution and height < min_resolution:
                    continue

                if img.mode != "RGB":
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="JPEG")
                buf.seek(0)

                image_id = str(uuid.uuid4())
                blob = bucket.blob(f"{job_id}/{image_id}.jpg")
                blob.upload_from_file(buf, content_type="image/jpeg")
                gcs_uri = f"gs://{bucket_name}/{job_id}/{image_id}.jpg"

                collected.append({
                    "image_id": image_id,
                    "gcs_uri": gcs_uri,
                    "source_url": image_url,
                    "width": width,
                    "height": height,
                })

            except Exception:
                continue

        page += 1
        if page > 10:  # cap at 300 images max
            break

    return {
        "status": "ok",
        "job_id": job_id,
        "query": query,
        "collected": len(collected),
        "image_ids": [img["image_id"] for img in collected],
        "images": collected,
    }
