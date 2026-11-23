# Prompt: AI features (grading assistant, tutor, brief-to-quote, trained matching model)

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: deliver the four AI features from the proposal, safely and cheaply (stories #21, #22, #23, #24)

Build on both services as they are (two services only, ports and adapters, zod, migrations, the outbox, the Jiwar UI in English and Arabic). The brief allows an LLM call, but its key must be a GitHub secret and its cost kept low (cache, rate limit). The product must also work for anyone without a key.

## Rules
- People decide. The AI drafts feedback, suggests a grade, answers questions from course material, drafts a brief and ranks candidates; it never grades, approves, prices or assigns anything by itself. Label AI output as a suggestion.
- One door to the model in each service: a provider port with a Claude adapter (official Anthropic SDK, the current default model Claude Opus 5.5, structured outputs with zod, low effort, server-side refusal fallback) and an offline adapter that runs each task's own rules. Wrap it with a cache (24 hours) and a per-user limit (20 calls an hour). Turn outages into a clear 503 and refusals into a clear 422.
- The key comes from the `ANTHROPIC_API_KEY` GitHub secret; CD copies it into the Container Apps as a secret. Never in the repository or the browser.

## Scope
1. **Grading assistant** (learning): `POST /pulls/:id/ai-review` for the course's instructor or an admin. Send the pull request's diff (capped at 40,000 characters, telling the model which files were left out) with the course and pass mark; get a suggested grade, a summary, strengths and improvements; post them as a comment from "AI assistant" marked as a suggestion; prefill the grade box in the UI.
2. **Bilingual tutor** (learning): migration `007` with course notes in English and Arabic; retrieval with TF-IDF and cosine similarity in the service (no vector database); answer only from the retrieved notes, in the language of the question, naming the notes used; when nothing relevant is found, say so without calling the model.
3. **Brief-to-quote** (projects): `POST /ai/brief` for businesses; the business's own words become the title, goals, features and a suggested pack (or custom), which fill the request form for the business to check. Offline rules work in English (whole words) and Arabic.
4. **Matching model**: `ml/train.py` trains a logistic regression (scikit-learn) on a seeded synthetic dataset built from the proposal's rules, evaluates it on a held-out 20% (AUC, accuracy), and exports weights and scaling to `services/projects/src/matching/model.json`. The projects service scores candidates with it (0 to 100), eligible first. Learning's eligibility answer adds credits and completed projects; projects adds each trainee's average rating and current workload. Tests for the model's reproducibility and sensible weights; a CI job that lints, tests and checks the committed model is exactly what training produces.
5. **UI**: AI draft review button on the pull request page, tutor box on the course page, "describe it in your own words" on the request form, match score badges in the assignment picker; offline answers labelled; English and Arabic.
6. **Docs**: ADR-6, the README's AI section, the data model.

## Process
Test the Claude adapter against a fake SDK client (model, effort, structured output, fallbacks, refusals), the cache, expiry and limits, retrieval in both languages, and every feature through the API. Verify on SQL Server and in the browser. Do not call the paid API without the team's key and permission.
