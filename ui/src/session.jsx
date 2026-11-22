// The demo user the presenter is acting as (ADR-4). The list comes from the
// learning service, with the projects service as a fallback, so the switcher
// still works when one service is down.
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setApiUser } from './api.js';
import { readSetting, saveSetting } from './storage.js';

const SessionContext = createContext(null);

async function loadDemoUsers() {
  try {
    return (await api('learning', '/demo-users')).items;
  } catch {
    return (await api('projects', '/demo-users')).items;
  }
}

export function SessionProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(() => readSetting('user', null));
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDemoUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

  // Keep the API client in step during render, so child effects already send the right user.
  setApiUser(userId);

  const choose = (id) => {
    saveSetting('user', id || null);
    setUserId(id || null);
  };

  const user = users.find((u) => u.id === userId) ?? null;
  const is = (...roles) => Boolean(user) && user.roles.some((r) => roles.includes(r));

  return (
    <SessionContext.Provider value={{ users, user, choose, is, error }}>{children}</SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
