export type Updater<T> = (updater: (value: T) => void) => void;

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export interface RequestMessage {
  role: MessageRole;
  content: string;
}

export type DalleSize = "1024x1024" | "1792x1024" | "1024x1792";
export type DalleQuality = "standard" | "hd";
export type DalleStyle = "vivid" | "natural";
export type OpenAIImageQuality = "low" | "medium" | "high" | "auto";
export type ImageQuality = DalleQuality | OpenAIImageQuality;
export type ImageModeration = "auto" | "low";

export type PresetModelSize =
  | "auto"
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2560x1440"
  | "1440x2560"
  | "2880x2880"
  | "3840x2160"
  | "2160x3840"
  | "768x1344"
  | "864x1152"
  | "1344x768"
  | "1152x864"
  | "1440x720"
  | "720x1440";

export type ModelSize = PresetModelSize | `${number}x${number}`;
