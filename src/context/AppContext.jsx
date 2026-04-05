import { createContext, useState } from 'react';

export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [results, setResults] = useState(null);

  return (
    <AppContext.Provider value={{ results, setResults }}>
        {children}
    </AppContext.Provider>
  );
};
