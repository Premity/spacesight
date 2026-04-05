import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RunPage from './pages/RunPage';
import ResultsPage from './pages/ResultsPage';
import { AppProvider } from './context/AppContext';

function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/results" element={<ResultsPage />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}

export default App;
