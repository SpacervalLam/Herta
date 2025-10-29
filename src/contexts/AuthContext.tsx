import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/services/supabaseService';
import type { User, Session } from '@supabase/supabase-js';

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

  // 确保用户资料在users表中存在
  const ensureUserProfileExists = async (userId: string, email?: string, name?: string) => {
    try {
      // 检查用户是否已存在
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (findError && findError.code !== 'PGRST116') { // PGRST116表示记录不存在
        throw findError;
      }

      // 如果用户不存在，创建用户记录
      if (!existingUser) {
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email,
            name: name || email?.split('@')[0],
            created_at: new Date(),
            updated_at: new Date()
          });

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Failed to ensure user profile exists:', error);
    }
  };

  // 初始化时检查用户会话
  React.useEffect(() => {
    const checkUserSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user || null);
        
        // 确保用户资料在数据库中存在
        if (data.session?.user) {
          await ensureUserProfileExists(
            data.session.user.id,
            data.session.user.email,
            data.session.user.user_metadata?.name
          );
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
      
      // 确保用户资料在数据库中存在
      if (session?.user) {
        ensureUserProfileExists(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.name
        );
      }
      
      setIsLoading(false);
    });

    return () => subscription.data.subscription.unsubscribe();
  }, []);

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

      // 确保用户资料在数据库中存在
      if (data?.session?.user) {
        try {
          await ensureUserProfileExists(
            data.session.user.id,
            data.session.user.email,
            data.session.user.user_metadata?.name
          );
        } catch (profileError) {
          console.error('创建用户资料失败，但登录成功:', profileError);
          // 不抛出错误，因为登录本身是成功的
        }
      }

      toast.success('登录成功！');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

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

      // 确保用户资料在数据库中存在（如果已自动登录）
      if (data?.session?.user) {
        try {
          await ensureUserProfileExists(
            data.session.user.id,
            data.session.user.email,
            data.session.user.user_metadata?.name
          );
        } catch (profileError) {
          console.error('创建用户资料失败，但注册成功:', profileError);
          // 不抛出错误，因为注册本身是成功的
        }
      }

      toast.success('注册成功！请检查您的邮箱进行验证。');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 登出功能
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        throw error;
      }

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
    if (!user) {
      throw new Error('用户未登录');
    }
    
    setIsLoading(true);
    try {
      // 更新Supabase Auth用户信息
      const { error: authError } = await supabase.auth.updateUser({
        data,
      });

      if (authError) {
        toast.error(authError.message);
        throw authError;
      }

      // 同时更新users表中的用户资料
      const { error: dbError } = await supabase
        .from('users')
        .update({
          name: data.name,
          avatar_url: data.avatar_url,
          updated_at: new Date()
        })
        .eq('id', user.id);

      if (dbError) {
        console.error('Failed to update user profile in database:', dbError);
        // 这里不抛出错误，因为Auth更新已经成功
      }

      toast.success('个人资料已更新');
    } catch (error) {
      console.error('Update profile error:', error);
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
    migrateData: async () => {
      toast.info('已不再需要数据迁移，所有数据直接保存到数据库');
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};