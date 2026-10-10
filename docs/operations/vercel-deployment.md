# Vercel deployment

Owner: Platform · Last verified: 2026-09-02

The Production project is `sekhemaifactory-creators-projects/sekhem-product-application`. Record the exact Git SHA. While GitHub is canonical, keep the existing GitHub integration. The prepared GitLab pipeline uses protected masked `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; MR preview and Production promotion are manual, and Production is restricted to the protected default branch.

After deploy, verify domain availability, expected SHA/build metadata, session transport, exact CORS origin, and operational/demo labels. Do not click Analyze/Provider Test as a deployment check.
