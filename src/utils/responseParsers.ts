// 解析器基类
export abstract class ResponseParser {
    abstract parseChunk(chunk: string): { content: string; done: boolean };
  }
  
  // 百度千帆解析器
  export class BaiduQianfanParser extends ResponseParser {
    parseChunk(chunk: string) {
      // 百度流式响应格式：data: {"id":"...","result":"...","is_end":false}
      const cleaned = chunk.replace(/^data: /, '').trim();
      if (!cleaned) return { content: '', done: false };
      
      try {
        const data = JSON.parse(cleaned);
        return {
          content: data.result || '',
          done: data.is_end === true
        };
      } catch (e) {
        console.error('百度响应解析失败:', e);
        return { content: '', done: false };
      }
    }
  }
  
  // OpenAI解析器
  export class OpenAIParser extends ResponseParser {
    parseChunk(chunk: string) {
      // OpenAI流式响应格式：data: {"choices":[{"delta":{"content":"..."}}]}
      const cleaned = chunk.replace(/^data: /, '').trim();
      if (cleaned === '[DONE]') return { content: '', done: true };
      if (!cleaned) return { content: '', done: false };
      
      try {
        const data = JSON.parse(cleaned);
        return {
          content: data.choices?.[0]?.delta?.content || '',
          done: data.choices?.[0]?.finish_reason === 'stop'
        };
      } catch (e) {
        console.error('OpenAI响应解析失败:', e);
        return { content: '', done: false };
      }
    }
  }
  
  // 解析器工厂：根据模型类型返回对应解析器
  export const getParser = (modelType: string): ResponseParser => {
    switch (modelType) {
      case 'baidu-qianfan':
        return new BaiduQianfanParser();
      case 'openai':
        return new OpenAIParser();
      // 其他模型解析器...
      default:
        throw new Error(`未支持的模型类型: ${modelType}`);
    }
  };