import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n.jsx';
import { SessionProvider, useSession } from './session.jsx';
import Home from './pages/Home.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import CourseForm from './pages/CourseForm.jsx';

// Navigation per role. Each feature adds its links here with the roles that see them.
const NAV = [
  { to: '/', key: 'navHome', end: true },
  { to: '/courses', key: 'navCourses' },
  { to: '/teach', key: 'navTeach', roles: ['instructor'] },
];

function UserSwitcher() {
  const { t } = useLanguage();
  const { users, user, choose, error } = useSession();
  return (
    <label className="switcher">
      <span>{t('actingAs')}</span>
      <select value={user?.id ?? ''} onChange={(e) => choose(e.target.value)} title={error ?? undefined}>
        <option value="">{t('visitor')}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.roles.map((r) => t('roles')[r]).join(', ')})
          </option>
        ))}
      </select>
    </label>
  );
}

function Layout() {
  const { t, toggle } = useLanguage();
  const { is } = useSession();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Jiwar</span>
          <nav>
            {NAV.filter((n) => !n.roles || is(...n.roles)).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-tools">
            <UserSwitcher />
            <button type="button" className="link-button" onClick={toggle}>
              {t('language')}
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/teach" element={<Courses mine />} />
          <Route path="/courses/new" element={<CourseForm />} />
          <Route path="/courses/:id" element={<CourseDetail />} />
          <Route path="/courses/:id/edit" element={<CourseForm />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <SessionProvider>
        <BrowserRouter>
          <Layout />
        </BrowserRouter>
      </SessionProvider>
    </LanguageProvider>
  );
}
