import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { languageOf } from '../monacoSetup.js';
import { api } from '../api.js';
import { useLanguage } from '../i18n.jsx';
import { useSession } from '../session.jsx';
import { ErrorNote, Loading, useLoad } from '../components.jsx';
import { StatusBadge } from './PullRequest.jsx';

// The coding workspace (story #19): a file tree, the Monaco editor, commits on
// branches, history, and pull requests into the protected main branch.
export default function Workspace() {
  const { repoId } = useParams();
  const { t } = useLanguage();
  const { user } = useSession();
  const repo = useLoad(() => api('learning', `/repos/${repoId}`), [repoId, user?.id]);
  const [branch, setBranch] = useState('main');
  const [version, setVersion] = useState(0); // bump to reload files and history
  const files = useLoad(
    () => api('learning', `/repos/${repoId}/files?branch=${branch}`),
    [repoId, branch, version],
  );
  const history = useLoad(
    () => api('learning', `/repos/${repoId}/commits?branch=${branch}`),
    [repoId, branch, version],
  );

  const [draft, setDraft] = useState([]); // [{ path, content }] being edited
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Start editing from the branch's files whenever they load.
  useEffect(() => {
    if (!files.data) return;
    setDraft(files.data.items);
    setOpen((current) =>
      files.data.items.some((f) => f.path === current) ? current : (files.data.items[0]?.path ?? null),
    );
  }, [files.data]);

  const saved = useMemo(() => files.data?.items ?? [], [files.data]);
  const changed = useMemo(
    () =>
      draft.length !== saved.length ||
      draft.some((f) => saved.find((s) => s.path === f.path)?.content !== f.content),
    [draft, saved],
  );

  const r = repo.data;
  const canWrite = r?.canWrite;
  const onMain = branch === 'main';
  const current = draft.find((f) => f.path === open);

  async function run(work, ok) {
    setError(null);
    setNotice(null);
    try {
      const out = await work();
      if (ok) setNotice(ok);
      return out;
    } catch (err) {
      setError(err);
      return null;
    }
  }

  const edit = (content) => setDraft((all) => all.map((f) => (f.path === open ? { ...f, content } : f)));

  function addFile() {
    const path = window.prompt(t('newFilePrompt'), 'style.css');
    if (!path || draft.some((f) => f.path === path)) return;
    setDraft((all) => [...all, { path, content: '' }]);
    setOpen(path);
  }

  function removeFile() {
    if (!open || !window.confirm(t('deleteFileConfirm').replace('{path}', open))) return;
    setDraft((all) => all.filter((f) => f.path !== open));
    setOpen(draft.find((f) => f.path !== open)?.path ?? null);
  }

  async function newBranch() {
    const name = window.prompt(t('newBranchPrompt'), 'homework-1');
    if (!name) return;
    const made = await run(() =>
      api('learning', `/repos/${repoId}/branches`, { method: 'POST', body: { name, from: branch } }),
    );
    if (made) {
      repo.reload();
      setBranch(name);
    }
  }

  async function commit() {
    const done = await run(
      () =>
        api('learning', `/repos/${repoId}/commits`, {
          method: 'POST',
          body: { branch, message, files: draft },
        }),
      t('committed'),
    );
    if (done) {
      setMessage('');
      setVersion((v) => v + 1);
      repo.reload();
    }
  }

  async function openPull() {
    const title = window.prompt(t('pullTitlePrompt'), message || branch);
    if (!title) return;
    const pull = await run(() =>
      api('learning', `/repos/${repoId}/pulls`, { method: 'POST', body: { source: branch, title } }),
    );
    if (pull) repo.reload();
  }

  if (!user) return <p>{t('chooseUserFirst')}</p>;

  return (
    <section className="workspace">
      <p className="eyebrow">{t('codingWorkspace')}</p>
      <ErrorNote error={repo.error} />
      {repo.loading && !r && <Loading />}
      {r && (
        <>
          <div className="page-head">
            <h1>{r.courseTitle}</h1>
            <div className="branch-bar">
              <label className="inline">
                {t('branch')}{' '}
                <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {r.branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                      {b.name === 'main' ? ` (${t('protected')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {canWrite && (
                <button type="button" className="button secondary" onClick={newBranch}>
                  {t('newBranch')}
                </button>
              )}
            </div>
          </div>

          <ErrorNote error={error ?? files.error} />
          {notice && (
            <p className="note note-ok" role="status">
              {notice}
            </p>
          )}
          {canWrite && onMain && <p className="note">{t('mainProtectedNote')}</p>}

          <div className="ide">
            <aside className="file-tree" aria-label={t('files')}>
              <ul>
                {draft.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      className={f.path === open ? 'file active' : 'file'}
                      onClick={() => setOpen(f.path)}
                    >
                      {f.path}
                    </button>
                  </li>
                ))}
              </ul>
              {canWrite && !onMain && (
                <div className="tree-actions">
                  <button type="button" className="link-button" onClick={addFile}>
                    + {t('newFile')}
                  </button>
                  <button type="button" className="link-button" onClick={removeFile}>
                    {t('deleteFile')}
                  </button>
                </div>
              )}
            </aside>
            <div className="editor-pane">
              {current ? (
                <Editor
                  height="420px"
                  path={current.path}
                  language={languageOf(current.path)}
                  value={current.content}
                  onChange={(value) => edit(value ?? '')}
                  options={{ readOnly: !canWrite || onMain, minimap: { enabled: false }, fontSize: 14 }}
                />
              ) : (
                <p className="muted">{t('noFileOpen')}</p>
              )}
            </div>
          </div>

          {canWrite && !onMain && (
            <div className="commit-bar">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('commitMessage')}
                aria-label={t('commitMessage')}
              />
              <button
                type="button"
                className="button"
                disabled={!changed || message.trim().length < 3}
                onClick={commit}
              >
                {t('commit')}
              </button>
              <button type="button" className="button secondary" disabled={changed} onClick={openPull}>
                {t('openPull')}
              </button>
            </div>
          )}

          <div className="two-col">
            <div className="card">
              <p className="eyebrow">{t('history')}</p>
              <ol className="timeline">
                {history.data?.items.map((c) => (
                  <li key={c.id}>
                    <strong>{c.message}</strong>{' '}
                    <span className="muted small">{new Date(c.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card">
              <p className="eyebrow">{t('pullRequests')}</p>
              {r.pulls.length === 0 && <p className="muted">{t('noPulls')}</p>}
              <ul className="plain">
                {r.pulls.map((p) => (
                  <li key={p.id}>
                    <Link to={`/pulls/${p.id}`}>{p.title}</Link> <StatusBadge status={p.status} />{' '}
                    <span className="muted small">
                      {p.sourceBranch} → {p.targetBranch}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
