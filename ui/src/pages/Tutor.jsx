import { useState } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { ErrorNote } from '../components.jsx';

// Story #22: ask the course's AI tutor. It answers from the course notes, in
// the language of the question, and names the notes it used.
export default function Tutor({ course }) {
  const { t } = useLanguage();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setAnswer(await api('learning', `/courses/${course.id}/tutor`, { method: 'POST', body: { question } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card tutor">
      <p className="eyebrow">{t('aiTutor')}</p>
      <p className="muted small">{t('aiTutorIntro')}</p>
      <form className="send" onSubmit={ask}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('askPlaceholder')}
          aria-label={t('aiTutor')}
          required
          minLength={3}
        />
        <button type="submit" className="button" disabled={busy}>
          {busy ? t('aiThinking') : t('ask')}
        </button>
      </form>
      <ErrorNote error={error} />
      {answer && (
        <div className="tutor-answer" dir="auto">
          <p className="prose">{answer.answer}</p>
          {answer.usedSources.length > 0 && (
            <p className="muted small">
              {t('sources')}: {answer.usedSources.join(' · ')}
            </p>
          )}
          {answer.source === 'mock' && <p className="muted small">{t('aiOfflineNote')}</p>}
        </div>
      )}
    </div>
  );
}
