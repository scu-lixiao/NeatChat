import { ServiceProvider } from "../constant";

// {{CHENGQI:
// Action: Created - 提供商名称格式化工具模块
// Timestamp: 2025-06-19 16:10:00 +08:00
// Reason: 创建统一的提供商名称格式化逻辑，确保在整个应用中一致显示
// Principle_Applied: SOLID - 单一职责，DRY原则
// Optimization: 统一的提供商名称处理，避免重复代码
// Architectural_Note (AR): 提供商名称显示的标准化处理模块
// Documentation_Note (DW): 提供商名称格式化工具，确保正确大小写显示
// }}

/**
 * 格式化提供商名称，确保正确的大小写显示
 * @param provider 提供商名称（可能是任意大小写格式）
 * @returns 正确大小写格式的提供商名称
 */
export function formatProviderName(provider: string): string {
  // 创建提供商名称映射，确保正确的大小写
  const providerNameMap: Record<string, string> = {
    'openai': 'OpenAI',
    'azure': 'Azure',
    'google': 'Google',
    'anthropic': 'Anthropic',
    'baidu': 'Baidu',
    'bytedance': 'ByteDance',
    'alibaba': 'Alibaba',
    'tencent': 'Tencent',
    'moonshot': 'Moonshot',
    'stability': 'Stability',
    'iflytek': 'Iflytek',
    'xai': 'XAI',
    'chatglm': 'ChatGLM',
    'deepseek': 'DeepSeek',
    'siliconflow': 'SiliconFlow',
  };

  // 如果输入已经是正确格式，直接返回
  if (Object.values(ServiceProvider).includes(provider as ServiceProvider)) {
    return provider;
  }

  // 尝试从映射中找到正确的格式
  const normalizedProvider = providerNameMap[provider.toLowerCase()];
  if (normalizedProvider) {
    return normalizedProvider;
  }

  // 如果找不到映射，返回首字母大写的格式
  return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}

/**
 * 获取提供商的显示名称，处理特殊情况
 * @param provider 提供商名称
 * @returns 用于显示的提供商名称
 */
export function getProviderDisplayName(provider: string): string {
  return formatProviderName(provider);
}

/**
 * 验证提供商名称是否有效
 * @param provider 提供商名称
 * @returns 是否为有效的提供商名称
 */
export function isValidProvider(provider: string): boolean {
  return Object.values(ServiceProvider).includes(provider as ServiceProvider) ||
         Object.keys({
           'openai': 'OpenAI',
           'azure': 'Azure',
           'google': 'Google',
           'anthropic': 'Anthropic',
           'baidu': 'Baidu',
           'bytedance': 'ByteDance',
           'alibaba': 'Alibaba',
           'tencent': 'Tencent',
           'moonshot': 'Moonshot',
           'stability': 'Stability',
           'iflytek': 'Iflytek',
           'xai': 'XAI',
           'chatglm': 'ChatGLM',
           'deepseek': 'DeepSeek',
           'siliconflow': 'SiliconFlow',
         }).includes(provider.toLowerCase());
}
