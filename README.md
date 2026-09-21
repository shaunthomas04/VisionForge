<div align="center">

<img src="docs/logo.png" alt="VisionForge Logo" width="120" />

# VisionForge

**AI agent that builds fully labeled computer vision datasets from a plain-English request.**

[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org)
[![Google ADK](https://img.shields.io/badge/Google%20ADK-Agent%20Builder-4285F4)](https://google.github.io/adk-docs/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB-Atlas-00ED64)](https://www.mongodb.com/atlas)

</div>

---

## What VisionForge does

Type a plain-English request like "build a dataset of gaming mice" and VisionForge will automate the full workflow from image collection through dataset export.

It searches for relevant images, uploads them to cloud storage, uses Gemini Vision to identify objects and draw bounding boxes, validates the annotations with a second pass, removes duplicates, and exports YOLO or COCO archives ready for training pipelines.

### Pipeline

| Step | What happens |
|------|-------------|
| **Image Collection** | Searches a source like Unsplash, filters by resolution, and uploads images to Google Cloud Storage |
| **Gemini Annotation** | Gemini Vision identifies objects and produces pixel-accurate bounding boxes and class labels |
| **Validation** | A second Gemini pass checks the crop around each box and rejects false positives |
| **Deduplication** | Perceptual hashing removes near-duplicate images before export |
| **Export** | Generates YOLO and COCO zip archives and uploads them to GCS |
| **Embedding** | Stores dataset metadata and semantic vectors in MongoDB Atlas for search |

### Web UI features

- Live pipeline progress streamed over SSE
- Conversation-style agent updates while each step runs
- One-click exports for YOLO and COCO
- Dataset browser with versioned runs and metadata
- Semantic dataset search using Atlas Vector Search
- Annotated image gallery with bounding-box overlays
- Train / validation / test split summaries

---

## Requirements

- Python 3.11+
- Node.js 18+
- Google Cloud project with Vertex AI enabled
- MongoDB Atlas cluster
- Unsplash developer account for image search
- Two GCS buckets: `visionforge-raw` and `visionforge-exports`

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/shaunthomas04/VisionForge.git
cd VisionForge
pip install -r requirements.txt
```

### 2. Install frontend dependencies

```bash
cd frontend && npm install && cd ..
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values for your environment.

| Variable | Where to get it |
|----------|----------------|
| `GOOGLE_CLOUD_PROJECT` | GCP Console → Project ID |
| `GOOGLE_CLOUD_LOCATION` | Usually `global` or your preferred region |
| `GEMINI_MODEL` | Example: `gemini-3.1-flash-lite` |
| `UNSPLASH_ACCESS_KEY` | Unsplash Developer account |
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers |
| `GCS_BUCKET_RAW` | Your raw images bucket |
| `GCS_BUCKET_EXPORTS` | Your export bucket |

### 4. Authenticate with Google Cloud

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 5. Create the MongoDB Atlas Vector Search index

In the MongoDB Atlas UI:

1. Go to your cluster → Atlas Search → Create Search Index
2. Select Atlas Vector Search → Bring your own embeddings
3. Database: `visionforge` · Collection: `datasets`
4. Index name: `datasets_vector`
5. Paste this JSON in the JSON editor:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}
```

6. Click Create Search Index and wait for it to become active.

---

## Running locally

Open two terminals.

### Terminal 1 — backend

```bash
uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
```

### Terminal 2 — frontend

```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

---

## Deploying to Cloud Run

```bash
adk deploy cloud_run agent \
  --project $GOOGLE_CLOUD_PROJECT \
  --region $GOOGLE_CLOUD_REGION \
  --service-name visionforge
```

> For deployed environments, configure the MongoDB MCP server connection separately and set the relevant environment variables for production use.

---

## Architecture

```text
Browser (React SPA)
    │
    │  SSE stream /run_sse
    ▼
ADK FastAPI ── google-adk
    │
    ▼
Gemini Vision (Vertex AI)
    │
    ├── search_images        → Unsplash API → GCS raw bucket
    ├── annotate_images      → Gemini Vision, parallel workers
    ├── validate_annotations → Gemini crop check, parallel workers
    ├── deduplicate          → pHash
    ├── export_dataset       → YOLO + COCO zip → GCS export bucket
    ├── embed_dataset        → text-embedding-004 → MongoDB Atlas vector field
    └── McpToolset ──────────→ MongoDB Atlas MCP server
                                      ├── jobs
                                      ├── images
                                      ├── annotations
                                      └── datasets
```

---

## Project structure

```text
visionforge/
├── agent/
│   ├── agent.py            # ADK agent and tool wiring
│   ├── prompts.py          # Agent instruction prompt
│   └── tools/
│       ├── search.py       # search_images
│       ├── annotate.py     # annotate_images
│       ├── validate.py     # validate_annotations
│       ├── deduplicate.py  # deduplicate
│       ├── export.py       # export_dataset
│       └── embed.py        # embed_dataset
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── JobDetail.tsx
│       │   └── DatasetBrowser.tsx
│       ├── components/
│       │   ├── PipelineStatus.tsx
│       │   └── ExportPanel.tsx
│       └── contexts/
│           └── JobContext.tsx
├── server/
│   └── main.py             # FastAPI app and endpoints
├── requirements.txt
├── .env.example
├── LICENSE
├── README.md
└── docs/
```

---

## Key design decisions

- Google ADK is used to orchestrate the agent workflow and expose a production-ready API layer.
- MongoDB Atlas stores structured metadata and vector embeddings for semantic search.
- Two-pass Gemini validation improves annotation quality and reduces false positives.
- GCS is used for raw images and exported archives, while Atlas stores queryable metadata.
- pHash deduplication reduces near-duplicate images before dataset creation.
- The frontend is built to surface live progress and completed datasets in a simple web UI.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contributing

Contributions are welcome. If you want to improve the agent workflow, UI, export logic, or documentation, open an issue or submit a pull request.

## Support

For questions or feature requests, open a GitHub issue.
