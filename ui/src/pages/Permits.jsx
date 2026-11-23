import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

// Admin: every trainee's level and work permit, with permits expiring within 30
// days flagged. Instructors and businesses never see this page or its data.
export default function Permits() {
  const { t } = useLanguage();
  const { loading, data, error, reload } = useLoad(() => api('learning', '/permits'), []);
  const [edits, setEdits] = useState({});
  const [actionError, setActionError] = useState(null);

  const edit = (row) =>
    edits[row.traineeId] ?? {
      status: row.permit?.status ?? 'pending',
      expiresOn: row.permit?.expiresOn ?? '',
    };
  const change = (row, field, value) =>
    setEdits((all) => ({ ...all, [row.traineeId]: { ...edit(row), [field]: value } }));

  async function save(row) {
    setActionError(null);
    const { status, expiresOn } = edit(row);
    try {
      await api('learning', `/permits/${row.traineeId}`, {
        method: 'PUT',
        body: { status, expiresOn: expiresOn || null },
      });
      setEdits((all) => ({ ...all, [row.traineeId]: undefined }));
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  async function togglePause(row) {
    setActionError(null);
    try {
      await api('learning', `/trainees/${row.traineeId}/projects-paused`, {
        method: 'PUT',
        body: { paused: !row.projectsPaused },
      });
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  const badge = (row) => {
    if (row.expiringSoon) return <span className="badge badge-wait">{t('permitExpiringSoon')}</span>;
    if (row.permitValid) return <span className="badge badge-ok">{t('permitValid')}</span>;
    return <span className="badge badge-bad">{t('permitMissing')}</span>;
  };

  return (
    <section>
      <p className="eyebrow">{t('navAdmin')}</p>
      <h1>{t('traineesAndPermits')}</h1>
      <ErrorNote error={error ?? actionError} />
      {loading && <Loading />}
      <ul className="cards">
        {data?.items.map((row) => (
          <li key={row.traineeId} className="card">
            <Link className="card-title" to={`/trainees/${row.traineeId}`}>
              {row.name}
            </Link>
            <p>
              {t('level')} {row.level} {badge(row)}
              {row.projectsPaused && <span className="badge badge-bad">{t('projectsPaused')}</span>}
            </p>
            <div className="row">
              <label>
                {t('permitStatus')}
                <select value={edit(row).status} onChange={(e) => change(row, 'status', e.target.value)}>
                  <option value="pending">{t('permitPending')}</option>
                  <option value="verified">{t('permitVerified')}</option>
                </select>
              </label>
              <label>
                {t('expiresOn')}
                <input
                  type="date"
                  value={edit(row).expiresOn}
                  onChange={(e) => change(row, 'expiresOn', e.target.value)}
                />
              </label>
            </div>
            <div className="actions">
              <button type="button" className="button" onClick={() => save(row)}>
                {t('save')}
              </button>
              <button type="button" className="button secondary" onClick={() => togglePause(row)}>
                {row.projectsPaused ? t('resumeProjects') : t('pauseProjects')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
