# VisionForge

Automated computer vision dataset builder agent for the Google Cloud Rapid Agent Hackathon (MongoDB track).

A user submits a natural language request like "build a dataset of gaming mice" and the agent runs a full pipeline: image collection → Gemini vision annotation → validation → MongoDB storage → YOLO/COCO export.

**Contest:** Google Cloud Rapid Agent Hackathon — MongoDB Track  
**Contest Period:** May 5, 2026 12:00 PM PT → June 11, 2026 2:00 PM PT  
**Judging Period:** June 22 – July 6, 2026  
**This project was started on:** May 19, 2026 (within the contest period — required by rules)  
**Agent framework:** Google ADK (`google-adk`) — the code-first SDK for Google Cloud Agent Builder  
**Python:** 3.11+

---

## Rules Compliance

This section maps every hard requirement from the contest rules to how VisionForge satisfies it.

### Required Components (Rule 7A)
| Requirement | How we satisfy it |
|---|---|
| Powered by Gemini | Gemini 1.5 Pro Vision for image annotation and validation |
| Google Cloud Agent Builder | Built with `google-adk` (the code-first SDK for Agent Builder), deployed to Vertex AI Agent Engine via `adk deploy cloud_run` |
| Partner MCP server | Official MongoDB Atlas MCP server (provided by MongoDB) — sole interface for all database operations |
| Solves a real challenge | Automates manual CV dataset labeling — a genuine bottleneck in ML workflows |

### Platform & Build Requirements (Rule 7B)
| Requirement | How we satisfy it |
|---|---|
| Web platform | React frontend hosted via Cloud Run |
| Google Cloud for cloud platform | Cloud Run, GCS, Vertex AI — no AWS or Azure |
| MongoDB products for MongoDB track | MongoDB Atlas + official MongoDB Atlas MCP server |
| No competing cloud services | No AWS, Azure, or any service competing with Google Cloud or MongoDB Atlas |
| Newly created during contest period | Project started May 19, 2026 — within May 5–June 11, 2026 window |
| Third-party integrations authorized | Google Custom Search API (Google Terms of Service), MongoDB Atlas (MongoDB Terms) |

### AI Tool Restriction (Rule 7B — Limitation on AI Usage)
**Only the following AI tools are permitted and used:**
- Gemini 1.5 Pro Vision (Google Cloud AI — Gemini models on Agent Platform)
- Google Cloud Agent Builder (Vertex AI Agent Builder)

**Explicitly forbidden and not used:**
- OpenAI / ChatGPT
- Hugging Face models
- AWS Bedrock / SageMaker
- Azure OpenAI
- Any AI tool not from Google Cloud or MongoDB's built-in AI features

### Submission Requirements (Rule 7B — What to Submit)
- [ ] Hosted project URL (Cloud Run — publicly accessible, no auth wall for judges)
- [ ] Public GitHub repo with Apache 2.0 LICENSE file — must be visible in the repo About section
- [ ] Demo video on YouTube or Vimeo (publicly visible link)
- [ ] Devpost text description (see template below)

### Video Requirements (Rule 7B)
- [ ] Length: ≤ 3 minutes (only first 3 min evaluated if longer)
- [ ] Language: English or English subtitles
- [ ] Shows the project functioning on the web platform
- [ ] Uploaded to YouTube or Vimeo — must be publicly visible
- [ ] No third-party logos, ads, or trademarks
- [ ] No inappropriate content
- [ ] Original, unpublished work

---

## Devpost Submission Text Template

Fill this in at submission time:

```
## What it does
VisionForge is an AI agent that turns a plain-English request like "build a dataset
of gaming mice" into a fully labeled, export-ready computer vision dataset. It
automates image collection, Gemini-powered annotation, validation, deduplication,
versioned storage in MongoDB, and export in YOLO or COCO format.

## Technologies used
- Google Cloud Agent Builder (Vertex AI Agent Builder) — agent orchestration
- Gemini 1.5 Pro Vision — bounding box annotation and two-pass validation
- Google Cloud Run — backend and frontend hosting
- Google Cloud Storage — raw image and export archive storage
- Google Custom Search API — image collection
- MongoDB Atlas — dataset metadata, annotations, versioning
- MongoDB Atlas MCP Server — Partner integration; all DB ops routed through MCP

## How we built it
[describe build process]

## Challenges
[describe challenges]

## What we learned
[describe learnings]

## What's next
[describe future plans]
```

---

## Architecture

```
Browser (Web UI)
      │  POST /run  { query: "gaming mice", target_count: 200 }
      ▼
FastAPI (Cloud Run) — served by ADK via get_fast_api_app()
      │
      ▼
ADK Agent  (google-adk, Gemini 1.5 Pro Vision as model)
  │
  ├── McpToolset ──────────────────────────────────────────────────────────────┐
  │   (ADK native — connects to official MongoDB Atlas MCP server)             │
  │   Auto-discovers: find, insertOne, updateOne, aggregate, etc.              ▼
  │                                                              MongoDB Atlas
  │                                                              ├── jobs
  │                                                              ├── images
  │                                                              ├── annotations
  │                                                              └── datasets
  │
  ├── @tool search_images      → Google Custom Search API → GCS
  ├── @tool annotate_image     → Gemini 1.5 Pro Vision (inline in agent model)
  ├── @tool validate_annotation→ Gemini second-pass crop check
  ├── @tool deduplicate        → pHash compute → MCP query
  └── @tool export_dataset     → YOLO / COCO zip → GCS bucket

Google Cloud Storage
  ├── raw/          — downloaded source images
  ├── exports/      — YOLO / COCO zip archives
  └── thumbnails/   — resized previews for UI
```

**Development workflow:**
```
local: adk web          # browser UI at localhost:8000 — test agent interactively
local: adk api_server   # FastAPI at localhost:8080 — test /run endpoint
deploy: adk deploy cloud_run   # packages agent + FastAPI, deploys to Cloud Run
```

**All database operations route through the official MongoDB Atlas MCP server via ADK's `McpToolset` — no direct pymongo driver calls. This satisfies the contest Partner MCP server integration requirement.**

---

## Project Structure

```
visionforge/
├── CLAUDE.md
├── README.md                          # setup instructions for judges
├── LICENSE                            # Apache 2.0 — must be visible in GitHub About
├── requirements.txt                   # google-adk, google-cloud-storage, imagehash, etc.
├── .env.example                       # all required env vars, no secrets
│
├── agent/
│   ├── agent.py                       # ADK Agent definition — model, tools, McpToolset
│   ├── tools/
│   │   ├── search.py                  # @tool search_images — Custom Search → GCS
│   │   ├── annotate.py                # @tool annotate_image — Gemini Vision → bbox + labels
│   │   ├── validate.py                # @tool validate_annotation — second Gemini crop check
│   │   ├── deduplicate.py             # @tool deduplicate — pHash → MCP query
│   │   └── export.py                  # @tool export_dataset — YOLO/COCO zip → GCS
│   └── prompts.py                     # Gemini prompt templates
│
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx               # query input, launch job
│   │   │   ├── JobDetail.tsx          # live pipeline progress via SSE
│   │   │   └── DatasetBrowser.tsx     # browse images, annotations, export
│   │   └── components/
│   │       ├── AnnotationPreview.tsx  # image with bbox overlay
│   │       ├── PipelineStatus.tsx     # step-by-step progress bar
│   │       └── ExportPanel.tsx        # format selector + download link
│   └── package.json
│
└── infra/
    ├── cloudbuild.yaml                # CI/CD via adk deploy cloud_run
    └── terraform/                     # GCS buckets, IAM, Secret Manager
```

---

## MongoDB Schema

### `jobs`
```json
{
  "_id": "ObjectId",
  "query": "gaming mice",
  "status": "running | completed | failed",
  "config": {
    "target_count": 200,
    "min_resolution": 300,
    "confidence_threshold": 0.75,
    "export_formats": ["yolo", "coco"]
  },
  "stats": {
    "collected": 0,
    "annotated": 0,
    "validated": 0,
    "deduplicated": 0
  },
  "created_at": "ISODate",
  "completed_at": "ISODate"
}
```

### `images`
```json
{
  "_id": "ObjectId",
  "job_id": "ObjectId",
  "gcs_uri": "gs://visionforge-raw/...",
  "source_url": "https://...",
  "phash": "a1b2c3d4...",
  "width": 1024,
  "height": 768,
  "status": "raw | annotated | validated | rejected",
  "rejection_reason": null
}
```

### `annotations`
```json
{
  "_id": "ObjectId",
  "image_id": "ObjectId",
  "job_id": "ObjectId",
  "class_name": "gaming_mouse",
  "bbox": { "x": 120, "y": 80, "w": 200, "h": 150 },
  "confidence": 0.91,
  "gemini_model": "gemini-1.5-pro-002",
  "validated": true,
  "created_at": "ISODate"
}
```

### `datasets`
```json
{
  "_id": "ObjectId",
  "job_id": "ObjectId",
  "version": 1,
  "image_count": 187,
  "class_counts": { "gaming_mouse": 187 },
  "splits": { "train": 149, "val": 26, "test": 12 },
  "exports": {
    "yolo": "gs://visionforge-exports/job_abc/v1/yolo.zip",
    "coco": "gs://visionforge-exports/job_abc/v1/coco.zip"
  },
  "created_at": "ISODate"
}
```

---

## Pipeline Steps

### 1. Image Collection (`tools/search.py`)
- Call Google Custom Search API with the user query
- Filter: width ≥ 300px, image types jpg/png, safe search on
- Download to memory, upload to `gs://visionforge-raw/<job_id>/<uuid>.jpg`
- Store `ImageRecord` in MongoDB via MCP server
- Target: collect `config.target_count * 1.5` images to allow for validation loss

### 2. Annotation (`tools/annotate.py`)
- Send each image to Gemini 1.5 Pro Vision with a structured prompt
- Request JSON response: `{ class_name, bbox: {x,y,w,h}, confidence, description }`
- Parse and validate response schema; store `AnnotationRecord` in MongoDB via MCP
- Skip images where Gemini returns no object or malformed JSON after 2 retries

### 3. Validation (`tools/validate.py`)
- Second Gemini pass: crop the bbox region, ask "Does this crop show a [class_name]? Confidence 0-1."
- Reject annotations below `config.confidence_threshold`
- Also reject: bbox area < 5% of image, bbox touching all 4 edges (likely full-image false positive)
- Update `images.status` and `images.rejection_reason` in MongoDB via MCP

### 4. Deduplication (`tools/deduplicate.py`)
- Compute perceptual hash (pHash) of each validated image using `imagehash` library
- Query MongoDB via MCP: find existing images with Hamming distance < 8
- Keep the highest-resolution copy, reject the rest
- Runs per-job and cross-job to avoid re-annotating duplicates across runs

### 5. Export (`tools/export.py`)
- Pull all validated, deduplicated annotations for the job from MongoDB via MCP
- Generate train/val/test split (80/10/10), stratified if multi-class
- Write YOLO format: one `.txt` per image with `class cx cy w h` (normalized)
- Write COCO format: single `annotations.json` with full schema
- Zip each format, upload to `gs://visionforge-exports/<job_id>/v<n>/`
- Write `DatasetSnapshot` to MongoDB `datasets` collection

---

## ADK Agent Definition Pattern

`agent/agent.py` wires together the model, custom tools, and the MongoDB MCP toolset:

```python
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, SseServerParams
from agent.tools.search import search_images
from agent.tools.annotate import annotate_image
from agent.tools.validate import validate_annotation
from agent.tools.deduplicate import deduplicate
from agent.tools.export import export_dataset

root_agent = Agent(
    name="visionforge",
    model="gemini-1.5-pro-002",
    description="Builds labeled computer vision datasets from a natural language query.",
    instruction="""
        You are a CV dataset builder. When given a query like 'gaming mice':
        1. Call search_images to collect images and get a job_id.
        2. Call annotate_image for each collected image.
        3. Call validate_annotation to filter low-confidence results.
        4. Call deduplicate to remove near-duplicate images.
        5. Call export_dataset to produce YOLO and COCO archives.
        Report progress after each step.
    """,
    tools=[
        search_images,
        annotate_image,
        validate_annotation,
        deduplicate,
        export_dataset,
        McpToolset(
            connection_params=SseServerParams(
                url=os.environ["MONGODB_MCP_SERVER_URL"],
            )
        ),
    ],
)
```

Each `@tool` function signature is its own schema — ADK infers the JSON schema from
Python type hints and docstrings. No separate JSON schema files needed.

**Custom tool signatures:**
- `search_images(query: str, count: int, min_resolution: int) -> dict`
- `annotate_image(job_id: str, image_id: str, gcs_uri: str) -> dict`
- `validate_annotation(job_id: str, annotation_id: str) -> dict`
- `deduplicate(job_id: str) -> dict`
- `export_dataset(job_id: str, formats: list[str]) -> dict`

---

## Environment Variables

```
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_REGION=us-central1
GEMINI_MODEL=gemini-1.5-pro-002
CUSTOM_SEARCH_API_KEY=
CUSTOM_SEARCH_ENGINE_ID=
GCS_BUCKET_RAW=visionforge-raw
GCS_BUCKET_EXPORTS=visionforge-exports
MONGODB_MCP_SERVER_URL=          # SSE URL from MongoDB Atlas MCP server setup
MONGODB_ATLAS_URI=               # connection string (used by MCP server, not app directly)
```

## Key Commands

```bash
# Install
pip install "google-adk[extensions]"   # Python 3.11+ required

# Local dev — interactive agent UI in browser
adk web agent/

# Local dev — FastAPI endpoint at localhost:8080
adk api_server agent/

# Deploy to Cloud Run (packages agent + serves via ADK FastAPI)
adk deploy cloud_run agent/ \
  --project $GOOGLE_CLOUD_PROJECT \
  --region $GOOGLE_CLOUD_REGION \
  --service-name visionforge
```

---

## Key Technical Decisions

- **Google ADK as the build framework**: `google-adk` is the code-first path for Google Cloud Agent Builder — develop locally with `adk web`, deploy to Cloud Run with `adk deploy cloud_run`. Satisfies the contest's "Google Cloud Agent Builder" requirement.
- **`McpToolset` for MongoDB**: ADK's native `McpToolset` connects to the official MongoDB Atlas MCP server over SSE, auto-discovers all MongoDB operations as agent tools, and requires zero custom wrapper code. Satisfies the Partner MCP server integration requirement.
- **GCS for binary storage, MongoDB for metadata**: images are too large for MongoDB; GCS URIs stored in MongoDB give queryability without blob overhead
- **Two-pass Gemini validation**: first pass generates labels, second pass verifies them on the cropped region — reduces false positives and demonstrates deeper Gemini usage
- **pHash deduplication cross-job**: lets users build on previous dataset runs without re-annotating duplicates; stored in MongoDB for queryability
- **No non-Google AI tools**: pHash is a traditional computer vision library (`imagehash`), not an AI model — compliant with the AI tool restriction

---

## Permitted vs. Forbidden Services

| Service | Status | Reason |
|---|---|---|
| Gemini 1.5 Pro Vision | Permitted | Google Cloud AI (required) |
| Google Cloud Agent Builder | Permitted | Google Cloud AI (required) |
| Google Cloud Run | Permitted | Google Cloud platform |
| Google Cloud Storage | Permitted | Google Cloud platform |
| Google Custom Search API | Permitted | Google service, authorized under ToS |
| MongoDB Atlas | Permitted | Contest Partner product (MongoDB track) |
| MongoDB Atlas MCP Server | Permitted | Contest Partner MCP server (required) |
| FastAPI | Permitted | Framework, not a competing cloud service |
| React | Permitted | Framework, not a competing cloud service |
| `imagehash` (pHash library) | Permitted | Traditional algorithm library, not an AI tool |
| OpenAI / any non-Google LLM | **FORBIDDEN** | Non-Google AI tool |
| AWS / Azure | **FORBIDDEN** | Competes with Google Cloud |
| Any other document DB | **FORBIDDEN** | Competes with MongoDB |

---

## Final Submission Checklist

### Code & Repo
- [ ] Public GitHub repository
- [ ] Apache 2.0 LICENSE file at repo root
- [ ] License visible in GitHub repo About section (must be detectable)
- [ ] README.md with clear installation and run instructions for judges
- [ ] `.env.example` with all required variables (no real secrets)

### Hosted Project
- [ ] Deployed to Cloud Run
- [ ] Publicly accessible URL — no login wall blocking judges
- [ ] Project functions as shown in the video

### Demo Video
- [ ] Uploaded to YouTube or Vimeo as a public video
- [ ] ≤ 3 minutes
- [ ] In English (or English subtitles)
- [ ] Shows the full pipeline working end-to-end on the web platform
- [ ] No third-party logos, ads, or trademarks
- [ ] Original, unpublished

### Devpost Submission
- [ ] Devpost account created at rapid-agent.devpost.com
- [ ] Hosted URL entered
- [ ] GitHub repo URL entered
- [ ] YouTube/Vimeo video URL entered
- [ ] Text description completed (use template above)
- [ ] Submitted before June 11, 2026 at 2:00 PM PT
- [ ] All team members added (max 4)

### Google Cloud Credits
- [ ] Request $100 Google Cloud credits via the form by June 4, 2026 (5 business days to approve)
