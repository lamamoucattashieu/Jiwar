-- Credits, levels and work permits (stories #12, #13, #14).
-- Trainee, instructor and admin ids are demo user ids (ADR-4), not foreign keys.

-- The course a trainee must pass to reach a level (1 = Web basics, 2 = React, 3 = Practical AI).
ALTER TABLE courses ADD required_for_level INT NULL
  CONSTRAINT ck_courses_required_for_level CHECK (required_for_level BETWEEN 1 AND 3);
GO

-- A trainee's final grade in a course. A passing grade waits for an admin to verify it;
-- only verified results add credits.
CREATE TABLE course_results (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_course_results PRIMARY KEY,
  course_id INT NOT NULL CONSTRAINT fk_course_results_course REFERENCES courses (id),
  trainee_id NVARCHAR(50) NOT NULL,
  grade INT NOT NULL CONSTRAINT ck_course_results_grade CHECK (grade BETWEEN 0 AND 100),
  status NVARCHAR(30) NOT NULL
    CONSTRAINT ck_course_results_status CHECK (status IN ('failed', 'pending_verification', 'verified', 'rejected')),
  graded_by NVARCHAR(50) NOT NULL,
  graded_at DATETIME2 NOT NULL CONSTRAINT df_course_results_graded_at DEFAULT SYSUTCDATETIME(),
  reviewed_by NVARCHAR(50) NULL,
  reviewed_at DATETIME2 NULL,
  reject_reason NVARCHAR(500) NULL
);
GO

-- At most one open or verified result per trainee and course.
CREATE UNIQUE INDEX ux_course_results_active ON course_results (course_id, trainee_id)
  WHERE status IN ('pending_verification', 'verified');
CREATE INDEX ix_course_results_status ON course_results (status);
GO

-- Every credit change, ever. Corrections are new rows with a reason.
CREATE TABLE credit_ledger (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_credit_ledger PRIMARY KEY,
  trainee_id NVARCHAR(50) NOT NULL,
  amount INT NOT NULL CONSTRAINT ck_credit_ledger_amount CHECK (amount <> 0),
  source_type NVARCHAR(20) NOT NULL
    CONSTRAINT ck_credit_ledger_source CHECK (source_type IN ('course', 'attendance', 'project', 'correction')),
  source_id INT NULL,
  reason NVARCHAR(500) NOT NULL,
  created_by NVARCHAR(50) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_credit_ledger_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_credit_ledger_trainee ON credit_ledger (trainee_id);
GO

-- The database itself refuses edits and deletes, so the ledger stays append-only
-- even if a bug or a person tries to change history.
CREATE TRIGGER trg_credit_ledger_append_only ON credit_ledger
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  THROW 50001, 'credit_ledger is append-only: add a correction entry instead', 1;
END;
GO

CREATE TABLE work_permits (
  trainee_id NVARCHAR(50) NOT NULL CONSTRAINT pk_work_permits PRIMARY KEY,
  status NVARCHAR(20) NOT NULL CONSTRAINT ck_work_permits_status CHECK (status IN ('pending', 'verified')),
  expires_on DATE NULL,
  updated_by NVARCHAR(50) NOT NULL,
  updated_at DATETIME2 NOT NULL CONSTRAINT df_work_permits_updated_at DEFAULT SYSUTCDATETIME()
);
GO

-- The level a trainee has reached (levels never drop on their own) and whether an
-- admin has paused their access to projects.
CREATE TABLE trainee_profiles (
  trainee_id NVARCHAR(50) NOT NULL CONSTRAINT pk_trainee_profiles PRIMARY KEY,
  level INT NOT NULL CONSTRAINT df_trainee_profiles_level DEFAULT 0
    CONSTRAINT ck_trainee_profiles_level CHECK (level BETWEEN 0 AND 3),
  projects_paused BIT NOT NULL CONSTRAINT df_trainee_profiles_paused DEFAULT 0,
  updated_at DATETIME2 NOT NULL CONSTRAINT df_trainee_profiles_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE notifications (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_notifications PRIMARY KEY,
  user_id NVARCHAR(50) NOT NULL,
  kind NVARCHAR(40) NOT NULL,
  data NVARCHAR(1000) NOT NULL CONSTRAINT df_notifications_data DEFAULT '{}',
  event_id BIGINT NULL, -- the outbox event that created it, so a retried event does not notify twice
  created_at DATETIME2 NOT NULL CONSTRAINT df_notifications_created_at DEFAULT SYSUTCDATETIME(),
  read_at DATETIME2 NULL
);
GO

CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX ux_notifications_event ON notifications (event_id, user_id, kind) WHERE event_id IS NOT NULL;
GO

-- Transactional outbox: events are written in the same transaction as the change
-- that caused them, then delivered (and retried) by the dispatcher.
CREATE TABLE outbox (
  id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_outbox PRIMARY KEY,
  event_type NVARCHAR(60) NOT NULL,
  payload NVARCHAR(2000) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_outbox_created_at DEFAULT SYSUTCDATETIME(),
  processed_at DATETIME2 NULL,
  attempts INT NOT NULL CONSTRAINT df_outbox_attempts DEFAULT 0,
  last_error NVARCHAR(1000) NULL
);
GO

CREATE INDEX ix_outbox_pending ON outbox (processed_at, id);
