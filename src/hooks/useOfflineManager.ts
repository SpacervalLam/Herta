import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// 定义迁移状态接口（保持兼容性）
export interface MigrationStatus {
  isMigrating: boolean;
  progress: number;
  total: number;
  lastError: string | null;
  completed: boolean;
}

// 定义对话和消息的接口（保持兼容性）
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: any[];
}

export interface LocalConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: LocalMessage[];
}

/**
 * 简化版的离线管理器钩子
 * 当前版本不支持离线功能，强制用户联网使用
 */
export const useOfflineManager = () => {
  // 始终假定在线
  const [isOnline] = useState(true); // 已移除未使用的setIsOnline
  
  // 迁移状态（空实现）
  const [migrationStatus] = useState<MigrationStatus>({
    isMigrating: false,
    progress: 0,
    total: 0,
    lastError: null,
    completed: true // 标记为已完成，避免触发实际迁移
  });

  // 监听网络状态变化，但不再用于离线功能
  useEffect(() => {
    const handleOffline = () => {
      // 当检测到离线时，显示提示
      toast.error('网络连接已断开。此应用需要网络连接才能使用。');
    };

    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 保存离线数据（空实现）
  const saveOfflineData = useCallback(() => {
    console.warn('离线功能当前不可用，请确保网络连接正常。');
  }, []);

  // 获取离线数据（空实现）
  const getOfflineData = useCallback(() => {
    console.warn('离线功能当前不可用，请确保网络连接正常。');
    return null;
  }, []);

  // 同步离线变更到数据库（空实现）
  const syncOfflineChanges = useCallback(async () => {
    console.warn('离线功能当前不可用，请确保网络连接正常。');
  }, []);

  // 检查并迁移localStorage中的历史数据（空实现）
  const migrateLocalStorageData = useCallback(async () => {
    console.warn('数据迁移功能当前已弃用。所有数据现在直接保存到数据库中。');
    return true;
  }, []);

  // 记录离线变更（空实现）
  const recordOfflineChange = useCallback(() => {
    console.warn('离线功能当前不可用，请确保网络连接正常。');
    return false;
  }, []);

  // 清理localStorage中的历史数据（空实现）
  const clearLocalStorageData = useCallback(() => {
    return true;
  }, []);

  return {
    isOnline,
    saveOfflineData,
    getOfflineData,
    syncOfflineChanges,
    migrateLocalStorageData,
    migrationStatus,
    recordOfflineChange,
    clearLocalStorageData
  };
};