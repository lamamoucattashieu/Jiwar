// All configuration comes from environment variables (12-factor).
export function loadConfig(env = process.env) {
  return {
    serviceName: 'projects',
    port: Number(env.PORT ?? 8000),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:8080',
    version: env.GIT_SHA ?? 'dev',
    databaseUrl: env.DATABASE_URL || undefined,
  };
}
