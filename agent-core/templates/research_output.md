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
  
  NOTE: This document is the output of an interactive research session.
  The Research agent engaged in constructive dialogue with the user to
  achieve 100% understanding before this brief was generated.
-->
# Research Brief – {{task_title}}

| Field | Value |
|-------|-------|
| Task ID | `{{task_id}}` |
| Task Slug | `{{task_slug}}` |
| Author | `{{author}}` |
| Date | `{{date}}` |
| Source Request | `{{source}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Request Summary

> **Original Request**: [Quote the user's initial request]

**Refined Understanding** (after clarification):
- [Clear, specific statement of what needs to be built]
- [Why it needs to be built - problem/opportunity]

---

## 2. Clarification Summary

The following was clarified through interactive dialogue:

| Topic | Question Asked | User Response | Impact on Scope |
|-------|----------------|---------------|-----------------|
| Intent | | | |
| Constraints | | | |
| Success Criteria | | | |
| Edge Cases | | | |

**Key Decisions Made**:
- [Decision 1 and rationale]
- [Decision 2 and rationale]

---

## 3. Current Knowledge Snapshot

Relevant prior work and context from project knowledge:

| Source | Relevance |
|--------|-----------|
| `{{RRCE_DATA}}/knowledge/...` | [How it applies] |
| [Search result] | [How it applies] |

**Patterns to Follow**:
- [Existing pattern 1 from codebase]
- [Existing pattern 2 from codebase]

---

## 4. Requirements

### Functional Requirements
- [ ] [FR-1]: [Requirement description]
- [ ] [FR-2]: [Requirement description]
- [ ] [FR-3]: [Requirement description]

### Non-Functional Requirements
- [ ] [NFR-1]: [Performance/Security/etc. requirement]
- [ ] [NFR-2]: [Requirement description]

### Success Criteria
How we'll know this is done:
1. [Measurable outcome 1]
2. [Measurable outcome 2]
3. [Measurable outcome 3]

---

## 5. Scope Boundaries

### In Scope
- [Explicit inclusion 1]
- [Explicit inclusion 2]

### Out of Scope
- [Explicit exclusion 1]
- [Explicit exclusion 2]

### Constraints
- [Hard constraint 1 - e.g., timeline, tech, resources]
- [Hard constraint 2]

---

## 6. Assumptions & Risks

### Assumptions
| ID | Assumption | Confidence | Validation Needed |
|----|------------|------------|-------------------|
| A1 | [Assumption] | High/Medium/Low | [How to validate] |
| A2 | [Assumption] | High/Medium/Low | [How to validate] |

### Risks
| ID | Risk | Impact | Likelihood | Mitigation |
|----|------|--------|------------|------------|
| R1 | [Risk description] | High/Medium/Low | High/Medium/Low | [Mitigation] |
| R2 | [Risk description] | High/Medium/Low | High/Medium/Low | [Mitigation] |

---

## 7. Opportunity & Alternative Approaches

Approaches considered during research:

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| [Approach A] | | | Chosen / Rejected |
| [Approach B] | | | Chosen / Rejected |

**Rationale for chosen approach**: [Explanation]

---

## 8. Hand-off Notes for Planning

### Ready for Planning
- [ ] Core requirements are clear and specific
- [ ] Success criteria are measurable
- [ ] Scope boundaries are explicit
- [ ] No blocking open questions remain

### Context for Planning Agent
- [Important context the planner needs to know]
- [Technical considerations for task breakdown]

### Open Questions (Non-Blocking)
- [Question that can be resolved during planning or execution]

### References Added to meta.json
- [List of knowledge files referenced]

---

> **Next Step**: `/plan TASK_SLUG={{task_slug}}`
> 
> Keep this document under 500 lines. Replace placeholders with concise entries and trim empty sections.
