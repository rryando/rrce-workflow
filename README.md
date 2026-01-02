# RRCE-Workflow

> **Agentic code workflow generator for AI-assisted development**

[![npm version](https://badge.fury.io/js/rrce-workflow.svg)](https://www.npmjs.com/package/rrce-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RRCE-Workflow transforms your AI coding assistant (GitHub Copilot, OpenCode, Claude Desktop, Antigravity IDE) into a **context-aware agent** with persistent project knowledge.

**Key Features:**
- **Global Knowledge Base**: Centralized context management across all your projects (`~/.rrce-workflow/`).
- **MCP Hub**: A Model Context Protocol server exposing tools, resources, and prompts to any MCP-compatible client.
- **Semantic Search (RAG)**: Local, privacy-first vector indexing powered by `@xenova/transformers` for deep codebase understanding.
- **Structured Agent Pipelines**: 7 specialized agents (Init, Research, Planning, Executor, Docs, Sync, Doctor) for end-to-end development workflows.
- **Task Management**: Built-in CRUD operations for tracking high-level tasks via MCP tools.

---

## 🚀 Quick Start

### 1. Run the Wizard (Project Setup)

From the project you want to work on:

```bash
cd your-project
npx rrce-workflow
```

This launches the setup wizard and can:
- Create the `.rrce-workflow/` structure (workspace mode) or initialize global storage (global mode)
- Install IDE integrations (VSCode / Claude Desktop / OpenCode / Antigravity)
- Optionally expose the project to MCP and enable semantic search indexing

### 2. Launch the MCP Dashboard (TUI)

The **MCP Dashboard** lets you manage exposed projects, indexing jobs, IDE integrations, and view logs.

```bash
npx rrce-workflow mcp
```

### 3. Run the MCP Server (for IDE integrations)

When an IDE connects via MCP, it launches the server in non-interactive mode:

```bash
npx rrce-workflow mcp start
```

Note: `mcp start` is intended for stdio-based MCP clients (it only auto-starts when `stdout` is not a TTY).

---

## 🧠 Model Context Protocol (MCP)

RRCE-Workflow uses the [Model Context Protocol](https://modelcontextprotocol.io/) to bridge your codebase with AI models. This allows your AI assistant to access project context and knowledge without copy/paste.

### Features
*   **Universal Context**: Access your project's `project-context.md`, architecture docs, and task history from *any* MCP-enabled tool.
*   **Cross-Project References**: Your AI can read documentation from Project A while working on Project B (perfect for monorepos or microservices).
*   **MCP Tools**: Includes `search_knowledge`, `search_code`, `find_related_files`, `get_project_context`, `resolve_path`, task CRUD operations, and more.

### MCP Tools Reference

| Tool | Description |
|------|-------------|
| `resolve_path` | Resolve configuration paths (`RRCE_DATA`, `WORKSPACE_ROOT`, etc.) for a project |
| `list_projects` | List projects exposed via MCP |
| `get_project_context` | Get the project context/architecture for a specific project |
| `search_knowledge` | Semantic search across project knowledge bases |
| `search_code` | Semantic search across code files (snippets + line numbers + context) |
| `find_related_files` | Find imports/imported-by relationships for a file |
| `index_knowledge` | Start (or query) the semantic indexing job for a project |
| `list_agents` | List available RRCE agents and their arguments |
| `get_agent_prompt` | Get the system prompt for a specific agent (with context injection) |
| `list_tasks` | List all tasks for a project |
| `get_task` | Get details of a task |
| `create_task` | Create a task |
| `update_task` | Update a task (`meta.json`) |
| `delete_task` | Delete a task |

### Connecting Your IDE

The easiest way to connect is via the TUI (`npx rrce-workflow mcp` -> **Install** tab), but you can also configure it manually.

#### OpenCode

RRCE-Workflow integrates with OpenCode both as an MCP server and by providing **Custom Primary Agents**.

1.  **Register MCP Server**: Add the following to `~/.config/opencode/opencode.json`:
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

2.  **Install Agents**: Run `npx rrce-workflow` and select **OpenCode** as a tool. This will generate specialized primary agents (Research, Planning, etc.) in `.opencode/agent/` that you can cycle through using the **Tab** key in the OpenCode TUI.

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

## The Agent Pipeline

Once installed, you gain access to 7 specialized agent workflows. Invoke them via your AI assistant's chat interface or through MCP tools.

| Agent | ID | Purpose | Key Arguments |
|-------|----|---------|---------------|
| **Init** | `init` | Analyze codebase, establish project context and semantic index | `PROJECT_NAME` (optional) |
| **Research** | `research_discussion` | Interactive requirements clarification through dialogue | `TASK_SLUG`, `REQUEST` |
| **Planning** | `planning_discussion` | Transform research into actionable execution plan | `TASK_SLUG` |
| **Executor** | `executor` | Implement the plan - the ONLY agent authorized to modify code | `TASK_SLUG`, `BRANCH` |
| **Docs** | `documentation` | Generate project documentation (API, architecture, changelog) | `DOC_TYPE`, `TASK_SLUG` |
| **Sync** | `sync` | Reconcile knowledge base with current codebase state | `SCOPE` (optional) |
| **Doctor** | `doctor` | Analyze codebase health, identify issues, recommend improvements | `PROJECT_NAME`, `FOCUS_AREA` |

### Recommended Workflow
1.  **`init`**: "Analyze this codebase." → Creates `project-context.md` and semantic index.
2.  **`research_discussion`**: "I need to add user auth." → Interactive requirements gathering.
3.  **`planning_discussion`**: "Create a plan for user auth." → Generates implementation checklist.
4.  **`executor`**: "Implement the auth plan." → Writes code, runs tests.
5.  **`documentation`**: "Generate API docs." → Produces release-ready documentation.
6.  **`sync`**: "Update knowledge." → Refreshes context for the next task.

---

## Semantic Search (RAG)

RRCE-Workflow includes a local, embedding-based search engine powered by `@xenova/transformers`.

-   **Privacy First**: All embeddings are calculated locally. No code leaves your machine.
-   **Full Codebase Indexing**: The `index_knowledge` tool scans your entire source tree (respecting skip lists like `node_modules`, `.git`).
-   **Smart Fallback**: If RAG fails or isn't enabled, `search_knowledge` performs line-by-line text matching.
-   **Model**: Uses `Xenova/all-MiniLM-L6-v2` by default (configurable per-project).

RAG is enabled by default in Express Setup. You can toggle it per-project in the MCP Dashboard or via `config.yaml`.

---

## Requirements

-   **Node.js 18+**
-   **Git**

## Tech Stack

| Component | Technology |
|-----------|------------|
| TUI Framework | Ink ^6.6.0 (React-based) |
| MCP Server | @modelcontextprotocol/sdk ^1.25.1 |
| Embeddings | @xenova/transformers ^2.17.2 |
| Build | esbuild |
| Runtime | Node.js >= 18 |

## License

MIT © RRCE Team
