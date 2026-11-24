import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';

export function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const hydrate = useDataStore((s) => s.hydrate);

  useEffect(() => {
    void initialize().then(() => hydrate());
  }, [initialize, hydrate]);

  return <AppShell />;
}

export default App;
