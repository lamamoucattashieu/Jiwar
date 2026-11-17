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

## Azure setup

_Documented in Sprint 1, together with the deployment pipeline._

## Team

| Name | GitHub |
|---|---|
| Lama | [@lamamoucattashieu](https://github.com/lamamoucattashieu) |
| Salma | TBD |
| Adam | TBD |
| Habib | TBD |
| Issam | TBD |
| Sanad | TBD |
