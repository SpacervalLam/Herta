import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor, Upload, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTheme } from 'next-themes';
import { settingsStorage } from '@/utils/settingsStorage';
// Input组件已移除，不再需要导入
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(1);
  const [previewImage, setPreviewImage] = useState<string>('');
  
  // 使用useState仅获取setBackgroundImage方法来更新设置
  const [, setBackgroundImage] = useState<string>('');
  
  // 背景图片相关状态管理已通过直接创建DOM元素实现

  useEffect(() => {
    // 加载所有设置
    const userSettings = settingsStorage.getSettings();
    setSendKey(userSettings.sendMessageKey);
    setBackgroundImage(userSettings.backgroundImage || '');
    setBackgroundOpacity(userSettings.backgroundOpacity);
    setPreviewImage(userSettings.backgroundImage || '');
  }, []);

  const handleSendKeyChange = (value: string) => {
    const newKey = value as 'enter' | 'ctrl-enter';
    setSendKey(newKey);
    settingsStorage.updateSettings({ sendMessageKey: newKey });
  };
  
  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setBackgroundImage(base64String);
        setPreviewImage(base64String);
        settingsStorage.updateSettings({ backgroundImage: base64String });
      };
      reader.readAsDataURL(file);
    }
    // 文件上传后自动重置，不需要额外处理
  };
  
  // 处理移除背景图片
  const handleRemoveBackground = () => {
    setBackgroundImage('');
    setPreviewImage('');
    settingsStorage.updateSettings({ backgroundImage: undefined });
  };
  
  // 处理透明度变化
  const handleOpacityChange = (value: number) => {
    setBackgroundOpacity(value);
    settingsStorage.updateSettings({ backgroundOpacity: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-background/90 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">{t('settings.theme')}</Label> {/* 修改 */}
            <RadioGroup value={theme} onValueChange={setTheme}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
                  <Sun className="h-4 w-4" />
                  {t('settings.light')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
                  <Moon className="h-4 w-4" />
                  {t('settings.dark')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="system" id="system" />
                <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  {t('settings.system')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 发送消息快捷键设置 */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">{t('settings.sendMessageKey')}</Label>
            <RadioGroup value={sendKey} onValueChange={handleSendKeyChange}>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="ctrl-enter" id="send-ctrl-enter" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="send-ctrl-enter" className="cursor-pointer">
                    <div className="font-medium">{t('settings.ctrlEnterSend')}</div>
                    <div className="text-sm text-muted-foreground">{t('settings.enterNewline')}</div>
                  </Label>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="enter" id="send-enter" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="send-enter" className="cursor-pointer">
                    <div className="font-medium">{t('settings.enterSend')}</div>
                    <div className="text-sm text-muted-foreground">{t('settings.shiftEnterNewline')}</div>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>
          
          {/* 背景设置 */}
          <div className="space-y-6 pt-4 border-t">
            <Label className="text-base font-semibold">{t('settings.background')}</Label>
            
            {/* 背景图片上传 */}
            <div className="space-y-3">
              <Label htmlFor="background-image">{t('settings.backgroundImage')}</Label>
              <div className="space-y-3">
                {/* 图片预览区 */}
                {previewImage ? (
                  <Card className="overflow-hidden">
                    <div className="relative h-40">
                      <img 
                        src={previewImage} 
                        alt={t('settings.backgroundPreview')} 
                        className="w-full h-full object-cover" 
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                        onClick={handleRemoveBackground}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg p-6 text-center">
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('settings.uploadBackgroundImage')}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('settings.supportedFormats')}
                    </p>
                    <Button 
                      variant="secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        // 直接创建一个临时的input元素，避免依赖Input组件的ref转发问题
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = 'image/*';
                        fileInput.style.display = 'none';
                        fileInput.onchange = (e) => {
                          const target = e.target as HTMLInputElement;
                          handleImageUpload({target} as React.ChangeEvent<HTMLInputElement>);
                        };
                        document.body.appendChild(fileInput);
                        fileInput.click();
                        // 清理临时元素
                        fileInput.onclick = () => {
                          setTimeout(() => document.body.removeChild(fileInput), 0);
                        };
                      }}
                    >
                      {t('settings.selectImage')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* 透明度调节 */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label htmlFor="opacity-slider">
                  {t('settings.backgroundOpacity')} ({Math.round(backgroundOpacity * 100)}%)
                </Label>
              </div>
              <Slider
                id="opacity-slider"
                value={[backgroundOpacity]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(value) => handleOpacityChange(value[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('settings.transparent')}</span>
                <span>{t('settings.opaque')}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;