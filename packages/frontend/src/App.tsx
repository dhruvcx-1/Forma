import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useSetupStatus, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';

// Pages
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const LogWeight = lazy(() => import('@/pages/LogWeight'));
const Measurements = lazy(() => import('@/pages/Measurements'));
const MeasurementDetail = lazy(() => import('@/pages/MeasurementDetail'));
const Goals = lazy(() => import('@/pages/Goals'));
const Photos = lazy(() => import('@/pages/Photos'));
const Settings = lazy(() => import('@/pages/Settings'));
const DataIO = lazy(() => import('@/pages/DataIO'));
const Login = lazy(() => import('@/pages/Login'));
const Setup = lazy(() => import('@/pages/Setup'));
const PublicProfile = lazy(() => import('@/pages/PublicProfile'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PublicProfileRoute() {
  const { username } = useParams<{ username: string }>();
  if (!username?.startsWith('@')) {
    return <Navigate to="/" replace />;
  }
  return <PublicProfile />;
}

function AuthGuard({ children }: { children: React.ReactElement }) {
  const location = useLocation();

  // Public profile routes (e.g. /@username or /u/username) do not require authentication
  if (location.pathname.startsWith('/@') || location.pathname.startsWith('/u/')) {
    return children;
  }

  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();
  const { data: auth, isLoading: authLoading } = useAuth();

  if (setupLoading || authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <LoadingState />
      </div>
    );
  }

  // If first-run is not completed, route to /setup
  if (setupStatus && !setupStatus.isSetup) {
    if (location.pathname !== '/setup') {
      return <Navigate to="/setup" replace />;
    }
    return children;
  }

  // If setup is done, prevent staying on /setup
  if (location.pathname === '/setup' && setupStatus?.isSetup) {
    return <Navigate to="/login" replace />;
  }

  // If not authenticated, route to /login
  const isAuthenticated = auth?.authenticated || (auth as any)?.id !== undefined;
  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  // If already authenticated and on /login, redirect to /
  if (isAuthenticated && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthGuard>
            <Suspense
              fallback={
                <div className="h-screen w-screen flex items-center justify-center bg-background">
                  <LoadingState />
                </div>
              }
            >
              <Routes>
                {/* Public / Setup Routes */}
                <Route path="/setup" element={<Setup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/u/:username" element={<PublicProfile />} />
                <Route path="/:username" element={<PublicProfileRoute />} />

                {/* Authenticated Application Shell */}
                <Route
                  path="/"
                  element={
                    <ErrorBoundary>
                      <AppShell />
                    </ErrorBoundary>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="log" element={<LogWeight />} />
                  <Route path="measurements" element={<Measurements />} />
                  <Route path="measurements/:id" element={<MeasurementDetail />} />
                  <Route path="goals" element={<Goals />} />
                  <Route path="photos" element={<Photos />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="data" element={<DataIO />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthGuard>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
