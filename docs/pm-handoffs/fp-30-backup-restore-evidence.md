# FP-30 Backup / Restore Evidence

Package ID: FP-30
Owner: Infra
Host: sekhem-app-01
User: root for backup artifact creation; sekhem for repo commit
Git root: /opt/sekhem/app/repo
Branch: main
Repo HEAD before evidence commit: eb99a5e884d379a8a3033185a82c6bd573fa12f5

## Purpose

This document records controlled backup artifact creation and restore-readiness metadata validation for FP-30.

This is evidence only. It does not authorize deployment, production cutover, production restore, restart, migration, seed, db push, DB reset, or production readiness claim.

## Backup Artifact

Backup artifact path:

/opt/sekhem/backups/fp-30/sekhem-db-20260613T121009Z.dump

Backup artifact size bytes:

21820

Backup artifact SHA256:

1d80ce87983606c0c293e5f2c3fa9f5d9ba580cf019a811b91ad67392dec795e

## Restore-List Evidence

Restore-list evidence path:

/opt/sekhem/backups/fp-30/sekhem-db-20260613T121009Z.dump.restore-list.txt

Restore-list evidence size bytes:

3356

Restore-list SHA256:

4d5e8bc4696ce029819e2445d8e3c400c8452d61bae8bd71a6a85f97e25c8564

## Safety Confirmation

Restore dry-run executed: NO
Production restore executed: NO
DB reset: NO
Migration/seed/db push: NO
Deployment executed: NO
Restart executed: NO
Secrets exposed: NO
Production readiness claim: NO

## Evidence Status

Backup artifact created: YES
Restore-list evidence created: YES
Final backup/restore evidence status: PASS

## Notes

The restore-readiness check used metadata/listing validation only with pg_restore --list.

No restore into production DB was executed.

No destructive DB action was executed.
