import { createContext, useState } from 'react';

export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [results, setResults] = useState(null);
  
  const clearResults = () => {
    setResults(null);
  };

  return (
    <AppContext.Provider value={{ results, setResults, clearResults }}>
        {children}
    </AppContext.Provider>
  );
};
