import os

from google import genai

_gemini_client: genai.Client | None = None
_mongo_db = None


def _get_db():
    global _mongo_db
    if _mongo_db is None:
        import os as _os
        from pymongo import MongoClient
        uri = _os.environ.get("MONGODB_URI")
        if not uri:
            return None
        _mongo_db = MongoClient(uri, serverSelectionTimeoutMS=4000)["visionforge"]
    return _mongo_db


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
        )
    return _gemini_client


def embed_dataset(job_id: str, query: str) -> dict:
    """Generate a semantic embedding for a dataset and store it in MongoDB for vector search.

    Call this immediately after inserting the dataset document into MongoDB. The embedding
    is generated using text-embedding-004 and stored on the dataset document, enabling
    semantic similarity search across all datasets.

    Args:
        job_id: The pipeline job ID — used to find and update the dataset document.
        query: The natural language query string for this dataset (e.g. "golden retrievers").

    Returns:
        A dict with status ok and the embedding dimensions, or status error with a message.
    """
    try:
        client = _get_gemini_client()
        result = client.models.embed_content(
            model="text-embedding-004",
            contents=query,
        )
        embedding = list(result.embeddings[0].values)
    except Exception as e:
        return {"status": "error", "job_id": job_id, "message": f"Embedding failed: {e}"}

    try:
        db = _get_db()
        if db is None:
            return {"status": "error", "job_id": job_id, "message": "MONGODB_URI not set"}
        db["datasets"].update_one(
            {"job_id": job_id},
            {"$set": {"embedding": embedding}},
        )
    except Exception as e:
        return {"status": "error", "job_id": job_id, "message": f"MongoDB update failed: {e}"}

    return {"status": "ok", "job_id": job_id, "dimensions": len(embedding)}
