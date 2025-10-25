import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getEnabledModels, getActiveModelId, setActiveModel } from '@/utils/modelStorage';
import { ModelConfig } from '@/types/model';
import { toast } from 'sonner';

interface ModelSelectorProps {
  onModelChange?: () => void;
}

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  const loadModels = () => {
    const enabledModels = getEnabledModels();
    setModels(enabledModels);
    const currentActiveId = getActiveModelId();
    setActiveModelId(currentActiveId);
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleModelChange = (modelId: string) => {
    setActiveModel(modelId);
    setActiveModelId(modelId);
    const model = models.find(m => m.id === modelId);
    if (model) {
      toast.success(t('model.switchTo', { name: model.name }));
    }
    onModelChange?.();
  };

  if (models.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('model.noModels')}
      </div>
    );
  }

  // 获取当前选中的模型对象
  const activeModel = models.find(m => m.id === activeModelId);

  return (
    <Select value={activeModelId || undefined} onValueChange={handleModelChange}>
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