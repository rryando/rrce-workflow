<!--
  TEMPLATE: Architecture Documentation
  DOC_TYPE: architecture

  AGENT-FILLED VARIABLES:
  - {{system_name}}: System or project name
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{workspace_name}}: Project name
-->
# Architecture – {{system_name}}

| Field | Value |
|-------|-------|
| Author | `{{author}}` |
| Date | `{{date}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Overview

High-level description of the system and its purpose.

---

## 2. Components

| Component | Responsibility | Technology | Location |
|-----------|---------------|------------|----------|
| | | | `path/to/` |

### Component Details

#### [Component Name]
- **Purpose**: [What it does]
- **Key files**: `path/to/entry.ts`
- **Dependencies**: [Internal and external]

---

## 3. Data Flow

Describe how data moves through the system:

1. [Step 1: Input source]
2. [Step 2: Processing]
3. [Step 3: Output/Storage]

---

## 4. Key Decisions

| Decision | Rationale | Alternatives Considered | Date |
|----------|-----------|------------------------|------|
| | | | |

---

## 5. Diagrams

[Describe or link to architecture diagrams. Use ASCII art or mermaid syntax if inline.]

---

## 6. Constraints & Trade-offs

- [Constraint 1 and how it shapes the design]
- [Trade-off 1: what was gained vs. given up]

---

## 7. Future Considerations

- [Planned improvements or known technical debt]

---

> Keep this document under 500 lines. Link to code paths instead of duplicating implementation details.
