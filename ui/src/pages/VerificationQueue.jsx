import { useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

// Admin: passing grades waiting to become credits. Every credit is checked by
// the instructor who graded it and an admin.
export default function VerificationQueue() {
  const { t } = useLanguage();
  const { users } = useSession();
  const { loading, data, error, reload } = useLoad(() => api('learning', '/verification-queue'), []);
  const [actionError, setActionError] = useState(null);
  const [reasons, setReasons] = useState({});
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id;

  async function act(id, action) {
    setActionError(null);
    try {
      const body = action === 'reject' ? { reason: reasons[id] ?? '' } : undefined;
      await api('learning', `/results/${id}/${action}`, { method: 'POST', body });
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <section>
      <p className="eyebrow">{t('navAdmin')}</p>
      <h1>{t('verificationQueue')}</h1>
      <p className="muted">{t('verificationIntro')}</p>
      <ErrorNote error={error ?? actionError} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p>{t('queueEmpty')}</p>}
      <ul className="cards">
        {data?.items.map((r) => (
          <li key={r.id} className="card">
            <span className="card-title">{nameOf(r.traineeId)}</span>
            <p>
              {r.courseTitle} · {t('grade')} {r.grade}% · +{r.credits} {t('credits')}
            </p>
            <p className="muted">
              {t('gradedBy')} {nameOf(r.gradedBy)}
            </p>
            <label className="reason">
              {t('rejectReason')}
              <input
                value={reasons[r.id] ?? ''}
                onChange={(e) => setReasons((all) => ({ ...all, [r.id]: e.target.value }))}
                placeholder={t('rejectReasonHint')}
              />
            </label>
            <div className="actions">
              <button type="button" className="button" onClick={() => act(r.id, 'verify')}>
                {t('verify')}
              </button>
              <button type="button" className="button secondary" onClick={() => act(r.id, 'reject')}>
                {t('reject')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
