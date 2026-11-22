-- Courses: online modules, live classes and in-person workshops.
-- instructor_id is a demo user id (ADR-4), not a foreign key.
CREATE TABLE courses (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_courses PRIMARY KEY,
  title NVARCHAR(200) NOT NULL,
  description NVARCHAR(4000) NOT NULL CONSTRAINT df_courses_description DEFAULT '',
  type NVARCHAR(20) NOT NULL
    CONSTRAINT ck_courses_type CHECK (type IN ('module', 'live_class', 'workshop')),
  credits INT NOT NULL CONSTRAINT ck_courses_credits CHECK (credits BETWEEN 0 AND 50),
  pass_mark INT NOT NULL CONSTRAINT df_courses_pass_mark DEFAULT 60
    CONSTRAINT ck_courses_pass_mark CHECK (pass_mark BETWEEN 0 AND 100),
  instructor_id NVARCHAR(50) NOT NULL,
  published BIT NOT NULL CONSTRAINT df_courses_published DEFAULT 0,
  created_at DATETIME2 NOT NULL CONSTRAINT df_courses_created_at DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL CONSTRAINT df_courses_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_courses_instructor ON courses (instructor_id);
