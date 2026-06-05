# In-process cache keyed by job_id.
# Stores annotation data between pipeline steps so the agent never has to
# pass large annotation arrays through the model's context window.

_raw_annotations: dict[str, list] = {}       # job_id → list from annotate_images
_validated_annotations: dict[str, list] = {} # job_id → list from validate_annotations
