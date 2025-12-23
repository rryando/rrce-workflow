# TUI Agent Workflow Generator

A terminal-based agentic code workflow generator designed to work seamlessly with:
- **GitHub Copilot CLI** - Command-line AI assistance
- **Antigravity IDE** - Google's agentic coding environment  
- **VS Code** - With Copilot and other AI extensions

## Overview

This project provides a structured approach to defining, generating, and executing AI-assisted coding workflows through a terminal user interface.

## Project Structure

```
tui-agemt-workflow-gen/
├── agent-core/           # Core agent definitions and workflows
│   ├── knowledge/        # Domain knowledge and context
│   ├── prompts/          # Agent prompt definitions
│   ├── refs/             # Reference materials
│   ├── tasks/            # Task definitions
│   └── templates/        # Output templates
├── .agent/               # Agent workflow configurations
│   └── workflows/        # Reusable workflow definitions
└── ...
```

## Agent Prompts

The `agent-core/prompts/` directory contains specialized prompts for different agent roles:
- `documentation.md` - Documentation generation
- `executor.md` - Code execution workflows
- `planning_orchestrator.md` - Task planning and orchestration
- `research_discussion.md` - Research and discovery
- `sync.md` - Synchronization workflows

## Getting Started

*Coming soon*

## License

*TBD*
