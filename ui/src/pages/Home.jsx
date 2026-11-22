import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

  // Status is always a word as well as a colour.
  const badge = (name) => {
    const s = status[name];
    if (!s) return <span className="badge badge-wait">{t('checking')}</span>;
    return s.ok ? (
      <span className="badge badge-ok">
        {t('statusOk')} · {s.version}
      </span>
    ) : (
      <span className="badge badge-bad">{t('statusDown')}</span>
    );
  };

  return (
    <section>
      <div className="hero">
        <img src="/brand/jiwar-logo.png" alt="Jiwar, جوار" className="hero-logo" />
        <div>
          <p className="eyebrow eyebrow-on-dark">{t('heroEyebrow')}</p>
          <h1>{t('heroTitle')}</h1>
          <p className="hero-text">{t('appTagline')}</p>
          <Link className="button button-light" to="/courses">
            {t('browseCourses')}
          </Link>
        </div>
      </div>

      <p className="eyebrow">{t('systemStatus')}</p>
      <ul className="status-grid">
        <li className="card">
          <span>{t('learningService')}</span>
          {badge('learning')}
        </li>
        <li className="card">
          <span>{t('projectsService')}</span>
          {badge('projects')}
        </li>
      </ul>
    </section>
  );
}
