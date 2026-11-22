// DATABASE_URL can be an mssql:// URL (used by docker compose) or an ADO.NET
// connection string like the one Azure shows (Server=...;Database=...;...).
// The mssql driver only understands the second form or a config object, so
// URLs are turned into a config object here.
export function toConnectionConfig(databaseUrl) {
  if (!databaseUrl.startsWith('mssql://')) return databaseUrl;

  const url = new URL(databaseUrl);
  const flag = (name, fallback) => {
    const value = url.searchParams.get(name);
    return value === null ? fallback : value === 'true';
  };

  return {
    server: url.hostname,
    port: url.port ? Number(url.port) : 1433,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    options: {
      encrypt: flag('encrypt', true),
      trustServerCertificate: flag('trustServerCertificate', false),
    },
  };
}
