import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Info, TriangleAlert, X } from 'lucide-react';
import { AppProvider, useApp, useDispatch } from './store';
import { TopNav } from '../components/layout/TopNav';
import LiveMapPage from '../pages/LiveMapPage';

const FleetPage = lazy(() => import('../pages/FleetPage'));
const RoutesPage = lazy(() => import('../pages/RoutesPage'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'));
const IncidentsPage = lazy(() => import('../pages/IncidentsPage'));
const MaintenancePage = lazy(() => import('../pages/MaintenancePage'));
const OperationsPage = lazy(() => import('../pages/OperationsPage'));

function Toast() {
  const { toast } = useApp();
  const dispatch = useDispatch();
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 6000);
    return () => window.clearTimeout(t);
  }, [toast, dispatch]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} className="glass toast" role="status" initial={{ opacity: 0, y: 16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 16, x: '-50%' }}>
          {toast.tone === 'warn' ? <TriangleAlert size={16} className="warn-t" /> : <Info size={16} className="muted" />}
          <span>{toast.text}</span>
          <button className="corner-link" aria-label="Dismiss" onClick={() => dispatch({ type: 'CLEAR_TOAST' })}>
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Loading() {
  return <div className="page"><div className="card shimmer" style={{ height: 220 }} aria-busy="true" aria-label="Loading view" /></div>;
}

function Views() {
  const { view } = useApp();
  return (
    <main className="main">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <Suspense fallback={<Loading />}>
            {view === 'live' && <LiveMapPage />}
            {view === 'fleet' && <FleetPage />}
            {view === 'routes' && <RoutesPage />}
            {view === 'analytics' && <AnalyticsPage />}
            {view === 'incidents' && <IncidentsPage />}
            {view === 'maintenance' && <MaintenancePage />}
            {view === 'operations' && <OperationsPage />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <div className="app">
          <TopNav />
          <Views />
          <Toast />
        </div>
      </AppProvider>
    </MotionConfig>
  );
}
