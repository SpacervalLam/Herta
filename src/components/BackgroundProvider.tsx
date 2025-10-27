import React, { useEffect } from 'react';
import { settingsStorage } from '@/utils/settingsStorage';

interface BackgroundProviderProps {
  children: React.ReactNode;
}

export const BackgroundProvider: React.FC<BackgroundProviderProps> = ({ children }) => {
  // 应用背景设置的函数
  const applyBackgroundSettings = () => {
    const settings = settingsStorage.getSettings();

    // 应用背景图片和透明度到body或根元素
    const rootElement = document.getElementById('root');
    if (rootElement) {
      // 设置CSS变量，这样在其他组件中也可以使用
      document.documentElement.style.setProperty('--background-image-opacity', settings.backgroundOpacity.toString());
      
      // 应用背景样式到根元素的伪元素，这样不会影响内容
      const styleId = 'background-style';
      let styleElement = document.getElementById(styleId) as HTMLStyleElement;
      
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }

      styleElement.textContent = `
        #root::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: ${settings.backgroundImage ? `url(${settings.backgroundImage})` : 'none'};
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          opacity: ${settings.backgroundOpacity};
          z-index: -1;
          pointer-events: none;
        }
      `;
    }
  };

  // 初始加载设置
  useEffect(() => {
    applyBackgroundSettings();

    // 监听设置变化事件
    const handleSettingsChange = () => {
      applyBackgroundSettings();
    };

    window.addEventListener('settings-changed', handleSettingsChange);

    // 清理事件监听
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);

  return (
    <div className="relative min-h-screen">
      {children}
    </div>
  );
};