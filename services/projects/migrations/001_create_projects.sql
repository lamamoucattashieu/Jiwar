-- Packs, project requests and their workflow, messages, payments and payouts
-- (stories #15, #16, #17, #18). Company, trainee and admin ids are demo user ids
-- (ADR-4); trainee data lives in the learning service and is fetched over HTTP.

-- Jiwar's fixed-price packs. Prices in Jordanian dinars; they are placeholders
-- from the proposal until the team confirms them.
CREATE TABLE packs (
  code NVARCHAR(30) NOT NULL CONSTRAINT pk_packs PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  summary NVARCHAR(500) NOT NULL,
  delivery_days INT NOT NULL,
  setup_fee_jd DECIMAL(10, 2) NOT NULL,
  price_jd DECIMAL(10, 2) NOT NULL,
  level_required INT NOT NULL CONSTRAINT ck_packs_level CHECK (level_required BETWEEN 1 AND 3)
);
GO

CREATE TABLE projects (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_projects PRIMARY KEY,
  company_id NVARCHAR(50) NOT NULL,
  pack_code NVARCHAR(30) NULL CONSTRAINT fk_projects_pack REFERENCES packs (code), -- NULL = custom
  title NVARCHAR(200) NOT NULL,
  goals NVARCHAR(2000) NOT NULL,
  features NVARCHAR(2000) NOT NULL CONSTRAINT df_projects_features DEFAULT '',
  examples NVARCHAR(1000) NOT NULL CONSTRAINT df_projects_examples DEFAULT '',
  deadline DATE NULL,
  status NVARCHAR(20) NOT NULL
    CONSTRAINT ck_projects_status CHECK (status IN
      ('requested', 'quoted', 'accepted', 'in_progress', 'in_review', 'approved', 'cancelled')),
  level_required INT NULL CONSTRAINT ck_projects_level CHECK (level_required BETWEEN 1 AND 3),
  setup_fee_jd DECIMAL(10, 2) NULL,
  price_jd DECIMAL(10, 2) NULL,
  preferred_trainee_id NVARCHAR(50) NULL,
  trainee_id NVARCHAR(50) NULL,
  revisions_used INT NOT NULL CONSTRAINT df_projects_revisions DEFAULT 0,
  max_revisions INT NOT NULL CONSTRAINT df_projects_max_revisions DEFAULT 2,
  rating INT NULL CONSTRAINT ck_projects_rating CHECK (rating BETWEEN 1 AND 5),
  testimonial NVARCHAR(1000) NULL,
  testimonial_public BIT NOT NULL CONSTRAINT df_projects_testimonial_public DEFAULT 0,
  created_at DATETIME2 NOT NULL CONSTRAINT df_projects_created_at DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL CONSTRAINT df_projects_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_projects_company ON projects (company_id);
CREATE INDEX ix_projects_trainee ON projects (trainee_id);
CREATE INDEX ix_projects_status ON projects (status);
GO

-- Every status change, so the timeline shows who moved the project and when.
CREATE TABLE project_events (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_project_events PRIMARY KEY,
  project_id INT NOT NULL CONSTRAINT fk_project_events_project REFERENCES projects (id),
  action NVARCHAR(30) NOT NULL,
  from_status NVARCHAR(20) NOT NULL,
  to_status NVARCHAR(20) NOT NULL,
  actor_id NVARCHAR(50) NOT NULL,
  note NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_project_events_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_project_events_project ON project_events (project_id, id);
GO

CREATE TABLE messages (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_messages PRIMARY KEY,
  project_id INT NOT NULL CONSTRAINT fk_messages_project REFERENCES projects (id),
  author_id NVARCHAR(50) NOT NULL,
  body NVARCHAR(2000) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_messages_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_messages_project ON messages (project_id, id);
GO

-- Money in: one invoice for the setup fee (when the company accepts the quote)
-- and one for the price (when it approves the delivery).
CREATE TABLE invoices (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_invoices PRIMARY KEY,
  project_id INT NOT NULL CONSTRAINT fk_invoices_project REFERENCES projects (id),
  kind NVARCHAR(20) NOT NULL CONSTRAINT ck_invoices_kind CHECK (kind IN ('setup_fee', 'project_price')),
  amount_jd DECIMAL(10, 2) NOT NULL,
  payment_ref NVARCHAR(100) NOT NULL,
  paid_at DATETIME2 NOT NULL CONSTRAINT df_invoices_paid_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT ux_invoices_project_kind UNIQUE (project_id, kind)
);
GO

-- Money out: the trainee's share of the project price, paid outside the platform.
CREATE TABLE payouts (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_payouts PRIMARY KEY,
  project_id INT NOT NULL CONSTRAINT fk_payouts_project REFERENCES projects (id),
  trainee_id NVARCHAR(50) NOT NULL,
  amount_jd DECIMAL(10, 2) NOT NULL,
  jiwar_share_jd DECIMAL(10, 2) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_payouts_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT ux_payouts_project UNIQUE (project_id)
);
GO

-- Transactional outbox, as in the learning service (ADR-1): an approved project
-- must reach the learning service as credits even if learning is down right now.
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
