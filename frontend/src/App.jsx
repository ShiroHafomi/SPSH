import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { Navbar } from './components/Navbar';
import { FlashProvider, useFlash } from './components/FlashProvider';
import { FlashContainer } from './components/FlashMessage';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentForm from './pages/StudentForm';
import Predictor from './pages/Predictor';
import AdminUsers from './pages/AdminUsers';

function FlashArea() {
  const { messages, removeFlash } = useFlash();
  return <FlashContainer messages={messages} onRemove={(i) => removeFlash(messages[i].id)} />;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <FlashProvider>
          <div className="min-h-screen bg-primary-50 dark:bg-gray-950 text-primary-950 dark:text-gray-100 transition-colors">
            <Navbar />
            <main id="app-content" className="pt-24 pb-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <FlashArea />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/students"
                    element={
                      <ProtectedRoute>
                        <Students />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/students/new"
                    element={
                      <ProtectedRoute>
                        <StudentForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/students/:id/edit"
                    element={
                      <ProtectedRoute>
                        <StudentForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/predictor"
                    element={
                      <ProtectedRoute>
                        <Predictor />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/users"
                    element={
                      <ProtectedRoute adminOnly>
                        <AdminUsers />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </FlashProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;