# Prompt: CI/CD pipeline, Azure infrastructure and smoke test

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: make every merge to main deploy itself to Azure, safely

The repository has two Express services and a React UI (see ADR-1 to ADR-4 and the foundation work). Read the group assignment's sections 4 to 6 and the Assignment 2 Azure deployment guide, including its "Group project: the IE subscription" section, and follow them exactly. Do not add Azure services the brief does not allow. If the guide and the brief disagree, the group section of the guide wins for the group project; tell me about anything else that conflicts.

## Constraints from the brief and the guide
- Everything goes in the group's existing resource group in `westeurope`, with names starting with the group prefix `sdd-<class>-g<N>`. At most 2 Container Apps, 2 serverless SQL databases and 1 Static Web App. We cannot create resource groups or assign roles.
- Container Apps on the Consumption plan, minimum 0 and maximum 1 replicas. Databases serverless with a 15-minute auto-pause and 2 GB (the free offer is not available in the IE subscription).
- The pipeline signs in as the existing managed identity `<prefix>-github` through OIDC (federated credentials for `main`, registered with both the name and the numeric-id subject). No passwords or client secrets in the pipeline.
- Images in GHCR tagged with the commit SHA, built with `provenance: false`.
- Configuration only through environment variables and secrets; the connection string is a Container Apps secret. CORS is handled by the services, never by the Container Apps ingress.
- Nothing changed by hand after the initial setup. The initial setup is written as IaC (Bicep), which is credited.

## Scope

### 1. CI (`.github/workflows/ci.yml`)
- Runs on every pull request, on pushes to branches other than `main`, and as a reusable workflow (`workflow_call`) for CD.
- Jobs: lint and format check for the whole repository; tests for each service with the existing 70% coverage floor; `npm audit --omit=dev --audit-level=high` for each service and the UI; UI build; Docker build of each image (not pushed).
- Pin the Node version to the one in the Dockerfiles and cache npm and Docker layers.

### 2. CD (`.github/workflows/cd.yml`)
- Runs on every push to `main`; calls CI first and only continues if it passes. One deploy at a time.
- Push both images to GHCR tagged with the SHA (and `main`).
- Sign in with `azure/login` (OIDC), point both Container Apps at the new images and set `GIT_SHA`.
- Wait until `/health` on both services returns 200 and reports this commit's SHA, failing the run after a few minutes. Because the services migrate on startup, this also proves the migrations ran.
- Build the UI, write `config.js` with the Container Apps addresses, and deploy it to the Static Web App with a token read at deploy time.
- Do not use a GitHub `environment` on the deploy job: it would change the OIDC subject.

### 3. Infrastructure (`infra/main.bicep`, `infra/setup.sh`)
- Bicep for the Log Analytics workspace (low daily cap), the Container Apps environment using it, both Container Apps (external ingress on port 8000, small CPU and memory, `DATABASE_URL` as a secret, `CORS_ORIGIN` set to the Static Web App, `LEARNING_URL` for projects), the SQL server with the "allow Azure services" rule, both databases and the Static Web App. Outputs: the three addresses.
- A setup script, run once by one member and safe to re-run: deploys the Bicep while keeping the images already deployed, creates one contained user per database with `db_ddladmin`, `db_datareader` and `db_datawriter` through a temporary firewall rule it always removes, registers the federated credentials, and sets the GitHub secrets and variables.

### 4. Smoke test and release tag (credited extras)
- A read-only `scripts/smoke-test.sh` run after every deploy: both databases answer, the catalogue returns JSON, the UI and a deep link load, the deployed `config.js` points at the services, a browser preflight for a JSON POST from the UI's origin is allowed by both services, and other origins are not.
- After a passing smoke test, tag the commit `release-YYYY.MM.DD-N`.

### 5. UI cold starts
- The first request after an idle period may time out or get a 503 while the container starts and the database resumes. Show "The ... service is starting up after being idle. Please try again in a minute." instead of a generic error.

### 6. Docs
- README: the CI/CD table and the Azure setup steps (no passwords). A decision record for deployment and the pipeline, with alternatives. Keep `docs/decisions.md` within the brief's 4 to 6 records.

## Process
1. Validate what can be validated without Azure: `actionlint` on the workflows, `shellcheck` on the scripts, compile the Bicep, run every CI step on a clean checkout in Node 24, and run the health and smoke scripts against `docker compose`, including checks that they fail when they should.
2. Fix whatever these checks find.
3. Report what was built, what could not be tested without the group's Azure access, and the manual steps left (running setup once, making the GHCR packages public).
