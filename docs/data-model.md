# Data Model

Each service owns its own database. Ids from the other service, or demo user ids (ADR-4), are stored as plain values and checked in code, never as foreign keys across databases.

## learning database

```mermaid
erDiagram
    courses {
        INT id PK
        NVARCHAR(200) title
        NVARCHAR(4000) description
        NVARCHAR(20) type "module | live_class | workshop"
        INT credits "0 to 50"
        INT pass_mark "0 to 100, default 60"
        NVARCHAR(50) instructor_id "demo user id"
        BIT published "default 0"
        DATETIME2 created_at
        DATETIME2 updated_at
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
| `courses` | `001_create_courses.sql`, demo rows in `002_seed_demo_courses.sql` | Full CRUD. Unpublished courses are visible only to their instructor and admins. |
| `schema_migrations` | created by the migration runner | One row per applied migration, with its checksum. |

## projects database

| Table | Migration | Notes |
|---|---|---|
| `schema_migrations` | created by the migration runner | No feature tables yet. |
