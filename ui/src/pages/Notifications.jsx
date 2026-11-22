import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

// In-app notifications. The server stores a kind and data; the text is built
// here, so it follows the chosen language.
export default function Notifications() {
  const { t } = useLanguage();
  const { user } = useSession();
  const { loading, data, error, reload } = useLoad(() => api('learning', '/notifications'), [user?.id]);

  const text = (n) => {
    if (n.kind === 'creditsChanged') {
      const key = n.data.amount > 0 ? 'noteCreditsAdded' : 'noteCreditsRemoved';
      return t(key).replace('{n}', Math.abs(n.data.amount)).replace('{reason}', n.data.reason);
    }
    if (n.kind === 'levelReached') return t('noteLevelReached').replace('{level}', n.data.level);
    if (n.kind === 'resultRejected') {
      return t('noteResultRejected').replace('{course}', n.data.course).replace('{reason}', n.data.reason);
    }
    return n.kind;
  };

  async function markRead(id) {
    await api('learning', `/notifications/${id}/read`, { method: 'POST' });
    reload();
  }

  if (!user) return <p>{t('chooseUserFirst')}</p>;

  return (
    <section>
      <p className="eyebrow">{t('navNotifications')}</p>
      <h1>{t('navNotifications')}</h1>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p className="muted">{t('noNotifications')}</p>}
      <ul className="cards cards-single">
        {data?.items.map((n) => (
          <li key={n.id} className={n.readAt ? 'card read' : 'card'}>
            <p className="note-text">{text(n)}</p>
            <p className="muted small">
              {new Date(n.createdAt).toLocaleString()}
              {!n.readAt && (
                <button type="button" className="link-button" onClick={() => markRead(n.id)}>
                  {t('markRead')}
                </button>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
