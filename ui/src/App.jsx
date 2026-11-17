import { useEffect, useState } from 'react';

const { LEARNING_URL, PROJECTS_URL } = window.JIWAR_CONFIG;

const SERVICES = [
  { name: 'Learning service', url: LEARNING_URL },
  { name: 'Projects service', url: PROJECTS_URL },
];

async function checkHealth(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return res.ok ? `ok (version ${body.version})` : `unhealthy (HTTP ${res.status})`;
  } catch {
    return 'unreachable';
  }
}

export default function App() {
  const [status, setStatus] = useState({});

  useEffect(() => {
    SERVICES.forEach(async ({ name, url }) => {
      const result = await checkHealth(url);
      setStatus((prev) => ({ ...prev, [name]: result }));
    });
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Jiwar</h1>
      <p>Coding and AI training for Palestinian refugee youth in Jordan, connected to paid projects from local businesses.</p>
      <h2>System status</h2>
      <ul>
        {SERVICES.map(({ name }) => (
          <li key={name}>
            {name}: {status[name] ?? 'checking…'}
          </li>
        ))}
      </ul>
    </main>
  );
}
