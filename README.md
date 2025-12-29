# RRCE-Workflow

> **Agentic code workflow generator for AI-assisted development**

[![npm version](https://badge.fury.io/js/rrce-workflow.svg)](https://www.npmjs.com/package/rrce-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RRCE-Workflow is a tool that turns your AI coding assistant (GitHub Copilot, Claude Desktop, Antigravity IDE, etc.) into a **context-aware agent**. 

It standardizes how AI agents understand your project through:
1.  **Global Knowledge Base**: Centralized context management across all your projects.
2.  **MCP Hub**: A Model Context Protocol server that exposes your code and knowledge to any MCP-compatible client.
3.  **Semantic Search (RAG)**: Local, privacy-first vector indexing for deep codebase understanding.
4.  **Structured Agent Pipelines**: Reusable prompts for Research, Planning, Execution, and Documentation.

---

## 🚀 Quick Start

### 1. The MCP Dashboard (TUI)

The central command center for RRCE-Workflow is the **MCP Dashboard**. It lets you manage your projects, server status, and IDE integrations.

```bash
npx rrce-workflow mcp
```

From this dashboard, you can:
-   **Manage Projects**: Toggle which projects are exposed to your AI agents.
-   **Monitor Status**: See the health of the MCP server and RAG indexing.
-   **Install to IDE**: Automatically configure **VSCode**, **Claude Desktop**, **Antigravity IDE**, or **OpenCode** to use the RRCE MCP server.
-   **View Logs**: Debug agent interactions in real-time.

### 2. Setting Up a Project

To enable agent workflows for your current project, run the setup wizard:

```bash
cd your-project
npx rrce-workflow
```

You can choose between:

*   **⚡ Express Setup**: Configures the project using recommended defaults:
    *   **Global Storage**: Keeps your project directory clean; config lives in `~/.rrce-workflow/`.
    *   **MCP Enabled**: Exposes the project to your AI tools via the local server.
    *   **RAG Enabled**: Indexes your code for semantic search.
    
*   **⚙️ Custom Setup**: Full control over storage location (Global vs Workspace), tool selection, and more.

---

## 🧠 Model Context Protocol (MCP)

RRCE-Workflow uses the [Model Context Protocol](https://modelcontextprotocol.io/) to bridge your codebase with AI models. This allows your AI assistant to "see" your project context without needing to manually copy-paste files.

### Features
*   **Universal Context**: Access your project's `project-context.md`, architecture docs, and task history from *any* MCP-enabled tool.
*   **Cross-Project References**: Your AI can read documentation from Project A while working on Project B (perfect for monorepos or microservices).
*   **Tools & Resources**: Exposes tools like `search_knowledge` and `get_project_context` directly to the model.

### Connecting Your IDE

The easiest way to connect is via the TUI (`npx rrce-workflow mcp` -> **Install** tab), but you can also configure it manually.

#### OpenCode

Add to `~/.config/opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rrce": {
      "type": "local",
      "command": ["npx", "-y", "rrce-workflow", "mcp", "start"],
      "enabled": true
    }
  }
}
```

#### VSCode (with MCP Extension)
Add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "rrce": {
      "type": "stdio",
      "command": "npx",
      "args": ["rrce-workflow", "mcp", "start"]
    }
  }
}
```

#### Claude Desktop
Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "rrce": {
      "command": "npx",
      "args": ["rrce-workflow", "mcp", "start"]
    }
  }
}
```

### Uninstalling MCP Integration

To remove RRCE from your IDEs:

```bash
npx rrce-workflow mcp uninstall
```

This will:
- Show you which IDEs currently have RRCE installed
- Let you select which ones to remove it from
- Ask for confirmation before removal
- Cleanly remove RRCE configuration while preserving other MCP servers and settings

---

## 📂 Storage Modes

RRCE-Workflow supports two ways to store your agent workflow data (`knowledge/`, `tasks/`, `refs/`).

### 1. Global Mode (Default & Recommended)
Stores configuration and knowledge outside your project directory in `~/.rrce-workflow/workspaces/<project-name>` (or a custom path you configure).

*   **✅ Pros**: Keeps your repo clean, easy cross-project linking, no `.gitignore` pollution.
*   **❌ Cons**: Knowledge isn't checked into your project's git repo (unless you manually sync/backup).

**Custom Global Path**: When running the wizard, you can choose a custom location instead of `~/.rrce-workflow/`. Your preference is saved and automatically used for future projects.

### 2. Workspace Mode (Alternative)
Stores everything in a `.rrce-workflow` folder inside your project root.

*   **✅ Pros**: Knowledge travels with the repo (great for teams sharing context).
*   **❌ Cons**: Adds files to your project tree; requires `.gitignore` management.

**To use Workspace Mode**: Select "Custom Setup" -> "Workspace" when running `npx rrce-workflow`.

---

## 🤖 The Agent Pipeline

Once installed, you gain access to powerful agent workflows. Invoke them using your AI assistant's chat interface (if supported) or by pasting the prompts.

| Agent | Purpose | Recommended Use |
|-------|---------|-----------------|
| **Init** | **Context Establishment** | Run once at project start to analyze tech stack & architecture. |
| **Research** | **Scope Definition** | Use when starting a complex feature to clarify requirements & risks. |
| **Planning** | **Execution Strategy** | Generates a step-by-step implementation plan (checklist). |
| **Execute** | **Implementation** | The "coding" phase. Implements the plan created by the Planning agent. |
| **Docs** | **Documentation** | Generates tailored docs (API refs, guides) from code. |
| **Sync** | **Knowledge Maintenance** | Scans code changes to update the `knowledge/` folder. |
| **Doctor** | **Health Analysis** | Analyzes codebase for issues, tech debt, and improvement opportunities. |

### Recommended Workflow
1.  **`/init`**: "Analyze this codebase." -> Creates `project-context.md`.
2.  **`/research`**: "I need to add user auth." -> Generates a Research Brief.
3.  **`/plan`**: "Create a plan for user auth." -> Generates an Implementation Plan.
4.  **`/execute`**: "Implement the auth plan." -> Writes code across files.
5.  **`/sync`**: "Update knowledge." -> Refreshes context for the next task.

---

## 🔍 Semantic Search (RAG)

RRCE-Workflow includes a local, embedding-based search engine.
-   **Privacy First**: All embeddings are calculated locally on your CPU/GPU. No code leaves your machine.
-   **Smart Context**: Allows the agent to find relevant code snippets via natural language queries (e.g., "Find the authentication middleware logic") even if keywords don't match exactly.

RAG is enabled by default in Express Setup. You can toggle it per-project in the MCP Dashboard.

---

## Requirements

-   **Node.js 18+**
-   **Git**

## License

MIT © RRCE Team
