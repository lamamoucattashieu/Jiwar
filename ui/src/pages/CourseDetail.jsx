import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';
import GradeForm from './GradeForm.jsx';
import Tutor from './Tutor.jsx';

export default function CourseDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user, is } = useSession();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState(null);
  const { loading, data: course, error } = useLoad(() => api('learning', `/courses/${id}`), [id, user?.id]);

  const canManage = course && (is('admin') || (is('instructor') && course.instructorId === user.id));

  // A trainee's own repository for this course, created on first use.
  async function openWorkspace() {
    try {
      const repo = await api('learning', `/courses/${id}/workspace`, { method: 'POST' });
      navigate(`/workspace/${repo.id}`);
    } catch (err) {
      setDeleteError(err);
    }
  }

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
          {is('trainee') && course.published && (
            <div className="actions">
              <button type="button" className="button" onClick={openWorkspace}>
                {t('openWorkspace')}
              </button>
            </div>
          )}
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
          {course.published && (is('trainee') || canManage) && <Tutor course={course} />}
          {canManage && <GradeForm course={course} />}
        </article>
      )}
    </section>
  );
}
