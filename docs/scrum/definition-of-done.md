# Definition of Done
An item is Done only when all of these are true:
- Merged to main through a pull request approved by another team member
- CI green (lint, format, tests, coverage ≥70% core logic, image build)
- Deployed to Azure by the pipeline and /health returns 200
- Acceptance criteria checked by the Product Owner
- No secrets in code; openapi.yaml, docs and AI_USAGE.md updated if affected
