import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor } from 'lucide-react';
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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');

  useEffect(() => {
    // 加载发送快捷键设置
    const userSettings = settingsStorage.getSettings();
    setSendKey(userSettings.sendMessageKey);
  }, []);

  const handleSendKeyChange = (value: string) => {
    const newKey = value as 'enter' | 'ctrl-enter';
    setSendKey(newKey);
    settingsStorage.updateSettings({ sendMessageKey: newKey });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;