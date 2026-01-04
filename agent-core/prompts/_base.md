# RRCE Base Protocol

This protocol is automatically injected into all RRCE agents. Agent-specific instructions follow below.

## Path Resolution
Use values from the **System Context** table above. Never guess or construct paths manually.
- `RRCE_DATA` - Knowledge, tasks, and artifacts storage
- `WORKSPACE_ROOT` - Project source code location
- `RRCE_HOME` - Global RRCE installation directory

## Tool Preference Order
1. **Semantic search** (`rrce_search_knowledge`, `rrce_search_code`) - finds concepts without exact matches
2. **Direct read** (`read`) - for specific known files
3. **Pattern search** (`glob`, `grep`) - last resort for exact strings or when RAG unavailable

## Retrieval Budget
- Default: max **2 retrieval calls per turn** (agent-specific limits may apply)
- Prefer summarizing findings over quoting large outputs

## Context Handling
If a `PRE-FETCHED CONTEXT` block exists in your prompt:
- Treat it as authoritative
- **Do not re-search** unless user introduces clearly new scope

## Metadata Updates
For `meta.json` changes, use `rrce_update_task()` - it auto-saves. Never use `write` for meta.json.

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

## Workspace Constraints
- Most agents are **read-only** on `WORKSPACE_ROOT`
- Only **Executor** may modify source code
- All agents may write to their designated `RRCE_DATA` paths

---

