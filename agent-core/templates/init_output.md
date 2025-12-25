<!--
  RRCE Template Variables:
  - {{RRCE_DATA}}: Primary storage path (resolves based on storage mode in .rrce-workflow/config.yaml)
      - global: {{RRCE_HOME}}/workspaces/<workspace-name>/
      - workspace: <workspace>/.rrce-workflow/
      - both: <workspace>/.rrce-workflow/ (primary, auto-synced to global)
  - {{RRCE_HOME}}: Global home (default: ~/.rrce-workflow, customizable via storage.globalPath in config)
  - {{WORKSPACE_ROOT}}: Workspace root directory
  - {{WORKSPACE_NAME}}: Workspace name from config or directory name
-->
# Project Context – {{project_name}}

- Initialized: `{{date}}`
- Last Updated: `{{date}}`
- Author: `{{author}}`
- Workspace: `{{workspace_root}}`

---

## 1. Project Identity

| Attribute | Value |
|-----------|-------|
| **Name** |  |
| **Description** |  |
| **Primary Language(s)** |  |
| **Runtime Version(s)** |  |
| **Repository Type** | monorepo / single-app / library |
| **License** |  |

### Key Documentation
- README: 
- CONTRIBUTING: 
- Other: 

---

## 2. Tech Stack

### Languages & Runtimes
| Language | Version | Purpose |
|----------|---------|---------|
|  |  |  |

### Frameworks
| Framework | Version | Layer |
|-----------|---------|-------|
|  |  | frontend / backend / cli / mobile |

### Databases & Storage
| Technology | Purpose |
|------------|---------|
|  |  |

### External Services & APIs
| Service | Purpose | Auth Method |
|---------|---------|-------------|
|  |  |  |

### Build Tools
| Tool | Config File | Purpose |
|------|-------------|---------|
|  |  |  |

---

## 3. Code Organization

### Directory Structure
```
{{workspace_root}}/
├── 
├── 
└── 
```

### Structure Pattern
- [ ] Monorepo (multiple packages/services)
- [ ] Modular (feature-based organization)
- [ ] Layered (controllers/services/repositories)
- [ ] Flat (minimal nesting)
- [ ] Other: 

### Key Directories
| Directory | Purpose |
|-----------|---------|
| `src/` |  |
| `tests/` |  |
| `docs/` |  |

### Entry Points
| File | Purpose |
|------|---------|
|  |  |

---

## 4. Coding Conventions

### Style & Formatting
| Tool | Config File | Key Rules |
|------|-------------|-----------|
| Linter |  |  |
| Formatter |  |  |
| Type Checker |  |  |

### Naming Conventions
| Element | Convention | Example |
|---------|------------|---------|
| Files |  |  |
| Functions |  |  |
| Classes |  |  |
| Variables |  |  |
| Constants |  |  |

### Patterns Observed
- **Error Handling**: 
- **State Management**: 
- **Async Patterns**: 
- **Logging**: 
- **Configuration**: 

### Code Quality Gates
- [ ] Type checking enforced
- [ ] Lint checks in CI
- [ ] Code review required
- [ ] Commit message conventions

---

## 5. Testing Strategy

### Test Frameworks
| Framework | Purpose | Config |
|-----------|---------|--------|
|  | unit |  |
|  | integration |  |
|  | e2e |  |

### Test Organization
- [ ] Co-located with source (`*.test.ts` next to `*.ts`)
- [ ] Separate `tests/` directory
- [ ] Separate `__tests__/` directories
- [ ] Other: 

### Coverage Requirements
| Metric | Target | Current |
|--------|--------|---------|
| Line Coverage |  |  |
| Branch Coverage |  |  |

### Test Commands
```bash
# Unit tests
{{test_unit_command}}

# Integration tests
{{test_integration_command}}

# E2E tests
{{test_e2e_command}}

# Coverage report
{{coverage_command}}
```

---

## 6. DevOps & Deployment

### CI/CD
| Platform | Config File | Triggers |
|----------|-------------|----------|
|  |  |  |

### Containerization
| Tool | Config File | Purpose |
|------|-------------|---------|
| Docker |  |  |
| Compose |  |  |

### Environments
| Environment | URL/Access | Notes |
|-------------|------------|-------|
| Development |  |  |
| Staging |  |  |
| Production |  |  |

### Infrastructure
| Tool | Purpose |
|------|---------|
|  |  |

---

## 7. Dependencies & Constraints

### Key Dependencies
| Dependency | Version | Purpose | Critical? |
|------------|---------|---------|-----------|
|  |  |  | yes/no |

### Version Strategy
- [ ] Exact versions pinned
- [ ] Semver ranges allowed
- [ ] Lock file committed
- [ ] Regular dependency updates

### Constraints & Requirements
- **Node/Runtime Version**: 
- **OS Compatibility**: 
- **Browser Support**: 
- **Security Requirements**: 
- **Performance Targets**: 

---

## 8. Skill Requirements (Executor Scope)

Based on the tech stack analysis, the Executor agent should have proficiency in:

### Required Skills
- [ ] 
- [ ] 
- [ ] 

### Preferred Skills
- [ ] 
- [ ] 

### Out of Scope
- 
- 

---

## 9. Project Scope (Research Boundaries)

### In Scope for Research
- 
- 

### Out of Scope
- 
- 

### Key Stakeholders
| Role | Responsibility |
|------|----------------|
|  |  |

---

## 10. Open Questions & Gaps

| Question | Priority | Notes |
|----------|----------|-------|
|  | high/medium/low |  |

---

## Checklist

- [ ] Tech stack fully documented
- [ ] Coding conventions captured
- [ ] Testing strategy clear
- [ ] DevOps pipeline understood
- [ ] Skill requirements defined
- [ ] Scope boundaries established

---

> Keep this document under 500 lines. Update when major changes occur. Run `rrce-workflow sync` periodically to reconcile with codebase changes.
