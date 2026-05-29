import os

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, SseConnectionParams, StdioConnectionParams
from mcp import StdioServerParameters

from .tools import (
    annotate_images,
    deduplicate,
    export_dataset,
    search_images,
    validate_annotations,
)
from .prompts import AGENT_INSTRUCTION

load_dotenv()

_tools = [
    search_images,
    annotate_images,
    validate_annotations,
    deduplicate,
    export_dataset,
]

# MongoDB Atlas MCP server.
# Prefer stdio (ADK spawns npx automatically) over SSE if no URL is set.
_mcp_url = os.environ.get("MONGODB_MCP_SERVER_URL")
_mcp_conn_str = os.environ.get("MONGODB_URI")

if _mcp_url:
    # Explicit SSE URL — used in Cloud Run where MCP server runs as a sidecar
    _tools.append(McpToolset(connection_params=SseConnectionParams(url=_mcp_url)))
elif _mcp_conn_str:
    # Local dev — ADK spawns the Node.js MCP server as a subprocess via npx
    _tools.append(
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=["-y", "mongodb-mcp-server"],
                    env={
                        **os.environ,
                        "MDB_MCP_CONNECTION_STRING": _mcp_conn_str,
                    },
                )
            )
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
