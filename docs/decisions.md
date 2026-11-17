# Decision Records

## ADR-1: Two services, learning and projects

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The assignment requires exactly two services, each with its own container and database, talking over HTTP. Jiwar has two clearly separate jobs: training youth in coding and AI, and matching them to paid projects from local businesses.
- **Decision:** Split along that line. The **learning** service owns courses and learner progress. The **projects** service owns businesses, project offers and applications. When the projects service needs to know what a learner has completed, it asks the learning service over HTTP (`LEARNING_URL`) instead of reading its database.
- **Alternatives:** One service per user type (youth vs. business), which would split the same data across both services and need many cross-service calls; a single monolith, which the assignment does not allow.
- **Consequences:** Each service can be built, tested and deployed by a sub-team on its own. Calls from projects to learning need a timeout and a clear error when learning is down. Referential integrity across the seam (a learner ID stored in projects) is checked in code, not by a foreign key.

## ADR-2: Node.js (Express) and Azure SQL serverless

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The backend must be Python (Flask or FastAPI) or Node.js (Express). Storage must be Azure SQL Database serverless on Azure and SQL Server locally.
- **Decision:** Both services use Node.js 24 with Express 5. Each service has its own SQL Server database (`learning`, `projects`) and its own login with access to that database only. Locally one SQL Server container holds both databases, created by the idempotent `db/init.sql`.
- **Alternatives:** FastAPI (Python), which would mean two languages in the repository (Python services, JavaScript UI); a shared database with one schema per service, which the assignment does not allow.
- **Consequences:** One language for the UI and both services, so everyone can review every pull request. Node's built-in test runner gives tests and coverage without extra packages. SQL Server dialect (`INT IDENTITY`, `NVARCHAR`, `OFFSET … FETCH`) must be used in migrations.

## ADR-3: React (Vite) static UI with runtime configuration

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** The UI must be static files on Azure Static Web Apps, calling both services from the browser. Service URLs differ between local and Azure and must not be hardcoded.
- **Decision:** React built with Vite to static files in `ui/`. Service URLs live in `ui/public/config.js` (`window.JIWAR_CONFIG`), loaded before the app. The local file points to `localhost`. On deploy the pipeline overwrites it with the Azure Container Apps URLs. Locally, compose builds the UI once (`ui-build`) and serves it with a stock `nginx:alpine` image, with no Dockerfile.
- **Alternatives:** Plain HTML/JS, which is simpler but harder to grow as the number of pages increases; Vite build-time variables (`import.meta.env`), which would require a rebuild per environment.
- **Consequences:** The same build works everywhere. Each service only accepts cross-origin requests from the UI's origin (`CORS_ORIGIN`).

## ADR-4: Demo users instead of authentication

- **Status:** Accepted, Sprint 0 (17 Nov 2026)
- **Context:** User authentication is out of scope; a hard-coded demo user is enough.
- **Decision:** The product uses a small set of seeded demo users (learners and businesses). The UI lets the presenter pick which demo user to act as.
- **Alternatives:** An optional API key, which protects write endpoints but does not help show both sides of the product in the demo; real authentication, which is out of scope.
- **Consequences:** No passwords or sessions to store or secure. The live system is not fit for real users without adding authentication.
