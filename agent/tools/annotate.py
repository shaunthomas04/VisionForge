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
    # TODO: implement with Gemini 1.5 Pro Vision + MongoDB insert via MCP
    return {
        "status": "not_implemented",
        "annotation_id": None,
        "job_id": job_id,
        "image_id": image_id,
        "class_name": None,
        "bbox": None,
        "confidence": None,
        "message": "annotate_image is a stub — implement in tools/annotate.py",
    }
