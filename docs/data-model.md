# Data Model

Each service owns its own database. Ids from the other service, or demo user ids (ADR-4), are stored as plain values and checked in code, never as foreign keys across databases.

## learning database

```mermaid
erDiagram
    courses ||--o{ course_results : "graded in"
    course_results ||--o| credit_ledger : "verified into (source_type = course)"
    courses {
        INT id PK
        NVARCHAR(200) title
        NVARCHAR(4000) description
        NVARCHAR(20) type "module | live_class | workshop"
        INT credits "0 to 50"
        INT pass_mark "0 to 100, default 60"
        NVARCHAR(50) instructor_id "demo user id"
        BIT published "default 0"
        INT required_for_level "1 to 3, nullable"
        DATETIME2 created_at
        DATETIME2 updated_at
    }
    course_results {
        INT id PK
        INT course_id FK
        NVARCHAR(50) trainee_id "demo user id"
        INT grade "0 to 100"
        NVARCHAR(30) status "failed | pending_verification | verified | rejected"
        NVARCHAR(50) graded_by
        NVARCHAR(50) reviewed_by "an admin, never graded_by"
        NVARCHAR(500) reject_reason
    }
    credit_ledger {
        INT id PK
        NVARCHAR(50) trainee_id
        INT amount "never 0; negative for corrections"
        NVARCHAR(20) source_type "course | attendance | project | correction"
        INT source_id "e.g. the course_results id"
        NVARCHAR(500) reason
        NVARCHAR(50) created_by
        DATETIME2 created_at
    }
    work_permits {
        NVARCHAR(50) trainee_id PK
        NVARCHAR(20) status "pending | verified"
        DATE expires_on
        NVARCHAR(50) updated_by
    }
    trainee_profiles {
        NVARCHAR(50) trainee_id PK
        INT level "0 to 3, never lowered automatically"
        BIT projects_paused
    }
    notifications {
        INT id PK
        NVARCHAR(50) user_id
        NVARCHAR(40) kind "creditsChanged | levelReached | resultRejected"
        NVARCHAR(1000) data "JSON"
        BIGINT event_id "outbox event that created it"
        DATETIME2 read_at
    }
    outbox {
        BIGINT id PK
        NVARCHAR(60) event_type
        NVARCHAR(2000) payload "JSON"
        DATETIME2 processed_at "NULL while pending"
        INT attempts "given up after 5"
        NVARCHAR(1000) last_error
    }
    schema_migrations {
        INT version PK
        NVARCHAR(200) name
        CHAR(64) checksum
        DATETIME2 applied_at
    }
```

| Table | Migration | Notes |
|---|---|---|
| `courses` | `001_create_courses.sql`, demo rows in `002`; `required_for_level` added in `003` | Full CRUD. Unpublished courses are visible only to their instructor and admins. A course with results cannot be deleted (409). |
| `course_results` | `003_credits_levels_permits.sql` | A filtered unique index allows only one pending or verified result per trainee and course. |
| `credit_ledger` | `003` | Append-only, enforced by the database: the trigger `trg_credit_ledger_append_only` rejects every `UPDATE` and `DELETE`. A trainee's credits are `SUM(amount)`. |
| `work_permits` | `003` | One row per trainee. Only admins (and the trainee) see it. |
| `trainee_profiles` | `003` | The level reached, so a level never drops when, for example, a permit expires; and whether project access is paused. |
| `notifications` | `003` | A unique index on `(event_id, user_id, kind)` makes a redelivered outbox event harmless. |
| `outbox` | `003` | Events written in the same transaction as the change, delivered by the dispatcher (ADR-1). |
| `schema_migrations` | created by the migration runner | One row per applied migration, with its checksum. |

### Coding workspace (migration `006_code_workspace.sql`)

```mermaid
erDiagram
    courses ||--o{ code_repos : "one per trainee"
    code_repos ||--o{ code_commits : contains
    code_commits ||--o{ code_files : "snapshot of"
    code_commits ||--o| code_commits : "parent"
    code_repos ||--o{ code_branches : has
    code_branches }o--|| code_commits : "head"
    code_repos ||--o{ pull_requests : has
    pull_requests ||--o{ review_comments : has
    code_repos {
        INT id PK
        INT course_id FK
        NVARCHAR(50) trainee_id "unique with course_id"
    }
    code_commits {
        INT id PK
        INT repo_id FK
        INT parent_id FK "NULL for the first commit"
        NVARCHAR(500) message
        NVARCHAR(50) author_id
    }
    code_files {
        INT commit_id PK
        NVARCHAR(120) path PK
        NVARCHAR(MAX) content
    }
    code_branches {
        INT id PK
        INT repo_id FK
        NVARCHAR(50) name "unique per repo; main is protected in code"
        INT head_commit_id FK
    }
    pull_requests {
        INT id PK
        INT repo_id FK
        NVARCHAR(50) source_branch
        NVARCHAR(50) target_branch "main"
        NVARCHAR(20) status "open | changes_requested | merged"
        INT merged_commit_id FK
        INT base_commit_id FK "main before the merge"
    }
    review_comments {
        INT id PK
        INT pull_id FK
        NVARCHAR(120) path "NULL = on the whole pull request"
        INT line "line in the new code"
        NVARCHAR(2000) body
    }
```

Each commit stores a full snapshot of its files, so reading any version is one query and a diff compares two snapshots (`codeDiff.js`). History follows `parent_id` with a recursive query. A filtered unique index allows one open pull request per branch.

### Course notes (migration `007_course_notes.sql`)

`course_notes` (`id`, `course_id` FK to `courses`, `title`, `body`): the material the AI tutor answers from, seeded with notes in English and Arabic for the published courses.

Demo data for credits (`004_seed_demo_credits.sql`): Ahmad is Level 1 (30 credits, Web basics, valid permit), Mariam has 15 credits and a pending permit, and Yousef has a React result waiting for verification and a permit that expires within 30 days.

## projects database

```mermaid
erDiagram
    packs ||--o{ projects : "requested as"
    projects ||--o{ project_events : "moves through"
    projects ||--o{ messages : "discussed in"
    projects ||--o{ invoices : "paid by"
    projects ||--o| payouts : "pays the trainee"
    packs {
        NVARCHAR(30) code PK "website | whatsapp-bot | ai-assistant"
        NVARCHAR(100) name
        INT delivery_days
        DECIMAL setup_fee_jd
        DECIMAL price_jd
        INT level_required "1 to 3"
    }
    projects {
        INT id PK
        NVARCHAR(50) company_id "demo user id"
        NVARCHAR(30) pack_code FK "NULL = custom request"
        NVARCHAR(200) title
        NVARCHAR(2000) goals
        DATE deadline
        NVARCHAR(20) status "requested | quoted | accepted | in_progress | in_review | approved | cancelled"
        INT level_required
        DECIMAL setup_fee_jd
        DECIMAL price_jd
        NVARCHAR(50) preferred_trainee_id "a wish; the admin decides"
        NVARCHAR(50) trainee_id "learning demo user id"
        INT revisions_used "max_revisions default 2"
        INT rating "1 to 5"
        NVARCHAR(1000) testimonial
        BIT testimonial_public "company consent"
    }
    project_events {
        INT id PK
        INT project_id FK
        NVARCHAR(30) action
        NVARCHAR(20) from_status
        NVARCHAR(20) to_status
        NVARCHAR(50) actor_id
    }
    messages {
        INT id PK
        INT project_id FK
        NVARCHAR(50) author_id
        NVARCHAR(2000) body
    }
    invoices {
        INT id PK
        INT project_id FK
        NVARCHAR(20) kind "setup_fee | project_price, unique per project"
        DECIMAL amount_jd
        NVARCHAR(100) payment_ref "from the mock payment provider"
    }
    payouts {
        INT id PK
        INT project_id FK "unique"
        NVARCHAR(50) trainee_id
        DECIMAL amount_jd "80% of the price"
        DECIMAL jiwar_share_jd "20%"
    }
    outbox {
        BIGINT id PK
        NVARCHAR(60) event_type "project.approved"
        NVARCHAR(2000) payload "JSON"
        DATETIME2 processed_at
        INT attempts "given up after 8"
    }
```

| Table | Migration | Notes |
|---|---|---|
| `packs` | `001_create_projects.sql`, rows in `002` | Fixed prices are placeholders from the proposal. |
| `projects` | `001`, demo rows in `002` | The status follows the state machine in `projectRules.js`; every change is also written to `project_events`. |
| `project_events`, `messages` | `001` | The timeline and the thread on the project page. |
| `invoices`, `payouts` | `001` | Money in from companies (mock payments) and out to trainees. Unique keys stop a project being charged or paid out twice. |
| `outbox` | `001` | `project.approved` events, delivered to the learning service's `POST /internal/project-credits` and retried while it is down. |
| `schema_migrations` | created by the migration runner | One row per applied migration, with its checksum. |

Across the two databases: `credit_ledger.source_id` in learning (with `source_type = 'project'`) holds `projects.id`, and a unique index there (`005_project_credits.sql`) means a retried event never adds the credits twice. Project 1 (approved, Ahmad) and its 5 credits are seeded in both databases.
