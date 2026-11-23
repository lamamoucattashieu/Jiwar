// All configuration comes from environment variables (12-factor).
export function loadConfig(env = process.env) {
  return {
    serviceName: 'projects',
    port: Number(env.PORT ?? 8000),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:8080',
    version: env.GIT_SHA ?? 'dev',
    databaseUrl: env.DATABASE_URL || undefined,
    // Shared key for calls between the two services (X-Internal-Key).
    internalApiKey: env.INTERNAL_API_KEY || undefined,
    // Optional: with a key the AI features call Claude; without one they use offline rules.
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    learningUrl: env.LEARNING_URL ?? 'http://localhost:3001',
  };
}
