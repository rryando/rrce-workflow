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
1. Ask where to store workflow data (global, workspace, or both)
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
  mode: workspace        # or: global, both
  globalPath: "~/.rrce-workflow"  # optional custom path

project:
  name: "my-project"
```

Agents resolve `{{RRCE_DATA}}` based on storage mode:
- `workspace` → `.rrce-workflow/`
- `global` → `~/.rrce-workflow/workspaces/my-project/`
- `both` → `.rrce-workflow/` (primary, synced to global)

### Cross-Project References

When using `global` or `both` mode, you can reference other projects:

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
| `both` | Both locations (synced) | Full redundancy + cross-project access |

---

## Custom Global Path

If the default `~/.rrce-workflow` isn't writable (common with `npx` in enterprise environments), the wizard lets you choose a custom location:

```yaml
storage:
  mode: global
  globalPath: "/path/to/custom/rrce-workflow"
```

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

---

## License

MIT © RRCE Team
