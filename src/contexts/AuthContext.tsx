import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/services/supabaseService';
import type { User, Session } from '@supabase/supabase-js';
import { useOfflineManager } from '@/hooks/useOfflineManager';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; avatar_url?: string }) => Promise<void>;
  migrateData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasMigrated, setHasMigrated] = React.useState(false);
  const { migrateLocalStorageData } = useOfflineManager();

  // 处理数据迁移
  const handleDataMigration = async (userId: string) => {
    try {
      await migrateLocalStorageData(userId);
      setHasMigrated(true);
    } catch (error) {
      console.error('Data migration error:', error);
    }
  };

  // 初始化时检查用户会话
  React.useEffect(() => {
    const checkUserSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user || null);
        
        // 自动迁移数据（首次登录时）
        if (data.session?.user && !hasMigrated) {
          await handleDataMigration(data.session.user.id);
        }
      } catch (error) {
        console.error('Error checking user session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserSession();

    // 监听认证状态变化
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      
      // 自动迁移数据（首次登录时）
      if (session?.user && !hasMigrated) {
        handleDataMigration(session.user.id);
      } else if (!session) {
        setHasMigrated(false); // 登出后重置迁移状态
      }
      
      setIsLoading(false);
    });

    return () => subscription.data.subscription.unsubscribe();
  }, [hasMigrated, migrateLocalStorageData]);

  // 登录功能
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // 确保输入有效性检查
      if (!email || !password) {
        toast.error('邮箱和密码不能为空');
        throw new Error('邮箱和密码不能为空');
      }
      
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        throw error;
      }

      // 登录成功后自动迁移数据
      if (data?.session?.user && !hasMigrated) {
        try {
          await handleDataMigration(data.session.user.id);
        } catch (migrationError) {
          console.error('数据迁移失败，但登录成功:', migrationError);
          // 不抛出迁移错误，因为登录本身是成功的
        }
      }

      toast.success('登录成功！');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [hasMigrated]);

  // 注册功能
  const register = useCallback(async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      // 确保输入有效性检查
      if (!email || !password) {
        toast.error('邮箱和密码不能为空');
        throw new Error('邮箱和密码不能为空');
      }
      
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (error) {
        toast.error(error.message);
        throw error;
      }

      // 注册成功后如果已自动登录，尝试迁移数据
      if (data?.session?.user && !hasMigrated) {
        try {
          await handleDataMigration(data.session.user.id);
        } catch (migrationError) {
          console.error('数据迁移失败，但注册成功:', migrationError);
          // 不抛出迁移错误，因为注册本身是成功的
        }
      }

      toast.success('注册成功！请检查您的邮箱进行验证。');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [hasMigrated]);

  // 登出功能
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        throw error;
      }
      setHasMigrated(false); // 登出后重置迁移状态
      toast.success('已成功登出');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 更新用户资料
  const updateProfile = useCallback(async (data: { name?: string; avatar_url?: string }) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data,
      });

      if (error) {
        toast.error(error.message);
        throw error;
      }

      toast.success('个人资料已更新');
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 手动触发数据迁移
  const migrateData = useCallback(async () => {
    if (!user) {
      throw new Error('用户未登录');
    }

    try {
      setIsLoading(true);
      await handleDataMigration(user.id);
      toast.success('数据迁移成功！');
    } catch (error) {
      console.error('Manual data migration error:', error);
      toast.error('数据迁移失败');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateProfile,
    migrateData
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};