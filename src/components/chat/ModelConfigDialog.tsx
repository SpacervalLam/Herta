import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Settings, Plus, Trash2, Save, Server, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  getModelConfigs,
  addModelConfig,
  updateModelConfig,
  deleteModelConfig,
  getActiveModelId,
  setActiveModel
} from '@/utils/modelStorage';
import { ModelConfig, MODEL_PRESETS, DEFAULT_MODEL_CONFIG } from '@/types/model';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getOllamaServiceStatus,
  getOllamaModels
} from '@/services/ollamaService';
import { Card } from '@/components/ui/card';

interface ModelConfigDialogProps {
  onModelChange?: () => void;
}

export default function ModelConfigDialog({ onModelChange }: ModelConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<Partial<ModelConfig> | null>(null);
  const [isNewModel, setIsNewModel] = useState(false);
  const [isDetectingOllama, setIsDetectingOllama] = useState(false);

  useEffect(() => {
    if (open) loadModels();
  }, [open]);

  const loadModels = () => {
    const configs = getModelConfigs();
    setModels(configs);
    const activeId = getActiveModelId();
    if (activeId && configs.find(m => m.id === activeId)) {
      setSelectedModelId(activeId);
    }
  };

  const handleAddNew = () => {
    setEditingModel({
      name: '',
      modelType: 'openai',
      apiUrl: '',
      apiKey: '',
      description: '',
      ...DEFAULT_MODEL_CONFIG
    });
    setIsNewModel(true);
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = MODEL_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setEditingModel({
        name: preset.name,
        modelType: preset.modelType,
        apiUrl: preset.apiUrlPlaceholder,
        modelName: preset.modelName,
        apiKey: '',
        description: preset.description,
        ...DEFAULT_MODEL_CONFIG
      });
    }
  };

  const handleSave = () => {
    if (!editingModel || !editingModel.name || !editingModel.apiUrl) {
      toast.error('请填写必填字段');
      return;
    }

    try {
      if (isNewModel) {
        const newModel = addModelConfig(editingModel as Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>);
        toast.success('模型配置已添加');
        setActiveModel(newModel.id);
      } else if (selectedModelId) {
        updateModelConfig(selectedModelId, editingModel);
        toast.success('模型配置已更新');
      }

      loadModels();
      setEditingModel(null);
      setIsNewModel(false);
      onModelChange?.();
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个模型配置吗?')) {
      deleteModelConfig(id);
      toast.success('模型配置已删除');
      loadModels();
      if (selectedModelId === id) {
        setSelectedModelId(null);
        setEditingModel(null);
      }
      onModelChange?.();
    }
  };

  const handleEdit = (model: ModelConfig) => {
    setSelectedModelId(model.id);
    setEditingModel(model);
    setIsNewModel(false);
  };

  const handleSetActive = (id: string) => {
    setActiveModel(id);
    toast.success('已切换模型');
    onModelChange?.();
  };

  const detectOllamaModels = async () => {
    setIsDetectingOllama(true);
    try {
      const serviceStatus = await getOllamaServiceStatus();
      if (serviceStatus.isAvailable) {
        const installedModels = await getOllamaModels();
        const existingModels = getModelConfigs();
        const existingOllamaModels = existingModels.filter(m =>
          m.modelType === 'local' && m.apiUrl.includes('localhost:11434')
        );
        let addedCount = 0;
        for (const ollamaModel of installedModels) {
          const isAlreadyConfigured = existingOllamaModels.some(m => m.modelName === ollamaModel.name);
          if (!isAlreadyConfigured) {
            const newModel: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'> = {
              name: `Ollama - ${ollamaModel.name}`,
              modelType: 'local',
              apiUrl: 'http://localhost:11434/api/chat',
              modelName: ollamaModel.name,
              description: `本地Ollama模型: ${ollamaModel.name}`,
              maxTokens: 2000,
              temperature: 0.7,
              enabled: true
            };
            addModelConfig(newModel);
            addedCount++;
          }
        }
        toast.success(
          addedCount > 0
            ? `检测到 ${installedModels.length} 个Ollama模型，新增 ${addedCount} 个配置`
            : `检测到 ${installedModels.length} 个Ollama模型，均已配置`
        );
        loadModels();
      } else {
        toast.error(serviceStatus.error || 'Ollama服务未运行');
      }
    } catch (error) {
      toast.error('检测Ollama模型失败');
      console.error(error);
    } finally {
      setIsDetectingOllama(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="模型配置">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="!max-w-[1000px] w-[90vw] max-h-[95vh] h-[85vh] rounded-2xl p-6 flex flex-col">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-xl font-bold tracking-wide">模型配置管理</DialogTitle>
          <DialogDescription>配置和管理您的 AI 模型接口</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden gap-6 mt-4 flex-col sm:flex-row">
          {/* 左侧：模型列表 */}
          <Card className="w-full sm:w-72 flex-shrink-0 border rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
              <h3 className="font-semibold text-sm">已配置模型</h3>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={detectOllamaModels}
                  disabled={isDetectingOllama}
                >
                  {isDetectingOllama ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                </Button>
                <Button size="icon" variant="outline" onClick={handleAddNew}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-3">
              {models.length ? (
                <div className="space-y-2">
                  {models.map(model => {
                    const isActive = getActiveModelId() === model.id;
                    const isSelected = selectedModelId === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() => handleEdit(model)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-sm'
                            : 'hover:bg-accent/50 border-muted'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-sm truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {model.modelType}
                            </div>
                            {isActive && (
                              <div className="text-xs text-primary mt-1 font-medium">✓ 当前使用</div>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={e => {
                              e.stopPropagation();
                              handleDelete(model.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  暂无配置的模型
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* 右侧：编辑表单 */}
          <Card className="flex-1 overflow-hidden border rounded-xl shadow-sm">
            {editingModel ? (
              <ScrollArea className="h-full p-6">
                <div className="space-y-5">
                  {isNewModel && (
                    <div className="space-y-2">
                      <Label>选择预设模板</Label>
                      <Select onValueChange={handleSelectPreset}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择一个预设模板..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MODEL_PRESETS.map(preset => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>模型名称 *</Label>
                      <Input
                        value={editingModel.name || ''}
                        onChange={e => setEditingModel({ ...editingModel, name: e.target.value })}
                        placeholder="例如: GPT-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>模型类型</Label>
                      <Select
                        value={editingModel.modelType}
                        onValueChange={v => setEditingModel({ ...editingModel, modelType: v as any })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="claude">Claude</SelectItem>
                          <SelectItem value="gemini">Gemini</SelectItem>
                          <SelectItem value="baidu">百度文心</SelectItem>
                          <SelectItem value="local">本地模型</SelectItem>
                          <SelectItem value="custom">自定义</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>API地址 *</Label>
                      <Input
                        value={editingModel.apiUrl || ''}
                        onChange={e => setEditingModel({ ...editingModel, apiUrl: e.target.value })}
                        placeholder="https://"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API密钥</Label>
                      <Input
                        type="password"
                        value={editingModel.apiKey || ''}
                        onChange={e => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                        placeholder="API Key"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>描述</Label>
                    <Textarea
                      value={editingModel.description || ''}
                      onChange={e => setEditingModel({ ...editingModel, description: e.target.value })}
                      placeholder="模型描述..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>最大Token数</Label>
                      <Input
                        type="number"
                        value={editingModel.maxTokens || ''}
                        onChange={e => setEditingModel({ ...editingModel, maxTokens: parseInt(e.target.value) })}
                        placeholder="2000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>温度 (0-2)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={editingModel.temperature || ''}
                        onChange={e => setEditingModel({ ...editingModel, temperature: parseFloat(e.target.value) })}
                        placeholder="0.7"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>启用状态</Label>
                      <div className="flex items-center h-10 space-x-2">
                        <Switch
                          checked={editingModel.enabled}
                          onCheckedChange={checked => setEditingModel({ ...editingModel, enabled: checked })}
                        />
                        <span className="text-sm">{editingModel.enabled ? '已启用' : '已禁用'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button onClick={handleSave} className="flex-1">
                      <Save className="h-4 w-4 mr-2" /> 保存配置
                    </Button>
                    {!isNewModel && selectedModelId && (
                      <Button variant="outline" onClick={() => handleSetActive(selectedModelId)}>
                        设为当前模型
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="text-3xl mb-2">🧩</div>
                <div className="text-sm">选择一个模型进行编辑</div>
                <div className="text-xs mt-1">或点击「新增」添加新模型</div>
              </div>
            )}
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
