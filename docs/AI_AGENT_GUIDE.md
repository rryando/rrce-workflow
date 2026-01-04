# AI Agent Architecture Guide: RRCE-Workflow

This guide helps AI coding agents understand the codebase structure and conventions to ensure accurate implementations and prevent duplication.

## 1. Project Navigation

### Core Directories
- `src/mcp/`: MCP Server implementation and TUI
  - `ui/`: React (Ink) components for the TUI
  - `handlers/`: MCP protocol handlers (tools, prompts, resources)
  - `services/`: Business logic (RAG, Indexing, Context Extraction)
  - `lib/`: TUI-specific utilities
- `src/lib/`: Shared core utilities (detection, paths, project utils)
- `agent-core/`: Global agent prompts and templates
- `docs/`: System documentation

### Feature-to-File Mapping
| Feature | File(s) |
|---------|---------|
| TUI Dashboard | `src/mcp/ui/Overview.tsx` |
| Projects Management | `src/mcp/ui/ProjectsView.tsx` |
| Task Browser | `src/mcp/ui/TasksView.tsx` |
| MCP Tools | `src/mcp/handlers/tools.ts` |
| MCP Resources | `src/mcp/resources.ts` |
| RAG Logic | `src/mcp/services/rag.ts` |
| Indexing Background Jobs | `src/mcp/services/indexing-jobs.ts` |
| Installation Logic | `src/mcp/install.ts` |

## 2. Coding Conventions

### Single Source of Truth (SSOT)
Always use existing utilities instead of reimplementing logic:
- **Project Sorting**: Use `sortProjects` from `src/lib/project-utils.ts`.
- **Project Config Lookup**: Use `findProjectConfig` from `src/mcp/config-utils.ts`.
- **Path Resolution**: Use `resolveDataPath` or `resolveProjectPaths`.

### TUI Components
- **Size Limit**: Keep components under 200 lines. Extract sub-components to `src/mcp/ui/components/`.
- **Styling**: Use `ink` components. Follow the "Unified Cockpit" aesthetic (white borders).
- **Status Icons**: Use helpers in `src/mcp/ui/ui-helpers.ts`.

### Type Safety
- **Avoid `any`**: Use `TaskMeta`, `AgentInfo`, and `DetectedProject` types.
- **Interfaces**: Define clear interfaces for component props and service parameters.
- **Validation**: Validate input at the boundaries of the MCP tools and resources.

## 3. Implementation Patterns

### Error Handling
- Never use empty `catch {}` blocks.
- Use `logger.error(message, error)` for internal logging.
- Surface meaningful error messages to the user in the TUI via `errorLine` state.

### Async Operations
- Use `indexingJobs` for long-running background tasks.
- Ensure the TUI remains responsive by using cooperative yields (`setImmediate`) in tight loops.

### Metadata
- Task metadata is stored in `meta.json` within project task directories.
- Use `updateTask` in `resources.ts` to persist changes to task state.

## 4. Common Pitfalls to Avoid
- **Duplicating Install Logic**: All IDE configurations are handled in `install.ts` using a data-driven approach via `TARGET_CONFIGS`.
- **Hardcoding Paths**: Always use path resolution utilities to handle Global vs. Workspace modes.
- **Stale Context**: When searching code, be aware that semantic search results might be stale if indexing is in progress. Check the `indexingInProgress` flag.
