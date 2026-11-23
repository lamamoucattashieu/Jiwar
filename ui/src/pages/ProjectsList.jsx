import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';
import { jd } from './Packs.jsx';

const STATUSES = ['requested', 'quoted', 'accepted', 'in_progress', 'in_review', 'approved', 'cancelled'];

export const StatusBadge = ({ status }) => {
  const { t } = useLanguage();
  const tone = status === 'approved' ? 'badge-ok' : status === 'cancelled' ? 'badge-bad' : 'badge-wait';
  return <span className={`badge ${tone}`}>{t(`status_${status}`)}</span>;
};

// Businesses see their requests, trainees their assigned work and earnings,
// admins the whole pipeline with a status filter.
export default function ProjectsList() {
  const { t } = useLanguage();
  const { user, is } = useSession();
  const [status, setStatus] = useState('');
  const { loading, data, error } = useLoad(
    () => api('projects', `/projects${status ? `?status=${status}` : ''}`),
    [user?.id, status],
  );
  const payouts = useLoad(
    () => (is('trainee') ? api('projects', '/payouts') : Promise.resolve(null)),
    [user?.id],
  );

  if (!user) return <p>{t('chooseUserFirst')}</p>;
  const title = is('admin') ? t('pipeline') : is('trainee') ? t('myWork') : t('myProjects');
  const earned = payouts.data?.items.reduce((sum, p) => sum + p.amountJd, 0) ?? 0;

  return (
    <section>
      <p className="eyebrow">{t('navProjects')}</p>
      <div className="page-head">
        <h1>{title}</h1>
        {is('company') && (
          <Link className="button" to="/packs">
            {t('newRequest')}
          </Link>
        )}
      </div>

      {is('trainee') && payouts.data && (
        <div className="hero hero-compact">
          <div>
            <p className="eyebrow eyebrow-on-dark">{t('earnings')}</p>
            <p className="big-number">{jd(earned)}</p>
            <p className="hero-text">{t('earningsNote')}</p>
          </div>
        </div>
      )}

      {is('admin') && (
        <label className="inline">
          {t('status')}{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p className="muted">{t('noProjects')}</p>}
      <ul className="cards">
        {data?.items.map((p) => (
          <li key={p.id} className="card">
            <Link className="card-title" to={`/projects/${p.id}`}>
              {p.title}
            </Link>
            <p>
              <StatusBadge status={p.status} />
              {p.priceJd && <span className="muted"> · {jd(p.priceJd)}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
