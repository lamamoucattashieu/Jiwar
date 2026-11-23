-- Credits for completed client projects come from the projects service, which may
-- retry. One ledger entry per project, guaranteed by the database.
CREATE UNIQUE INDEX ux_credit_ledger_project ON credit_ledger (source_type, source_id)
  WHERE source_type = 'project';
GO

-- Demo: Ahmad delivered the Zaytoun Bakery website (project 1 in the projects
-- service's demo data), approved by the client.
INSERT INTO credit_ledger (trainee_id, amount, source_type, source_id, reason, created_by)
VALUES ('trainee-ahmad', 5, 'project', 1, N'Completed client project: Zaytoun Bakery website', 'projects-service');
