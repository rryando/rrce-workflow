<!--
  TEMPLATE: Execution Plan
  
  HOW TO USE:
  1. Copy to: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/planning/{{TASK_SLUG}}-plan.md
  2. Replace {{variable}} placeholders with actual values
  3. Remove unused table rows and empty sections
  
  AUTO-FILLED VARIABLES (from System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks
  - {{WORKSPACE_NAME}}: Project name
  
  AGENT-FILLED VARIABLES:
  - {{task_id}}: UUID for the task
  - {{task_slug}}: kebab-case task identifier
  - {{task_title}}: Human-readable task title
  - {{author}}: Git user or agent name (planner)
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{research_artifact}}: Path to research brief
  - {{workspace_name}}: Project name
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
