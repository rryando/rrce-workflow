# RRCE-Workflow Architecture

> RR Context Engineering Workflow - A selection-agnostic agentic workflow system

## Overview

RRCE-Workflow is a TUI-based agentic code workflow generator designed to work seamlessly across:
- **GitHub Copilot CLI**
- **Antigravity IDE** (Google's agentic coding environment)
- **VS Code** (with Copilot and other AI extensions)

The system provides a structured multi-agent pipeline for software development tasks, with persistent knowledge caching and workspace-aware context management.

## Core Principles

1. **Selection Agnostic** - Identical prompts and behavior across all supported tools
2. **Workspace Aware** - Respects project boundaries and maintainer preferences
3. **Global Cache, Project Scoped** - Knowledge persists globally but is organized per-project
4. **Non-Intrusive** - Minimal footprint in workspace; state lives in user home directory

---

## Directory Structure

### Global Installation (`~/.rrce-workflow/`)

```
~/.rrce-workflow/
├── config.yaml                              # User global configuration
├── templates/                               # Default template store
│   ├── meta.template.json                   # Task metadata template
│   ├── research_output.md                   # Research brief template
│   ├── planning_output.md                   # Execution plan template
│   ├── executor_output.md                   # Implementation log template
│   ├── documentation_output.md              # Handover note template
│   └── docs/                                # Doc-type specific templates
│       └── <doc-type>.md
└── workspaces/                              # Project-scoped cache
    └── <workspace-hash>/                    # SHA256 of workspace path
        ├── workspace.json                   # Workspace metadata
        ├── knowledge/                       # Project domain knowledge
        │   └── <domain>.md
        └── tasks/                           # Task state and artifacts
            └── <task-slug>/
                ├── meta.json                # Task metadata and status
                ├── research/                # Research artifacts
                ├── planning/                # Planning artifacts
                ├── execution/               # Execution logs
                └── docs/                    # Generated documentation
```

### Workspace Configuration (Optional)

```
<workspace>/
└── .rrce-workflow.yaml                      # Project-specific config
```

---

## Path Resolution

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `RRCE_HOME` | Global installation path | `~/.rrce-workflow` |
| `RRCE_WORKSPACE` | Explicit workspace root | Auto-detected |
| `RRCE_AUTHOR` | Default author name | From `config.yaml` |

### Template Variables (used in prompts and templates)

| Variable | Resolves To |
|----------|-------------|
| `{{RRCE_HOME}}` | Global installation path |
| `{{RRCE_CACHE}}` | `{{RRCE_HOME}}/workspaces/{{WORKSPACE_HASH}}` |
| `{{WORKSPACE_ROOT}}` | Detected workspace directory |
| `{{WORKSPACE_HASH}}` | SHA256 hash of workspace absolute path |

### Workspace Detection Algorithm

```
1. If $RRCE_WORKSPACE is set → use it
2. Walk up from CWD, find first directory containing:
   - .git/
   - .rrce-workflow.yaml
3. Fall back to CWD
```

---

## Agent Pipeline

```
                                    ┌─────────────────┐
                                    │      Init       │ ← First run or re-sync
                                    │ (Project Setup) │
                                    └────────┬────────┘
                                             │
                                             ▼
                                  project-context.md
                                             │
        ┌────────────────────────────────────┴────────────────────────────────────┐
        ▼                                                                          │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Research     │────▶│    Planning     │────▶│    Executor     │────▶│  Documentation  │
│   & Discussion  │     │  Orchestrator   │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
        ▼                       ▼                       ▼                       ▼
   research.md              plan.md              execution.md          handover.md
        │                       │                       │                       │
        └───────────────────────┴───────────────────────┴───────────────────────┘
                                        │
                                        ▼
                            {{RRCE_CACHE}}/knowledge/
                              (Persistent Context)
```

### Agent Responsibilities

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| **Init** | Analyze codebase, establish project context | Workspace files | `project-context.md` |
| **Research & Discussion** | Clarify requirements, surface risks | User request + context | Requirements brief |
| **Planning Orchestrator** | Create actionable execution plan | Research brief | Prioritized task breakdown |
| **Executor** | Implement and verify | Plan + skill scope | Code + execution log |
| **Documentation** | Synthesize and handover | All artifacts | Release-ready docs |
| **Sync** | Reconcile knowledge | Codebase state | Updated knowledge files |

---

## Configuration

### Global Config (`~/.rrce-workflow/config.yaml`)

```yaml
version: 1

# User identity
author: "your-name"
email: "your@email.com"

# Default behaviors
defaults:
  auto_create_workspace_cache: true
  sync_after_execution: false
  
# Editor integration hints (informational)
editor:
  preferred: "vscode"  # vscode | antigravity | vim | etc.
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

All agent prompts use YAML frontmatter for metadata and tool compatibility:

```yaml
---
description: Brief description of the agent's purpose
argument-hint: CLI-style argument hint for display
agent: agent | ask | edit              # Copilot mode
tools: ['search/codebase', ...]        # Available Copilot tools
required-args:
  - name: ARG_NAME
    prompt: "Interactive prompt if arg is missing"
optional-args:
  - name: ARG_NAME
    default: "default value or $ENV_VAR"
---
```

The TUI parses this to:
1. Display help/usage information
2. Auto-prompt for missing required arguments
3. Apply defaults for optional arguments

---

## Multi-Tool Integration

RRCE-Workflow prompts are designed to work across multiple AI coding tools:

### Tool Support Matrix

| Tool | Prompt Location | Extension | Notes |
|------|----------------|-----------|-------|
| **Antigravity IDE** | `.agent/workflows/` | `.md` | Native workflow support |
| **GitHub Copilot (VSCode)** | `.github/prompts/` | `.prompt.md` | Requires `chat.promptFiles: true` |
| **Copilot CLI** | Any location | `.md` | Reference via file path |

### Wizard Command

The TUI provides an interactive wizard to set up prompts for your preferred tools:

```
$ rrce-workflow wizard

┌─────────────────────────────────────────────────────────┐
│  RRCE-Workflow Project Setup                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Which AI tools do you use?                             │
│                                                         │
│  [x] GitHub Copilot (VSCode)                            │
│  [x] Antigravity IDE                                    │
│  [ ] Copilot CLI only                                   │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ✓ Created .github/prompts/*.prompt.md                  │
│  ✓ Created .agent/workflows/*.md                        │
│  ✓ Initialized project context                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Generated Files

When you run `rrce-workflow wizard`, it creates:

**For GitHub Copilot (VSCode):**
```
.github/prompts/
├── init.prompt.md
├── research.prompt.md
├── planning.prompt.md
├── executor.prompt.md
├── documentation.prompt.md
└── sync.prompt.md
```

**For Antigravity IDE:**
```
.agent/workflows/
├── init.md
├── research.md
├── planning.md
├── executor.md
├── documentation.md
└── sync.md
```

### Copilot-Specific Features

Our prompts include Copilot-compatible frontmatter:

| Field | Purpose | Values |
|-------|---------|--------|
| `agent` | Execution mode | `agent` (full), `ask` (read-only), `edit` (code changes) |
| `tools` | Available tools | `search/codebase`, `search/web`, `terminalLastCommand`, etc. |

---

## Installation Flow (TUI First Run)

```
$ npx rrce-workflow

┌─────────────────────────────────────────────────────────┐
│  RRCE-Workflow Setup Wizard                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Welcome! Let's configure your workflow environment.    │
│                                                         │
│  Your name: [_________________]                         │
│  Email (optional): [_________________]                  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ✓ Created ~/.rrce-workflow/config.yaml                │
│  ✓ Installed default templates                          │
│  ✓ Ready to use!                                        │
│                                                         │
│  Run `rrce-workflow help` for available commands.       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Future Considerations

- [ ] Web UI for knowledge browsing
- [ ] Cross-project knowledge sharing (opt-in)
- [ ] Plugin system for custom agents
- [ ] LLM-agnostic (support OpenAI, Anthropic, Gemini, local models)

