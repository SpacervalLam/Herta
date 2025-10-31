// 用户设置存储管理

export interface UserSettings {
  // 发送消息快捷键设置
  sendMessageKey: 'enter' | 'ctrl-enter';
  // 背景设置
  backgroundImage?: string; // 背景图片URL
  backgroundOpacity: number; // 背景透明度 (0-1)
}

const SETTINGS_KEY = 'ai-chat-user-settings';

const defaultSettings: UserSettings = {
  sendMessageKey: 'ctrl-enter', // 默认Ctrl+Enter发送
  backgroundOpacity: 1, // 默认完全不透明
};

// 获取设置
export const getSettings = (): UserSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      // 合并默认设置和保存的设置
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('读取用户设置失败:', error);
  }
  return { ...defaultSettings };
};

// 保存设置
export const saveSettings = (settings: UserSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('保存用户设置失败:', error);
  }
};
