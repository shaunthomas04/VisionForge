def validate_annotation(
    job_id: str,
    annotation_id: str,
    confidence_threshold: float = 0.75,
) -> dict:
    """Run a second Gemini pass on the cropped bounding box region to verify the label.

    Rejects annotations where the crop confidence is below threshold, the bbox
    covers less than 5% of the image, or the bbox touches all four edges
    (likely a full-image false positive).

    Args:
        job_id: The pipeline job this annotation belongs to.
        annotation_id: The MongoDB document ID for the annotation to verify.
        confidence_threshold: Minimum confidence score to accept (0.0–1.0).

    Returns:
        A dict with passed bool, confidence score, rejection_reason (if any),
        and updated annotation status.
    """
    # TODO: implement with Gemini Vision crop check + MongoDB update via MCP
    return {
        "status": "not_implemented",
        "annotation_id": annotation_id,
        "job_id": job_id,
        "passed": False,
        "confidence": None,
        "rejection_reason": None,
        "message": "validate_annotation is a stub — implement in tools/validate.py",
    }
