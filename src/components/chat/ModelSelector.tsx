import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getEnabledModels, getActiveModelId, setActiveModelId } from '@/utils/modelStorage';
import { ModelConfig } from '@/types/model';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface ModelSelectorProps {
  onModelChange?: () => void;
}

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [currentActiveModelId, setCurrentActiveModelId] = useState<string | null>(null);

  const loadModels = async () => {
    if (!user?.id) return;
    
    try {
      const enabledModels = await getEnabledModels(user.id);
      setModels(enabledModels);
      const currentActiveId = await getActiveModelId(user.id);
      setCurrentActiveModelId(currentActiveId);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  useEffect(() => {
    loadModels();
  }, [user?.id]);

  const handleModelChange = async (modelId: string) => {
    if (!user?.id) {
      toast.error(t('error.notLoggedIn'));
      return;
    }
    
    try {
      await setActiveModelId(modelId, user.id);
      setCurrentActiveModelId(modelId);
      const model = models.find(m => m.id === modelId);
      if (model) {
        toast.success(t('model.switchTo', { name: model.name }));
      }
      onModelChange?.();
    } catch (error) {
      console.error('Failed to switch model:', error);
      toast.error(t('error.unknownError'));
    }
  };

  if (models.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('model.noModels')}
      </div>
    );
  }

  // 获取当前选中的模型对象
  const activeModel = models.find(m => m.id === currentActiveModelId);

  return (
    <Select value={currentActiveModelId || undefined} onValueChange={handleModelChange}>
      <SelectTrigger className="w-[200px]">
        {/*只显示模型名称，不显示描述 */}
        <SelectValue placeholder={t('model.selectModel')}>
          {activeModel ? activeModel.name : t('model.selectModel')}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {models.map(model => (
          <SelectItem key={model.id} value={model.id}>
            {/*下拉列表中显示名称 + 描述 */}
            <div className="flex flex-col">
              <span>{model.name}</span>
              {model.description && (
                <span className="text-xs text-muted-foreground">{model.description}</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}