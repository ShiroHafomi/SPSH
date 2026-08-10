import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, homeForRole } from '../hooks/useAuth';

export function ProtectedRoute({ children, adminOnly = false, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role gate: when an explicit list of allowed roles is given, bounce
  // disallowed users to their own role's home instead of a shared dashboard.
  // `adminOnly` is preserved as a shorthand for roles={['admin']}.
  const allowedRoles = roles || (adminOnly ? ['admin'] : null);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return children;
}