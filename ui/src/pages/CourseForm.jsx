import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { ErrorNote } from '../components.jsx';

const EMPTY = { title: '', description: '', type: 'module', credits: 5, passMark: 60, published: false };

// Create a course (/courses/new) or edit one (/courses/:id/edit).
export default function CourseForm() {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api('learning', `/courses/${id}`)
      .then(({ title, description, type, credits, passMark, published }) =>
        setForm({ title, description, type, credits, passMark, published }),
      )
      .catch(setError);
  }, [id]);

  const set = (field) => (e) => {
    const { type, value, checked } = e.target;
    setForm((f) => ({
      ...f,
      [field]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    }));
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api('learning', id ? `/courses/${id}` : '/courses', {
        method: id ? 'PUT' : 'POST',
        body: form,
      });
      navigate(`/courses/${saved.id}`);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <section>
      <h1>{id ? t('edit') : t('newCourse')}</h1>
      <ErrorNote error={error} />
      <form className="form" onSubmit={submit}>
        <label>
          {t('title')}
          <input value={form.title} onChange={set('title')} required minLength={3} maxLength={200} />
        </label>
        <label>
          {t('description')}
          <textarea value={form.description} onChange={set('description')} rows={5} maxLength={4000} />
        </label>
        <label>
          {t('type')}
          <select value={form.type} onChange={set('type')}>
            <option value="module">{t('module')}</option>
            <option value="live_class">{t('live_class')}</option>
            <option value="workshop">{t('workshop')}</option>
          </select>
        </label>
        <div className="row">
          <label>
            {t('credits')}
            <input type="number" min={0} max={50} value={form.credits} onChange={set('credits')} />
          </label>
          <label>
            {t('passMark')} (%)
            <input type="number" min={0} max={100} value={form.passMark} onChange={set('passMark')} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.published} onChange={set('published')} /> {t('published')}
        </label>
        <div className="actions">
          <button type="submit" className="button" disabled={saving}>
            {t('save')}
          </button>
          <button type="button" className="button secondary" onClick={() => navigate(-1)}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
