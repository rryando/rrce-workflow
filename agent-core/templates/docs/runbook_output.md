<!--
  TEMPLATE: Operations Runbook
  DOC_TYPE: runbook

  AGENT-FILLED VARIABLES:
  - {{service_name}}: Service or project name
  - {{author}}: Git user or agent name
  - {{date}}: ISO date (YYYY-MM-DD)
  - {{workspace_name}}: Project name
-->
# Runbook – {{service_name}}

| Field | Value |
|-------|-------|
| Author | `{{author}}` |
| Date | `{{date}}` |
| Workspace | `{{workspace_name}}` |

---

## 1. Deployment

### Prerequisites
- [ ] [Required access/credentials]
- [ ] [Required tools installed]

### Deploy Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Verify Deployment
- [ ] [Health check URL or command]
- [ ] [Expected log output]

---

## 2. Monitoring

| Metric | Alert Threshold | Dashboard |
|--------|----------------|-----------|
| | | |

---

## 3. Incident Response

### Common Issues

#### Issue: [Title]
- **Symptoms**: [What you'll see]
- **Root Cause**: [Why it happens]
- **Resolution**:
  1. [Step 1]
  2. [Step 2]
- **Prevention**: [How to avoid]

---

## 4. Rollback

### Rollback Steps
1. [Step 1]
2. [Step 2]
3. [Verify rollback success]

### Rollback Criteria
- [When to trigger rollback]

---

## 5. Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-call | | |
| Team lead | | |

---

> Keep this runbook under 500 lines. Focus on actionable steps, not explanations.
