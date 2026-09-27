import {
  resolveDeepSeekReasoningEffort,
  supportsDeepSeekReasoningEffort,
} from "../app/utils/model";

describe("DeepSeek reasoning effort", () => {
  test.each([
    ["deepseek-flash", "none", "none"],
    ["deepseek-flash", "low", "low"],
    ["deepseek-v4-pro", "high", "high"],
    ["deepseek-v4-pro", "max", "max"],
    ["deepseek-flash", "minimal", "low"],
    ["deepseek-flash", "medium", "high"],
    ["deepseek-v4-pro", "xhigh", "high"],
  ])("normalizes %s reasoning effort %s to %s", (model, effort, expected) => {
    expect(resolveDeepSeekReasoningEffort(model, effort)).toBe(expected);
  });

  test("does not send reasoning effort for unsupported or automatic models", () => {
    expect(resolveDeepSeekReasoningEffort("deepseek-reasoner", "high")).toBeUndefined();
    expect(resolveDeepSeekReasoningEffort("deepseek-flash", "auto")).toBeUndefined();
    expect(supportsDeepSeekReasoningEffort("deepseek-chat")).toBe(false);
  });
});