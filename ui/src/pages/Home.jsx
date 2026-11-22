import { useEffect, useState } from 'react';
import { SERVICES } from '../api.js';
import { useLanguage } from '../i18n.jsx';

async function checkHealth(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return res.ok ? { ok: true, version: body.version } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export default function Home() {
  const { t } = useLanguage();
  const [status, setStatus] = useState({});

  useEffect(() => {
    Object.entries(SERVICES).forEach(async ([name, url]) => {
      const result = await checkHealth(url);
      setStatus((prev) => ({ ...prev, [name]: result }));
    });
  }, []);

  const label = (name) => {
    const s = status[name];
    if (!s) return t('checking');
    return s.ok ? `${t('statusOk')} (${s.version})` : t('statusDown');
  };

  return (
    <section>
      <h1>Jiwar</h1>
      <p className="lead">{t('appTagline')}</p>
      <h2>{t('systemStatus')}</h2>
      <ul className="status-list">
        <li className={status.learning?.ok === false ? 'down' : ''}>
          {t('learningService')}: {label('learning')}
        </li>
        <li className={status.projects?.ok === false ? 'down' : ''}>
          {t('projectsService')}: {label('projects')}
        </li>
      </ul>
    </section>
  );
}
