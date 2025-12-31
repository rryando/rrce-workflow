<!--
  TEMPLATE: Execution Log
  
  HOW TO USE:
  1. Copy to: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/execution/{{TASK_SLUG}}-execution.md
  2. Replace {{variable}} placeholders with actual values
  3. Update Implementation Steps table as work progresses
  4. Remove empty sections
  
  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_NAME}}: Project name
  
  AGENT-FILLED VARIABLES:
  - {{task_id}}: UUID for the task
  - {{task_slug}}: kebab-case task identifier
  - {{task_title}}: Human-readable task title
  - {{author}}: Git user or agent name (executor)
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{plan_artifact}}: Path to execution plan
  - {{git_ref}}: Branch name or commit SHA
  - {{workspace_name}}: Project name
-->
# Execution Log – {{task_title}}

- Task ID: `{{task_id}}`
- Task Slug: `{{task_slug}}`
- Executor: `{{author}}`
- Date: `{{date}}`
- Plan Artifact: `{{plan_artifact}}`
- Branch / Commit Reference: `{{git_ref}}`
- Workspace: `{{workspace_name}}`

## 1. Work Summary
- Brief narrative of what was completed.
- Note any deviations from the plan and why.

## Checklist
- [ ] Replace with implementation task item.
- [ ] Replace with verification checkpoint.

## 2. Implementation Steps
| Step | Description | Status | Evidence / Links |
| --- | --- | --- | --- |
| 1 |  | pending |  |

## 3. Testing & Verification
- Commands executed (summaries only) and outcomes.
- Coverage of automated and manual checks.
- Outstanding testing gaps, if any.

## 4. Issues & Follow-ups
- Bugs discovered, blocked tasks, escalations.
- Required clarifications for future cycles.

## 5. Deliverables
- Key files, PRs, or artifacts delivered.
- Documentation or knowledge updates triggered.

## 6. Next Actions
- Items remaining before handoff or release.
- Recommendations for the Documentation agent.

> Keep this log under 500 lines. Inline only the essential evidence; link to detailed outputs when needed.
