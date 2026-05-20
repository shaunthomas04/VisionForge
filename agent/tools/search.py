import os
import uuid


def search_images(query: str, count: int = 100, min_resolution: int = 300) -> dict:
    """Search for and collect images matching a query, uploading them to GCS.

    Args:
        query: Natural language search query, e.g. 'gaming mice'.
        count: Target number of images to collect before validation loss.
        min_resolution: Minimum pixel dimension (width or height) to accept.

    Returns:
        A dict with job_id, collected image count, list of image_ids, and status.
    """
    # TODO: implement with Google Custom Search API + GCS upload
    job_id = str(uuid.uuid4())
    return {
        "status": "not_implemented",
        "job_id": job_id,
        "query": query,
        "collected": 0,
        "image_ids": [],
        "message": "search_images is a stub — implement in tools/search.py",
    }
