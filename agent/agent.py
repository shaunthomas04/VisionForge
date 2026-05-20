import os

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, SseConnectionParams

from .tools import (
    annotate_image,
    deduplicate,
    export_dataset,
    search_images,
    validate_annotation,
)
from .prompts import AGENT_INSTRUCTION

load_dotenv()

_tools = [
    search_images,
    annotate_image,
    validate_annotation,
    deduplicate,
    export_dataset,
]

# MongoDB Atlas MCP server — only wired in when the URL is configured.
# Run `adk web agent` without it set to test the agent skeleton locally.
_mcp_url = os.environ.get("MONGODB_MCP_SERVER_URL")
if _mcp_url:
    _tools.append(
        McpToolset(
            connection_params=SseConnectionParams(url=_mcp_url)
        )
    )

root_agent = Agent(
    name="visionforge",
    model=os.environ.get("GEMINI_MODEL", "gemini-1.5-pro-002"),
    description=(
        "Builds labeled computer vision datasets from a natural language query. "
        "Handles image collection, Gemini annotation, validation, deduplication, "
        "and YOLO/COCO export — all stored and versioned in MongoDB Atlas."
    ),
    instruction=AGENT_INSTRUCTION,
    tools=_tools,
)
