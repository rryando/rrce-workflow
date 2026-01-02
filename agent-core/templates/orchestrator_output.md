# RRCE Orchestration Summary

**Generated**: {{TIMESTAMP}}  
**Orchestrator**: RRCE Workflow Orchestrator  
**Phases Executed**: {{PHASES_EXECUTED}}

---

## Workflow Execution Summary

### Requested Work
{{USER_REQUEST}}

### Phases Completed

{{#each PHASES}}
#### {{PHASE_NAME}}

**Status**: {{STATUS}}  
**Artifact**: `{{ARTIFACT_PATH}}`  
**Duration**: {{DURATION}}

**Key Outcomes:**
{{OUTCOMES}}

**Next Steps:**
{{NEXT_STEPS}}

---

{{/each}}

## Overall Status

**Completion**: {{COMPLETION_PERCENTAGE}}%  
**Ready for Next Phase**: {{READY_FOR_NEXT}}

### Artifacts Generated

{{#each ARTIFACTS}}
- [`{{PATH}}`]({{PATH}}) - {{DESCRIPTION}}
{{/each}}

### Recommendations

{{RECOMMENDATIONS}}

---

**Session Complete**: {{SESSION_COMPLETE}}  
**Return Summary**: {{RETURN_SUMMARY}}
