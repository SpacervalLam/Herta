import React, { useState } from 'react';
import { LoginForm } from '@/components/Auth/LoginForm';
import { RegisterForm } from '@/components/Auth/RegisterForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t, i18n: instance } = useTranslation();

  const toggleLanguage = () => {
    const newLang = instance.language === 'zh' ? 'en' : 'zh';
    instance.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  // 如果用户已经认证，重定向到聊天页面
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat');
    }
  }, [isAuthenticated, navigate]);

  const handleAuthSuccess = () => {
    navigate('/chat');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* 语言切换按钮 */}
      <button
        onClick={toggleLanguage}
        className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/20 dark:bg-gray-800/50 backdrop-blur-sm text-sm font-medium text-gray-800 dark:text-white hover:bg-white/30 dark:hover:bg-gray-700/50 transition-colors"
      >
        {instance.language === 'zh' ? 'EN' : '中文'}
      </button>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {isLoginMode ? t('auth.welcomeBack') : t('auth.createAccount')}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {isLoginMode 
              ? t('auth.loginDesc') 
              : t('auth.registerDesc')}
          </p>
        </div>

        {isLoginMode ? (
          <>
            <LoginForm onSuccess={handleAuthSuccess} />
            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLoginMode(false)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm"
              >
                {t('auth.noAccount')}
              </button>
            </div>
          </>
        ) : (
          <>
            <RegisterForm onSuccess={handleAuthSuccess} />
            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLoginMode(true)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm"
              >
                {t('auth.hasAccount')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};