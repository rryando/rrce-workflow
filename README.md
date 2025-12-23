# TUI Agent Workflow Generator

[![RRCE-Workflow](https://img.shields.io/badge/RRCE-Workflow-blue)](https://github.com/rryando/tui-agemt-workflow-gen)

> **RR Context Engineering Workflow** - A selection-agnostic agentic code workflow generator

A terminal-based multi-agent workflow system designed to work seamlessly with:
- 🤖 **GitHub Copilot CLI** - Command-line AI assistance
- 🚀 **Antigravity IDE** - Google's agentic coding environment  
- 💻 **VS Code** - With Copilot and other AI extensions

## Overview

RRCE-Workflow provides a structured approach to AI-assisted software development through a 4-agent pipeline:

```
Research → Planning → Execution → Documentation
              ↓
        Knowledge Cache (persistent context)
```

## Key Features

- **Selection Agnostic** - Same prompts work across all supported tools
- **Workspace Aware** - Respects project boundaries and maintainer preferences  
- **Global Cache, Project Scoped** - Knowledge persists in `~/.rrce-workflow/` but is organized per-project
- **Non-Intrusive** - Minimal footprint in your workspace

## Quick Start

```bash
# Install and run setup wizard
npx rrce-workflow

# Initialize project context (first time or to refresh)
rrce-workflow init

# Start a new task
rrce-workflow research "Add user authentication"

# Continue with planning
rrce-workflow plan auth-feature

# Execute the plan
rrce-workflow execute auth-feature

# Generate documentation
rrce-workflow document auth-feature
```

## Project Structure

```
~/.rrce-workflow/                    # Global installation
├── config.yaml                      # User preferences
├── templates/                       # Default templates
└── workspaces/                      # Project-scoped cache
    └── <hash>/                      # Per-project knowledge & tasks

<your-project>/
└── .rrce-workflow.yaml              # Optional: project config
```

## Agent Roles

| Agent | Purpose |
|-------|---------|
| **Init** | Analyze codebase, establish project context (tech stack, conventions, scope) |
| **Research** | Clarify requirements, surface risks, create requirements brief |
| **Planning** | Convert research into actionable, prioritized task breakdown |
| **Executor** | Implement code, run tests, maintain execution log |
| **Documentation** | Synthesize work into release-ready documentation |
| **Sync** | Reconcile codebase state with knowledge cache |

## Configuration

### User Config (`~/.rrce-workflow/config.yaml`)

```yaml
version: 1
author: "your-name"
email: "your@email.com"
```

### Project Config (`.rrce-workflow.yaml`)

```yaml
version: 1
cache:
  enabled: true    # Set to false to disable caching for this repo
project:
  name: "my-project"
```

## Documentation

- [Architecture](./docs/architecture.md) - Detailed system design
- [Prompts](./agent-core/prompts/) - Agent prompt definitions
- [Templates](./agent-core/templates/) - Output templates

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RRCE_HOME` | Global installation path | `~/.rrce-workflow` |
| `RRCE_WORKSPACE` | Explicit workspace root | Auto-detected |
| `RRCE_AUTHOR` | Default author name | From config |

## License

MIT
