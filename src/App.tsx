import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { BackgroundProvider } from './components/BackgroundProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import routes from './routes';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // 可以在这里添加加载指示器
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <BackgroundProvider>
          <Router>
            <div className="h-screen overflow-hidden relative z-10">
              <Routes>
                <Route path="/auth" element={routes.find(r => r.path === '/auth')?.element} />
                <Route path="/chat" element={
                  <ProtectedRoute>
                    {routes.find(r => r.path === '/chat')?.element}
                  </ProtectedRoute>
                } />
                <Route path="/" element={
                  <ProtectedRoute>
                    {routes.find(r => r.path === '/')?.element}
                  </ProtectedRoute>
                } />
                <Route path="*" element={<Navigate to="/auth" replace />} />
              </Routes>
            </div>
            <Toaster position="top-center" richColors />
          </Router>
        </BackgroundProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
