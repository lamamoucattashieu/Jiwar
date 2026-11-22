import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

export default function CourseDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user, is } = useSession();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState(null);
  const { loading, data: course, error } = useLoad(() => api('learning', `/courses/${id}`), [id, user?.id]);

  const canManage = course && (is('admin') || (is('instructor') && course.instructorId === user.id));

  async function remove() {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await api('learning', `/courses/${id}`, { method: 'DELETE' });
      navigate('/courses');
    } catch (err) {
      setDeleteError(err);
    }
  }

  return (
    <section>
      <Link to="/courses">← {t('back')}</Link>
      <ErrorNote error={error ?? deleteError} />
      {loading && <Loading />}
      {course && (
        <article>
          <h1>{course.title}</h1>
          <p className="muted">
            {t(course.type)} · {course.credits} {t('credits')} · {t('passMark')} {course.passMark}% ·{' '}
            {course.published ? t('published') : t('draft')}
          </p>
          <p className="prose">{course.description}</p>
          {canManage && (
            <div className="actions">
              <Link className="button" to={`/courses/${course.id}/edit`}>
                {t('edit')}
              </Link>
              <button type="button" className="button danger" onClick={remove}>
                {t('delete')}
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
