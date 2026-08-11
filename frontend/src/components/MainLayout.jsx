import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useFlash } from './FlashProvider';
import { FlashContainer } from './FlashMessage';

/**
 * Shared chrome for non-role routes (/dashboard, /students*, /predictor).
 * Renders the floating glass Navbar + a centered padded content column with
 * the flash message stack. Role routes (admin/teacher/student) each render
 * their own sidebar + header via AdminLayout/TeacherLayout/StudentLayout and
 * must NOT also get this floating Navbar (that was the original double-nav bug).
 *
 * Login is a public full-screen route and renders outside this layout.
 */
function FlashArea() {
  const { messages, removeFlash } = useFlash();
  return <FlashContainer messages={messages} onRemove={(i) => removeFlash(messages[i].id)} />;
}

export function MainLayout() {
  return (
    <div className="min-h-screen bg-primary-50 dark:bg-gray-950 text-primary-950 dark:text-gray-100 transition-colors">
      <Navbar />
      <main id="app-content" className="pt-24 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FlashArea />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
