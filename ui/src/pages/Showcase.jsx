import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

function ProjectCards({ items }) {
  const { t } = useLanguage();
  return (
    <ul className="cards">
      {items.map((p) => (
        <li key={p.id} className="card">
          <span className="card-title">{p.title}</span>
          <p>
            {p.pack} · {p.company}
          </p>
          <p>
            {t('builtBy')} <Link to={`/portfolio/${p.traineeId}`}>{p.trainee}</Link>
            {p.rating && (
              <span className="stars" aria-label={`${p.rating} / 5`}>
                {' '}
                {'★'.repeat(p.rating)}
              </span>
            )}
          </p>
          {p.testimonial && <blockquote>“{p.testimonial}”</blockquote>}
        </li>
      ))}
    </ul>
  );
}

// Public: finished work, so businesses can judge quality before they ask.
export default function Showcase() {
  const { t } = useLanguage();
  const { loading, data, error } = useLoad(() => api('projects', '/showcase'), []);
  return (
    <section>
      <p className="eyebrow">{t('forBusinesses')}</p>
      <h1>{t('showcase')}</h1>
      <p className="muted">{t('showcaseIntro')}</p>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p className="muted">{t('noProjects')}</p>}
      {data && <ProjectCards items={data.items} />}
    </section>
  );
}

// Public portfolio: first name, level and finished projects, nothing personal.
export function Portfolio() {
  const { traineeId } = useParams();
  const { t } = useLanguage();
  const { loading, data, error } = useLoad(() => api('projects', `/portfolio/${traineeId}`), [traineeId]);
  return (
    <section>
      <p className="eyebrow">{t('portfolio')}</p>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && (
        <>
          <h1>{data.name}</h1>
          <p>
            {data.level === null ? (
              <span className="badge badge-wait">{t('levelUnavailable')}</span>
            ) : (
              <span className="badge badge-ok">
                {t('level')} {data.level}: {t(`level${data.level}`)}
              </span>
            )}
          </p>
          {data.projects.length === 0 && <p className="muted">{t('noProjects')}</p>}
          <ProjectCards items={data.projects} />
        </>
      )}
    </section>
  );
}
