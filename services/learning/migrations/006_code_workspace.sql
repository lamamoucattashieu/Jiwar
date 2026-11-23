-- The in-app coding workspace (stories #19, #20): a small Git of our own, stored
-- in this database instead of a separate Git server (ADR-1). Every commit keeps a
-- full snapshot of its files; branches point at commits; pull requests merge a
-- branch into main after an instructor's review.

-- One repository per trainee per course.
CREATE TABLE code_repos (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_code_repos PRIMARY KEY,
  course_id INT NOT NULL CONSTRAINT fk_code_repos_course REFERENCES courses (id),
  trainee_id NVARCHAR(50) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_code_repos_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT ux_code_repos_course_trainee UNIQUE (course_id, trainee_id)
);
GO

CREATE TABLE code_commits (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_code_commits PRIMARY KEY,
  repo_id INT NOT NULL CONSTRAINT fk_code_commits_repo REFERENCES code_repos (id),
  parent_id INT NULL CONSTRAINT fk_code_commits_parent REFERENCES code_commits (id),
  message NVARCHAR(500) NOT NULL,
  author_id NVARCHAR(50) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_code_commits_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_code_commits_repo ON code_commits (repo_id);
GO

-- The full set of files in a commit (a snapshot, not a delta).
CREATE TABLE code_files (
  commit_id INT NOT NULL CONSTRAINT fk_code_files_commit REFERENCES code_commits (id),
  path NVARCHAR(120) NOT NULL,
  content NVARCHAR(MAX) NOT NULL,
  CONSTRAINT pk_code_files PRIMARY KEY (commit_id, path)
);
GO

CREATE TABLE code_branches (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_code_branches PRIMARY KEY,
  repo_id INT NOT NULL CONSTRAINT fk_code_branches_repo REFERENCES code_repos (id),
  name NVARCHAR(50) NOT NULL,
  head_commit_id INT NOT NULL CONSTRAINT fk_code_branches_head REFERENCES code_commits (id),
  CONSTRAINT ux_code_branches_repo_name UNIQUE (repo_id, name)
);
GO

CREATE TABLE pull_requests (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_pull_requests PRIMARY KEY,
  repo_id INT NOT NULL CONSTRAINT fk_pull_requests_repo REFERENCES code_repos (id),
  source_branch NVARCHAR(50) NOT NULL,
  target_branch NVARCHAR(50) NOT NULL,
  title NVARCHAR(200) NOT NULL,
  description NVARCHAR(2000) NOT NULL CONSTRAINT df_pull_requests_description DEFAULT '',
  status NVARCHAR(20) NOT NULL
    CONSTRAINT ck_pull_requests_status CHECK (status IN ('open', 'changes_requested', 'merged')),
  created_by NVARCHAR(50) NOT NULL,
  reviewed_by NVARCHAR(50) NULL,
  merged_commit_id INT NULL CONSTRAINT fk_pull_requests_merged REFERENCES code_commits (id),
  -- Where main was before the merge, so a merged pull request still shows its diff.
  base_commit_id INT NULL CONSTRAINT fk_pull_requests_base REFERENCES code_commits (id),
  created_at DATETIME2 NOT NULL CONSTRAINT df_pull_requests_created_at DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL CONSTRAINT df_pull_requests_updated_at DEFAULT SYSUTCDATETIME()
);
GO

-- One open pull request per branch.
CREATE UNIQUE INDEX ux_pull_requests_open_branch ON pull_requests (repo_id, source_branch)
  WHERE status IN ('open', 'changes_requested');
GO

-- Review comments: on a line of a file, or on the whole pull request (path NULL).
CREATE TABLE review_comments (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_review_comments PRIMARY KEY,
  pull_id INT NOT NULL CONSTRAINT fk_review_comments_pull REFERENCES pull_requests (id),
  path NVARCHAR(120) NULL,
  line INT NULL,
  body NVARCHAR(2000) NOT NULL,
  author_id NVARCHAR(50) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_review_comments_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_review_comments_pull ON review_comments (pull_id, id);
