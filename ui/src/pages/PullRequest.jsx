import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';

export function StatusBadge({ status }) {
  const { t } = useLanguage();
  const tone = status === 'merged' ? 'badge-ok' : status === 'changes_requested' ? 'badge-bad' : 'badge-wait';
  return <span className={`badge ${tone}`}>{t(`pr_${status}`)}</span>;
}

// Pull request review (story #20): the diff against main, comments on lines,
// request changes or approve (merge, with an optional grade for verification).
export default function PullRequest() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user, users } = useSession();
  const { loading, data: pr, error, reload } = useLoad(() => api('learning', `/pulls/${id}`), [id, user?.id]);
  const [commentingOn, setCommentingOn] = useState(null); // { path, line }
  const [reviewNote, setReviewNote] = useState('');
  const [lineText, setLineText] = useState('');
  const [talk, setTalk] = useState('');
  const [grade, setGrade] = useState('');
  const [actionError, setActionError] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSource, setAiSource] = useState(null);
  const nameOf = (uid) =>
    uid === 'ai-assistant' ? t('aiAssistant') : (users.find((u) => u.id === uid)?.name ?? uid);

  // Story #21: an AI draft (posted as a comment) and a suggested grade the instructor can change.
  async function aiReview() {
    setActionError(null);
    setAiBusy(true);
    try {
      const { draft } = await api('learning', `/pulls/${id}/ai-review`, { method: 'POST' });
      setGrade(String(draft.suggestedGrade));
      setAiSource(draft.source);
      reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setAiBusy(false);
    }
  }

  async function post(path, body) {
    setActionError(null);
    try {
      await api('learning', path, { method: 'POST', body });
      setLineText('');
      setTalk('');
      setReviewNote('');
      setCommentingOn(null);
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  const commentsOn = (path, line) => pr.comments.filter((c) => c.path === path && c.line === line);

  if (!user) return <p>{t('chooseUserFirst')}</p>;

  return (
    <section>
      <p className="eyebrow">{t('pullRequest')}</p>
      <ErrorNote error={error ?? actionError} />
      {loading && !pr && <Loading />}
      {pr && (
        <>
          <h1>{pr.title}</h1>
          <p>
            <StatusBadge status={pr.status} />{' '}
            <span className="muted">
              {nameOf(pr.traineeId)} · {pr.courseTitle} · {pr.sourceBranch} → {pr.targetBranch}
            </span>
          </p>

          {pr.canReview && (
            <div className="card action-card">
              <p className="eyebrow">{t('review')}</p>
              <div className="row">
                <label>
                  {t('gradeOptional')}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  />
                </label>
                <label>
                  {t('reviewNote')}
                  <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                </label>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  disabled={pr.status !== 'open'}
                  onClick={() => post(`/pulls/${id}/approve`, { grade: grade === '' ? null : Number(grade) })}
                >
                  {t('approveMerge')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pr.status !== 'open'}
                  onClick={() => post(`/pulls/${id}/request-changes`, { body: reviewNote })}
                >
                  {t('requestChanges')}
                </button>
                <button type="button" className="button secondary" disabled={aiBusy} onClick={aiReview}>
                  {aiBusy ? t('aiThinking') : t('aiDraftReview')}
                </button>
              </div>
              {aiSource && (
                <p className="note note-ok small" role="status">
                  {t('aiDraftReady')} {aiSource === 'mock' && t('aiOfflineNote')}
                </p>
              )}
              <p className="muted small">{t('approveNote')}</p>
            </div>
          )}

          {pr.diff.length === 0 && <p className="muted">{t('noDiff')}</p>}
          {pr.diff.map((file) => (
            <div key={file.path} className="diff-file card">
              <p className="diff-head">
                <strong>{file.path}</strong>{' '}
                <span className="muted small">
                  {t(`file_${file.status}`)} · <span className="plus">+{file.additions}</span>{' '}
                  <span className="minus">−{file.deletions}</span>
                </span>
              </p>
              <table className="diff" dir="ltr">
                <tbody>
                  {file.lines.map((l, i) => {
                    return (
                      <Fragment key={i}>
                        <tr className={`diff-${l.type}`}>
                          <td className="ln">{l.oldNo ?? ''}</td>
                          <td className="ln">{l.newNo ?? ''}</td>
                          <td className="code">
                            {/* Comments go on lines of the new code (added or unchanged). */}
                            {l.newNo ? (
                              <button
                                type="button"
                                className="add-comment"
                                title={t('commentOnLine')}
                                onClick={() => setCommentingOn({ path: file.path, line: l.newNo })}
                              >
                                +
                              </button>
                            ) : (
                              <span className="add-comment-space" />
                            )}
                            <span className="sign">
                              {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
                            </span>
                            {l.text}
                          </td>
                        </tr>
                        {l.newNo &&
                          commentsOn(file.path, l.newNo).map((c) => (
                            <tr key={`c${c.id}`} className="diff-comment">
                              <td colSpan={3}>
                                <strong>{nameOf(c.authorId)}</strong>: {c.body}
                              </td>
                            </tr>
                          ))}
                        {l.newNo && commentingOn?.path === file.path && commentingOn.line === l.newNo && (
                          <tr className="diff-comment">
                            <td colSpan={3}>
                              <form
                                className="send"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  post(`/pulls/${id}/comments`, {
                                    path: file.path,
                                    line: l.newNo,
                                    body: lineText,
                                  });
                                }}
                              >
                                <input
                                  autoFocus
                                  value={lineText}
                                  onChange={(e) => setLineText(e.target.value)}
                                  placeholder={t('writeComment')}
                                  required
                                />
                                <button type="submit" className="button">
                                  {t('comment')}
                                </button>
                              </form>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          <div className="card">
            <p className="eyebrow">{t('conversation')}</p>
            <ul className="plain messages">
              {pr.comments
                .filter((c) => c.path === null)
                .map((c) => (
                  <li key={c.id}>
                    <strong>{nameOf(c.authorId)}</strong>{' '}
                    <span className="muted small">{new Date(c.createdAt).toLocaleString()}</span>
                    <p>{c.body}</p>
                  </li>
                ))}
            </ul>
            <form
              className="send"
              onSubmit={(e) => {
                e.preventDefault();
                post(`/pulls/${id}/comments`, { body: talk });
              }}
            >
              <input
                value={talk}
                onChange={(e) => setTalk(e.target.value)}
                placeholder={t('writeComment')}
                required
              />
              <button type="submit" className="button">
                {t('comment')}
              </button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

// Instructors: pull requests waiting for review in their courses.
export function Reviews() {
  const { t } = useLanguage();
  const { user, users } = useSession();
  const { loading, data, error } = useLoad(() => api('learning', '/reviews'), [user?.id]);
  const nameOf = (uid) => users.find((u) => u.id === uid)?.name ?? uid;
  return (
    <section>
      <p className="eyebrow">{t('codingWorkspace')}</p>
      <h1>{t('reviewsTitle')}</h1>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data && data.items.length === 0 && <p className="muted">{t('noReviews')}</p>}
      <ul className="cards">
        {data?.items.map((p) => (
          <li key={p.id} className="card">
            <Link className="card-title" to={`/pulls/${p.id}`}>
              {p.title}
            </Link>
            <p>
              {nameOf(p.traineeId)} · {p.sourceBranch} → {p.targetBranch}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
