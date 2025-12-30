<!--
  TEMPLATE: Research Brief
  
  HOW TO USE:
  1. Copy to: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/research/{{TASK_SLUG}}-research.md
  2. Replace {{variable}} placeholders with actual values
  3. Delete sections that are empty after population
  
  AUTO-FILLED VARIABLES (from System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks
  - {{WORKSPACE_NAME}}: Project name
  
  AGENT-FILLED VARIABLES:
  - {{task_id}}: UUID for the task
  - {{task_slug}}: kebab-case task identifier
  - {{task_title}}: Human-readable task title
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{source}}: URL or reference to original request
  - {{workspace_name}}: Project name
-->
# Research Brief – {{task_title}}

- Task ID: `{{task_id}}`
- Task Slug: `{{task_slug}}`
- Author: `{{author}}`
- Date: `{{date}}`
- Source Request / Conversation URL: `{{source}}`
- Workspace: `{{workspace_name}}`

## 1. Request Summary
- Concise restatement of the user's ask.
- Highlight explicit goals, constraints, and success metrics.

## Checklist
- [ ] Replace with concrete clarification or validation step.
- [ ] Replace with next ready-to-run action.

## 2. Current Knowledge Snapshot
- Relevant prior work or documents from `{{RRCE_DATA}}/knowledge` or workspace.
- Key facts that shape feasibility or scope.

## 3. Clarifications & Responses
| Question | Answer | Status (answered/pending) | Reference |
| --- | --- | --- | --- |
|  |  |  |  |

## 4. Assumptions & Risks
- Explicit assumptions that require validation.
- Risks or edge cases that need attention.

## 5. Opportunity & Alternative Approaches
- Potential strategies worth evaluating.
- Trade-offs or spikes recommended before execution.

## 6. Raw Requirement Draft
- Bullet the functional outcomes and non-functional requirements as currently understood.
- Note acceptance signals or metrics where available.

## 7. Hand-off Notes
- Immediate next steps for Planning.
- Pending clarifications or decisions to resolve.
- References added to `meta.json`.

> Keep this document under 500 lines. Replace placeholders with concise entries and trim empty sections if unnecessary.
