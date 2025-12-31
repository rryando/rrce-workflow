<!--
  TEMPLATE: Project Diagnosis
  
  HOW TO USE:
  1. Copy to: {{RRCE_DATA}}/tasks/doctor-{{YYYYMMDD}}/diagnosis.md
  2. Replace {{variable}} placeholders with actual values
  3. Add findings under appropriate priority sections
  4. Remove empty sections and placeholder rows
  
  SYSTEM PATH VARIABLES (Must be replaced by agent using System Resolved Paths):
  - {{RRCE_DATA}}: Storage path for knowledge/tasks (Use value from system context!)
  - {{WORKSPACE_ROOT}}: Source code directory
  
  AGENT-FILLED VARIABLES:
  - {{project_name}}: Name of the project
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{author}}: Git user or agent name (analyst)
  - {{workspace_root}}: Source code directory
  - {{focus_area}}: Focus area parameter or "General"
-->
# Project Diagnosis – {{project_name}}

- Diagnosis Date: `{{date}}`
- Analyst: `{{author}}`
- Workspace: `{{workspace_root}}`
- Focus Area: `{{focus_area}}` (or "General" if not specified)
- Project Context: `{{RRCE_DATA}}/knowledge/project-context.md`

---

## Executive Summary

A brief 2-3 sentence summary of the overall codebase health and most critical findings.

---

## Health Score

| Category | Score (1-5) | Notes |
|----------|-------------|-------|
| Code Quality |  |  |
| Architecture |  |  |
| Testing |  |  |
| Security |  |  |
| Performance |  |  |
| Maintainability |  |  |
| **Overall** |  |  |

*Scale: 1=Critical issues, 2=Significant issues, 3=Acceptable, 4=Good, 5=Excellent*

---

## Critical Findings (P0-P1)

### Finding 1: [Title]
- **Category**: (Code Quality / Architecture / Testing / Security / Performance)
- **Priority**: P0 / P1
- **Impact**: High
- **Effort**: Low / Medium / High
- **Location**: `path/to/file.ts:L42-L100`
- **Description**: What is the problem?
- **Evidence**: Code snippets, metrics, or specific examples.
- **Recommendation**: What should be done?
- **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2

---

## Medium Priority Findings (P2)

### Finding N: [Title]
- **Category**: 
- **Priority**: P2
- **Impact**: Medium
- **Effort**: 
- **Description**: 
- **Recommendation**: 

---

## Low Priority / Backlog (P3+)

| Finding | Category | Effort | Notes |
|---------|----------|--------|-------|
|  |  |  |  |

---

## Recommended Tasks for Planning Agent

> These are ready-to-use task definitions for the `planning` agent.

### Task 1: [Suggested Title]
```yaml
title: "[ACTION] [COMPONENT]: [Goal]"
priority: P1
category: refactoring / bugfix / feature / docs
description: |
  Brief description of what needs to be done and why.
acceptance_criteria:
  - Criterion 1
  - Criterion 2
estimated_effort: "2-4 hours / 1-2 days / 1 week"
dependencies:
  - Any blocking tasks or requirements
context_artifacts:
  - "{{RRCE_DATA}}/knowledge/project-context.md"
  - "path/to/relevant/file.ts"
```

### Task 2: [Suggested Title]
```yaml
# ... repeat format
```

---

## Metrics & Data

Any relevant metrics collected during analysis:
- Lines of code: 
- Files analyzed: 
- Test coverage (if available): 
- Dependency count: 
- TODO/FIXME comments found: 

---

## Next Steps

1. Review findings with team/stakeholder
2. Hand off high-priority tasks to `planning` agent: `rrce-workflow run planning --task="<Task Title>"`
3. Schedule follow-up diagnosis in: [timeframe]

---

> This diagnosis is based on automated analysis and code review. Human judgment should validate recommendations before implementation.
