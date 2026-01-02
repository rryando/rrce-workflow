# RRCE Token Optimization - Quick Start

**Version:** 2.0  
**Status:** Production Ready  
**Last Updated:** January 2026

---

## 🎯 What This Is

Major token optimization update for RRCE workflow that reduces token usage by **65%** while maintaining quality.

**Key improvements:**
- ✅ Prompt sizes reduced by 70-93%
- ✅ Session reuse with prompt caching (90% reduction on turn 2+)
- ✅ Smart RAG caching (no redundant searches)
- ✅ Cost-optimized models (Haiku for research, Sonnet for execution)
- ✅ Auto-progression (eliminates confirmation prompts)

---

## 📊 Quick Stats

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Prompt Size** | ~15K tokens | ~4K tokens | **73%** |
| **Full Workflow** | 150K tokens | 53K tokens | **65%** |
| **Cost** | $0.45 | $0.16 | **64%** |
| **Latency** | ~120s | ~70s | **42%** |

---

## 🚀 Quick Start

### For New Users

1. **Install RRCE:**
   ```bash
   npx rrce-workflow
   ```

2. **The optimization is already included!** No extra steps needed.

3. **Use direct subagent invocation** (most efficient):
   ```
   @rrce_research_discussion TASK_SLUG=my-feature REQUEST="..."
   @rrce_planning_discussion TASK_SLUG=my-feature
   @rrce_executor TASK_SLUG=my-feature
   ```

---

### For Existing Users

1. **Read the migration guide:**
   - [`docs/MIGRATION-v2.md`](./MIGRATION-v2.md)

2. **Update your configuration:**
   - Copy `opencode.json` settings (model configuration)

3. **Test with a simple workflow:**
   - Verify token reduction in your provider dashboard

4. **Adopt new usage patterns:**
   - Prefer direct invocation over orchestrator
   - Continue conversations in same session for caching

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[OPTIMIZATION-SUMMARY.md](../OPTIMIZATION-SUMMARY.md)** | Comprehensive technical details |
| **[MIGRATION-v2.md](./MIGRATION-v2.md)** | Step-by-step migration guide |
| **[opencode-guide-optimization-addendum.md](./opencode-guide-optimization-addendum.md)** | Usage best practices |
| **[opencode-guide.md](./opencode-guide.md)** | Main RRCE guide |

---

## 💡 Best Practices

### ✅ Do This (Efficient)

1. **Use direct subagent invocation:**
   ```
   @rrce_research_discussion TASK_SLUG=x REQUEST="..."
   ```
   
2. **Continue in same session** (for caching):
   - Don't start new chat for each answer
   - Let prompt cache activate on turn 2+

3. **Trust hybrid approach:**
   - Agent asks critical questions
   - Documents rest as assumptions
   - You can always ask for more detail

4. **Reserve orchestrator for full automation:**
   ```
   @rrce_orchestrator "Implement feature X end-to-end"
   ```

### ❌ Avoid This (Inefficient)

1. **Don't use orchestrator for single phases:**
   ```
   ❌ @rrce_orchestrator "Just do research on X"
   ✅ @rrce_research_discussion TASK_SLUG=x REQUEST="Research X"
   ```

2. **Don't start new chats unnecessarily:**
   - Each new chat = no caching
   - Continue in same session whenever possible

3. **Don't ask agent to "re-search":**
   - Agent caches knowledge on first turn
   - References findings thereafter
   - Only re-searches for new scope

---

## 🔧 Configuration

### Model Settings (opencode.json)

```json
{
  "agent": {
    "rrce_research_discussion": {
      "model": "anthropic/claude-haiku-4-20250514"
    },
    "rrce_planning_discussion": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "rrce_executor": {
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  }
}
```

**Why these models?**
- **Haiku for research:** 12x cheaper, quality is sufficient for Q&A
- **Sonnet for planning/execution:** Needs reasoning power and code generation

---

## 🐛 Troubleshooting

### "Token usage still high"

**Check:**
1. Are you using direct invocation (`@rrce_*`)?
2. Are you continuing in same session?
3. Is caching enabled? (Check provider logs for cache hits)

### "Research too brief"

**Adjust:** Edit `agent-core/prompts/research_discussion.md`
```markdown
**STOP after 3 rounds.** (increase from 2)
```

### "Wrong model being used"

**Verify:** 
1. `opencode.json` exists and has model config
2. Restart OpenCode: `pkill opencode && opencode`
3. Check logs for model selection

---

## 📈 Measuring Success

### Check Token Usage

**Via Provider Dashboard:**
- Anthropic: https://console.anthropic.com → Usage
- OpenAI: https://platform.openai.com/usage

**Look for:**
- Input tokens (should be ~4K on first turn)
- Cache read tokens (should be ~3.6K on turn 2+)
- Overall reduction of 60-70% compared to before

---

## 🎓 Learn More

### Core Concepts

1. **Session Reuse:** Reusing same session enables prompt caching
2. **Smart Caching:** Agents cache knowledge searches, reference thereafter
3. **Hybrid Clarification:** Ask critical questions, document rest as assumptions
4. **Auto-Progression:** Orchestrator auto-proceeds based on user intent

### Advanced Topics

- **Session naming convention:** `research-${TASK_SLUG}`, `planning-${TASK_SLUG}`
- **Prompt cache keys:** Automatic via OpenCode (`promptCacheKey = sessionID`)
- **Model selection:** Cost-optimized per agent type
- **Knowledge integration:** Pre-fetch context to avoid subagent re-searching

---

## 🤝 Contributing

Found additional optimizations? Submit a PR:
- GitHub: https://github.com/rryando/rrce-workflow

---

## 📞 Support

**Questions?**
- GitHub Issues: https://github.com/rryando/rrce-workflow/issues
- Documentation: `docs/` directory

---

**Quick Links:**
- [Full Technical Summary](../OPTIMIZATION-SUMMARY.md)
- [Migration Guide](./MIGRATION-v2.md)
- [Usage Best Practices](./opencode-guide-optimization-addendum.md)
- [Test Suite](../src/__tests__/rrce-optimization.test.ts)

---

**Version:** 2.0  
**Status:** ✅ Production Ready
