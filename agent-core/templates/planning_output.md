<!--
  TEMPLATE: Execution Plan
  
  HOW TO USE:
  1. Copy to: {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/planning/{{TASK_SLUG}}-plan.md
  2. Replace {{variable}} placeholders with actual values
  3. Remove unused table rows and empty sections
  
  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_NAME}}: Project name
  
  AGENT-FILLED VARIABLES:
  - {{task_id}}: UUID for the task
  - {{task_slug}}: kebab-case task identifier
  - {{task_title}}: Human-readable task title
  - {{author}}: Git user or agent name (planner)
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{research_artifact}}: Path to research brief
  - {{workspace_name}}: Project name
  
  NOTE: This document is the output of an interactive planning session.
  The Planning agent collaborated with the user to break down requirements
  into actionable tasks before this plan was finalized.
-->
# Execution Plan – {{task_title}}

| Field | Value |
|-------|-------|
| Task ID | `{{task_id}}` |
| Task Slug | `{{task_slug}}` |
| Planner | `{{author}}` |
| Date | `{{date}}` |
| Research Artifact | `{{research_artifact}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Scope Confirmation

**From Research Brief**:
> [Quote the refined understanding from research]

**Confirmed Inclusions**:
- [What will be built]

**Confirmed Exclusions**:
- [What will NOT be built]

---

## 2. Objectives & Success Criteria

### Primary Objectives
1. [Objective 1]
2. [Objective 2]

### Success Criteria (from Research)
| ID | Criteria | How to Verify |
|----|----------|---------------|
| SC-1 | [Measurable outcome] | [Verification method] |
| SC-2 | [Measurable outcome] | [Verification method] |

---

## 3. Task Breakdown

> **IMPORTANT**: The Executor MUST follow these tasks in order.
> Each task should be completed and verified before moving to the next.

| # | Task | Description | Acceptance Criteria | Effort | Dependencies |
|---|------|-------------|---------------------|--------|--------------|
| 1 | [Task Name] | [What to do] | [How to verify done] | S/M/L | None |
| 2 | [Task Name] | [What to do] | [How to verify done] | S/M/L | Task 1 |
| 3 | [Task Name] | [What to do] | [How to verify done] | S/M/L | Task 1, 2 |
| 4 | [Task Name] | [What to do] | [How to verify done] | S/M/L | Task 3 |

**Total Estimated Effort**: [Sum or range]

### Task Details

#### Task 1: [Task Name]
- **Files to modify**: `path/to/file.ts`
- **Implementation notes**: [Specific guidance for executor]
- **Edge cases to handle**: [List any edge cases]

#### Task 2: [Task Name]
- **Files to modify**: `path/to/file.ts`
- **Implementation notes**: [Specific guidance for executor]
- **Edge cases to handle**: [List any edge cases]

[Continue for each task...]

---

## 4. Validation Strategy

> The Executor should run these validations after completing the relevant tasks.

| Task(s) | Validation Type | Command / Steps |
|---------|-----------------|-----------------|
| 1-2 | Unit Tests | `npm test -- --grep 'feature'` |
| 3 | Integration Test | `npm run test:integration` |
| All | Type Check | `npm run typecheck` |
| All | Lint | `npm run lint` |
| All | Manual Verification | [Specific steps to manually verify] |

### Manual Verification Checklist
- [ ] [Step 1: What to check]
- [ ] [Step 2: What to check]
- [ ] [Step 3: What to check]

---

## 5. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| [Risk from research] | High/Med/Low | High/Med/Low | [How to mitigate] | Executor |
| [Implementation risk] | High/Med/Low | High/Med/Low | [How to mitigate] | Executor |

### Blockers Requiring Escalation
- [Any known blockers that need external support]

---

## 6. Technical Guidance

### Patterns to Follow
From project-context.md and knowledge base:
- [Pattern 1]: [Where to find example in codebase]
- [Pattern 2]: [Where to find example in codebase]

### Coding Conventions
- [Convention 1 from project context]
- [Convention 2 from project context]

### Dependencies
- [External dependency 1]: [How to use]
- [Internal module 1]: [How to import/use]

---

## 7. Knowledge Updates

Files to create/update in `{{RRCE_DATA}}/knowledge/` after implementation:

| Action | File | Content |
|--------|------|---------|
| Create | `{{RRCE_DATA}}/knowledge/[domain].md` | [What to document] |
| Update | `{{RRCE_DATA}}/knowledge/project-context.md` | [What changed] |

---

## 8. Handoff Checklist for Executor

### Prerequisites Verified
- [ ] Research brief exists and is complete
- [ ] Project context is available
- [ ] All dependencies are installed/available

### Executor Must Have
- [ ] Access to branch: `[branch name if specified]`
- [ ] [Any required API keys, credentials, or access]
- [ ] [Any required test data or fixtures]

### During Execution
- [ ] Follow tasks in order (1 → 2 → 3 → ...)
- [ ] Run validation after each task
- [ ] Document any deviations from this plan
- [ ] Update meta.json status as you progress

### After Execution
- [ ] All tasks completed and verified
- [ ] Execution log saved to `execution/{{task_slug}}-execution.md`
- [ ] meta.json updated with final status

---

## 9. Open Questions (Carried Forward)

From research phase (non-blocking):
- [Question 1] - Can be resolved during execution
- [Question 2] - Document resolution in execution log

---

> **Next Step**: `/execute TASK_SLUG={{task_slug}}`
> 
> Keep this plan under 500 lines. Remove unused rows or sections once populated.
