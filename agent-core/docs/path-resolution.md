# RRCE Path Resolution Protocol

This document describes how agents should resolve path variables. All agents reference this protocol.

## Automatic Resolution (Preferred)

When you receive a prompt, look for the **"System Resolved Paths"** table at the top of the context. If present, use those values directly:

| Variable | Description |
|----------|-------------|
| `WORKSPACE_ROOT` | Source code directory (where code lives) |
| `WORKSPACE_NAME` | Project name |
| `RRCE_DATA` | Storage path for knowledge, tasks, refs |
| `RRCE_HOME` | Global RRCE home (~/.rrce-workflow) |

**If the table is present, do NOT manually resolve paths.** Use the values exactly as provided.

## Manual Resolution (Fallback Only)

Only if no "System Resolved Paths" section exists in the context:

1. Read `.rrce-workflow/config.yaml` or `{{RRCE_HOME}}/workspaces/<project>/config.yaml`
2. Check `storage.mode`:
   - `workspace` → `RRCE_DATA = {{WORKSPACE_ROOT}}/.rrce-workflow/`
   - `global` → `RRCE_DATA = {{RRCE_HOME}}/workspaces/{{WORKSPACE_NAME}}/`
3. Defaults if no config found:
   - `RRCE_HOME = ~/.rrce-workflow`
   - `RRCE_DATA = .rrce-workflow/` (workspace mode assumed)

## Cross-Project References

To access another project's data:

**Via Path:**
```
{{RRCE_HOME}}/workspaces/<other-project>/knowledge/
```

**Via Tool (Preferred):**
```
Tool: search_knowledge
Args: { query: "your query", project: "<other-project>" }
```

## Resolution via MCP Tool (Highly Recommended)

If the "System Resolved Paths" table is missing or you suspect it might be outdated, use the `resolve_path` tool. This is the most robust way to determine the correct configuration, as it handles the logic for detecting global vs. local workspace modes.

```
Tool: resolve_path
Args: { path: "/absolute/path/to/workspace/root" }
```

Or if you only know the project name:

```
Tool: resolve_path
Args: { project: "project-name" }
```

The tool returns a JSON object containing `RRCE_DATA`, `RRCE_HOME`, `WORKSPACE_ROOT`, and `storage_mode`.

## Common Paths Reference

| Purpose | Path |
|---------|------|
| Project context | `{{RRCE_DATA}}/knowledge/project-context.md` |
| Semantic index | `{{RRCE_DATA}}/knowledge/embeddings.json` |
| Task storage | `{{RRCE_DATA}}/tasks/{{TASK_SLUG}}/` |
| Research output | `{{RRCE_DATA}}/tasks/{{TASK_SLUG}}/research/` |
| Planning output | `{{RRCE_DATA}}/tasks/{{TASK_SLUG}}/planning/` |
| Execution output | `{{RRCE_DATA}}/tasks/{{TASK_SLUG}}/execution/` |
| Documentation output | `{{RRCE_DATA}}/tasks/{{TASK_SLUG}}/docs/` |
| Templates | `{{RRCE_HOME}}/templates/` |
| Shared docs | `{{RRCE_HOME}}/docs/` |

## Variable Substitution

When writing files or referencing paths in output:

1. **In markdown/text files**: Use the literal resolved path (e.g., `/home/user/my-project/.rrce-workflow/`)
2. **In documentation/templates**: Use `{{VARIABLE}}` syntax for portability
3. **In meta.json**: Use relative paths from `RRCE_DATA` when possible

## Examples

### Correct Usage
```
# Context shows: RRCE_DATA = /home/user/project/.rrce-workflow

# To read project context:
Read file: /home/user/project/.rrce-workflow/knowledge/project-context.md

# To create task directory:
Create: /home/user/project/.rrce-workflow/tasks/add-auth/research/
```

### Incorrect Usage
```
# DON'T do this if paths are pre-resolved:
Read file: {{RRCE_DATA}}/knowledge/project-context.md  # Wrong - should use actual path

# DON'T manually construct paths:
Read file: ~/.rrce-workflow/workspaces/project/...  # Wrong - use provided RRCE_DATA
```
