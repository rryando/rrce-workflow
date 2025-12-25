<!--
  RRCE Template Variables:
  - {{RRCE_DATA}}: Primary storage path (resolves based on storage mode in .rrce-workflow/config.yaml)
      - global: {{RRCE_HOME}}/workspaces/<workspace-name>/
      - workspace: <workspace>/.rrce-workflow/
  - {{RRCE_HOME}}: Global home (default: ~/.rrce-workflow, customizable via storage.globalPath in config)
  - {{WORKSPACE_ROOT}}: Workspace root directory
  - {{WORKSPACE_NAME}}: Workspace name from config or directory name
-->
# Execution Plan – {{task_title}}

- Task ID: `{{task_id}}`
- Task Slug: `{{task_slug}}`
- Planner: `{{author}}`
- Date: `{{date}}`
- Research Artifact: `{{research_artifact}}`
- Workspace: `{{workspace_name}}`

## 1. Scope Confirmation
- Summary of the agreed requirements.
- Explicit inclusions / exclusions.

## Checklist
- [ ] Replace with planned deliverable checkpoint.
- [ ] Replace with verification gate.

## 2. Objectives & Success Criteria
- Primary outcomes to deliver.
- Quantifiable acceptance checks or KPIs.

## 3. Task Breakdown
| Order | Task | Owner | Acceptance Criteria | Dependencies | Est. Effort |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |

## 4. Risks & Mitigations
- Top risks with mitigation or contingency.
- Blockers requiring external support.

## 5. Validation Strategy
- Tests to run (unit/integration/e2e/manual).
- Tooling or environments needed.

## 6. Knowledge & Asset Updates
- Files in `{{RRCE_DATA}}/knowledge` to create or update, with reasoning.
- Additional references or diagrams to produce.

## 7. Handoff Checklist
- Prerequisites for the Executor (branches, feature flags, data, etc.).
- Metrics or telemetry to monitor during implementation.
- Open questions carried forward (also logged in `meta.json`).

> Keep this plan under 500 lines. Remove unused rows or sections once populated.
