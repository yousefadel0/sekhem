# Output schema and citations

Owner: AI Platform · Last verified: 2026-09-02

The canonical runtime validator remains authoritative. Provider JSON Schema is a compatible generation subset, not permission to relax runtime semantics. Findings require exact lowercase severity (`info`, `low`, `medium`, `high`, `critical`) and mandatory citations. JSON parsing remains strict/fenced/balanced; no guessing, alias mapping, or result repair occurs.

Validation diagnostics may contain only issue path, validator code, expected type, finish reason, token counts, configured output budget, and safe transport/status fields. Rejected values and raw content are forbidden.
