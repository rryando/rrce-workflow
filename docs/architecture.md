# RRCE-Workflow Architecture

> RR Context Engineering Workflow - A selection-agnostic agentic workflow system
> 
> **Version**: 0.2.91 | **Last Updated**: 2025-12-31

## Overview

RRCE-Workflow is a TUI-based agentic code workflow generator designed to work seamlessly across:
- **OpenCode** (Native agentic TUI environment with custom Primary Agents)
- **GitHub Copilot** (VSCode with MCP extension)
- **Antigravity IDE** (Google's agentic coding environment)
- **Claude Desktop** (MCP Server integration)
- **Any MCP-compatible client**

The system provides a structured multi-agent pipeline (7 agents) for software development tasks, with persistent knowledge caching, semantic search (RAG), and workspace-aware context management.

## Core Principles

1. **Selection Agnostic** - Identical prompts and behavior across all supported tools
2. **Workspace Aware** - Respects project boundaries and maintainer preferences
3. **Global Cache, Project Scoped** - Knowledge persists globally but is organized per-project
4. **Non-Intrusive** - Minimal footprint in workspace; state lives in user home directory

---

## Directory Structure

### Source Code Organization

```
rrce-workflow/
├── agent-core/           # Agent prompts and templates (Source of Truth)
│   ├── prompts/          # 7 agent system prompts (doctor, executor, init, etc.)
│   ├── templates/        # Output templates for agents
│   │   └── docs/         # Doc-type specific templates
│   └── docs/             # Internal documentation (path-resolution.md)
├── bin/                  # Executable entry points
│   └── rrce-workflow.js  # NPM binary wrapper
├── docs/                 # High-level architecture docs (this file)
├── scripts/              # Maintenance and verification scripts
├── src/                  # Source code
│   ├── commands/         # CLI/TUI command implementations
│   │   └── wizard/       # Interactive setup wizard (setup-flow, link-flow, etc.)
│   ├── lib/              # Core utilities
│   │   ├── detection.ts  # Project scanning and detection (DetectedProject)
│   │   ├── detection-service.ts  # Singleton project service
│   │   ├── git.ts        # Git utilities
│   │   ├── paths.ts      # Path resolution (RRCE_HOME, RRCE_DATA, etc.)
│   │   └── preferences.ts # User preference storage
│   ├── mcp/              # MCP Server implementation
│   │   ├── handlers/     # Decomposed request handlers
│   │   │   ├── prompts.ts   # Prompt/agent handlers
│   │   │   ├── resources.ts # Resource handlers
│   │   │   └── tools.ts     # 12 MCP tools (search, index, tasks, etc.)
│   │   ├── services/     # Backend services
│   │   │   └── rag.ts    # Semantic search with @xenova/transformers
│   │   ├── ui/           # TUI components (Ink/React)
│   │   │   └── components/ # Reusable UI components
│   │   ├── config.ts     # MCP configuration management
│   │   ├── resources.ts  # Project data access utilities
│   │   └── server.ts     # MCP Server entry point (Stdio transport)
│   └── types/            # Global TypeScript definitions
└── temp_rag_test/        # RAG testing environment
```

### Global Installation (`~/.rrce-workflow/`)

```
~/.rrce-workflow/
├── mcp.yaml                             # MCP server configuration (projects, permissions)
├── preferences.json                     # User preferences (global path overrides)
├── templates/                           # Default template store
│   ├── meta.template.json               # Task metadata template
│   └── docs/                            # Doc-type specific templates
└── workspaces/                          # Project-scoped data (Global Mode)
    └── <workspace-name>/                # Named by project, not hash
        ├── config.yaml                  # Project configuration
        ├── knowledge/                   # Project domain knowledge
        │   ├── project-context.md       # Main context file
        │   ├── embeddings.json          # RAG vector index
        │   └── <topic>.md               # Additional knowledge files
        ├── refs/                        # Reference documents
        └── tasks/                       # Task state and artifacts
            └── <task-slug>/
                ├── meta.json            # Task metadata, checklist, agent status
                ├── research/            # Research artifacts
                ├── planning/            # Planning artifacts
                ├── execution/           # Execution logs
                └── docs/                # Generated documentation
```

### Workspace Mode (`.rrce-workflow/`)

```
<workspace>/
└── .rrce-workflow/
    ├── config.yaml                      # Project-specific config
    ├── knowledge/                       # Project knowledge (same structure as global)
    ├── refs/
    └── tasks/
```

---

## Path Resolution

### Storage Modes

| Mode | Location | Use Case |
|------|----------|----------|
| `global` (default) | `~/.rrce-workflow/workspaces/<workspace-name>/` | Non-intrusive, survives repo deletion |
| `workspace` | `<workspace>/.rrce-workflow/` | Portable, team-shareable |

Configure via `config.yaml`:
```yaml
mode: global  # or: workspace
name: my-project
sourcePath: /path/to/source  # For global mode: links data back to source
```

### Key Path Functions (`src/lib/paths.ts`)

| Function | Purpose |
|----------|---------|
| `getEffectiveGlobalPath()` | Returns RRCE_HOME respecting user preferences |
| `getConfigPath(workspaceRoot)` | Finds config.yaml (local or global) |
| `resolveDataPath(mode, name, root)` | Resolves RRCE_DATA based on storage mode |
| `detectWorkspaceRoot()` | Walks up from CWD to find project root |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `RRCE_HOME` | Global installation path | `~/.rrce-workflow` |
| `RRCE_WORKSPACE` | Explicit workspace root | Auto-detected |

### Template Variables

| Variable | Resolves To |
|----------|-------------|
| `{{RRCE_HOME}}` | Global installation path |
| `{{RRCE_DATA}}` | Data path (based on storage mode) |
| `{{WORKSPACE_ROOT}}` | Workspace directory (source code location) |
| `{{WORKSPACE_NAME}}` | Project name (from config or directory) |

### Workspace Detection Algorithm

```
1. If $RRCE_WORKSPACE is set → use it
2. Walk up from CWD, find first directory containing:
   - .git/
   - .rrce-workflow/config.yaml (new)
   - .rrce-workflow.yaml (legacy)
3. Fall back to CWD
```

### Project Detection (`src/lib/detection.ts`)

The `DetectedProject` interface captures:
```typescript
interface DetectedProject {
  name: string;
  path: string;           // Absolute path to project root
  dataPath: string;       // Path to .rrce-workflow data directory
  source: 'global' | 'local';
  sourcePath?: string;    // For global mode: actual source code location
  knowledgePath?: string;
  tasksPath?: string;
  semanticSearchEnabled?: boolean;
}
```

Scanning priority:
1. Known projects from MCP config (name + path)
2. Global storage (`~/.rrce-workflow/workspaces/`)
3. Home directory recursive scan (up to depth 5)

### Cross-Project References

Reference another project's context when needed:
```
{{RRCE_HOME}}/workspaces/<other-project-name>/knowledge/project-context.md
```

**Use cases:**
- FE project referencing BE API specs
- Microservice referencing shared library conventions
- Monorepo packages accessing root-level decisions

---

## Agent Pipeline

```
                                    ┌─────────────────┐
                                    │      Init       │ ← First run or re-sync
                                    │ (Project Setup) │
                                    └────────┬────────┘
                                             │
                                             ▼
                                  project-context.md + embeddings.json
                                             │
        ┌────────────────────────────────────┴────────────────────────────────────┐
        ▼                                                                          │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Research     │────▶│    Planning     │────▶│    Executor     │────▶│  Documentation  │
│   Discussion    │     │   Discussion    │     │ (Code Changes)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
        ▼                       ▼                       ▼                       ▼
   research.md              plan.md              execution.md          handover.md
        │                       │                       │                       │
        └───────────────────────┴───────────────────────┴───────────────────────┘
                                        │
                               ┌────────┴────────┐
                               ▼                 ▼
                       {{RRCE_DATA}}/      ┌─────────────────┐
                         knowledge/        │      Sync       │
                                           │ (Reconciliation)│
                                           └────────┬────────┘
                                                    │
                                           ┌────────┴────────┐
                                           ▼                 ▼
                                       Doctor           (Next Task)
                                    (Health Check)
```

### Agent Responsibilities

| Agent | ID | Role | Input | Output |
|-------|-----|------|-------|--------|
| **Init** | `init` | Analyze codebase, establish project context, build RAG index | Workspace files | `project-context.md`, `embeddings.json` |
| **Research** | `research_discussion` | Interactive requirements clarification, surface risks | User request + context | Research brief |
| **Planning** | `planning_discussion` | Create actionable execution plan with checklist | Research brief | Prioritized task breakdown |
| **Executor** | `executor` | Implement and verify - ONLY agent that modifies code | Plan + skill scope | Code + execution log |
| **Documentation** | `documentation` | Synthesize and handover | All artifacts | Release-ready docs |
| **Sync** | `sync` | Reconcile knowledge with codebase state | Codebase state | Updated knowledge files |
| **Doctor** | `doctor` | Analyze codebase health using semantic search | Project + focus area | Health report, improvement tasks |

---

## Configuration

### MCP Configuration (`~/.rrce-workflow/mcp.yaml`)

```yaml
# Projects exposed to MCP clients
projects:
  - name: my-project
    path: /path/to/my-project
    permissions:
      knowledge: true
      tasks: true
      prompts: true
    semanticSearch:
      enabled: true
      model: Xenova/all-MiniLM-L6-v2
```

### Project Config (`<workspace>/.rrce-workflow/config.yaml` or global)

```yaml
name: my-project
mode: global  # or: workspace
sourcePath: /path/to/source  # For global mode

# Semantic search configuration
semantic_search:
  enabled: true

# Cross-project linking
linked_projects:
  - other-project
```

### User Preferences (`~/.rrce-workflow/preferences.json`)

```json
{
  "defaultGlobalPath": "/custom/path/.rrce-workflow",
  "useCustomGlobalPath": true
}
```

### Project Config (`<workspace>/.rrce-workflow.yaml`)

```yaml
version: 1

# Cache control - repo maintainer can disable/customize
cache:
  enabled: true              # Set to false to disable global caching
  knowledge: true            # Cache knowledge globally
  tasks: true                # Cache task state globally

# Template overrides
templates:
  dir: ./my-templates        # Local template directory (optional)

# Project metadata
project:
  name: "my-project"         # Friendly name
  
# Author override
author: "maintainer-name"    # Overrides global config for this project
```

---

## Prompt Frontmatter Schema

All agent prompts in `agent-core/prompts/` use YAML frontmatter for metadata:

```yaml
---
name: RRCE Executor
description: Execute the planned tasks to deliver working code and tests.
tools:
  - read
  - write
  - edit
  - bash
  - glob
  - grep
  - search_knowledge        # MCP tool (becomes rrce_search_knowledge in OpenCode)
  - get_project_context     # MCP tool
  - update_task             # MCP tool
arguments:
  - name: TASK_SLUG
    description: Enter the task slug to execute
    required: true
  - name: BRANCH
    description: Git branch for the work
    required: false
---

# Agent System Prompt Content...
```

### Tool Categories

| Category | Tools | Notes |
|----------|-------|-------|
| **Host Tools** | `read`, `write`, `edit`, `bash`, `grep`, `glob`, `webfetch` | Native to host environment |
| **MCP Tools** | `search_knowledge`, `get_project_context`, `list_tasks`, etc. | Prefixed with `rrce_` in OpenCode |

---

## Multi-Tool Integration

RRCE-Workflow prompts are designed to work across multiple AI coding tools via MCP and IDE-specific agent generation.

### Tool Support Matrix

| Tool | MCP Config Location | Agent Location | Notes |
|------|---------------------|----------------|-------|
| **OpenCode** | `~/.config/opencode/opencode.json` | `.opencode/agent/rrce-*.md` | Custom Primary Agents (Tab to switch) |
| **Antigravity IDE** | `~/.gemini/antigravity/mcp_config.json` | `.agent/workflows/*.md` | Native workflow support |
| **GitHub Copilot (VSCode)** | `.vscode/mcp.json` or global settings | `.github/prompts/*.prompt.md` | Custom agents format |
| **Claude Desktop** | `~/.config/claude/claude_desktop_config.json` | N/A | MCP Server only |

### OpenCode Agent Transformation

When generating agents for OpenCode (`src/commands/wizard/utils.ts`):
- **Mode**: Set to `primary` (enables Tab cycling in TUI)
- **Tools**: 
  - Host tools (`read`, `write`, `edit`, `bash`, `grep`, `glob`, `webfetch`) pass through as-is
  - MCP tools are prefixed with `rrce_` (e.g., `rrce_search_knowledge`)
  - Tool list respects per-agent frontmatter restrictions
- **Naming**: Agents prefixed with `rrce-` to avoid collisions

### Generated Files

**For OpenCode:**
```
.opencode/agent/
├── rrce-init.md
├── rrce-research.md
├── rrce-planning.md
├── rrce-executor.md
├── rrce-documentation.md
├── rrce-sync.md
└── rrce-doctor.md
```

**For Antigravity IDE:**
```
.agent/workflows/
├── init.md
├── research.md
├── planning.md
├── executor.md
├── documentation.md
├── sync.md
└── doctor.md
```

**For GitHub Copilot (VSCode):**
```
.github/prompts/
├── init.prompt.md
├── research.prompt.md
├── planning.prompt.md
├── executor.prompt.md
├── documentation.prompt.md
├── sync.prompt.md
└── doctor.prompt.md
```

---

## MCP Server Architecture

The MCP Server (`src/mcp/`) provides the bridge between project knowledge and AI agents.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Server Entry** | `src/mcp/server.ts` | Initializes server, registers handlers, manages Stdio transport |
| **Tool Handlers** | `src/mcp/handlers/tools.ts` | 12 MCP tools (search, index, tasks, resolve_path, etc.) |
| **Prompt Handlers** | `src/mcp/handlers/prompts.ts` | Agent system prompts with context injection |
| **Resource Handlers** | `src/mcp/handlers/resources.ts` | Knowledge files and project context as readable resources |
| **RAG Service** | `src/mcp/services/rag.ts` | Semantic search with @xenova/transformers |
| **Resources Utilities** | `src/mcp/resources.ts` | Project data access, task CRUD, context preamble generation |

### Context Injection

When an agent requests a prompt via `get_agent_prompt`, the server injects a **Context Preamble** containing:
- **System Resolved Paths**: Pre-resolved `RRCE_DATA`, `WORKSPACE_ROOT`, `RRCE_HOME`
- **Available Projects**: List of exposed projects with active project marked
- **Active Workspace**: Current project context for file operations

### Semantic Search (RAG)

| Feature | Implementation |
|---------|----------------|
| **Embedding Model** | `Xenova/all-MiniLM-L6-v2` (configurable) |
| **Index Location** | `<knowledge>/embeddings.json` |
| **Similarity** | Cosine similarity |
| **Indexable Extensions** | `.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rs`, `.md`, etc. |
| **Skip Directories** | `node_modules`, `.git`, `dist`, `build`, etc. |

---

## Installation Flow

```bash
# Option 1: MCP Dashboard (recommended)
npx rrce-workflow mcp

# Option 2: Project Setup Wizard
cd your-project
npx rrce-workflow

# Option 3: Start MCP Server directly (for IDE config)
npx rrce-workflow mcp start
```

---

## Key Design Patterns

1. **MCP Decoupling**: Handlers separated from server instance for maintainability
2. **TUI/MCP Separation**: MCP runs in "interactive" mode to avoid stdio conflicts with TUI
3. **Prompt Parsing**: Frontmatter-based prompts with variable injection
4. **Hybrid Storage**: Global mode (clean repos) vs Workspace mode (portable)
5. **DetectedProject.sourcePath**: For global mode, links data back to actual source location

---

## Future Considerations

- [ ] Web UI for knowledge browsing
- [ ] Cross-project knowledge sharing (opt-in)
- [ ] Plugin system for custom agents
- [ ] Comprehensive test suite (Jest/Vitest)
- [ ] CI/CD with GitHub Actions
- [ ] Cross-platform parity (Windows/macOS)

