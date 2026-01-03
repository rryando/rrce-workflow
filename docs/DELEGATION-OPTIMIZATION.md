# RRCE v2.1 - Delegation & Token Optimization

**Date:** January 2026  
**Focus:** Fixing orchestrator/subagent delegation inefficiencies

---

## Problems Identified

### Issue 1: Delegation Loop Creates New Sessions
**Problem:** When orchestrator delegates to research agent, and research asks questions:
```
User → OpenCode → Orchestrator → task(Research) → Questions
                                                    ↓
User answers → OpenCode → Orchestrator → task(Research) ← NEW CALL!
```
Each `task()` call creates a new LLM inference request, even with `session_id`.

### Issue 2: No Prompt Caching Across Delegations
**Problem:** The `session_id` parameter helps with session state, but:
- Each task() is a separate API call
- System prompt is re-sent each time
- Anthropic caching only helps WITHIN a session, not across task() calls

### Issue 3: Unclear Completion State
**Problem:** Research agent returns "Ready for planning? Invoke `@rrce_planning_discussion`"
- This instructs the USER, not the orchestrator
- Orchestrator can't parse this to auto-proceed
- Creates confusion about who handles transitions

### Issue 4: Double RAG Search
**Problem:** Both orchestrator AND subagent search knowledge:
- Orchestrator: "Pre-fetch context ONCE" (searches)
- Research agent: "First turn ONLY: Run knowledge discovery" (searches AGAIN)
- Result: Same context fetched twice

---

## Root Cause: Agent Inception

The deep delegation hierarchy wastes tokens:

```
Old Flow (Expensive):
User → OpenCode → Orchestrator → task(Research) → Questions
                                                    ↓
User ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
                                                    ↓
User → OpenCode → Orchestrator → task(Research) → Continue
                                                    ↓
[Repeat for each Q&A round - ~5K tokens per round-trip!]
```

---

## Solution: Flatten the Hierarchy

```
New Flow (Efficient):
User → OpenCode → Research (directly) → Q&A in SAME session
       │
       └─ After complete:
          User → OpenCode → Orchestrator → "Next phase: @rrce_planning_discussion"
```

### Key Changes Made

#### 1. Orchestrator → Phase Coordinator
- NO delegation for interactive work
- GUIDES user to invoke subagents directly
- Only delegates for non-interactive automation

#### 2. Context Pass-Through Protocol
- If orchestrator pre-fetches context, includes as `PRE-FETCHED CONTEXT` block
- Subagents detect this block and SKIP their own search
- Eliminates double-search

#### 3. Completion Signal Protocol
- All subagents return structured `<rrce_completion>` tag
- Orchestrator can parse this for auto-progression
- Clear handoff between phases

---

## OpenCode Capabilities Assessment

| Feature | Available? | Workaround |
|---------|------------|------------|
| Single session for all subagents | ❌ No | Use direct invocation instead |
| Blocking session (no return until complete) | ❌ No | Flatten hierarchy |
| Interactive within task() session | ❌ No | Flatten hierarchy |
| Static prompt caching | ✅ Partial | Provider-level (Anthropic/OpenAI) |
| session_id for state | ✅ Yes | Helps with continuation, not caching |

### Your Proposed Solutions - Analysis

#### 1. "Single subagent session for all subagents"
**Status:** Not available in OpenCode
**Workaround:** Don't use orchestrator for Q&A. Invoke subagents directly:
```
@rrce_research_discussion TASK_SLUG=x REQUEST="..."
```
This keeps all Q&A in ONE session with natural prompt caching.

#### 2. "Blocking session to prevent concurrency"
**Status:** Not available in OpenCode
**Workaround:** Flatten hierarchy eliminates the need. User invokes agents sequentially.

#### 3. "Static prompt caching"
**Status:** Partially available via providers
- Anthropic: Auto-caches prompts >1024 tokens with same prefix
- OpenAI: Similar mechanism
- OpenCode: Respects `session_id` for cache keys

**Key insight:** Caching works WITHIN a session, but each task() is a new session. Flattening fixes this.

---

## Token Impact Analysis

### Old Flow: Orchestrator Delegation
```
User wants research with 3 Q&A rounds:

Call 1: Orchestrator (5K) + delegation prompt (1K) + task(Research 4K)
        = 10K tokens
Call 2: Orchestrator (5K, cached) + user answer (0.5K) + task(Research 4K)
        = 9.5K tokens
Call 3: Orchestrator (5K, cached) + user answer (0.5K) + task(Research 4K)
        = 9.5K tokens

Total: ~29K tokens for research phase
```

### New Flow: Direct Invocation
```
User invokes research directly:

Call 1: Research (4K) + REQUEST
        = 4K tokens
Call 2: Research (cached 3.6K) + user answer
        = 0.9K tokens
Call 3: Research (cached 3.6K) + user answer
        = 0.9K tokens

Total: ~6K tokens for research phase

Savings: 79%!
```

---

## Updated Prompt Files

| File | Changes |
|------|---------|
| `orchestrator.md` | Flattened to phase coordinator, guides instead of delegates |
| `research_discussion.md` | Context pass-through, completion signal |
| `planning_discussion.md` | Context pass-through, completion signal |
| `executor.md` | Context pass-through, completion signal |

---

## New Usage Patterns

### Most Efficient (90% of cases)
```
# Research phase - direct invocation
@rrce_research_discussion TASK_SLUG=feature-x REQUEST="Add authentication"

# [Q&A happens in same session - caching works!]

# After research complete, invoke planning
@rrce_planning_discussion TASK_SLUG=feature-x

# After planning complete, invoke executor
@rrce_executor TASK_SLUG=feature-x
```

### Use Orchestrator For
```
# Status checks
@rrce "What's the status of feature-x?"

# Phase guidance
@rrce "Continue feature-x"

# Non-interactive automation (ONLY)
@rrce "Execute feature-x end-to-end without asking questions"
```

---

## Future Improvements (Requires OpenCode Changes)

### 1. Interactive Task Sessions
```typescript
task({
  subagent_type: "rrce_research_discussion",
  interactive: true,  // NEW: allows user input within session
  blocking: true,     // NEW: doesn't return until phase complete
})
```
This would allow orchestrator to delegate once and let user interact directly.

### 2. Shared Context Pool
```typescript
// MCP could maintain shared context
rrce_set_context(project, context)  // Orchestrator calls
rrce_get_context(project)           // Subagent retrieves (no search needed)
```

### 3. Prompt Hash Caching
```typescript
// MCP returns prompt hash instead of full content
{
  promptHash: "abc123",
  promptContent: "..." // Only sent if hash not cached
}
```

---

## Summary

**Problem:** Deep delegation hierarchy (orchestrator → subagent) wastes tokens due to:
1. Multiple task() calls (each is new inference)
2. Double context searches
3. Unclear completion signals

**Solution:** Flatten hierarchy:
1. Orchestrator becomes phase coordinator (guides, doesn't proxy)
2. Users invoke subagents directly for interactive work
3. Context pass-through eliminates double-search
4. Completion signals enable clear handoffs

**Result:** 79% token reduction for typical research phase.

---

## Files Changed

- `agent-core/prompts/orchestrator.md` (rewritten)
- `agent-core/prompts/research_discussion.md` (updated)
- `agent-core/prompts/planning_discussion.md` (updated)
- `agent-core/prompts/executor.md` (updated)
- `docs/DELEGATION-OPTIMIZATION.md` (this file)
