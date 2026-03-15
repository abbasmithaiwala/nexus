import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { SpacetimeProvider } from '@/contexts/SpacetimeContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/Home';
import { LobbyPage } from '@/pages/Lobby';
import { RoomPage } from '@/pages/Room';

function App() {
  return (
    <ErrorBoundary>
      <SpacetimeProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/lobby/:roomCode" element={<LobbyPage />} />
              <Route path="/room/:roomCode" element={<RoomPage />} />
              {/* Catch-all → home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </SpacetimeProvider>
    </ErrorBoundary>
  );
}

export default App;
