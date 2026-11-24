import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';

export function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const hydrate = useDataStore((s) => s.hydrate);
  const triggerWeeklyCheckinIfDue = useDataStore((s) => s.triggerWeeklyCheckinIfDue);

  useEffect(() => {
    void initialize()
      .then(() => hydrate())
      .then(() => triggerWeeklyCheckinIfDue());
  }, [initialize, hydrate, triggerWeeklyCheckinIfDue]);

  return <AppShell />;
}

export default App;
