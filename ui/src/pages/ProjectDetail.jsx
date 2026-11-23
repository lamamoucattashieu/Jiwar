import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';
import { jd } from './Packs.jsx';
import { StatusBadge } from './ProjectsList.jsx';

// One project: the brief, its timeline, money, messages, and the next steps
// this user may take. The server decides the allowed actions (p.actions); the
// page only shows them.
export default function ProjectDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user, users } = useSession();
  const {
    loading,
    data: p,
    error,
    reload,
  } = useLoad(() => api('projects', `/projects/${id}`), [id, user?.id]);
  const [actionError, setActionError] = useState(null);
  const nameOf = (uid) => users.find((u) => u.id === uid)?.name ?? uid;

  async function act(action, body) {
    setActionError(null);
    try {
      await api('projects', `/projects/${id}/${action}`, { method: 'POST', body });
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  if (!user) return <p>{t('chooseUserFirst')}</p>;

  return (
    <section>
      <Link to="/projects">← {t('navProjects')}</Link>
      <ErrorNote error={error ?? actionError} />
      {loading && !p && <Loading />}
      {p && (
        <>
          <h1>{p.title}</h1>
          <p>
            <StatusBadge status={p.status} />{' '}
            <span className="muted">
              {p.companyName}
              {p.traineeName && ` · ${t('trainee')}: ${p.traineeName}`}
              {p.levelRequired && ` · ${t('level')} ${p.levelRequired}`}
            </span>
          </p>

          <Actions p={p} act={act} />

          <div className="two-col">
            <div className="card">
              <p className="eyebrow">{t('brief')}</p>
              <p className="prose">{p.goals}</p>
              {p.features && <p className="prose muted">{p.features}</p>}
              {p.deadline && (
                <p className="muted">
                  {t('deadline')}: {p.deadline}
                </p>
              )}
              {p.priceJd && (
                <p>
                  {jd(p.priceJd)} + {jd(p.setupFeeJd)} {t('setupFee')} · {t('revisions')} {p.revisionsUsed}/
                  {p.maxRevisions}
                </p>
              )}
              {p.invoices.length > 0 && (
                <>
                  <p className="eyebrow">{t('invoices')}</p>
                  <ul className="plain">
                    {p.invoices.map((i) => (
                      <li key={i.id}>
                        {t(`invoice_${i.kind}`)}: {jd(i.amountJd)} · {t('paid')} ({i.paymentRef})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {p.payout && (
                <p className="note note-ok">
                  {t('payoutRecorded')
                    .replace('{trainee}', jd(p.payout.amountJd))
                    .replace('{jiwar}', jd(p.payout.jiwarShareJd))}
                </p>
              )}
              {p.rating && (
                <p>
                  {'★'.repeat(p.rating)}
                  {'☆'.repeat(5 - p.rating)} {p.testimonial && `“${p.testimonial}”`}
                </p>
              )}
            </div>

            <div className="card">
              <p className="eyebrow">{t('timeline')}</p>
              <ol className="timeline">
                {p.events.map((e) => (
                  <li key={e.id}>
                    <strong>{t(`status_${e.to}`)}</strong>{' '}
                    <span className="muted small">
                      {nameOf(e.actorId)} · {new Date(e.createdAt).toLocaleString()}
                    </span>
                    {e.note && <p className="small">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <Messages p={p} nameOf={nameOf} reload={reload} />
        </>
      )}
    </section>
  );
}

function Actions({ p, act }) {
  const { t } = useLanguage();
  const { user } = useSession();
  const [decline, setDecline] = useState(false);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState({ setupFeeJd: 30, priceJd: 150, levelRequired: 1 });
  const [rating, setRating] = useState({ rating: 5, testimonial: '', testimonialPublic: true });
  const has = (a) => p.actions.includes(a);
  // Only the company that asked rates the project, once it is approved.
  const canRate = p.status === 'approved' && p.companyId === user.id;

  if (p.actions.length === 0 && !canRate) return null;

  return (
    <div className="card action-card">
      <p className="eyebrow">{t('nextStep')}</p>

      {has('quote') && (
        <div className="row three">
          <label>
            {t('setupFee')} (JD)
            <input
              type="number"
              min={1}
              value={quote.setupFeeJd}
              onChange={(e) => setQuote({ ...quote, setupFeeJd: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('price')} (JD)
            <input
              type="number"
              min={1}
              value={quote.priceJd}
              onChange={(e) => setQuote({ ...quote, priceJd: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('level')}
            <select
              value={quote.levelRequired}
              onChange={(e) => setQuote({ ...quote, levelRequired: Number(e.target.value) })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>
      )}
      {has('assign') && <AssignPicker p={p} act={act} />}
      {(has('submit') || has('request_revision')) && (
        <label className="reason">
          {has('submit') ? t('noteForReviewer') : t('whatShouldChange')}
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {(has('accept') || has('approve')) && (
        <label className="check">
          <input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} />{' '}
          {t('simulateDecline')}
        </label>
      )}

      <div className="actions">
        {has('quote') && (
          <button type="button" className="button" onClick={() => act('quote', quote)}>
            {t('sendQuote')}
          </button>
        )}
        {has('accept') && (
          <button
            type="button"
            className="button"
            onClick={() => act('accept', { simulateDecline: decline })}
          >
            {t('acceptAndPay').replace('{amount}', jd(p.setupFeeJd))}
          </button>
        )}
        {has('submit') && (
          <button type="button" className="button" onClick={() => act('submit', { note })}>
            {t('submitForReview')}
          </button>
        )}
        {has('approve') && (
          <button
            type="button"
            className="button"
            onClick={() => act('approve', { simulateDecline: decline })}
          >
            {t('approveAndPay').replace('{amount}', jd(p.priceJd))}
          </button>
        )}
        {has('request_revision') && (
          <button
            type="button"
            className="button secondary"
            onClick={() => act('request-revision', { note })}
          >
            {t('requestRevision')}
          </button>
        )}
        {has('cancel') && (
          <button type="button" className="button secondary" onClick={() => act('cancel')}>
            {t('cancelProject')}
          </button>
        )}
      </div>
      {(has('accept') || has('approve')) && <p className="muted small">{t('mockPaymentNote')}</p>}

      {canRate && (
        <div className="rate">
          <label>
            {t('rating')}
            <select
              value={rating.rating}
              onChange={(e) => setRating({ ...rating, rating: Number(e.target.value) })}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="reason">
            {t('testimonial')}
            <input
              value={rating.testimonial}
              onChange={(e) => setRating({ ...rating, testimonial: e.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={rating.testimonialPublic}
              onChange={(e) => setRating({ ...rating, testimonialPublic: e.target.checked })}
            />{' '}
            {t('testimonialConsent')}
          </label>
          <div className="actions">
            <button type="button" className="button" onClick={() => act('rate', rating)}>
              {t('saveRating')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Admin: eligible trainees come from the learning service. If it is down, this
// box shows the error and the rest of the page keeps working.
function AssignPicker({ p, act }) {
  const { t } = useLanguage();
  const { loading, data, error } = useLoad(() => api('projects', `/projects/${p.id}/candidates`), [p.id]);
  const [traineeId, setTraineeId] = useState('');
  return (
    <div>
      <ErrorNote error={error} />
      {loading && <p className="muted">{t('checkingEligibility')}</p>}
      {data && (
        <ul className="plain">
          {data.items.map((c) => (
            <li key={c.traineeId}>
              <label className="check">
                <input
                  type="radio"
                  name="trainee"
                  value={c.traineeId}
                  disabled={!c.eligible}
                  checked={traineeId === c.traineeId}
                  onChange={() => setTraineeId(c.traineeId)}
                />{' '}
                {c.name} · {t('level')} {c.level}{' '}
                {c.eligible ? (
                  <span className="badge badge-ok">{t('eligible')}</span>
                ) : (
                  <span className="badge badge-wait">
                    {c.problems.map((x) => t(`problem_${x}`)).join(', ')}
                  </span>
                )}
                {c.preferred && <span className="badge">{t('preferredByClient')}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!traineeId}
          onClick={() => act('assign', { traineeId })}
        >
          {t('assign')}
        </button>
      </div>
    </div>
  );
}

function Messages({ p, nameOf, reload }) {
  const { t } = useLanguage();
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    setError(null);
    try {
      await api('projects', `/projects/${p.id}/messages`, { method: 'POST', body: { body } });
      setBody('');
      reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">{t('messages')}</p>
      {p.messages.length === 0 && <p className="muted">{t('noMessages')}</p>}
      <ul className="plain messages">
        {p.messages.map((m) => (
          <li key={m.id}>
            <strong>{nameOf(m.authorId)}</strong>{' '}
            <span className="muted small">{new Date(m.createdAt).toLocaleString()}</span>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>
      <ErrorNote error={error} />
      <form className="send" onSubmit={send}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('writeMessage')}
          required
        />
        <button type="submit" className="button">
          {t('send')}
        </button>
      </form>
    </div>
  );
}
