import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { BackgroundProvider } from './components/BackgroundProvider';

import routes from './routes';

const App: React.FC = () => {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <BackgroundProvider>
        <Router>
          <div className="h-screen overflow-hidden relative z-10">
            <Routes>
              {routes.map((route, index) => (
                <Route
                  key={index}
                  path={route.path}
                  element={route.element}
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <Toaster position="top-center" richColors />
        </Router>
      </BackgroundProvider>
    </ThemeProvider>
  );
};

export default App;
