<!--
  RRCE Template Variables:
  - {{RRCE_DATA}}: Primary storage path (resolves based on storage mode in .rrce-workflow.yaml)
      - global: ~/.rrce-workflow/workspaces/<workspace-name>/
      - workspace: <workspace>/.rrce-workflow/
      - both: <workspace>/.rrce-workflow/ (primary, auto-synced to global)
  - {{RRCE_HOME}}: Always ~/.rrce-workflow
  - {{WORKSPACE_ROOT}}: Workspace root directory
  - {{WORKSPACE_NAME}}: Workspace name from config or directory name
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
