<!--
  TEMPLATE: Knowledge Sync Report

  HOW TO USE:
  1. Save to: {{RRCE_DATA}}/tasks/sync-{{date}}/sync-report.md
  2. Replace {{variable}} placeholders with actual values
  3. Remove empty rows and unused sections

  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_NAME}}: Project name

  AGENT-FILLED VARIABLES:
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{author}}: Git user or agent name
  - {{scope}}: Sync scope (path/module or "Full Project")
  - {{workspace_name}}: Project name
-->
# Knowledge Sync Report – {{workspace_name}}

| Field | Value |
|-------|-------|
| Date | `{{date}}` |
| Author | `{{author}}` |
| Scope | `{{scope}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Knowledge Inventory (Before Sync)

| File | Last Updated | Lines | Status |
|------|-------------|-------|--------|
| `project-context.md` | | | Current / Stale / Missing |
| | | | |

---

## 2. Drift Items

| # | Category | Knowledge File | Issue | Resolution |
|---|----------|---------------|-------|------------|
| 1 | Stale / Missing / Contradictory / Incomplete / Redundant | `file.md` | [What's wrong] | [What was done] |
| 2 | | | | |

**Summary**: {{drift_count}} drift items found, {{resolved_count}} resolved.

---

## 3. Changes Made

### Files Updated
| File | Action | Changes |
|------|--------|---------|
| `{{RRCE_DATA}}/knowledge/file.md` | Updated / Created / Deleted | [Brief description] |

### Files Created
- [List any new knowledge files created]

### Files Deleted
- [List any knowledge files removed]

---

## 4. Reindex Results

| Metric | Value |
|--------|-------|
| Index Type | Incremental / Force / Clean |
| Files Indexed | |
| Duration | |
| Status | Success / Failed |

---

## 5. Follow-up Items

- [ ] [Item that needs attention in next sync]
- [ ] [Knowledge gap to investigate]

---

## 6. Health Assessment

| Category | Status | Notes |
|----------|--------|-------|
| Knowledge Coverage | Good / Fair / Poor | |
| Knowledge Freshness | Good / Fair / Poor | |
| Index Health | Good / Fair / Poor | |
| **Overall** | | |

---

> Keep this report under 500 lines. Link to knowledge files instead of duplicating content.
