<!--
  TEMPLATE: Generic Documentation (Fallback)

  HOW TO USE:
  1. Used when DOC_TYPE does not match a specific template in templates/docs/
  2. Copy to destination based on context:
     - With TASK_SLUG: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/docs/{{TASK_SLUG}}-{{DOC_TYPE}}.md
     - With TARGET_PATH: {{RRCE_DATA}}/{{TARGET_PATH}}
     - Default: {{RRCE_DATA}}/knowledge/{{DOC_TYPE}}.md
  3. Replace {{variable}} placeholders with actual values
  4. Remove empty sections

  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_NAME}}: Project name

  AGENT-FILLED VARIABLES:
  - {{doc_type}}: The documentation type requested
  - {{task_slug}}: kebab-case task identifier (if applicable)
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{workspace_name}}: Project name
-->
# {{doc_type}} – {{workspace_name}}

| Field | Value |
|-------|-------|
| Type | `{{doc_type}}` |
| Task | `{{task_slug}}` |
| Author | `{{author}}` |
| Date | `{{date}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Overview
- Purpose and scope of this document.
- Related tasks, research, or planning artifacts.

---

## 2. Context
- Background information and motivation.
- Key decisions that led to this documentation.

---

## 3. Details
- Main content for the requested documentation type.
- Technical specifics, references, and examples.

---

## 4. References
| ID | Source | Relevance |
|----|--------|-----------|
| R1 | `path/to/file` | [Why it matters] |

---

## 5. Follow-up Actions
- [ ] Outstanding items or next steps
- [ ] Items for future review

---

> Keep this document under 500 lines. Link to source files instead of duplicating content.
