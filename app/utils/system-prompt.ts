import {
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  KnowledgeCutOffDate,
} from "../constant";

export type SystemPromptTimeMode = "none" | "date" | "full";

function formatLocalDate(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

// Builds the injected global system prompt. For the "none" and "date" time
// modes the output only depends on the model (and the day), so providers can
// reuse the cached prompt prefix across requests.
export function buildSystemPrompt(
  modelConfig: {
    model: string;
    providerName?: string;
    // Missing on sessions created before this option existed.
    systemPromptTimeMode?: SystemPromptTimeMode;
  },
  now: Date,
) {
  const timeMode = modelConfig.systemPromptTimeMode ?? "none";
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  const vars: Record<string, string> = {
    ServiceProvider:
      modelInfo?.provider.providerName ?? modelConfig.providerName ?? "OpenAI",
    cutoff:
      KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default,
    model: modelConfig.model,
    time: timeMode === "date" ? formatLocalDate(now) : now.toString(),
  };

  let template = DEFAULT_SYSTEM_TEMPLATE;
  if (timeMode === "none") {
    template = template
      .split("\n")
      .filter((line) => !line.includes("{{time}}"))
      .join("\n");
  }

  return template.replace(/{{(\w+)}}/g, (match, name) => vars[name] ?? match);
}
