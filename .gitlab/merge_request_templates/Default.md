## Change

- Purpose:
- Scope:
- Exact base/head SHA:

## Risk and safety

- [ ] No secrets, credentials, raw provider output, or Production data included
- [ ] Authentication/RBAC and audit actors remain trusted
- [ ] Repository/provider access remains read-only and allowlisted
- [ ] Database change is additive; Production application is separately approved
- [ ] Rollback is documented

## Verification

- [ ] Targeted tests
- [ ] Backend test/typecheck/build (if affected)
- [ ] Frontend test/typecheck/build (if affected)
- [ ] Disposable migration reconstruction (if affected)
- [ ] `git diff --check`

## Deployment

- Production deployment required: YES / NO
- Manual restart required: YES / NO
- Migration required: YES / NO (never implicit)
- Observed Production SHA after deployment:
