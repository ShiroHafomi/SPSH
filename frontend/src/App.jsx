import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { LanguageProvider } from './hooks/useLanguage';
import { FlashProvider } from './components/FlashProvider';
import { ToastProvider } from './components/ui/Toast';
import { NotificationProvider } from './hooks/useNotifications';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { AdminLayout } from './components/AdminLayout';
import { TeacherLayout } from './components/TeacherLayout';
import { StudentLayout } from './components/StudentLayout';
import Login from './pages/Login';
// import Register from './'; // Disabled - Admin only creates users
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentForm from './pages/StudentForm';
import Predictor from './pages/Predictor';
import WhatIfSimulator from './pages/WhatIfSimulator';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminDashboard from './pages/AdminDashboard';
import AdminStudents from './pages/AdminStudents';
import AdminAtRisk from './pages/AdminAtRisk';
import AdminAITools from './pages/AdminAITools';
import StudentGoals from './pages/StudentGoals';
import StudentGoalsProgress from './pages/StudentGoalsProgress';
import StudyPlanner from './pages/StudyPlanner';
import Assignments from './pages/Assignments';
import Notifications from './pages/Notifications';
import MlMonitoring from './pages/MlMonitoring';

/**
 * Routing map
 *
 * Each role (admin/teacher/student) renders under its own layout (sidebar +
 * header) and must NOT also receive the shared floating <Navbar/> — that was
 * the original double-navigation bug. The shared (non-role) routes render
 * under <MainLayout/>, which owns the floating Navbar + padded content column.
 * Login is public and full-screen (no navbar).
 */
function NotificationRedirect() {
  const { user } = useAuth();
  const destination = {
    student: '/student/notifications',
    teacher: '/teacher/notifications',
    admin: '/admin/notifications',
  }[user?.role] || '/dashboard';

  return <Navigate to={destination} replace />;
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
      <ThemeProvider>
        <LanguageProvider>
          <FlashProvider>
            <ToastProvider>
              <Routes>
              {/* Public routes (full-screen) */}
              <Route path="/login" element={<Login />} />
              {/* <Route path="/register" element={<Register />} /> */} {/* Disabled - Admin only creates users */}

              {/* Admin routes - Admin only (own sidebar + header) */}
              <Route element={
                <ProtectedRoute roles={['admin']}>
                  <AdminLayout />
                </ProtectedRoute>
              }>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/students/:studentId/goals" element={<StudentGoalsProgress mode="admin" />} />
                <Route path="/admin/at-risk" element={<AdminAtRisk />} />
                <Route path="/admin/ai-tools" element={<AdminAITools />} />
                <Route path="/admin/ml-monitoring" element={<MlMonitoring apiRole="admin" />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/notifications" element={<Notifications />} />
              </Route>

              {/* Teacher routes - Teacher or Admin (own sidebar + header) */}
              <Route element={
                <ProtectedRoute roles={['teacher', 'admin']}>
                  <TeacherLayout />
                </ProtectedRoute>
              }>
                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/teacher/students" element={<Students />} />
                <Route path="/teacher/students/new" element={<StudentForm />} />
                <Route path="/teacher/students/:id/edit" element={<StudentForm />} />
                <Route path="/teacher/students/:studentId/goals" element={<StudentGoalsProgress mode="teacher" />} />
                <Route path="/teacher/at-risk" element={<AdminAtRisk />} />
                <Route path="/teacher/ml-monitoring" element={<MlMonitoring apiRole="teacher" />} />
              </Route>

              {/* Teacher notification center - Teacher only (own sidebar + header) */}
              <Route element={
                <ProtectedRoute roles={['teacher']}>
                  <TeacherLayout />
                </ProtectedRoute>
              }>
                <Route path="/teacher/notifications" element={<Notifications />} />
              </Route>

              {/* Student routes - Student only (own sidebar + header) */}
              <Route element={
                <ProtectedRoute roles={['student']}>
                  <StudentLayout />
                </ProtectedRoute>
              }>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/goals" element={<StudentGoals />} />
                <Route path="/student/notifications" element={<Notifications />} />
                <Route path="/student/study-planner" element={<StudyPlanner />} />
                <Route path="/student/assignments" element={<Assignments />} />
              </Route>

              {/* Shared routes - any authenticated user (floating Navbar via MainLayout) */}
              <Route element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/predictor" element={<Predictor />} />
                <Route path="/what-if" element={<WhatIfSimulator />} />
              </Route>

              {/* Shared, teacher/admin-only routes (still float under MainLayout) */}
              <Route element={
                <ProtectedRoute roles={['teacher', 'admin']}>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route path="/students" element={<Students />} />
                <Route path="/students/new" element={<StudentForm />} />
                <Route path="/students/:id/edit" element={<StudentForm />} />
              </Route>

              <Route
                path="/notifications"
                element={(
                  <ProtectedRoute>
                    <NotificationRedirect />
                  </ProtectedRoute>
                )}
              />

              {/* Default redirects based on role */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </ToastProvider>
          </FlashProvider>
        </LanguageProvider>
      </ThemeProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;