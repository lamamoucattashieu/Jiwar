import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote } from '../components.jsx';

// The guided brief a business fills in (story #15). A pack is quoted at its
// fixed price straight away; a custom request waits for an admin's quote.
export default function ProjectRequest() {
  const { t } = useLanguage();
  const { users } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    packCode: params.get('pack') ?? '',
    title: '',
    goals: '',
    features: '',
    examples: '',
    deadline: '',
    preferredTraineeId: '',
  });
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const [idea, setIdea] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);

  // Story #23: the business's own words become a draft brief it can still edit.
  async function fillWithAi() {
    setError(null);
    setBusy(true);
    try {
      const draft = await api('projects', '/ai/brief', { method: 'POST', body: { description: idea } });
      setForm((f) => ({
        ...f,
        title: draft.title,
        goals: draft.goals,
        features: draft.features || f.features,
        packCode: draft.packCode ?? '',
      }));
      setSuggestion(draft);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const project = await api('projects', '/projects', {
        method: 'POST',
        body: {
          ...form,
          packCode: form.packCode || null,
          deadline: form.deadline || null,
          preferredTraineeId: form.preferredTraineeId || null,
        },
      });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section>
      <p className="eyebrow">{t('forBusinesses')}</p>
      <h1>{t('newRequest')}</h1>
      <ErrorNote error={error} />
      <div className="card ai-card">
        <p className="eyebrow">{t('aiBriefTitle')}</p>
        <label className="reason">
          {t('aiBriefIntro')}
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} dir="auto" />
        </label>
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || idea.trim().length < 15}
            onClick={fillWithAi}
          >
            {busy ? t('aiThinking') : t('aiFillForm')}
          </button>
        </div>
        {suggestion && (
          <p className="note note-ok small" role="status">
            {suggestion.reason} {t('aiCheckForm')} {suggestion.source === 'mock' && t('aiOfflineNote')}
          </p>
        )}
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          {t('pack')}
          <select value={form.packCode} onChange={set('packCode')}>
            <option value="website">{t('pack_website')}</option>
            <option value="whatsapp-bot">{t('pack_whatsapp-bot')}</option>
            <option value="ai-assistant">{t('pack_ai-assistant')}</option>
            <option value="">{t('customRequest')}</option>
          </select>
        </label>
        <label>
          {t('projectTitle')}
          <input value={form.title} onChange={set('title')} required minLength={3} maxLength={200} />
        </label>
        <label>
          {t('goals')}
          <textarea value={form.goals} onChange={set('goals')} rows={3} required minLength={10} />
        </label>
        <label>
          {t('features')}
          <textarea value={form.features} onChange={set('features')} rows={3} />
        </label>
        <label>
          {t('examples')}
          <input value={form.examples} onChange={set('examples')} />
        </label>
        <div className="row">
          <label>
            {t('deadline')}
            <input type="date" value={form.deadline} onChange={set('deadline')} />
          </label>
          <label>
            {t('preferredTrainee')}
            <select value={form.preferredTraineeId} onChange={set('preferredTraineeId')}>
              <option value="">{t('noPreference')}</option>
              {users
                .filter((u) => u.roles.includes('trainee'))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name.split(' ')[0]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="muted small">{t('preferenceNote')}</p>
        <div>
          <button type="submit" className="button">
            {t('sendRequest')}
          </button>
        </div>
      </form>
    </section>
  );
}
