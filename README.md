# RRCE-Workflow

> Agentic code workflow generator for AI-assisted development

[![npm version](https://badge.fury.io/js/rrce-workflow.svg)](https://www.npmjs.com/package/rrce-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RRCE-Workflow is a CLI wizard that sets up AI agent prompts and workflows for your codebase. It works with **GitHub Copilot**, **Antigravity IDE**, and other AI coding assistants.

## Installation

```bash
# Quick start (no install needed)
npx rrce-workflow

# Or install globally
npm install -g rrce-workflow
```

---

## How to Use

### 1. Initial Setup

Run the wizard in your project directory:

```bash
cd your-project
npx rrce-workflow
```

The wizard will:
1. Ask where to store workflow data (global or workspace)
2. Let you choose a custom global path if the default isn't writable
3. Ask which AI tools you use (GitHub Copilot, Antigravity)
4. Set up prompts and knowledge folders

### 2. Using the Agent Prompts

After setup, you'll have agent prompts in IDE-specific folders:

- **GitHub Copilot**: `.github/agents/*.agent.md`
- **Antigravity**: `.agent/workflows/*.md`

In your AI assistant, invoke prompts using their names:

| Agent | Invoke With | What It Does |
|-------|-------------|--------------|
| **Init** | `/init` | Analyze your codebase and create `project-context.md` |
| **Research** | `/research REQUEST="..." TASK_SLUG=my-task` | Clarify requirements, create research brief |
| **Planning** | `/plan TASK_SLUG=my-task` | Create actionable execution plan |
| **Execute** | `/execute TASK_SLUG=my-task` | Implement the planned work |
| **Docs** | `/docs DOC_TYPE=architecture` | Generate documentation |
| **Sync** | `/sync` | Update knowledge base after code changes |

### 3. Recommended Workflow (RRCE Pipeline)

```
1. /init       → Establish project context
2. /research   → Clarify requirements for a new task
3. /plan       → Create execution plan
4. /execute    → Implement the plan
5. /docs       → Generate documentation (optional)
6. /sync       → Keep knowledge base current (periodic)
```

#### Pipeline Stages Explained

**🔍 Init** — Scans your codebase to understand tech stack, architecture, coding conventions, and project structure. Creates `project-context.md` that all other agents rely on. Run once at project start, and again when major changes occur.

**💬 Research** — Entry point for new tasks. Takes a user request and engages in clarifying discussion to refine scope, surface risks, and identify gaps. Produces a research brief for the Planning agent.

**📋 Planning** — Transforms the research brief into an ordered, actionable execution plan. Breaks work into tasks with dependencies, acceptance criteria, and testing strategy. Ensures the Executor has clear guidance.

**⚡ Execute** — Implements the planned work. Writes code, adds tests, runs verifications. Updates task metadata and logs execution notes for auditability.

**📄 Docs** — Synthesizes the completed work into documentation. Can generate API docs, architecture overviews, runbooks, or changelogs based on `DOC_TYPE`.

**🔄 Sync** — Maintenance agent that reconciles the knowledge base with actual code. Run periodically to catch drift and keep documentation accurate.

---

## How It Works

### Path Resolution

All agents read `.rrce-workflow/config.yaml` to resolve paths:

```yaml
storage:
  mode: workspace        # or: global
  globalPath: "~/.rrce-workflow"  # optional custom path

project:
  name: "my-project"
```

Agents resolve `{{RRCE_DATA}}` based on storage mode:
- `global` → `~/.rrce-workflow/workspaces/my-project/`

### Cross-Project References

When using `global` mode, you can reference other projects:

```
~/.rrce-workflow/workspaces/other-project/knowledge/project-context.md
```

This enables a frontend app to reference its backend API's knowledge!

---

## Folder Structure

After setup, your project will have:

```
your-project/
├── .rrce-workflow/           # Data storage
│   ├── config.yaml           # Configuration
│   ├── knowledge/            # Project context
│   ├── refs/                 # External references
│   ├── tasks/                # Task artifacts by slug
│   └── templates/            # Output templates
├── .github/agents/           # GitHub Copilot prompts
│   └── *.agent.md
└── .agent/workflows/         # Antigravity prompts
    └── *.md
```

---

## Wizard Options

When you run the wizard on an already-configured project, you'll see:

| Option | Description |
|--------|-------------|
| **Link other project knowledge** | Reference knowledge from other projects in global storage |
| **Sync to global storage** | Copy workspace data to global (enables cross-project access) |
| **Update from package** | Get latest prompts and templates |

---

## Storage Mode Comparison

| Mode | Location | Best For |
|------|----------|----------|
| `global` | `~/.rrce-workflow/workspaces/<name>/` | Clean workspace, cross-project references |
| `workspace` | `.rrce-workflow/` | Team sharing, portable with repo |

---

## Custom Global Path

If the default `~/.rrce-workflow` isn't writable (common with `npx` in enterprise environments), the wizard lets you choose a custom location:

```yaml
storage:
  mode: global
  globalPath: "/path/to/custom/rrce-workflow"
```

---

## MCP Hub (Cross-Project AI Access)

RRCE-Workflow includes an **MCP (Model Context Protocol) Hub** that exposes your project knowledge to AI assistants like **VSCode Copilot** and **Claude Desktop**.

### Quick Start

```bash
# Start the MCP Hub
npx rrce-workflow mcp

# Or run directly
npx rrce-workflow mcp start
```

### MCP Features

| Feature | Description |
|---------|-------------|
| **Cross-project knowledge** | AI can access context from multiple projects simultaneously |
| **Agent prompts** | All 6 agents (init, research, plan, execute, docs, sync) exposed as MCP prompts |
| **Search across projects** | Search knowledge bases across all exposed projects |
| **Selective exposure** | Choose which projects to expose via interactive TUI |

### VSCode Copilot Setup

1. Create `.vscode/mcp.json` in your workspace:

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

2. In Copilot Chat, switch to **Agent** mode
3. Click the 🔧 tools icon to see RRCE resources, tools, and prompts

### Claude Desktop Setup

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

### MCP Resources & Tools

**Resources:**
- `rrce://projects` — List all exposed projects
- `rrce://projects/{name}/context` — Get project context
- `rrce://projects/{name}/tasks` — Get task list

**Tools:**
- `search_knowledge` — Search across all project knowledge bases
- `list_projects` — List exposed projects
- `get_project_context` — Get specific project context

**Prompts:**
- `init`, `research`, `plan`, `execute`, `docs`, `sync` — Full RRCE pipeline

### Using Agent Prompts via MCP

Once the MCP server is connected, you can invoke RRCE agent prompts directly:

#### In VSCode Copilot (Agent Mode)

```
# Initialize project context
@rrce Use the init prompt to analyze this codebase

# Start a new task
@rrce Use the research prompt with REQUEST="add user authentication" and TASK_SLUG="auth-feature"

# Create execution plan
@rrce Use the plan prompt for TASK_SLUG="auth-feature"

# Execute the plan
@rrce Use the execute prompt for TASK_SLUG="auth-feature"
```

#### In Claude Desktop

```
Use the RRCE init prompt to analyze the current project

Search my RRCE projects for "authentication"

Use the research prompt with these arguments:
- REQUEST: "Add OAuth2 login"
- TASK_SLUG: "oauth-login"
```

#### In Other MCP-Compatible Tools (Cursor, etc.)

Most MCP clients follow similar patterns:
1. Connect to the RRCE MCP server via stdio
2. Use `list_prompts` to see available prompts
3. Call prompts with required arguments

**Example prompt arguments:**

| Prompt | Required Args | Optional Args |
|--------|---------------|---------------|
| `init` | — | `PROJECT_NAME` |
| `research` | `REQUEST`, `TASK_SLUG` | `TITLE` |
| `plan` | `TASK_SLUG` | — |
| `execute` | `TASK_SLUG` | `BRANCH` |
| `docs` | `DOC_TYPE` | `TASK_SLUG` |
| `sync` | — | `SCOPE` |

### MCP Configuration

Configure which projects to expose:

```bash
npx rrce-workflow mcp           # Interactive TUI
npx rrce-workflow mcp status    # View current status
```

Config stored at `~/.rrce-workflow/mcp.yaml`

---

## Requirements

- **Node.js 18+**
- **Git** (for user detection)

---

## Troubleshooting

### "Permission denied" when setting up

If you can't write to `~/.rrce-workflow`, the wizard will prompt you to choose a custom path. You can also set it manually:

```bash
export RRCE_HOME=/path/to/writable/location
npx rrce-workflow
```

### Agents can't find data files

Make sure the agent reads `.rrce-workflow/config.yaml` first. All prompts include a mandatory first step to resolve paths from the config.

### Updating prompts after package update

```bash
npx rrce-workflow
# Select "Update from package"
```

### MCP server not connecting

Ensure the server starts successfully:
```bash
npx rrce-workflow mcp start
```

Check that your IDE is configured to use stdio transport.

---

## License

MIT © RRCE Team
