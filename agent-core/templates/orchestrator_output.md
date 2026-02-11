# RRCE Orchestration Summary

**Generated**: {{timestamp}}
**Orchestrator**: RRCE Workflow Orchestrator
**Phases Executed**: {{phases_executed}}

---

## Workflow Execution Summary

### Requested Work
{{user_request}}

### Phases Completed

<!-- Repeat this block for each phase executed -->

#### {{phase_name}}

**Status**: {{phase_status}}
**Artifact**: `{{phase_artifact_path}}`
**Duration**: {{phase_duration}}

**Key Outcomes:**
{{phase_outcomes}}

**Next Steps:**
{{phase_next_steps}}

---

## Overall Status

**Completion**: {{completion_percentage}}%
**Ready for Next Phase**: {{ready_for_next}}

### Artifacts Generated

<!-- List all artifacts produced -->
- [`{{artifact_path}}`]({{artifact_path}}) - {{artifact_description}}

### Recommendations

{{recommendations}}

---

**Session Complete**: {{session_complete}}
**Return Summary**: {{return_summary}}
