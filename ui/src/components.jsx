// Small shared pieces used by every page.
import { useEffect, useState } from 'react';
import { useLanguage } from './i18n.jsx';

// Runs an async loader and tracks loading, data and error. Call reload() after a change.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="note note-error" role="alert">
      <p>{error.message}</p>
      {error.details && (
        <ul>
          {error.details.map((d) => (
            <li key={d.field}>
              <strong>{d.field}</strong>: {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useLanguage();
  return <p className="muted">{t('loading')}</p>;
}
