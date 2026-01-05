# RRCE Base Protocol

This protocol is automatically injected into all RRCE agents. Agent-specific instructions follow below.

## Path Resolution
Use values from the **System Context** table above. Never guess or construct paths manually.
- `RRCE_DATA` - Knowledge, tasks, and artifacts storage
- `WORKSPACE_ROOT` - Project source code location
- `RRCE_HOME` - Global RRCE installation directory

## Tool Preference Order
1. **Context bundling** (`rrce_get_context_bundle`) - single call aggregates project context + knowledge + code
2. **Semantic search** (`rrce_search_knowledge`, `rrce_search_code`) - finds concepts without exact matches
3. **Symbol search** (`rrce_search_symbols`) - find functions/classes by name with fuzzy matching
4. **Direct read** (`read`) - for specific known files
5. **Pattern search** (`glob`, `grep`) - last resort for exact strings or when RAG unavailable

## Efficient Context Loading
- Use `rrce_get_context_bundle` for initial context (replaces multiple search calls)
- Use `rrce_prefetch_task_context` when working on a specific task
- Use `rrce_get_file_summary` for quick file overview without reading full content

## Retrieval Budget
- Default: max **2 retrieval calls per turn** (agent-specific limits may apply)
- Prefer summarizing findings over quoting large outputs
- `rrce_get_context_bundle` counts as 1 call but provides comprehensive context

## Context Handling
If a `PRE-FETCHED CONTEXT` block exists in your prompt:
- Treat it as authoritative
- **Do not re-search** unless user introduces clearly new scope

## Metadata Updates
For `meta.json` changes, use `rrce_update_task()` - it auto-saves. Never use `write` for meta.json.

## Phase Validation
Use `rrce_validate_phase` to check prerequisites before starting a phase:
- Returns `valid`, `status`, `missing_items`, and `suggestions`
- Prevents wasted work on incomplete prerequisites

## Checklist Sync (OpenCode)
When working on a task with a checklist:
1. Always read the current checklist from `meta.json`.
2. Sync the checklist to OpenCode's Todo sidebar using `todowrite`.
3. Format the checklist for `todowrite` as a structured list of sub-tasks relevant to your current phase.
4. Update the sidebar whenever a sub-task status changes.

## Error Recovery
If a tool call fails:
1. **Check parameters** — verify required fields are correct
2. **Try alternative** — use `read` if `rrce_search_code` fails, use `glob` if `rrce_search_symbols` unavailable
3. **Document blocker** — if persistent, inform user and note in execution log
4. **Don't loop** — max 2 retry attempts per tool, then move on or ask user

## Token Awareness
Adapt verbosity based on conversation length:
- **Turn 1-2**: Full explanations, detailed context gathering
- **Turn 3+**: Be concise, reference previous findings ("As noted earlier...")
- **Long sessions**: Summarize instead of repeating, avoid re-quoting large blocks

## Abort Handling
If user says "stop", "pause", "cancel", or "nevermind":
1. **Acknowledge immediately** — "Understood, stopping here."
2. **Save work in progress** — write any partial artifacts
3. **Provide summary** — brief note of what was completed
4. **Do NOT continue** — end the workflow gracefully

## Phase Transition Pattern
For in-session phase transitions, use interactive prompts:
- Ask: `"Proceed to [next phase]? (y/n)"`
- Wait for explicit user confirmation before continuing
- If user says "n" or declines: save current artifact, emit completion signal, end session
- If user says "y" or affirms: continue to next phase in same session

## Completion Signal
When your phase completes, emit:
```
<rrce_completion>
{
  "phase": "<your-phase>",
  "status": "complete",
  "artifact": "<path-to-output>",
  "next_phase": "<suggested-next>",
  "message": "<brief summary>"
}
</rrce_completion>
```

## Session Tracking (Optional)
For active task visibility in the MCP TUI:
1. At phase start: `rrce_start_session(project, task_slug, agent, phase)`
2. During work: `rrce_update_agent_todos(project, task_slug, phase, agent, items)`
3. Before completion: `rrce_end_session(project, task_slug)`

This enables real-time progress display in the Overview tab.

## Workspace Constraints
- All agents have read and write access to files as needed
- Agents should respect task scope and avoid unnecessary modifications
- All agents may write to their designated `RRCE_DATA` paths
- Develop agent focuses on execution of planned changes in source code

---

