# Prompt: projects service (requests, workflow, mock payments, showcase)

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: build the business side of Jiwar in the projects service (stories #15, #16, #17, #18, #25)

Build on the existing structure (two services, ports and adapters per module, zod, migrations on startup, demo users with `requireRole`, transactional outbox, Jiwar-branded UI in English and Arabic). No new service, container or database; payments must stay a mock, because the brief puts real payments out of scope.

## Rules from the approved proposal
- Packs with fixed prices (one-week website, WhatsApp order bot, AI reply assistant) or a custom request through a guided brief (goals, features, examples, deadline, optional preferred trainee, which is only a wish).
- Workflow: requested → quoted (fixed for packs, set by an admin for custom) → accepted (the company pays the setup fee) → in progress (an admin assigns an eligible trainee) → in review (the trainee submits) → approved (the company pays the price), with revision rounds (2 by default) and cancelling before work starts. Each step belongs to one role; other people cannot see the project at all.
- Eligibility for assignment comes from the learning service: level at least the project's level, a valid work permit, project access not paused.
- Payments go through a `PaymentProvider` interface with a mock adapter, including a way to simulate a declined card; nothing is recorded when a payment fails. Invoices for the setup fee and the price; on approval the trainee's 80% payout (Jiwar 20%) is recorded, in exact cents.
- An approved project earns the trainee 5 credits in the learning service. It must arrive even if learning is down at that moment, and never twice.
- Public showcase and portfolios: first name, level, finished projects, ratings, and testimonials only where the company agreed. No personal details.
- Partial failure: with learning down, the other service keeps working; the affected feature fails with a timeout and a clear message, not a stack trace or a hung request.

## Scope
1. **Learning side**: `GET /internal/trainees/:id/eligibility` and an idempotent `POST /internal/project-credits`, behind a shared `X-Internal-Key` (the brief's "simple mechanism"); migration `005` with a unique index for project credits.
2. **Projects migrations** `001` (packs, projects, project_events, messages, invoices, payouts, outbox) and `002` (packs and demo projects matching the learning seed).
3. **Pure modules**: the workflow state machine (`projectRules.js`), the payout split (`money.js`).
4. **Adapters**: the mock payment provider; a learning client with a 3-second timeout and a circuit breaker (open after 3 failures for 30 seconds; a 4xx is an answer, not an outage); SQL and in-memory stores.
5. **Service and routes**: request, list, details (filtered by role: companies see invoices but not payouts, trainees the reverse), quote, accept and pay, candidates, assign, submit, request changes, approve and pay, cancel, rate, messages, showcase, portfolio, invoices, payouts; outbox delivery on approval, on startup and every minute.
6. **Configuration**: `INTERNAL_API_KEY` in `.env.example`, docker compose, Bicep (a Container Apps secret) and `setup.sh` (generated if not given).
7. **UI**: packs, the guided request form, the projects list (business, trainee with earnings, admin pipeline with a status filter), the project page (timeline, brief, invoices, payout, the next steps the server allows, the assignment picker with live eligibility, rating, messages), showcase and portfolios.
8. **Tests and docs**: the whole workflow through the API with a fake learning service and the mock payments, the circuit breaker with a fake clock, the timeout, the split, the SQL adapter with a fake executor; the data model and the internal-key decision.

## Process
Verify with `docker compose`: the full flow across both services (credits arriving in learning), a declined card, an ineligible assignment, and the learning service stopped (clear 503 within the timeout, other pages still working, the approval's credit event pending and then delivered when learning returns). Click through the UI as a business, an admin and a visitor. Run the smoke test.
