import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

// A trainee's level, what the next level still needs, and the credit ledger.
// /progress shows your own; staff open /trainees/:id.
export default function Progress() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user, users } = useSession();
  const traineeId = id ?? user?.id;
  const name = users.find((u) => u.id === id)?.name ?? id;
  const {
    loading,
    data: p,
    error,
  } = useLoad(() => api('learning', `/trainees/${traineeId}/progress`), [traineeId, user?.id]);

  if (!traineeId) return <p>{t('chooseUserFirst')}</p>;

  const percent = p?.next ? Math.min(100, Math.round((p.credits / p.next.creditsNeeded) * 100)) : 100;

  return (
    <section>
      <p className="eyebrow">{t('navProgress')}</p>
      <h1>{id ? name : t('myProgress')}</h1>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {p && (
        <>
          <div className="hero hero-compact">
            <div>
              <p className="eyebrow eyebrow-on-dark">{t('currentLevel')}</p>
              <p className="big-number">{p.level}</p>
              <p className="hero-text">{t(`level${p.level}`)}</p>
            </div>
            <div>
              {p.next ? (
                <>
                  <p className="hero-text">
                    {t('creditsTowards')
                      .replace('{have}', p.credits)
                      .replace('{need}', p.next.creditsNeeded)
                      .replace('{level}', p.next.level)}
                  </p>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span style={{ inlineSize: `${percent}%` }} />
                  </div>
                  {p.next.missing.length > 0 && (
                    <ul className="missing">
                      {p.next.missing.map((m) => (
                        <li key={m}>{t(`missing_${m}`).replace('{n}', p.next.projectsNeeded)}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="hero-text">{t('topLevel')}</p>
              )}
            </div>
          </div>

          {p.projectsPaused && (
            <p className="note note-error" role="status">
              {t('projectsPausedNote')}
            </p>
          )}
          {p.level === 0 && !id && (
            <p className="note note-locked">
              <img src="/brand/jiwar-key-on-cream.svg" alt="" className="lock-key" />
              <span>
                {t('projectsLocked')} <Link to="/courses">{t('browseCourses')}</Link>
              </span>
            </p>
          )}

          <p className="eyebrow">{t('ledger')}</p>
          {p.ledger.length === 0 && <p className="muted">{t('ledgerEmpty')}</p>}
          <ul className="ledger">
            {p.ledger.map((e) => (
              <li key={e.id} className="card">
                <span className={e.amount > 0 ? 'amount plus' : 'amount minus'}>
                  {e.amount > 0 ? `+${e.amount}` : e.amount}
                </span>
                <span>
                  {e.reason}
                  <br />
                  <span className="muted small">
                    {t(`source_${e.sourceType}`)} · {new Date(e.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
