import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './i18n.jsx';
import { SessionProvider, useSession } from './session.jsx';
import Home from './pages/Home.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import CourseForm from './pages/CourseForm.jsx';
import Progress from './pages/Progress.jsx';
import VerificationQueue from './pages/VerificationQueue.jsx';
import Permits from './pages/Permits.jsx';
import Notifications from './pages/Notifications.jsx';
import Packs from './pages/Packs.jsx';
import ProjectRequest from './pages/ProjectRequest.jsx';
import ProjectsList from './pages/ProjectsList.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Showcase, { Portfolio } from './pages/Showcase.jsx';

// Navigation per role. Each feature adds its links here with the roles that see them.
const NAV = [
  { to: '/', key: 'navHome', end: true },
  { to: '/courses', key: 'navCourses' },
  { to: '/showcase', key: 'navShowcase' },
  { to: '/packs', key: 'navPacks', roles: ['company'] },
  { to: '/projects', key: 'navProjects', roles: ['company', 'trainee', 'admin'] },
  { to: '/teach', key: 'navTeach', roles: ['instructor'] },
  { to: '/progress', key: 'navProgress', roles: ['trainee'] },
  { to: '/admin/verification', key: 'navVerification', roles: ['admin'] },
  { to: '/admin/permits', key: 'navPermits', roles: ['admin'] },
  { to: '/notifications', key: 'navNotifications', roles: ['trainee', 'instructor', 'company', 'admin'] },
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
          <NavLink to="/" className="brand" aria-label="Jiwar">
            <img src="/brand/jiwar-key.svg" alt="" className="brand-mark" />
            <span className="brand-word">Jiwar</span>
            <span className="brand-word-ar" lang="ar">
              جوار
            </span>
          </NavLink>
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
          <Route path="/progress" element={<Progress />} />
          <Route path="/trainees/:id" element={<Progress />} />
          <Route path="/admin/verification" element={<VerificationQueue />} />
          <Route path="/admin/permits" element={<Permits />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/packs" element={<Packs />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route path="/portfolio/:traineeId" element={<Portfolio />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/new" element={<ProjectRequest />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
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
