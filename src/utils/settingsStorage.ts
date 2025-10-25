// 用户设置存储管理

export interface UserSettings {
  // 发送消息快捷键设置
  sendMessageKey: 'enter' | 'ctrl-enter';
}

const SETTINGS_KEY = 'ai-chat-user-settings';

const defaultSettings: UserSettings = {
  sendMessageKey: 'ctrl-enter', // 默认Ctrl+Enter发送
};

export const settingsStorage = {
  // 获取用户设置
  getSettings(): UserSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        const settings = JSON.parse(data);
        return { ...defaultSettings, ...settings };
      }
    } catch (error) {
      console.error('读取用户设置失败:', error);
    }
    return defaultSettings;
  },

  // 保存用户设置
  saveSettings(settings: UserSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      // 触发自定义事件，通知其他组件设置已更改
      window.dispatchEvent(new Event('settings-changed'));
    } catch (error) {
      console.error('保存用户设置失败:', error);
    }
  },

  // 更新部分设置
  updateSettings(partial: Partial<UserSettings>): void {
    const current = this.getSettings();
    this.saveSettings({ ...current, ...partial });
  },

  // 重置为默认设置
  resetSettings(): void {
    this.saveSettings(defaultSettings);
  },
};
