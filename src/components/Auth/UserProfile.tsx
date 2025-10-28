import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone';
import { useSupabaseUpload } from '@/hooks/use-supabase-upload';
import { supabase } from '@/services/supabaseService';

export const UserProfile: React.FC = () => {
  const { user, updateProfile, logout } = useAuth();
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string>('');

  // 使用supabase上传功能
  const { 
    files, 
    setFiles, 
    onUpload, 
    loading: isUploading, 
    isSuccess: uploadSuccess 
  } = useSupabaseUpload({
    bucketName: 'avatars',
    path: `users/${user?.id}`,
    allowedMimeTypes: ['image/*'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
    supabase
  });

  // 处理头像上传成功后的逻辑
  React.useEffect(() => {
    if (uploadSuccess && files.length > 0) {
      // 生成Supabase CDN URL
      const fileUrl = supabase.storage
        .from('avatars')
        .getPublicUrl(`users/${user?.id}/${files[0].name}`)
        .data?.publicUrl;
      
      if (fileUrl) {
        setUploadedAvatarUrl(fileUrl);
      }
    }
  }, [uploadSuccess, files, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 如果有新上传的头像，使用上传后的URL
      const finalAvatarUrl = uploadedAvatarUrl || avatarUrl;
      await updateProfile({ name, avatar_url: finalAvatarUrl });
      setIsEditing(false);
      setUploadedAvatarUrl(''); // 重置上传状态
      setFiles([]); // 清空文件列表
      toast.success('个人资料已更新');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('更新个人资料失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm(t('user.confirmLogout') || '确定要登出吗？')) {
      try {
        await logout();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  // 处理取消编辑时重置状态
  const handleCancelEdit = () => {
    setIsEditing(false);
    setName(user?.user_metadata?.name || '');
    setAvatarUrl(user?.user_metadata?.avatar_url || '');
    setUploadedAvatarUrl(''); // 重置上传状态
    setFiles([]); // 清空文件列表
  };

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto w-full">
      {/* 完全移除卡片式设计，采用现代简约的一体化布局 */}
      
      {/* 用户信息区域 */}
      <div className="relative overflow-hidden">
        {/* 渐变背景，更加柔和自然 */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/15 dark:from-primary/2 dark:to-primary/8" />
        
        {/* 内容容器 */}
        <div className="relative p-8 flex flex-col items-center text-center">
          {/* 头像 */}
          <div className="w-28 h-28 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-md mb-6 transition-all duration-300 hover:scale-105">
            {uploadedAvatarUrl || avatarUrl ? (
              <img 
                src={uploadedAvatarUrl || avatarUrl} 
                alt="User avatar" 
                className="w-full h-full object-cover" 
              />
            ) : (
              <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">
                {user.user_metadata?.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            )}
          </div>
          
          {/* 用户名和邮箱 */}
          <div className="space-y-2 w-full">
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-center py-3 px-4 text-lg font-medium border border-gray-200 dark:border-gray-700 rounded-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary dark:text-white transition-all"
                placeholder={t('user.enterName') || '输入您的用户名'}
              />
            ) : (
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.user_metadata?.name || (t('user.unnamed') || '未设置用户名')}
              </h2>
            )}
            <p className="text-gray-600 dark:text-gray-400 text-base">{user.email}</p>
          </div>
        </div>
      </div>

      {/* 操作区域 - 完全移除卡片感，更自然地过渡 */}
      <div className="p-6 space-y-6">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 头像上传 */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('user.uploadAvatar') || '上传头像'}
              </label>
              <Dropzone
                {...{
                  files,
                  setFiles,
                  onUpload,
                  loading: isUploading,
                  successes: [],
                  errors: [],
                  setErrors: () => {},
                  isSuccess: uploadSuccess,
                  maxFileSize: 5 * 1024 * 1024,
                  maxFiles: 1,
                  allowedMimeTypes: ['image/*'],
                  getRootProps: (props) => props,
                  getInputProps: (props) => props,
                  inputRef: { current: null },
                  isDragActive: false,
                  isDragAccept: false,
                  isDragReject: false,
                  isFocused: false,
                  isFileDialogActive: false,
                  acceptedFiles: [],
                  fileRejections: [],
                  open: () => {},
                  accept: { 'image/*': [] },
                  multiple: false,
                  disabled: false,
                  onDrop: () => {},
                  onDropAccepted: () => {},
                  onDropRejected: () => {},
                  onDragOver: () => {},
                  onDragEnter: () => {},
                  onDragLeave: () => {},
                  rootRef: React.useRef<HTMLElement>(null)
                }}
                className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center bg-white dark:bg-gray-800 hover:border-primary/50 transition-all"
              >
                {files.length > 0 ? (
                  <DropzoneContent />
                ) : (
                  <DropzoneEmptyState />
                )}
              </Dropzone>
              
              {/* 显示上传后的头像预览 */}
              {(uploadedAvatarUrl) && (
                <div className="flex justify-center mt-2">
                  <img 
                    src={uploadedAvatarUrl} 
                    alt="Avatar preview" 
                    className="w-20 h-20 rounded-full object-cover border-2 border-primary"
                  />
                </div>
              )}
            </div>

            {/* 按钮区域 */}
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex-1 py-3 px-6 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {t('user.save') || '保存'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 py-3 px-6 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                {t('user.cancel') || '取消'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex space-x-4">
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-3 px-6 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all"
            >
              {t('user.editProfile') || '编辑资料'}
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-3 px-6 bg-gray-100 text-red-600 dark:bg-gray-700 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            >
              {t('user.logout') || '登出'}
            </button>
          </div>
        )}

        {/* 账户信息 */}
        <div className="pt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center">
            {t('user.accountCreated') || '账户创建于'}: {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
};