import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AnalyzePage from './pages/AnalyzePage';
import ResultsPage from './pages/ResultsPage';
import { AppProvider } from './context/AppContext';
import StarField from './components/ui/StarField';

function App() {
  return (
    <AppProvider>
      <StarField />
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/results" element={<ResultsPage />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}

export default App;
