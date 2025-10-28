import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile } from './UserProfile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Settings, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SettingsDialog from '@/components/chat/SettingsDialog';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleLogout = async () => {
    if (window.confirm(t('auth.confirmLogout') || '确定要登出吗？')) {
      try {
        await logout();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  if (!user) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-primary/10 transition-all duration-200"
          >
            <Avatar className="h-9 w-9 transition-transform duration-200 hover:scale-105">
              {user.user_metadata?.avatar_url ? (
                <AvatarImage 
                  src={user.user_metadata.avatar_url} 
                  alt={user.email} 
                  className="object-cover" 
                />
              ) : (
                <AvatarFallback 
                  className="bg-gradient-to-br from-primary/20 to-primary/30 text-primary font-medium"
                >
                  {user.user_metadata?.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="w-64 p-1 shadow-lg rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-muted-foreground">
              {user.email}
            </p>
          </div>
          <DropdownMenuItem 
            onClick={() => setShowProfile(true)}
            className="cursor-pointer flex items-center gap-2 rounded-md hover:bg-accent transition-colors"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            {t('user.userProfile') || '用户资料'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowSettings(true)}
            className="cursor-pointer flex items-center gap-2 rounded-md hover:bg-accent transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            {t('settings.title') || '设置'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer flex items-center gap-2 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded-md transition-colors mt-1"
          >
            <LogOut className="h-4 w-4" />
            {t('auth.logout') || '登出'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 用户资料对话框 */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('user.userProfile') || '用户资料'}</DialogTitle>
          </DialogHeader>
          <UserProfile />
        </DialogContent>
      </Dialog>

      {/* 设置对话框 */}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
};

export default UserMenu;