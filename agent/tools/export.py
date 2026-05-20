def export_dataset(job_id: str, formats: list[str] | None = None) -> dict:
    """Export the validated dataset as YOLO and/or COCO format zip archives in GCS.

    Pulls all validated, deduplicated annotations for the job from MongoDB,
    generates an 80/10/10 train/val/test split, writes the chosen formats,
    zips each, uploads to GCS, and writes a versioned DatasetSnapshot to MongoDB.

    Args:
        job_id: The pipeline job to export.
        formats: List of export formats to produce. Supported: 'yolo', 'coco'.
            Defaults to both if not specified.

    Returns:
        A dict with dataset version, image_count, class_counts, split sizes,
        and GCS download URLs for each format.
    """
    if formats is None:
        formats = ["yolo", "coco"]

    # TODO: implement YOLO/COCO serialization + GCS upload + MongoDB snapshot via MCP
    return {
        "status": "not_implemented",
        "job_id": job_id,
        "version": None,
        "image_count": 0,
        "class_counts": {},
        "splits": {"train": 0, "val": 0, "test": 0},
        "exports": {fmt: None for fmt in formats},
        "message": "export_dataset is a stub — implement in tools/export.py",
    }
