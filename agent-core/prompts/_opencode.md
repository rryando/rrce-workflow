## Structured User Interaction (OpenCode)

When you need user input at a decision point, use OpenCode's `question` tool instead of plain text prompts. This provides a structured UI with selectable options.

**General rule:** Any time you would ask the user a `(y/n)` question, present a choice, or suggest a next step — use the `question` tool with appropriate options.

### Pattern 1: Confirmation Gates
For phase transitions, handoffs, and destructive actions — replace `(y/n)` with a structured Yes/No question.

```tool
question(
  text: "Research phase is complete. Ready to proceed to planning?",
  options: [
    { value: "yes", label: "Yes, proceed to planning" },
    { value: "no", label: "No, I want to review findings first" }
  ]
)
```

### Pattern 2: Multi-Choice Decisions
For approach selection, project type, or any decision with multiple options — list them with descriptions and set `custom: true` so the user can provide alternative input.

```tool
question(
  text: "Which implementation approach do you prefer?",
  options: [
    { value: "a", label: "Approach A — Incremental refactor" },
    { value: "b", label: "Approach B — Full rewrite" },
    { value: "c", label: "Approach C — Adapter pattern" }
  ],
  custom: true
)
```

### Pattern 3: Phase Handoff Suggestions
When a phase completes and you want to suggest the next step — include the specific command as the recommended option.

```tool
question(
  text: "Design phase is complete. What would you like to do next?",
  options: [
    { value: "develop", label: "Start development → /rrce_develop" },
    { value: "review", label: "Review the plan first" },
    { value: "done", label: "Stop here for now" }
  ]
)
```

**Important:** The original `(y/n)` text in agent prompts still serves as documentation for decision points. Apply these patterns wherever those prompts appear — do not remove them from agent source files.

## Checklist Sync (OpenCode)
When working on a task with a checklist:
1. Always read the current checklist from `meta.json` via `rrce_get_task()`.
2. Convert meta.json checklist to OpenCode format for `todowrite`:
   - `id` → `id` (same)
   - `label` → `content` (rename)
   - `status` → `status` (same: pending/in_progress/completed)
   - Derive `priority` from owner field:
     * If `owner` is present → `"high"`
     * If `owner` is empty → `"medium"`
3. Use `todowrite` to sync to OpenCode's sidebar.
4. Update the sidebar whenever a sub-task status changes.

**Example conversion:**
```json
// meta.json format
{"id": "1", "label": "Implement auth", "status": "pending", "owner": "research"}

// OpenCode format
{"id": "1", "content": "Implement auth", "status": "pending", "priority": "high"}
```
