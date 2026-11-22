import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

const TYPES = ['module', 'live_class', 'workshop'];

export function CourseCard({ course }) {
  const { t } = useLanguage();
  return (
    <li className="card">
      <Link to={`/courses/${course.id}`} className="card-title">
        {course.title}
      </Link>
      <p className="muted">
        {t(course.type)} · {course.credits} {t('credits')}
        {!course.published && <span className="badge">{t('draft')}</span>}
      </p>
    </li>
  );
}

// The catalogue (mine=false) and an instructor's own courses (mine=true).
export default function Courses({ mine = false }) {
  const { t } = useLanguage();
  const { user, is } = useSession();
  const [type, setType] = useState('');

  const query = new URLSearchParams({ ...(type && { type }), ...(mine && { mine: 'true' }) });
  const { loading, data, error } = useLoad(
    () => api('learning', `/courses?${query}`),
    [type, mine, user?.id],
  );

  return (
    <section>
      <p className="eyebrow">{t('learning')}</p>
      <div className="page-head">
        <h1>{mine ? t('navTeach') : t('catalogue')}</h1>
        {is('instructor', 'admin') && (
          <Link className="button" to="/courses/new">
            {t('newCourse')}
          </Link>
        )}
      </div>
      {mine && <p className="muted">{t('myCoursesIntro')}</p>}

      <label className="inline">
        {t('type')}{' '}
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('allTypes')}</option>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(ty)}
            </option>
          ))}
        </select>
      </label>

      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p>{t('noCourses')}</p>}
      {data && (
        <ul className="cards">
          {data.items.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
