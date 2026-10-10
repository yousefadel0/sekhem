# Release checklist

- Record approved merge SHA and rollback SHA/bundle.
- Require green protected-branch pipeline and CODEOWNER approvals.
- Confirm every migration is separately reviewed, disposable-tested, and explicitly approved before Production use.
- Deploy one exact SHA; record Backend and frontend SHAs.
- Use one bounded restart when required; record PID and restart count.
- Verify local/private/public health and authentication/CORS behavior.
- Never run Provider Test or R&D as an implicit release check.
- Record rollback decision and final operator.
