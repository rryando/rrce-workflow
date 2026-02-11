<!-- TEMPLATE: Research Brief — save to {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/research/{{TASK_SLUG}}-research.md -->
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

## 1. Request & Clarification Summary

> **Original Request**: [Quote the user's initial request]

**Refined Understanding** (after clarification):
- [Clear, specific statement of what needs to be built]
- [Why it needs to be built - problem/opportunity]

**Key Decisions Made** (through interactive dialogue):

| Topic | Question Asked | User Response | Impact on Scope |
|-------|----------------|---------------|-----------------|
| Intent | | | |
| Constraints | | | |
| Success Criteria | | | |
| Edge Cases | | | |

---

## 2. References Collected

Sources discovered during research. Each gets a unique ID for cross-referencing in the plan.

| ID | Source | Relevance | Snippet |
|----|--------|-----------|---------|
| R1 | `src/example.ts:10-25` | [Why this source matters] | `relevant code excerpt` |
| R2 | `{{RRCE_DATA}}/knowledge/...` | [How it applies] | N/A |
| R3 | websearch: "[search query]" | [What was learned] | N/A |

> **Note**: These references are saved to `meta.json` via `rrce_update_task` for use in planning and execution.

### Key Patterns Identified

Patterns from the codebase that the implementation should follow:

- **R1**: [Pattern description and how to apply it]
- **R2**: [Pattern description and how to apply it]

---

## 3. Requirements

### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | [Requirement description] | Must-have |
| FR-2 | [Requirement description] | Should-have |
| FR-3 | [Requirement description] | Nice-to-have |

### Non-Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | [Performance/Security/etc.] | Must-have |
| NFR-2 | [Requirement description] | Should-have |

### Success Criteria
How we'll know this is done:
1. [Measurable outcome 1]
2. [Measurable outcome 2]
3. [Measurable outcome 3]

---

## 4. Scope Boundaries

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

## 5. Assumptions & Risks

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

## 6. Opportunity & Alternative Approaches

Approaches considered during research:

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| [Approach A] | | | Chosen / Rejected |
| [Approach B] | | | Chosen / Rejected |

**Rationale for chosen approach**: [Explanation]

---

## 7. Hand-off Notes for Planning

### Ready for Planning
- [ ] Core requirements are clear and specific
- [ ] Success criteria are measurable
- [ ] Scope boundaries are explicit
- [ ] No blocking open questions remain

### Context for Design Agent (Planning Phase)
- [Important context the planner needs to know]
- [Technical considerations for task breakdown]

### Open Questions (Non-Blocking)
- [Question that can be resolved during planning or execution]

### References Saved to meta.json
- [R1, R2, R3... — all references from Section 2 are persisted via `rrce_update_task`]

---

> **Next Step**: Proceed to Planning phase (Phase 2 of this design session).
>
> Keep this document under 500 lines. Replace placeholders with concise entries and trim empty sections.
