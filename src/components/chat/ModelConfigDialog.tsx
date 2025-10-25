import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Settings, Plus, Trash2, Save, Server, RefreshCw, ChevronDown, ChevronRight, Code } from 'lucide-react';
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<Partial<ModelConfig> | null>(null);
  const [isNewModel, setIsNewModel] = useState(false);
  const [isDetectingOllama, setIsDetectingOllama] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

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
      toast.error(t('model.requiredFields'));
      return;
    }

    try {
      if (isNewModel) {
        const newModel = addModelConfig(editingModel as Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>);
        toast.success(t('model.saveSuccess'));
        setActiveModel(newModel.id);
      } else if (selectedModelId) {
        updateModelConfig(selectedModelId, editingModel);
        toast.success(t('model.saveSuccess'));
      }

      loadModels();
      setEditingModel(null);
      setIsNewModel(false);
      onModelChange?.();
    } catch {
      toast.error(t('error.unknownError'));
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(t('model.deleteConfirm'))) {
      deleteModelConfig(id);
      toast.success(t('model.deleteSuccess'));
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
    toast.success(t('model.switchSuccess'));
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
              description: `${t('model.ollamaDescriptionPrefix')} ${ollamaModel.name}`,
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
            ? t('model.detectOllamaAdded', { total: installedModels.length, added: addedCount })
            : t('model.detectOllamaAllConfigured', { total: installedModels.length })
        );
        loadModels();
      } else {
        toast.error(serviceStatus.error || t('error.ollamaNotRunning'));
      }
    } catch (error) {
      toast.error(t('error.detectOllamaFailed'));
      console.error(error);
    } finally {
      setIsDetectingOllama(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t('model.config')}>
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="!max-w-[1000px] w-[90vw] max-h-[95vh] h-[85vh] rounded-2xl p-6 flex flex-col">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-xl font-bold tracking-wide">{t('model.management')}</DialogTitle>
          <DialogDescription>{t('model.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden gap-6 mt-4 flex-col sm:flex-row">
          {/* 左侧：模型列表 */}
          <Card className="w-full sm:w-72 flex-shrink-0 border rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
              <h3 className="font-semibold text-sm">{t('model.configured')}</h3>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={detectOllamaModels}
                  disabled={isDetectingOllama}
                  title={t('model.detectOllama')}
                >
                  {isDetectingOllama ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                </Button>
                <Button size="icon" variant="outline" onClick={handleAddNew} title={t('model.addNew')}>
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
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected
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
                              <div className="text-xs text-primary mt-1 font-medium">{t('model.currentModel')}</div>
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
                  {t('model.noModels')}
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
                      <Label>{t('model.selectPreset')}</Label>
                      <Select onValueChange={handleSelectPreset}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('model.selectPresetPlaceholder')} />
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
                      <Label>{t('model.name')} *</Label>
                      <Input
                        value={editingModel.name || ''}
                        onChange={e => setEditingModel({ ...editingModel, name: e.target.value })}
                        placeholder={t('model.namePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('model.type')}</Label>
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
                      <Label>{t('model.apiUrl')} *</Label>
                      <Input
                        value={editingModel.apiUrl || ''}
                        onChange={e => setEditingModel({ ...editingModel, apiUrl: e.target.value })}
                        placeholder="https://"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('model.apiKey')}</Label>
                      <Input
                        type="password"
                        value={editingModel.apiKey || ''}
                        onChange={e => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                        placeholder="API Key"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modelName">{t('model.modelIdentifier')}</Label>
                    <Input
                      id="modelName"
                      value={editingModel?.modelName || ''}
                      onChange={(e) => setEditingModel({ ...editingModel, modelName: e.target.value })}
                      placeholder={t('model.modelIdentifierPlaceholder')} // 例如: gpt-4, llama3
                    />
                    <p className="text-xs text-muted-foreground">{t('model.modelIdentifierHelp')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('model.descriptionLabel')}</Label>
                    <Textarea
                      value={editingModel.description || ''}
                      onChange={e => setEditingModel({ ...editingModel, description: e.target.value })}
                      placeholder={t('model.descriptionPlaceholder')}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>{t('model.maxTokens')}</Label>
                      <Input
                        type="number"
                        value={editingModel.maxTokens || ''}
                        onChange={e => setEditingModel({ ...editingModel, maxTokens: parseInt(e.target.value) })}
                        placeholder="2000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('model.temperature')}</Label>
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
                      <Label>{t('model.enabled')}</Label>
                      <div className="flex items-center h-10 space-x-2">
                        <Switch
                          checked={editingModel.enabled}
                          onCheckedChange={checked => setEditingModel({ ...editingModel, enabled: checked })}
                        />
                        <span className="text-sm">{editingModel.enabled ? t('model.enabled') : t('model.disabled')}</span>
                      </div>
                    </div>
                  </div>

                  {/* 高级配置部分 */}
                  <div className="border-t pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-between p-0 h-auto"
                      onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                    >
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        <span className="font-medium">{t('model.advancedConfig')}</span>
                      </div>
                      {showAdvancedConfig ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>

                    {showAdvancedConfig && (
                      <div className="mt-4 space-y-4">
                        {/* 多模态支持 */}
                        <div className="space-y-2">
                          <Label>{t('model.supportsMultimodal')}</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={editingModel.supportsMultimodal || false}
                              onCheckedChange={checked => 
                                setEditingModel({ ...editingModel, supportsMultimodal: checked })
                              }
                            />
                            <span className="text-sm text-muted-foreground">
                              {t('model.supportsMultimodalHelp')}
                            </span>
                          </div>
                        </div>

                        {/* 自定义请求配置 */}
                        <div className="space-y-2">
                          <Label>{t('model.customRequestBody')}</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={editingModel.customRequestConfig?.enabled || false}
                              onCheckedChange={checked => {
                                const customConfig = editingModel.customRequestConfig || {
                                  enabled: false,
                                  requestBodyTemplate: '',
                                  headers: {},
                                  responseParser: {
                                    contentPath: 'choices[0].message.content',
                                    errorPath: 'error.message',
                                    usagePath: 'usage'
                                  }
                                };
                                setEditingModel({ 
                                  ...editingModel, 
                                  customRequestConfig: { ...customConfig, enabled: checked }
                                });
                              }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {t('model.customRequestBodyHelp')}
                            </span>
                          </div>
                        </div>

                        {/* 自定义请求体配置详情 */}
                        {editingModel.customRequestConfig?.enabled && (
                          <div className="space-y-4 pl-4 border-l-2 border-muted">
                            {/* 请求体模板 */}
                            <div className="space-y-2">
                              <Label>{t('model.requestBodyTemplate')}</Label>
                              <Textarea
                                value={editingModel.customRequestConfig?.requestBodyTemplate || ''}
                                onChange={e => {
                                  const customConfig = editingModel.customRequestConfig || {
                                    enabled: true,
                                    requestBodyTemplate: '',
                                    headers: {},
                                    responseParser: {
                                      contentPath: 'choices[0].message.content',
                                      errorPath: 'error.message',
                                      usagePath: 'usage'
                                    }
                                  };
                                  setEditingModel({
                                    ...editingModel,
                                    customRequestConfig: {
                                      ...customConfig,
                                      requestBodyTemplate: e.target.value
                                    }
                                  });
                                }}
                                placeholder={`{
  "model": "{{modelName}}",
  "messages": {{messages}},
  "max_tokens": {{maxTokens}},
  "temperature": {{temperature}}
}`}
                                rows={8}
                                className="font-mono text-sm"
                              />
                              <p className="text-xs text-muted-foreground">
                                {t('model.requestBodyTemplatePlaceholder')}
                              </p>
                            </div>

                            {/* 自定义请求头 */}
                            <div className="space-y-2">
                              <Label>{t('model.customHeaders')}</Label>
                              <Textarea
                                value={JSON.stringify(editingModel.customRequestConfig?.headers || {}, null, 2)}
                                onChange={e => {
                                  try {
                                    const headers = JSON.parse(e.target.value);
                                    const customConfig = editingModel.customRequestConfig || {
                                      enabled: true,
                                      requestBodyTemplate: '',
                                      headers: {},
                                      responseParser: {
                                        contentPath: 'choices[0].message.content',
                                        errorPath: 'error.message',
                                        usagePath: 'usage'
                                      }
                                    };
                                    setEditingModel({
                                      ...editingModel,
                                      customRequestConfig: {
                                        ...customConfig,
                                        headers
                                      }
                                    });
                                  } catch (error) {
                                    // 忽略JSON解析错误，让用户继续编辑
                                  }
                                }}
                                placeholder={`{
  "Authorization": "Bearer {{apiKey}}",
  "Content-Type": "application/json"
}`}
                                rows={4}
                                className="font-mono text-sm"
                              />
                            </div>

                            {/* 响应解析配置 */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label>{t('model.contentPath')}</Label>
                                <Input
                                  value={editingModel.customRequestConfig?.responseParser?.contentPath || ''}
                                  onChange={e => {
                                    const customConfig = editingModel.customRequestConfig || {
                                      enabled: true,
                                      requestBodyTemplate: '',
                                      headers: {},
                                      responseParser: {
                                        contentPath: 'choices[0].message.content',
                                        errorPath: 'error.message',
                                        usagePath: 'usage'
                                      }
                                    };
                                    setEditingModel({
                                      ...editingModel,
                                      customRequestConfig: {
                                        ...customConfig,
                                        responseParser: {
                                          ...customConfig.responseParser!,
                                          contentPath: e.target.value
                                        }
                                      }
                                    });
                                  }}
                                  placeholder={t('model.contentPathPlaceholder')}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>{t('model.errorPath')}</Label>
                                <Input
                                  value={editingModel.customRequestConfig?.responseParser?.errorPath || ''}
                                  onChange={e => {
                                    const customConfig = editingModel.customRequestConfig || {
                                      enabled: true,
                                      requestBodyTemplate: '',
                                      headers: {},
                                      responseParser: {
                                        contentPath: 'choices[0].message.content',
                                        errorPath: 'error.message',
                                        usagePath: 'usage'
                                      }
                                    };
                                    setEditingModel({
                                      ...editingModel,
                                      customRequestConfig: {
                                        ...customConfig,
                                        responseParser: {
                                          ...customConfig.responseParser!,
                                          errorPath: e.target.value
                                        }
                                      }
                                    });
                                  }}
                                  placeholder={t('model.errorPathPlaceholder')}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>{t('model.usagePath')}</Label>
                                <Input
                                  value={editingModel.customRequestConfig?.responseParser?.usagePath || ''}
                                  onChange={e => {
                                    const customConfig = editingModel.customRequestConfig || {
                                      enabled: true,
                                      requestBodyTemplate: '',
                                      headers: {},
                                      responseParser: {
                                        contentPath: 'choices[0].message.content',
                                        errorPath: 'error.message',
                                        usagePath: 'usage'
                                      }
                                    };
                                    setEditingModel({
                                      ...editingModel,
                                      customRequestConfig: {
                                        ...customConfig,
                                        responseParser: {
                                          ...customConfig.responseParser!,
                                          usagePath: e.target.value
                                        }
                                      }
                                    });
                                  }}
                                  placeholder={t('model.usagePathPlaceholder')}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button onClick={handleSave} className="flex-1">
                      <Save className="h-4 w-4 mr-2" /> {t('model.saveConfig')}
                    </Button>
                    {!isNewModel && selectedModelId && (
                      <Button variant="outline" onClick={() => handleSetActive(selectedModelId)}>
                        {t('model.setActive')}
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="text-3xl mb-2">🧩</div>
                <div className="text-sm">{t('settings.selectModelToEdit')}</div>
                <div className="text-xs mt-1">{t('settings.orClickAddNewToAddNewModel')}</div>
              </div>
            )}
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
