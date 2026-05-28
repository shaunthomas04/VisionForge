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


@app.get("/api/datasets")
async def list_datasets():
    db = _get_db()
    if db is None:
        return []
    try:
        docs = list(db["datasets"].find({}, {"_id": 0}).sort("created_at", -1))
        for doc in docs:
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
        doc = db["datasets"].find_one({"job_id": job_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Dataset not found")
        job = db["jobs"].find_one({"job_id": job_id}, {"query": 1, "_id": 0})
        if job:
            doc["query"] = job.get("query", "Unknown")
        return doc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
