<!--
  TEMPLATE: Handover Note / Documentation
  
  HOW TO USE:
  1. Copy to destination based on DOC_TYPE:
     - With TASK_SLUG: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/docs/{{TASK_SLUG}}-{{DOC_TYPE}}.md
     - With TARGET_PATH: {{RRCE_DATA}}/{{TARGET_PATH}}
     - Default: {{RRCE_DATA}}/knowledge/{{DOC_TYPE}}.md
  2. Replace {{variable}} placeholders with actual values
  3. Remove empty sections
  
  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_NAME}}: Project name
  
  AGENT-FILLED VARIABLES:
  - {{task_id}}: UUID for the task (if applicable)
  - {{task_slug}}: kebab-case task identifier (if applicable)
  - {{task_title}}: Human-readable task title
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{execution_artifact}}: Path to execution log
  - {{release_ref}}: Release tag or commit SHA
  - {{workspace_name}}: Project name
-->
# Handover Note – {{task_title}}

- Task ID: `{{task_id}}`
- Task Slug: `{{task_slug}}`
- Author: `{{author}}`
- Date: `{{date}}`
- Execution Artifact: `{{execution_artifact}}`
- Release / Merge Reference: `{{release_ref}}`
- Workspace: `{{workspace_name}}`

## 1. Overview
- Purpose of the work and high-level outcome.
- Linked research, plan, and execution documents.

## Checklist
- [ ] Replace with sign-off requirement.
- [ ] Replace with follow-up confirmation.

## 2. Implementation Details
- Summary of major code changes and affected components.
- Feature flags, configuration updates, or migrations.

## 3. Validation Evidence
- Tests executed and results.
- Monitoring or telemetry instructions post-release.

## 4. Decisions & Rationale
- Final decisions made with references.
- Deferred items or future considerations.

## 5. Knowledge Sync
- Updates pushed to `{{RRCE_DATA}}/knowledge` with file references.
- External documentation or runbooks updated.

## 6. Operational Notes
- Deployment steps, rollback plan, and ownership.
- Support contacts or escalation paths.

## 7. Follow-up Actions
- Outstanding tasks or bugs.
- Recommendations for future improvements.

## 8. Sign-off
- Confirmation of readiness and any approvals obtained.

> Keep this handover document under 500 lines. Ensure all links are relative paths when possible.
