<!--
  RRCE Template Variables:
  - {{RRCE_DATA}}: Primary storage path (resolves based on storage mode in .rrce-workflow/config.yaml)
      - global: {{RRCE_HOME}}/workspaces/<workspace-name>/
      - workspace: <workspace>/.rrce-workflow/
  - {{RRCE_HOME}}: Global home (default: ~/.rrce-workflow, customizable via storage.globalPath in config)
  - {{WORKSPACE_ROOT}}: Workspace root directory
  - {{WORKSPACE_NAME}}: Workspace name from config or directory name
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
