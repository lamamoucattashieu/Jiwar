-- Demo content so the catalogue is not empty on a fresh deploy.
INSERT INTO courses (title, description, type, credits, pass_mark, instructor_id, published)
VALUES
  (N'Web basics', N'HTML, CSS and how the web works. The required first module for every trainee.',
    'module', 10, 60, 'instructor-omar', 1),
  (N'React for real projects', N'Components, state and talking to an API, built around a client-style project.',
    'module', 15, 60, 'instructor-dana', 1),
  (N'Practical AI', N'Using language models safely in small business tools: prompts, limits and costs.',
    'module', 15, 60, 'instructor-dana', 1),
  (N'Live class: Git together', N'A live online session on branches, pull requests and reviews.',
    'live_class', 1, 0, 'instructor-omar', 1),
  (N'Workshop: build a landing page in a day', N'In-person workshop. Bring a laptop; we build and deploy one page.',
    'workshop', 4, 60, 'instructor-omar', 0);
