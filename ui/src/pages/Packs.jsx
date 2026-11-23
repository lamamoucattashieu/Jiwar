import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

export const jd = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} JD`;

// Public: Jiwar's fixed-price packs. Businesses can request one in a few clicks.
export default function Packs() {
  const { t } = useLanguage();
  const { is } = useSession();
  const { loading, data, error } = useLoad(() => api('projects', '/packs'), []);

  return (
    <section>
      <p className="eyebrow">{t('forBusinesses')}</p>
      <div className="page-head">
        <h1>{t('packsTitle')}</h1>
        {is('company') && (
          <Link className="button secondary" to="/projects/new">
            {t('customRequest')}
          </Link>
        )}
      </div>
      <p className="muted">{t('packsIntro')}</p>
      <ErrorNote error={error} />
      {loading && <Loading />}
      <ul className="cards">
        {data?.items.map((p) => (
          <li key={p.code} className="card">
            <span className="card-title">{p.name}</span>
            <p>{p.summary}</p>
            <p className="big-price">{jd(p.priceJd)}</p>
            <p className="muted">
              + {jd(p.setupFeeJd)} {t('setupFee')} · {p.deliveryDays} {t('days')} · {t('level')}{' '}
              {p.levelRequired}
            </p>
            {is('company') && (
              <div className="actions">
                <Link className="button" to={`/projects/new?pack=${p.code}`}>
                  {t('requestThisPack')}
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!is('company') && <p className="muted">{t('packsChooseBusiness')}</p>}
    </section>
  );
}
