"""
VisionForge API server.

Wraps ADK's FastAPI app and adds read-only MongoDB endpoints for the
Datasets tab in the frontend.

Usage:
  uvicorn main:app --host 127.0.0.1 --port 8000 --reload
"""
import os
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

from google.adk.cli.fast_api import get_fast_api_app

app = get_fast_api_app(
    agents_dir=".",
    web=False,
    allow_origins=["http://localhost:5173"],
)

# ── Read-only MongoDB client for the Datasets UI ─────────────────────────────
# The ADK agent uses the MCP server for all writes.
# These endpoints are purely for displaying stored datasets in the frontend.

_db = None

def _get_db():
    global _db
    if _db is None:
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            return None
        from pymongo import MongoClient
        _db = MongoClient(uri, serverSelectionTimeoutMS=4000)["visionforge"]
    return _db


def _stamp(doc: dict) -> dict:
    """Replace created_at with the ObjectId insertion timestamp (always accurate)."""
    obj_id = doc.pop("_id", None)
    if obj_id is not None:
        try:
            doc["created_at"] = obj_id.generation_time.isoformat()
        except Exception:
            pass
    return doc


@app.get("/api/datasets")
async def list_datasets():
    db = _get_db()
    if db is None:
        return []
    try:
        docs = list(db["datasets"].find({}, {"embedding": 0}).sort("_id", -1))
        for doc in docs:
            _stamp(doc)
            job = db["jobs"].find_one({"job_id": doc.get("job_id")}, {"query": 1, "_id": 0})
            if job:
                doc["query"] = job.get("query", "Unknown")
        return docs
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/search-datasets")
async def search_datasets(q: str):
    db = _get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    try:
        from google import genai as _genai
        client = _genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
        )
        result = client.models.embed_content(model="text-embedding-004", contents=q)
        query_vector = list(result.embeddings[0].values)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}")
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "datasets_vector",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 100,
                    "limit": 20,
                }
            },
            {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
            {"$project": {"embedding": 0}},
        ]
        docs = list(db["datasets"].aggregate(pipeline))
        for doc in docs:
            _stamp(doc)
            job = db["jobs"].find_one({"job_id": doc.get("job_id")}, {"query": 1, "_id": 0})
            if job:
                doc["query"] = job.get("query", "Unknown")
        return docs
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/datasets/{job_id}")
async def get_dataset(job_id: str):
    db = _get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    try:
        doc = db["datasets"].find_one({"job_id": job_id}, {"embedding": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Dataset not found")
        _stamp(doc)
        job = db["jobs"].find_one({"job_id": job_id}, {"query": 1, "_id": 0})
        if job:
            doc["query"] = job.get("query", "Unknown")
        return doc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/images/{job_id}")
async def list_images(job_id: str):
    """List all images for a job by scanning the GCS bucket.

    The job_id stored in the datasets document is written by the LLM and may differ
    from the UUID that search.py used as the GCS prefix. We resolve the real prefix by
    parsing the export GCS URI (written by export.py with the correct UUID), then fall
    back to the raw job_id if no exports exist.
    """
    bucket_name = os.environ.get("GCS_BUCKET_RAW", "visionforge-raw")

    # Resolve the actual GCS prefix from the exports URI when possible
    gcs_prefix = job_id
    db = _get_db()
    if db is not None:
        try:
            doc = db["datasets"].find_one({"job_id": job_id}, {"exports": 1, "_id": 0})
            if doc:
                for uri in (doc.get("exports") or {}).values():
                    # URI format: gs://visionforge-exports/{real_job_id}/v1/yolo.zip
                    if uri and uri.startswith("gs://") and not uri.startswith("error"):
                        parts = uri[len("gs://"):].split("/")
                        if len(parts) >= 2:
                            gcs_prefix = parts[1]
                            break
        except Exception:
            pass

    import asyncio
    from google.cloud import storage as gcs_lib

    def _list():
        client = gcs_lib.Client()
        blobs = client.bucket(bucket_name).list_blobs(prefix=f"{gcs_prefix}/")
        return [
            {
                "image_id": b.name.split("/")[-1].rsplit(".", 1)[0],
                "filename":  b.name.split("/")[-1],
                "gcs_uri":   f"gs://{bucket_name}/{b.name}",
            }
            for b in blobs
            if b.name.split("/")[-1]
        ]

    try:
        images = await asyncio.get_event_loop().run_in_executor(None, _list)
        return images
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/image/{job_id}/{filename}")
async def proxy_image(job_id: str, filename: str):
    """Stream an image from GCS to the browser.

    job_id here is the real GCS prefix (already resolved by list_images), not the
    datasets document job_id, so we can use it directly as the blob path prefix.
    """
    bucket = os.environ.get("GCS_BUCKET_RAW", "visionforge-raw")
    blob_path = f"{job_id}/{filename}"

    import asyncio
    from fastapi.responses import Response
    from google.cloud import storage as gcs_lib

    def _fetch():
        return gcs_lib.Client().bucket(bucket).blob(blob_path).download_as_bytes()

    try:
        data = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.get("/api/download/{job_id}/{fmt}")
async def download_export(job_id: str, fmt: str):
    """Stream a YOLO or COCO zip from GCS directly to the browser."""
    db = _get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured")

    doc = db["datasets"].find_one({"job_id": job_id}, {"exports": 1, "_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    uri = (doc.get("exports") or {}).get(fmt)
    if not uri or uri.startswith("error"):
        raise HTTPException(status_code=404, detail=f"No {fmt} export found")

    bucket_name, blob_path = uri[len("gs://"):].split("/", 1)

    import asyncio
    from fastapi.responses import Response
    from google.cloud import storage as gcs_lib

    def _fetch():
        return gcs_lib.Client().bucket(bucket_name).blob(blob_path).download_as_bytes()

    data = await asyncio.get_event_loop().run_in_executor(None, _fetch)

    slug = "dataset"
    job = db["jobs"].find_one({"job_id": job_id}, {"query": 1, "_id": 0})
    if job:
        slug = job.get("query", "dataset").replace(" ", "_")

    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}_{fmt}.zip"'},
    )
