# Step trace draft

`createStepTraceDraft` in `@jolty/telemetry` creates an in-memory record of one step through execution. It records run and step IDs, a caller-supplied safe goal summary, a page origin and pathname, candidate IDs/roles/retrieval scores, the selected decision or failure, execution status, and stage timing. `validation_outcome` is `pending`; full traces and persistence belong to Milestone 8.

The draft deliberately omits form values, candidate names, URL query and fragment, and raw error messages. A caller must also keep secrets out of `goalSummary` and page path. The helper performs no logging, storage, validation, fallback, or control flow. Its purpose is to preserve the already available pre-validation evidence while the trace contract develops.
