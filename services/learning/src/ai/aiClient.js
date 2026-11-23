// One door to the language model for every AI feature (ADR-6).
//
//   provider (Strategy): Claude through the Anthropic SDK when ANTHROPIC_API_KEY
//     is set, otherwise a mock that runs each task's offline rules, so the
//     product works (and is testable) without a key or network.
//   createAi (Decorator around the provider): caches answers and rate-limits
//     each user, which the brief asks for when a paid API is used.
//
// A task is plain data: { name, system, prompt(input), schema (zod), mock(input) }.
// People always decide: the AI drafts, suggests and explains; it never grades,
// assigns or prices anything by itself.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors.js';

export const AI_MODEL = 'claude-opus-5-5';
export const RATE_LIMIT_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 24 * HOUR_MS;
const CACHE_MAX_ENTRIES = 200;

const UNAVAILABLE =
  'The AI assistant is not available right now. Everything else keeps working; try again later.';

export function createClaudeProvider({ apiKey, client }) {
  const anthropic = client ?? new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 });
  return {
    name: 'claude',
    async run(task, input) {
      const response = await anthropic.beta.messages.parse({
        model: AI_MODEL,
        max_tokens: 16000,
        // Low effort: these are short, well-specified tasks.
        output_config: { effort: 'low', format: betaZodOutputFormat(task.schema) },
        // If a safety classifier declines, the API retries on a fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: task.system,
        messages: [{ role: 'user', content: task.prompt(input) }],
      });
      if (response.stop_reason === 'refusal') {
        throw new HttpError(422, 'The AI assistant declined this request.');
      }
      if (!response.parsed_output)
        throw new HttpError(502, 'The AI answer could not be read. Please try again.');
      return response.parsed_output;
    },
  };
}

export const mockProvider = { name: 'mock', run: async (task, input) => task.mock(input) };

export function providerFromConfig(config) {
  return config.anthropicApiKey ? createClaudeProvider({ apiKey: config.anthropicApiKey }) : mockProvider;
}

export function createAi({ provider, log = () => {}, now = Date.now, limitPerHour = RATE_LIMIT_PER_HOUR }) {
  const cache = new Map(); // key -> { value, expires }; Map keeps insertion order for eviction
  const calls = new Map(); // userId -> timestamps of model calls in the last hour

  function cached(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expires < now()) {
      cache.delete(key);
      return null;
    }
    return hit.value;
  }

  function remember(key, value) {
    cache.set(key, { value, expires: now() + CACHE_TTL_MS });
    if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  }

  function checkRate(userId) {
    const recent = (calls.get(userId) ?? []).filter((t) => t > now() - HOUR_MS);
    if (recent.length >= limitPerHour) {
      throw new HttpError(
        429,
        `You have used the AI assistant ${limitPerHour} times this hour. Please try again later.`,
      );
    }
    calls.set(userId, [...recent, now()]);
  }

  return {
    mode: provider.name,
    async run(task, input, userId) {
      const key = createHash('sha256')
        .update(`${task.name}\n${JSON.stringify(input)}`)
        .digest('hex');
      const hit = cached(key);
      if (hit) return { ...hit, cached: true };

      checkRate(userId); // only real calls count: cached answers are free
      let output;
      try {
        output = await provider.run(task, input);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        log(JSON.stringify({ msg: 'ai call failed', task: task.name, error: err.message }));
        throw new HttpError(503, UNAVAILABLE);
      }
      const value = { ...output, source: provider.name };
      remember(key, value);
      return { ...value, cached: false };
    },
  };
}
