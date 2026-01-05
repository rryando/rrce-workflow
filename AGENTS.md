# AI Agent Guide: rrce-workflow

This repository uses a phase-based agentic workflow for AI-assisted development. This file provides the technical ground truth for agents operating in this codebase.

## 1. Development Environment

### Build & Run
- **Dev Mode:** `npm run dev` (uses tsx)
- **Wizard:** `npm run wizard`
- **Build:** `npm run build` (outputs to `dist/index.js`)
- **Start:** `npm start` (alias for dev)

### Testing (Vitest)
- **Run all tests:** `npm test`
- **Run single file:** `npx vitest run path/to/file.test.ts`
- **Run specific test:** `npx vitest run -t "test name"`
- **Coverage:** `npm run test:coverage`
- **Watch mode:** `npm run test:watch`

## 2. Project Architecture & Navigation

### Core Directories
- `src/mcp/`: MCP Server implementation and TUI.
  - `ui/`: React (Ink) components for the TUI (white-border "cockpit" aesthetic).
  - `handlers/`: MCP protocol handlers (tools, prompts, resources).
  - `services/`: Business logic (RAG, Indexing, Context Extraction).
  - `lib/`: TUI-specific utilities.
- `src/lib/`: Shared core utilities (detection, paths, project utils, git).
- `agent-core/`: Global agent prompts and templates (executor.md, research.md, etc.).
- `docs/`: System documentation, architecture, and migration guides.

### Feature-to-File Mapping
| Feature | File(s) |
|---------|---------|
| TUI Dashboard | `src/mcp/ui/Overview.tsx` |
| Projects Management | `src/mcp/ui/ProjectsView.tsx` |
| Task Browser | `src/mcp/ui/TasksView.tsx` |
| MCP Tools | `src/mcp/handlers/tools.ts` |
| MCP Resources | `src/mcp/resources.ts` |
| RAG Logic | `src/mcp/services/rag.ts` |
| Indexing Jobs | `src/mcp/services/indexing-jobs.ts` |
| Path Utilities | `src/lib/paths.ts` |
| Project Detection | `src/lib/detection.ts` |

## 3. Coding Standards

### Naming Conventions
- **Files/Folders:** `kebab-case.ts` (e.g., `setup-flow.ts`).
- **Functions/Variables:** `camelCase` (e.g., `getGitUser`).
- **Classes/Interfaces:** `PascalCase` (e.g., `DetectionService`).
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `RRCE_HOME`).

### Formatting & Style
- **Indentation:** 2 spaces.
- **Quotes:** Single quotes `'`.
- **Semicolons:** Always include `;`.
- **Imports:** Grouping: Node built-ins -> External libs -> Project aliases/Internal modules.
- **Complexity:** Keep TUI components under 200 lines. Extract sub-components to `src/mcp/ui/components/`.

### Type Safety
- **Strict Typing:** No `any`. Use `TaskMeta`, `AgentInfo`, and `DetectedProject` types.
- **Interfaces:** Prefer `interface` over `type` for object definitions.
- **Exhaustiveness:** Use `switch` with exhaustive checks for enums/unions.

## 4. Implementation Patterns

### Error Handling
Use the `WorkflowError` pattern for user-facing errors and `logger` for internal tracking.
```typescript
class WorkflowError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

try {
  // logic
} catch (err) {
  logger.error('Contextual message', err);
  throw new WorkflowError('User-friendly message');
}
```
- Never use empty `catch {}` blocks.
- Surface meaningful errors to the TUI via `errorLine` or dedicated UI states.

### Single Source of Truth (SSOT)
- **Project Configuration**: Use `findProjectConfig` from `src/mcp/config-utils.ts`.
- **Path Resolution**: Use `resolveDataPath` or `resolveProjectPaths` from `src/lib/paths.ts`.
- **UI Icons**: Use helpers in `src/mcp/ui/ui-helpers.ts` for status icons and progress bars.

### MCP & RAG
- **Background Jobs**: Use `indexingJobs` in `src/mcp/services/indexing-jobs.ts` for long-running tasks.
- **Semantic Search**: Be aware that indexing might be in progress (`indexingInProgress` flag).

## 5. Workflow Protocols

### Slash Command Protocol
The primary interaction model is via **in-context slash commands** (`/rrce_*`). This reduces token consumption by 60% compared to heavy delegation.

### OpenCode Integrations
- **Checklist Sync**: Agents MUST push their `meta.json` checklist to the OpenCode Todo sidebar using the `todowrite` tool.
- **Tool Names**: Standard tools (read, write, grep) are used without the `rrce_` prefix to align with native IDE capabilities.

### Phase Pipeline
/1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
3. **Develop** (`/rrce_develop`) — code implementation
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
4. **Document** (`/rrce_docs`) — auto-generate or update documentation./g; 112,113,114d
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
3. **Planning** (`/rrce_plan`): Create task breakdown in `meta.json` and a plan artifact.
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
4. **Execution** (`/rrce_execute`): Make code changes (Executor agent).
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
5. **Documentation** (`/rrce_docs`): Auto-generate or update documentation.
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.

1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
## 6. Agent Checklist
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
- [ ] Prerequisites verified (research + planning complete before execution).
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
- [ ] Metadata updated (`meta.json`) via `rrce_update_task()`.
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
- [ ] No hardcoded absolute paths (use `paths.ts`).
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
- [ ] Code changes validated with Vitest.
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
- [ ] Completion signal (`<rrce_completion>`) emitted after phase finish.
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.

1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
---
1. **Init** (`/rrce_init`): Set up project context.
2. **Design** (`/rrce_design`) — merged Research + Planning
3. **Develop** (`/rrce_develop`) — code implementation
4. **Document** (`/rrce_docs`) — auto-generate or update documentation.
*Last Updated: 2026-01-04*
