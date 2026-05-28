# VisionForge

**AI agent that builds fully-labeled computer vision datasets from a plain-English request.**

Enter a prompt like *"build a dataset of gaming mice"* and VisionForge runs a complete pipeline: image collection → Gemini Vision annotation → validation → deduplication → YOLO/COCO export — all stored and versioned in MongoDB Atlas.

Built for the **Google Cloud Rapid Agent Hackathon — MongoDB Track** using Google ADK (`google-adk`), Gemini 1.5 Pro Vision, Google Cloud Storage, and the official MongoDB Atlas MCP server.

---

## Requirements

- Python 3.11+
- Node.js 18+ (ADK spawns the MongoDB MCP server via `npx`)
- A Google Cloud project with Vertex AI enabled
- A MongoDB Atlas cluster
- An Unsplash developer account (free key at [developers.unsplash.com](https://developers.unsplash.com))
- Two GCS buckets: `visionforge-raw` and `visionforge-exports`

---

## Setup

### 1. Clone and install Python dependencies

```bash
git clone https://github.com/shaunthomas04/visionforge.git
cd visionforge
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in all values
```

Key variables to fill in:

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | Your GCP project ID |
| `UNSPLASH_ACCESS_KEY` | [developers.unsplash.com](https://developers.unsplash.com) → New Application |
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers → copy connection string |

### 3. Authenticate with Google Cloud

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Running locally

**Terminal 1 — ADK backend (port 8000):**

```bash
adk api_server . --allow_origins http://localhost:5173
```

**Terminal 2 — React frontend (port 5173):**

```bash
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Deploying to Cloud Run

```bash
adk deploy cloud_run agent \
  --project $GOOGLE_CLOUD_PROJECT \
  --region $GOOGLE_CLOUD_REGION \
  --service-name visionforge
```

For Cloud Run deployments, set `MONGODB_MCP_SERVER_URL` to the SSE URL of a deployed MongoDB Atlas MCP server sidecar instead of leaving it blank.

---

## Architecture

```
Browser → React SPA
             ↓  POST /run_sse (SSE stream)
         ADK FastAPI (google-adk)
             ↓
         Gemini 1.5 Pro Vision (Vertex AI)
             ↓  tool calls
    ┌────────┼────────────────────────┐
    │        │                        │
search_  annotate_ / validate_     MCP Toolset
images   annotation                   ↓
    │        │              MongoDB Atlas MCP Server
    ↓        ↓                   (jobs / images /
   GCS     GCS raw           annotations / datasets)
 exports
```

All database operations go through the **official MongoDB Atlas MCP server** — no direct pymongo calls.

---

## Pipeline steps

1. **Image Collection** — Unsplash API, uploads to GCS `visionforge-raw/`
2. **Gemini Annotation** — Gemini 1.5 Pro Vision identifies objects and draws bounding boxes
3. **Validation** — Second Gemini pass crops the bbox region and confirms the label
4. **Deduplication** — Perceptual hashing (pHash) removes near-duplicate images
5. **Export** — YOLO and COCO zip archives written to GCS `visionforge-exports/`

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
