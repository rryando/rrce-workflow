# RRCE Workflow v2.0 Migration Guide

**From:** v1.x (Original)  
**To:** v2.0 (Token-Optimized)  
**Date:** January 2026

This guide helps you migrate from RRCE v1.x to v2.0, which introduces major token usage optimizations.

---

## 📋 Migration Checklist

- [ ] Backup current `agent-core/prompts/` directory
- [ ] Review breaking changes below
- [ ] Update `opencode.json` with new agent configuration
- [ ] Test with a simple workflow
- [ ] Update team documentation

**Estimated migration time:** 15-30 minutes

---

## 🔥 Breaking Changes

### 1. Prompt Structure Changes

**What changed:** All subagent prompts significantly reduced in size (70% reduction)

**Impact:** Agents may behave slightly differently due to streamlined instructions

| Agent | Old Lines | New Lines | Change |
|-------|-----------|-----------|--------|
| Research | 332 | 80 | -76% |
| Planning | 307 | 80 | -74% |
| Executor | 300+ | 100 | -67% |

**Migration action:** None required (prompts are backward compatible)

---

### 2. Hybrid Research Approach

**What changed:** Research agent now uses "hybrid" clarification:
- Asks only **critical** questions that can't be inferred
- Documents other items as **assumptions**
- Max **2 question rounds** (down from 4)

**Old behavior:**
```
Agent: 12 questions across 4 rounds
User: Answers all 12 questions
```

**New behavior:**
```
Agent: 6 critical questions across 2 rounds
Agent: Documents 6 other items as assumptions (with confidence levels)
```

**Migration action:** 
- Review generated research briefs
- Check "Assumptions" section for documented inferences
- If too aggressive, edit `agent-core/prompts/research_discussion.md` line 52:
  ```markdown
  **STOP after 3 rounds.** (increase from 2 to 3)
  ```

---

### 3. Auto-Progression in Orchestrator

**What changed:** Orchestrator now auto-progresses through phases based on user intent (no confirmation prompts)

**Old behavior:**
```
Orchestrator: Research complete! Ready to proceed to planning? (Y/n)
User: yes
Orchestrator: Starting planning...
```

**New behavior:**
```
Orchestrator: (Detects user wants implementation, auto-proceeds to planning → execution)
```

**Migration action:**
- If you prefer manual control, use direct subagent invocation:
  ```
  @rrce_research_discussion TASK_SLUG=x REQUEST="..."
  @rrce_planning_discussion TASK_SLUG=x
  @rrce_executor TASK_SLUG=x
  ```
- Orchestrator is now recommended **only** for full automation

---

### 4. Provider Caching Configuration (Model-Agnostic)

**What changed:** RRCE now enables provider caching for ALL providers, but does NOT force specific models

**New behavior:**
- `setCacheKey: true` enabled for Anthropic, OpenAI, OpenRouter, Google
- **No hardcoded models** - you choose what model to use
- Prompt caching activates automatically for any model that supports it

**Recommended models** (optional, for cost optimization):

| Agent | Recommendation | Rationale |
|-------|----------------|-----------|
| Research | Haiku/Mini | Q&A doesn't need heavy reasoning |
| Planning | Sonnet/GPT-4o | Task breakdown needs reasoning |
| Executor | Sonnet/GPT-4o | Code generation needs power |

**To set models per agent (optional):**
```json
{
  "agent": {
    "rrce_research_discussion": {
      "model": "anthropic/claude-haiku-4-20250514"
    }
  }
}
```

**Migration action:** None required - caching is automatic

---

### 5. Session State Management

**What changed:** Agents now cache knowledge searches across conversation turns

**Old behavior:**
```
Turn 1: Search knowledge for "auth patterns"
Turn 2: Search knowledge for "auth patterns" AGAIN
Turn 3: Search knowledge for "auth patterns" AGAIN
```

**New behavior:**
```
Turn 1: Search knowledge for "auth patterns" ONCE, store results
Turn 2: Reference cached results
Turn 3: Reference cached results
```

**Impact:** ~5K tokens saved per session

**Migration action:** None required (automatic optimization)

**Note:** Agents will only re-search if you introduce **completely new scope**

---

## ✅ What's Preserved (Non-Breaking)

### No Changes to These Areas:

1. **MCP Server Interface:** All MCP tools (`rrce_search_knowledge`, `rrce_get_task`, etc.) unchanged
2. **Task Structure:** `meta.json` format and artifact locations unchanged
3. **File Paths:** `{{RRCE_DATA}}`, `{{WORKSPACE_ROOT}}` resolution unchanged
4. **Agent Names:** `@rrce_research_discussion`, `@rrce_planning_discussion`, etc. unchanged
5. **Workflow Phases:** Research → Planning → Execution sequence unchanged
6. **Artifact Templates:** Research brief, planning doc, execution log formats unchanged

---

## 🚀 Migration Steps

### Step 1: Backup Current Configuration

```bash
# Backup prompts
cp -r agent-core/prompts agent-core/prompts.backup

# Backup OpenCode config (if you have custom settings)
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.backup
```

### Step 2: Pull Latest Changes

```bash
cd /path/to/rrce-workflow
git pull origin main
```

**Or install via npm:**
```bash
npm install -g rrce-workflow@latest
```

### Step 3: Update OpenCode Configuration

Add to `~/.config/opencode/opencode.json` or project `opencode.json`:

```json
{
  "agent": {
    "rrce_research_discussion": {
      "description": "Interactive research and requirements clarification (optimized for direct invocation)",
      "mode": "subagent",
      "model": "anthropic/claude-haiku-4-20250514",
      "temperature": 0.2
    },
    "rrce_planning_discussion": {
      "description": "Transform research into actionable execution plan (balanced reasoning)",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.1
    },
    "rrce_executor": {
      "description": "Execute planned tasks - ONLY agent authorized to modify source code",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.3
    }
  }
}
```

**Note:** Copy the full configuration from `opencode.json` in this repo

### Step 4: Restart OpenCode

```bash
# Kill existing OpenCode processes
pkill opencode

# Start OpenCode
opencode
```

### Step 5: Test Migration

Run a simple research workflow:

```
@rrce_research_discussion TASK_SLUG=test-migration REQUEST="Test the migration by researching a simple feature"
```

**Verify:**
- Agent asks fewer questions (2 rounds max)
- Agent uses Haiku model (check logs: should show `claude-haiku`)
- Token usage is significantly lower (check API logs)

### Step 6: Review and Adjust

**If research is too brief:**
Edit `agent-core/prompts/research_discussion.md`:
```markdown
**STOP after 3 rounds.** (increase from default 2)
```

**If research is using wrong model:**
Check `opencode.json` - verify Haiku is configured

**If orchestrator auto-progresses too aggressively:**
Use direct subagent invocation instead:
```
@rrce_research_discussion (manual control)
@rrce_planning_discussion (manual control)
@rrce_executor (manual control)
```

---

## 🔍 Validation Tests

### Test 1: Token Usage Reduction

**Run:**
```
@rrce_research_discussion TASK_SLUG=token-test REQUEST="Research adding a new API endpoint"
```

**Check token usage** (in provider dashboard or OpenCode logs)

**Expected:**
- First turn: ~5K tokens (down from ~20K)
- Second turn: ~2K tokens (cached!)
- Third turn: ~2K tokens (cached!)

### Test 2: Knowledge Caching

**Verify** agent doesn't re-search on subsequent turns:

1. Start research
2. On first turn, note what knowledge agent found
3. On second turn, agent should **reference** findings (not re-search)
4. Check logs: `rrce_search_knowledge` should appear only once

### Test 3: Hybrid Clarification

**Verify** agent asks fewer questions:

**v1.0 behavior:** 10-12 questions across 4 rounds
**v2.0 behavior:** 6-8 questions across 2 rounds + documented assumptions

**Check:** Research brief should have "Assumptions" section with confidence levels

---

## 📊 Expected Performance Improvements

| Metric | v1.0 | v2.0 | Improvement |
|--------|------|------|-------------|
| Research tokens (3 rounds) | 66K | 16K | **76%** |
| Research cost | $0.20 | $0.004 | **98%** |
| Planning tokens | 44K | 19K | **57%** |
| Full workflow tokens | 150K | 53K | **65%** |
| Full workflow cost | $0.45 | $0.16 | **64%** |
| Latency | ~120s | ~70s | **42%** |

---

## 🐛 Troubleshooting

### "Agent still using Sonnet for research"

**Cause:** OpenCode config not loaded

**Fix:**
1. Verify `opencode.json` exists in project root OR global config
2. Restart OpenCode completely: `pkill opencode && opencode`
3. Check logs for model selection

---

### "Token usage not reduced"

**Possible causes:**
1. **Not continuing in same session:** Each new chat = no cache benefit
2. **Using orchestrator:** Orchestrator has overhead, use direct invocation
3. **Modified prompts:** Custom edits may increase token usage

**Fix:**
- Continue conversations in same session (don't start new chat)
- Use `@rrce_*` directly instead of orchestrator
- Compare your prompts with v2.0 defaults

---

### "Research too brief, missing important questions"

**Cause:** Hybrid approach may be too aggressive for your use case

**Fix:**
Increase question rounds in `agent-core/prompts/research_discussion.md`:

```markdown
### 2. Focused Clarification (Hybrid Approach - Max 3 Rounds)  # Change from 2 to 3

...

**STOP after 3 rounds.**  # Change from 2 to 3
```

Or switch to "ask-first" mode:

```markdown
**Ask ALL critical questions** that can't be inferred from knowledge.
Document only obvious assumptions.
```

---

### "Orchestrator still prompting for confirmation"

**Cause:** Old prompt cached in OpenCode

**Fix:**
1. Clear OpenCode cache: `rm -rf ~/.cache/opencode`
2. Restart OpenCode
3. Verify updated `orchestrator.md` is being used

---

## 🔄 Rollback Instructions

If you need to revert to v1.0:

### Step 1: Restore Backups

```bash
# Restore prompts
rm -rf agent-core/prompts
mv agent-core/prompts.backup agent-core/prompts

# Restore OpenCode config
mv ~/.config/opencode/opencode.json.backup ~/.config/opencode/opencode.json
```

### Step 2: Downgrade Package

```bash
npm install -g rrce-workflow@1.x
```

### Step 3: Restart OpenCode

```bash
pkill opencode && opencode
```

---

## 📚 Additional Resources

- [Token Optimization Guide](./opencode-guide-optimization-addendum.md)
- [Main RRCE Guide](./opencode-guide.md)
- [Architecture Documentation](./architecture.md)
- [OpenCode Documentation](https://opencode.ai/docs)

---

## 🤝 Support

**Issues or questions?**
- GitHub Issues: https://github.com/rryando/rrce-workflow/issues
- Discord: (if available)

---

**Migration completed?** Mark the checklist at the top ✓

**Last Updated:** January 2026  
**Version:** 2.0
