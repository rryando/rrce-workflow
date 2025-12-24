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
