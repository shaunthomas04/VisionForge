def deduplicate(job_id: str, hamming_threshold: int = 8) -> dict:
    """Remove near-duplicate images from a job using perceptual hashing.

    Computes a pHash for each validated image and removes duplicates within
    the job and against images from previous jobs stored in MongoDB.
    When duplicates are found, the highest-resolution copy is kept.

    Args:
        job_id: The pipeline job to deduplicate.
        hamming_threshold: Maximum Hamming distance to consider two images
            duplicates. Lower = stricter. Default 8 works well in practice.

    Returns:
        A dict with kept count, removed count, and list of removed image_ids.
    """
    # TODO: implement with imagehash + MongoDB query via MCP
    return {
        "status": "not_implemented",
        "job_id": job_id,
        "kept": 0,
        "removed": 0,
        "removed_ids": [],
        "message": "deduplicate is a stub — implement in tools/deduplicate.py",
    }
