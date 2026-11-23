import { useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote } from '../components.jsx';

// Shown to the course's instructor (or an admin) on the course page: record a
// trainee's final grade. A passing grade goes to the admin verification queue.
export default function GradeForm({ course }) {
  const { t } = useLanguage();
  const { users } = useSession();
  const trainees = users.filter((u) => u.roles.includes('trainee'));
  const [traineeId, setTraineeId] = useState('');
  const [grade, setGrade] = useState(70);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    try {
      setSaved(
        await api('learning', '/results', {
          method: 'POST',
          body: { courseId: course.id, traineeId, grade },
        }),
      );
    } catch (err) {
      setError(err);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>{t('recordGrade')}</h2>
      <p className="muted">{t('recordGradeIntro').replace('{passMark}', course.passMark)}</p>
      <ErrorNote error={error} />
      {saved && (
        <p className="note note-ok" role="status">
          {saved.status === 'failed' ? t('gradeSavedFailed') : t('gradeSavedPending')}
        </p>
      )}
      <div className="row">
        <label>
          {t('trainee')}
          <select value={traineeId} onChange={(e) => setTraineeId(e.target.value)} required>
            <option value="">{t('choose')}</option>
            {trainees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('grade')} (%)
          <input
            type="number"
            min={0}
            max={100}
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
            required
          />
        </label>
      </div>
      <div>
        <button type="submit" className="button">
          {t('saveGrade')}
        </button>
      </div>
    </form>
  );
}
