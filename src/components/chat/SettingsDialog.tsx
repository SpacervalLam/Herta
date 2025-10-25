import { useState, useEffect } from 'react';
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
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            自定义你的AI对话界面
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">主题</Label>
            <RadioGroup value={theme} onValueChange={setTheme}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
                  <Sun className="h-4 w-4" />
                  浅色
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
                  <Moon className="h-4 w-4" />
                  深色
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="system" id="system" />
                <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  跟随系统
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 发送消息快捷键设置 */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">发送消息快捷键</Label>
            <RadioGroup value={sendKey} onValueChange={handleSendKeyChange}>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="ctrl-enter" id="send-ctrl-enter" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="send-ctrl-enter" className="cursor-pointer">
                    <div className="font-medium">Ctrl + Enter 发送</div>
                    <div className="text-sm text-muted-foreground">Enter 键换行</div>
                  </Label>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="enter" id="send-enter" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="send-enter" className="cursor-pointer">
                    <div className="font-medium">Enter 发送</div>
                    <div className="text-sm text-muted-foreground">Shift + Enter 换行</div>
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
