-- Demo data that shows every state on a fresh deploy:
--   Ahmad: 30 verified credits, Web basics passed, permit valid -> Level 1
--   Mariam: 15 verified credits, permit pending -> "15 of 30 credits, permit pending"
--   Yousef: a React result waiting in the admin verification queue; permit expires soon
UPDATE courses SET required_for_level = 1 WHERE title = N'Web basics';
UPDATE courses SET required_for_level = 2 WHERE title = N'React for real projects';
UPDATE courses SET required_for_level = 3 WHERE title = N'Practical AI';
GO

DECLARE @web INT = (SELECT id FROM courses WHERE title = N'Web basics');
DECLARE @react INT = (SELECT id FROM courses WHERE title = N'React for real projects');
DECLARE @git INT = (SELECT id FROM courses WHERE title = N'Live class: Git together');
DECLARE @workshop INT = (SELECT id FROM courses WHERE title = N'Workshop: build a landing page in a day');

INSERT INTO course_results (course_id, trainee_id, grade, status, graded_by, reviewed_by, reviewed_at)
VALUES
  (@web, 'trainee-ahmad', 88, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@react, 'trainee-ahmad', 79, 'verified', 'instructor-dana', 'admin-rania', SYSUTCDATETIME()),
  (@git, 'trainee-ahmad', 100, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@workshop, 'trainee-ahmad', 90, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@web, 'trainee-mariam', 72, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@workshop, 'trainee-mariam', 65, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@git, 'trainee-mariam', 100, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@web, 'trainee-yousef', 91, 'verified', 'instructor-omar', 'admin-rania', SYSUTCDATETIME()),
  (@react, 'trainee-yousef', 75, 'pending_verification', 'instructor-dana', NULL, NULL);

INSERT INTO credit_ledger (trainee_id, amount, source_type, source_id, reason, created_by)
SELECT r.trainee_id, c.credits, 'course', r.id, N'Passed ' + c.title, r.reviewed_by
FROM course_results r JOIN courses c ON c.id = r.course_id
WHERE r.status = 'verified' AND c.credits > 0;

INSERT INTO work_permits (trainee_id, status, expires_on, updated_by)
VALUES
  ('trainee-ahmad', 'verified', '2027-06-30', 'admin-rania'),
  ('trainee-mariam', 'pending', NULL, 'admin-rania'),
  ('trainee-yousef', 'verified', '2026-12-10', 'admin-rania');

INSERT INTO trainee_profiles (trainee_id, level) VALUES
  ('trainee-ahmad', 1),
  ('trainee-mariam', 0),
  ('trainee-yousef', 0);
