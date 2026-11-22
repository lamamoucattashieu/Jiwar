# Jiwar

Jiwar is a platform that trains Palestinian refugee youth in Jordan in coding and AI and connects them to paid projects from local businesses.

## Live URL

_Added when the pipeline first deploys to Azure (Sprint 1)._

## Architecture

Two Express services, each with its own SQL Server database, and a static React UI that calls both from the browser. See [docs/decisions.md](docs/decisions.md) for the reasons.

```
                   Browser
                      │  loads static files
                      ▼
            UI (React, static files)
        Azure Static Web Apps / nginx locally
           │                       │
           │ HTTP (CORS)           │ HTTP (CORS)
           ▼                       ▼
   learning service ◄──HTTP──  projects service
   (Express, :3001)            (Express, :3002)
           │                       │
           ▼                       ▼
     learning DB               projects DB
       (Azure SQL serverless / SQL Server locally)
```

## Run locally

Requirements: Docker Desktop (on Apple Silicon, enable Rosetta emulation for the SQL Server image).

```bash
cp .env.example .env        # local-only passwords for the SQL Server container
docker compose up --build
```

| What | URL |
|---|---|
| UI | http://localhost:8080 |
| Learning service | http://localhost:3001/health |
| Projects service | http://localhost:3002/health |

The first start pulls the SQL Server image and takes a few minutes. `db-init` creates the two databases and logins, and `ui-build` builds the UI; both exit once they are done.

To run one service without Docker (Node.js 24):

```bash
cd services/learning   # or services/projects
npm ci
npm start              # http://localhost:8000/health
```

## Run tests

Each service has its own tests and fails if line coverage of `src/` is below 70%:

```bash
cd services/learning && npm ci && npm test
cd services/projects && npm ci && npm test
```

Lint and format checks for the whole repository (run from the root):

```bash
npm ci && (cd ui && npm ci)
npm run lint
npm run format:check
```

## CI/CD

| Workflow | When | What |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Every pull request and every push to a branch other than `main` | Lint, format check, tests with coverage (fails below 70%), `npm audit`, UI build, both images built |
| [`cd.yml`](.github/workflows/cd.yml) | Every push to `main` (a merged pull request) | Runs CI, pushes both images to GHCR tagged with the commit SHA, deploys them to Azure Container Apps, waits for `/health` to report that SHA, deploys the UI to Static Web Apps, runs [`scripts/smoke-test.sh`](scripts/smoke-test.sh) against the live URLs, then tags the commit `release-YYYY.MM.DD-N` |

## Azure setup

Everything lives in the group's resource group in `westeurope` and is declared in [`infra/main.bicep`](infra/main.bicep): a Log Analytics workspace, a Container Apps environment, the two Container Apps (scale 0 to 1), one SQL server with two serverless databases (15-minute auto-pause, 2 GB) and one Static Web App. One member runs the setup once; after that only the pipeline changes anything.

1. Accept the Microsoft invitation from IE, then sign in to IE's directory:
   ```bash
   az login --tenant 5ca2bc70-353c-4d1f-b7d7-7f2b2259df68   # add --use-device-code if the browser fails
   gh auth login
   ```
2. Set the group's values and choose three strong passwords (never commit them):
   ```bash
   export PREFIX=sdd-<class>-g<N>
   export GITHUB_REPO=lamamoucattashieu/Jiwar
   export SQL_ADMIN_PASSWORD='...' LEARNING_DB_PASSWORD='...' PROJECTS_DB_PASSWORD='...'
   ```
3. Run [`infra/setup.sh`](infra/setup.sh) (Azure Cloud Shell has `az` and `sqlcmd`):
   ```bash
   bash infra/setup.sh
   ```
   It deploys the Bicep file, creates one contained user per database (`db_ddladmin`, `db_datareader`, `db_datawriter`) through a temporary firewall rule for your IP that it removes again, registers the federated credentials of `<prefix>-github` for `main`, and sets the GitHub secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) and variables (`PREFIX`, `RESOURCE_GROUP`).
4. Merge to `main`. The first CD run fails to pull the images because new GHCR packages are private: make `jiwar-learning` and `jiwar-projects` public in the package settings on GitHub, then re-run the failed job.

To read a service's logs: `az containerapp logs show -n <prefix>-learning -g rg-<prefix> --follow`.

## Team

| Name | GitHub |
|---|---|
| Lama | [@lamamoucattashieu](https://github.com/lamamoucattashieu) |
| Salma | [@snsourieu2024](https://github.com/snsourieu2024) |
| Adam | [@adamkhouryedy2308-eng](https://github.com/adamkhouryedy2308-eng) |
| Habib | [@habo212](https://github.com/habo212) |
| Issam | [@issamarida](https://github.com/issamarida) |
| Sanad | [@Sanad-AlBilleh](https://github.com/Sanad-AlBilleh) |
