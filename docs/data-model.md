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

Demo data for credits (`004_seed_demo_credits.sql`): Ahmad is Level 1 (30 credits, Web basics, valid permit), Mariam has 15 credits and a pending permit, and Yousef has a React result waiting for verification and a permit that expires within 30 days.

## projects database

| Table | Migration | Notes |
|---|---|---|
| `schema_migrations` | created by the migration runner | No feature tables yet. |
