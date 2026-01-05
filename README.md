# RRCE-Workflow

> **Agentic code workflow generator for AI-assisted development**

[![npm version](https://badge.fury.io/js/rrce-workflow.svg)](https://www.npmjs.com/package/rrce-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RRCE-Workflow transforms your AI coding assistant (GitHub Copilot, OpenCode, Claude Desktop, Antigravity IDE) into a **context-aware agent** with persistent project knowledge.

**Key Features:**
- **Global Knowledge Base**: Centralized context management across all your projects (`~/.rrce-workflow/`).
- **MCP Hub**: A Model Context Protocol server exposing tools, resources, and prompts to any MCP-compatible client.
- **Semantic Search (RAG)**: Local, privacy-first vector indexing powered by `@xenova/transformers` for deep codebase understanding.
- **4-Phase Workflow**: Init → Design (research+planning merged) → Develop → Document for streamlined development.
- **Slash Commands**: In-context execution (`/rrce_*`) with ~60% token efficiency over subagent delegation.
- **Task Management**: Built-in CRUD operations for tracking high-level tasks via MCP tools, including knowledge extraction and cleanup.
- **Agent Session Tracking**: Real-time task progress visualization in MCP TUI with OpenCode Todo sidebar sync.

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
| `index_knowledge` | Start (or query) the semantic indexing job for a project. Supports `force` (re-hash) and `clean` (wipe/rebuild) parameters |
| `list_tasks` | List all tasks for a project (supports filtering by status, keyword, date) |
| `get_task` | Get details of a task (including phase status, checklist, metadata) |
| `create_task` | Create a new task in the project |
| `update_task` | Update task metadata (`meta.json`) |
| `delete_task` | Delete a task |
| `search_tasks` | Search tasks by keyword, status, agent phase, or date |
| `validate_phase` | Check if a task phase has all prerequisites complete |
| `cleanup_task` | Extract valuable knowledge from tasks and delete artifacts. Supports single, bulk, or --all mode |
| `start_session` | Start an agent session for active task tracking (TUI visibility) |
| `end_session` | End an agent session before completion signal |
| `update_agent_todos` | Update agent todo list for granular work tracking (TUI display) |
| `get_agent_prompt` | Get the system prompt for a specific agent or slash command |

### Connecting Your IDE

The easiest way to connect is via the TUI (`npx rrce-workflow mcp` -> **Install** tab), but you can also configure it manually.

#### OpenCode

RRCE-Workflow integrates with OpenCode both as an MCP server and by providing a **Primary Orchestrator Agent** plus specialized subagents.

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

2.  **Install Agents**: Run `npx rrce-workflow` and select **OpenCode** as a tool. This generates:
    - **Primary Agent (`rrce`)**: Phase Coordinator orchestrating the complete workflow (tab-switchable)
    - **Subagents** (`@rrce_*`): Specialized agents for isolated execution (expert mode)
    - **Auto-configuration**: Hides OpenCode's native plan agent to avoid confusion

3.  **Usage**:
    - Press `Tab` to cycle to the RRCE agent for structured workflows
    - Use slash commands (`/rrce_init`, `/rrce_design`, `/rrce_develop`) for in-context execution (60% more efficient)
    - Direct subagent access via `@rrce_init`, `@rrce_design`, etc. for isolated execution
    - Build agent can automatically delegate to RRCE for complex tasks

See [OpenCode Guide](docs/opencode-guide.md) for detailed usage instructions.

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

## 4-Phase Workflow

RRCE uses a streamlined 4-phase pipeline for end-to-end development:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Init     →  2. Design     →  3. Develop    →  4. Document  │
│  /rrce_init     /rrce_design     /rrce_develop    /rrce_docs   │
└─────────────────────────────────────────────────────────────────┘
```

| Phase | Slash Command | Purpose | Prerequisite |
|-------|---------------|---------|--------------|
| **Init** | `/rrce_init` | Project setup, context extraction, semantic indexing | None |
| **Design** | `/rrce_design task-slug "request"` | Research + Planning (merged for efficiency) | Init complete |
| **Develop** | `/rrce_develop task-slug` | Code implementation based on approved plan | Design complete |
| **Document** | `/rrce_docs task-slug` | Generate/update documentation | Develop complete |

### Slash Commands (In-Context Execution)

The primary interaction model is **in-context slash commands** (`/rrce_*`), which achieve a **60% token reduction** compared to subagent delegation.

| Command | Arguments | Purpose |
|---------|-----------|---------|
| `/rrce_init` | `[project-name]` | Initialize project context and semantic index |
| `/rrce_design` | `task-slug "request"` | Research and plan in single session |
| `/rrce_develop` | `task-slug` | Execute code implementation |
| `/rrce_docs` | `doc-type [task-slug]` | Generate documentation |
| `/rrce_cleanup` | `task-slug` \| `--all` | Extract knowledge and delete tasks |
| `/rrce_sync` | `[scope]` | Sync knowledge base with codebase |
| `/rrce_doctor` | `[focus-area]` | Analyze codebase health |

### Subagents (Isolated Execution)

For fully autonomous, non-interactive execution, use subagents via `@mentions`:

| Agent | Invoke With | Purpose | Key Arguments |
|-------|-------------|---------|---------------|
| **Init** | `@rrce_init` | Analyze codebase, establish project context | `PROJECT_NAME` (optional) |
| **Design** | `@rrce_design` | Research + planning for isolated execution | `TASK_SLUG`, `REQUEST` |
| **Develop** | `@rrce_develop` | Implement the plan - ONLY agent authorized to modify code | `TASK_SLUG` |
| **Docs** | `@rrce_docs` | Generate project documentation | `DOC_TYPE`, `TASK_SLUG` |
| **Sync** | `@rrce_sync` | Reconcile knowledge base with current codebase state | `SCOPE` (optional) |
| **Doctor** | `@rrce_doctor` | Analyze codebase health, recommend improvements | `PROJECT_NAME`, `FOCUS_AREA` |

### OpenCode Integration

OpenCode provides specialized UX optimizations:

- **Tool Name Stabilization**: Standard tools (`read`, `write`) use no `rrce_` prefix, aligning with native IDE capabilities
- **Checklist Sync**: Agents automatically push their task checklist to the OpenCode Todo sidebar
- **Hybrid Delegation**: Orchestrator uses a mix of `@mention` text and interactive confirmation suggestions

### Recommended Workflow
1.  **`/rrce_init`**: "Analyze this codebase." → Creates `project-context.md` and semantic index
2.  **`/rrce_design my-feature "Add user authentication"`**: Research + planning in one session
3.  **`/rrce_develop my-feature`**: Execute the implementation
4.  **`/rrce_docs my-feature`**: Generate/update documentation
5.  **`/rrce_cleanup my-feature`**: (Optional) Extract insights and delete task artifacts

---

## Semantic Search (RAG)

RRCE-Workflow includes a local, embedding-based search engine powered by `@xenova/transformers`.

-   **Privacy First**: All embeddings are calculated locally. No code leaves your machine.
-   **Full Codebase Indexing**: The `index_knowledge` tool scans your entire source tree (respecting `.gitignore` rules).
-   **Background Jobs**: Non-blocking indexing with progress tracking via the MCP Dashboard.
-   **Automatic Cleanup**: DriftService detects and removes embeddings for deleted files during reindexing.
-   **Dual Index**: Separate indices for knowledge (`embeddings.json`) and code (`code-embeddings.json`).
-   **Smart Fallback**: If RAG fails or isn't enabled, `search_knowledge` performs line-by-line text matching.
-   **Model**: Uses `Xenova/all-MiniLM-L6-v2` by default (configurable per-project).

### Reindexing Guidance

| Scenario | Tool Argument | Rationale |
|----------|---------------|-----------|
| Routine updates | `{ "project": "name" }` | Incremental (fastest). Only updates changed files |
| Major refactors | `{ "project": "name", "force": true }` | Forces re-calculation of hashes for all files without wiping |
| Corrupt index / Stale vectors | `{ "project": "name", "clean": true }` | Wipes index files and rebuilds from scratch. Resolves vector drift |

RAG is enabled by default in Express Setup. You can toggle it per-project in the MCP Dashboard or via `config.yaml`.

---

## MCP Dashboard (TUI)

The **MCP Dashboard** provides a cockpit-style interface for managing your RRCE workflow:

### Tabs Overview
1. **Overview (System Cockpit)**: Dashboard snapshot of server health, recent activity, and active task tracking
2. **Logs**: Real-time tailing of the MCP hub server logs
3. **Tasks**: Priority view for task management with current project auto-pinned and expanded
4. **Projects**: Configuration hub for project exposure with real-time indexing progress (indented row)

### Key Features
- **Unified Cockpit Aesthetic**: White borders, high-density information display
- **Active Task Tracking**: Real-time progress visualization with phase indicators
- **Session Management**: Agent todo list display showing granular work items
- **Project Prioritization**: Current workspace automatically pinned and expanded in Tasks tab
- **Background Indexing**: Non-blocking indexing with progress reporting in Projects tab

## 🛠 AI Agent Effectiveness & Code Health

The codebase has been optimized for **highly navigatable AI coding agents**:

### Codebase Optimizations
- **Modular Architecture**: Domain-specific tool handlers split into separate files (`tools/project.ts`, `tools/task.ts`, etc.)
- **Component Refactoring**: TUI views split into modular sub-components (<200 LOC per file)
- **Type Safety**: Strict typing with `TaskMeta`, `AgentInfo`, and `DetectedProject` interfaces (no `any` types)
- **Efficiency**: ~65% token reduction via prompt condensation, session reuse, and hybrid research
- **Testing**: 207 tests passing across 18 test files using Vitest

### AI Agent Guide (AGENTS.md)
All AI coding agents MUST consult `AGENTS.md` for technical ground truth, including:
- Build/test commands (dev mode: `npm run dev`, test: `npm test`)
- Naming conventions (kebab-case files, camelCase functions, PascalCase classes)
- Implementation patterns (`WorkflowError` error handling, SSOT principles)
- MCP & RAG patterns (background jobs, semantic search)

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
