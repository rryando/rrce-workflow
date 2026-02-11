<!-- TEMPLATE: Execution Plan — save to {{RRCE_DATA}}/tasks/{{TASK_SLUG}}/planning/{{TASK_SLUG}}-plan.md -->
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

## 3. Chosen Approach

**Selected**: [Approach name from research alternatives]

**Rationale**: [Why this approach was chosen over alternatives]

**Key trade-offs accepted**:
- [Trade-off 1 and why it's acceptable]
- [Trade-off 2 and why it's acceptable]

---

## 4. Implementation Architecture

How the tasks connect and where changes fit in the existing system:

**Change map**:
- [Component/module A] → [What changes and why]
- [Component/module B] → [What changes and why]

**Data flow**: [How data moves through the changed components]

**Integration points**: [Where new code connects to existing code]

---

## 5. Task Breakdown

> **IMPORTANT**: The Executor MUST follow these tasks in order.
> Each task should be completed and verified before moving to the next.

| # | Task | Files | Acceptance Criteria | Effort | Deps |
|---|------|-------|---------------------|--------|------|
| 1 | [Task Name] | `path/to/file.ts` | [Observable/runnable check] | S/M/L | None |
| 2 | [Task Name] | `path/to/file.ts` | [Observable/runnable check] | S/M/L | 1 |
| 3 | [Task Name] | `path/to/file.ts` | [Observable/runnable check] | S/M/L | 1, 2 |
| 4 | [Task Name] | `path/to/file.ts` | [Observable/runnable check] | S/M/L | 3 |

**Total Estimated Effort**: [Sum or range]

### Task Details

#### Task 1: [Task Name]
- **Files to modify**: `path/to/file.ts`
- **Research refs**: R1, R3
- **Implementation notes**: [How to implement, not just what]
- **Edge cases to handle**: [Boundary conditions]
- **Validation command**: `[specific command to verify this task]`
- **Acceptance criteria**: [Observable outcome — e.g., "test passes", "endpoint returns 200"]

#### Task 2: [Task Name]
- **Files to modify**: `path/to/file.ts`
- **Research refs**: R2
- **Implementation notes**: [How to implement, not just what]
- **Edge cases to handle**: [Boundary conditions]
- **Validation command**: `[specific command to verify this task]`
- **Acceptance criteria**: [Observable outcome]

[Continue for each task...]

---

## 6. Validation Strategy

> The Executor should run these validations after completing the relevant tasks.

| Task | What to Verify | Command / Steps | Type |
|------|----------------|-----------------|------|
| 1 | [Specific behavior] | `npm test -- --grep 'feature'` | Unit |
| 2 | [Integration point] | `npm run test:integration` | Integration |
| All | No regressions | `npm test` | Regression |
| All | Type safety | `npm run typecheck` | Type Check |

### Manual Verification Checklist
- [ ] [Step 1: What to check]
- [ ] [Step 2: What to check]
- [ ] [Step 3: What to check]

---

## 7. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| [Risk from research] | High/Med/Low | High/Med/Low | [How to mitigate] | Executor |
| [Implementation risk] | High/Med/Low | High/Med/Low | [How to mitigate] | Executor |

### Blockers Requiring Escalation
- [Any known blockers that need external support]

---

## 8. Technical Guidance

### Patterns to Follow
From research references and knowledge base:
- **R1** — [Pattern description]: [Where to find example in codebase]
- **R2** — [Pattern description]: [Where to find example in codebase]

### Coding Conventions
- [Convention 1 from project context]
- [Convention 2 from project context]

### Dependencies
- [External dependency 1]: [How to use]
- [Internal module 1]: [How to import/use]

---

## 9. Handoff Checklist

- [ ] Research brief exists and is complete
- [ ] All task file paths verified against actual codebase
- [ ] Validation commands are concrete and copy-pasteable
- [ ] No blocking open questions remain

### Open Questions (Carried Forward)
From research phase (non-blocking):
- [Question 1] - Can be resolved during execution
- [Question 2] - Document resolution in execution log

---

> **Next Step**: `/rrce_develop TASK_SLUG={{task_slug}}`
>
> Keep this plan under 500 lines. Remove unused rows or sections once populated.
