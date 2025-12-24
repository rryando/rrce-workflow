# RRCE-Workflow

> Agentic code workflow generator for AI-assisted development

[![npm version](https://badge.fury.io/js/rrce-workflow.svg)](https://www.npmjs.com/package/rrce-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RRCE-Workflow is a TUI that helps you set up and manage AI agent workflows for your codebase. It works with GitHub Copilot, Antigravity IDE, and other AI coding tools.

## Installation

```bash
# Using npm
npx rrce-workflow

# Using bun (recommended)
bunx rrce-workflow

# Global install
npm install -g rrce-workflow
```

## Quick Start

```bash
# Run setup wizard
rrce-workflow wizard

# Or just run to see available agents
rrce-workflow
```

## Features

- **Setup Wizard** - Interactive configuration for storage mode and AI tools
- **Agent Prompts** - Pre-built prompts for init, research, planning, execution, documentation, and sync
- **Multi-Tool Support** - Works with GitHub Copilot (`.agent.md`) and Antigravity IDE
- **Cross-Project References** - Reference context from related projects

## Agents

| Agent | Command | Description |
|-------|---------|-------------|
| **Init** | `/init` | Initialize or update project context |
| **Research** | `/research` | Clarify requirements and create research brief |
| **Planning** | `/plan` | Transform requirements into execution plan |
| **Executor** | `/execute` | Implement the planned tasks |
| **Documentation** | `/docs` | Generate project documentation |
| **Sync** | `/sync` | Reconcile codebase with knowledge base |

## Configuration

After running the wizard, a `.rrce-workflow.yaml` is created in your project:

```yaml
version: 1

storage:
  mode: global  # or: workspace, both

project:
  name: "my-project"
```

### Storage Modes

| Mode | Location | Use Case |
|------|----------|----------|
| `global` | `~/.rrce-workflow/workspaces/<name>/` | Non-intrusive, cross-project access |
| `workspace` | `.rrce-workflow/` | Portable with repo, team sharing |
| `both` | Both locations (synced) | Redundancy + cross-project access |

When `both` is selected, data is stored in **both** locations simultaneously:
- Primary (for reads): `<workspace>/.rrce-workflow/`
- Secondary (auto-synced): `~/.rrce-workflow/workspaces/<name>/`

Each storage location contains:
```
<storage-path>/
├── knowledge/      # Project context and domain knowledge
├── prompts/        # Agent prompt files
├── refs/           # External references
├── tasks/          # Task artifacts and metadata
└── templates/      # Output templates
```

## Requirements

- Node.js 18+ or Bun 1.0+
- Git (for user detection)

## License

MIT © RRCE Team
