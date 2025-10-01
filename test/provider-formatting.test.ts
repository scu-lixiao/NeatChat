// {{CHENGQI:
// Action: Created - 提供商名称格式化功能的单元测试
// Timestamp: 2025-06-19 16:15:00 +08:00
// Reason: 为提供商名称格式化功能提供测试覆盖，确保修复正确性
// Principle_Applied: SOLID - 测试驱动开发，质量保证
// Optimization: 确保提供商名称格式化功能的正确性和稳定性
// Architectural_Note (AR): 测试覆盖的最佳实践
// Documentation_Note (DW): 提供商名称格式化功能的完整测试套件
// }}

import { formatProviderName, getProviderDisplayName, isValidProvider } from "../app/utils/provider";
import { ServiceProvider } from "../app/constant";

describe("Provider Name Formatting", () => {
  describe("formatProviderName", () => {
    test("should format lowercase provider names correctly", () => {
      expect(formatProviderName("google")).toBe("Google");
      expect(formatProviderName("openai")).toBe("OpenAI");
      expect(formatProviderName("anthropic")).toBe("Anthropic");
      expect(formatProviderName("bytedance")).toBe("ByteDance");
      expect(formatProviderName("xai")).toBe("XAI");
      expect(formatProviderName("chatglm")).toBe("ChatGLM");
      expect(formatProviderName("deepseek")).toBe("DeepSeek");
      expect(formatProviderName("siliconflow")).toBe("SiliconFlow");
    });

    test("should preserve correctly formatted provider names", () => {
      expect(formatProviderName("Google")).toBe("Google");
      expect(formatProviderName("OpenAI")).toBe("OpenAI");
      expect(formatProviderName("Anthropic")).toBe("Anthropic");
      expect(formatProviderName("ByteDance")).toBe("ByteDance");
      expect(formatProviderName("XAI")).toBe("XAI");
      expect(formatProviderName("ChatGLM")).toBe("ChatGLM");
      expect(formatProviderName("DeepSeek")).toBe("DeepSeek");
      expect(formatProviderName("SiliconFlow")).toBe("SiliconFlow");
    });

    test("should handle mixed case provider names", () => {
      expect(formatProviderName("GOOGLE")).toBe("Google");
      expect(formatProviderName("oPeNaI")).toBe("OpenAI");
      expect(formatProviderName("AnThRoPiC")).toBe("Anthropic");
      expect(formatProviderName("bYtEdAnCe")).toBe("ByteDance");
    });

    test("should handle unknown provider names gracefully", () => {
      expect(formatProviderName("unknown")).toBe("Unknown");
      expect(formatProviderName("newprovider")).toBe("Newprovider");
      expect(formatProviderName("TEST")).toBe("Test");
    });

    test("should work with all ServiceProvider enum values", () => {
      Object.values(ServiceProvider).forEach(provider => {
        const result = formatProviderName(provider);
        expect(result).toBe(provider); // Should return the same value for correct enum values
      });
    });
  });

  describe("getProviderDisplayName", () => {
    test("should return formatted provider names", () => {
      expect(getProviderDisplayName("google")).toBe("Google");
      expect(getProviderDisplayName("openai")).toBe("OpenAI");
      expect(getProviderDisplayName("Google")).toBe("Google");
      expect(getProviderDisplayName("OpenAI")).toBe("OpenAI");
    });
  });

  describe("isValidProvider", () => {
    test("should validate correct ServiceProvider enum values", () => {
      Object.values(ServiceProvider).forEach(provider => {
        expect(isValidProvider(provider)).toBe(true);
      });
    });

    test("should validate lowercase provider names", () => {
      expect(isValidProvider("google")).toBe(true);
      expect(isValidProvider("openai")).toBe(true);
      expect(isValidProvider("anthropic")).toBe(true);
      expect(isValidProvider("bytedance")).toBe(true);
    });

    test("should reject invalid provider names", () => {
      expect(isValidProvider("invalid")).toBe(false);
      expect(isValidProvider("unknown")).toBe(false);
      expect(isValidProvider("")).toBe(false);
    });
  });

  describe("Integration with Custom Model Manager", () => {
    test("should handle provider names as they would appear in the UI", () => {
      // Test cases that simulate the actual usage in CustomModelManager
      const testCases = [
        { input: "google", expected: "Google" },
        { input: "Google", expected: "Google" },
        { input: "openai", expected: "OpenAI" },
        { input: "OpenAI", expected: "OpenAI" },
        { input: "anthropic", expected: "Anthropic" },
        { input: "Anthropic", expected: "Anthropic" },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(formatProviderName(input)).toBe(expected);
      });
    });

    test("should generate correct modal titles", () => {
      const mockTitle = "自定义模型管理";
      const testCases = [
        { provider: "google", expected: `${mockTitle} - Google` },
        { provider: "openai", expected: `${mockTitle} - OpenAI` },
        { provider: "anthropic", expected: `${mockTitle} - Anthropic` },
      ];

      testCases.forEach(({ provider, expected }) => {
        const result = `${mockTitle} - ${formatProviderName(provider)}`;
        expect(result).toBe(expected);
      });
    });
  });
});
