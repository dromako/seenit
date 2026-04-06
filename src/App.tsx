import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LookupPage from './pages/LookupPage';
import TitlePage from './pages/TitlePage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import TraktAuthPage from './pages/TraktAuthPage';
import NavBar from './components/NavBar';

function App() {
  return (
    <BrowserRouter>
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          flex: 1,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
          padding: '0 16px 80px',
        }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/lookup" element={<LookupPage />} />
            <Route path="/title/:tmdbId/:mediaType" element={<TitlePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/auth/trakt" element={<TraktAuthPage />} />
            <Route path="/auth/callback" element={<TraktAuthPage />} />
          </Routes>
        </div>
        <NavBar />
      </div>
    </BrowserRouter>
  );
}

export default App;
