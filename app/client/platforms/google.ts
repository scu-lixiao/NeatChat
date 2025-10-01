import { ApiPath, Google, REQUEST_TIMEOUT_MS } from "@/app/constant";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  SpeechOptions,
} from "../api";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
  ChatMessageTool,
} from "@/app/store";
import { streamWithThink } from "@/app/utils/chat";
import { getClientConfig } from "@/app/config/client";
import { GEMINI_BASE_URL } from "@/app/constant";

import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
} from "@/app/utils";
import { preProcessImageContent } from "@/app/utils/chat";
import { nanoid } from "nanoid";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class GeminiProApi implements LLMApi {
  path(path: string, shouldStream = false): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";
    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.googleUrl;
    }

    const isApp = !!getClientConfig()?.isApp;
    if (baseUrl.length === 0) {
      baseUrl = isApp ? GEMINI_BASE_URL : ApiPath.Google;
    }
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Google)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    let chatPath = [baseUrl, path].join("/");
    if (shouldStream) {
      chatPath += chatPath.includes("?") ? "&alt=sse" : "?alt=sse";
    }

    return chatPath;
  }
  extractMessage(res: any) {
    console.log("[Response] gemini-pro response: ", res);

    // 处理数组形式的响应（多个块）
    if (Array.isArray(res)) {
      // 合并所有文本块
      let fullText = "";
      for (const chunk of res) {
        const textPart = chunk?.candidates?.at(0)?.content?.parts?.at(0)?.text;
        if (textPart) {
          fullText += textPart;
        }
      }
      return fullText || "";
    }

    // 处理单个响应对象
    return (
      res?.candidates?.at(0)?.content?.parts.at(0)?.text ||
      res?.at(0)?.candidates?.at(0)?.content?.parts.at(0)?.text ||
      res?.error?.message ||
      ""
    );
  }
  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions): Promise<void> {
    const apiClient = this;
    let multimodal = false;

    // 添加联网状态日志
    const session = useChatStore.getState().currentSession();
    // console.log(
    //   "[Chat] Web Access:",
    //   session.mask?.plugin?.includes("googleSearch") ? "Enabled" : "Disabled",
    // );

    // try get base64image from local cache image_url
    const _messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      _messages.push({ role: v.role, content });
    }

    const messages = _messages.map((v) => {
      let parts: any[] = [{ text: getMessageTextContent(v) }];
      if (isVisionModel(options.config.model)) {
        const images = getMessageImages(v);
        if (images.length > 0) {
          multimodal = true;
          parts = parts.concat(
            images.map((image) => {
              const imageType = image.split(";")[0].split(":")[1];
              const imageData = image.split(",")[1];
              return {
                inline_data: {
                  mime_type: imageType,
                  data: imageData,
                },
              };
            }),
          );
        }
      }
      return {
        role: v.role.replace("assistant", "model").replace("system", "user"),
        parts: parts,
      };
    });

    // google requires that role in neighboring messages must not be the same
    for (let i = 0; i < messages.length - 1; ) {
      // Check if current and next item both have the role "model"
      if (messages[i].role === messages[i + 1].role) {
        // Concatenate the 'parts' of the current and next item
        messages[i].parts = messages[i].parts.concat(messages[i + 1].parts);
        // Remove the next item
        messages.splice(i + 1, 1);
      } else {
        // Move to the next item
        i++;
      }
    }
    // if (visionModel && messages.length > 1) {
    //   options.onError?.(new Error("Multiturn chat is not enabled for models/gemini-pro-vision"));
    // }

    const accessStore = useAccessStore.getState();

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };
    const requestPayload = {
      contents: messages,
      generationConfig: {
        temperature: modelConfig.temperature,
        maxOutputTokens: modelConfig.max_tokens,
        topP: modelConfig.top_p,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: accessStore.googleSafetySettings,
        },
        {
	        category: "HARM_CATEGORY_CIVIC_INTEGRITY",
	        threshold: accessStore.googleSafetySettings,
	      },
      ],
    };

    // 强制添加 tools 参数
    (requestPayload as any).tools = [
      {
        "google_search": {}
      }
    ];

    // 添加思考模式配置（仅限支持的模型）
    if (modelConfig.model === "gemini-2.5-flash-preview-05-20") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        "includeThoughts": true,
        "thinkingBudget": 24576
      };
    } else if (modelConfig.model === "gemini-2.5-pro-preview-06-05") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        "includeThoughts": true,
        "thinkingBudget": 32768
      };
    } else if (modelConfig.model === "gemini-2.5-pro") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        "includeThoughts": true,
        "thinkingBudget": 32768
      };
    }
    // 其他模型不添加 thinkingConfig 参数

    let shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    try {
      // https://github.com/google-gemini/cookbook/blob/main/quickstarts/rest/Streaming_REST.ipynb
      const chatPath = this.path(
        Google.ChatPath(modelConfig.model),
        shouldStream,
      );

      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      if (shouldStream) {
        const [_, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        
        // 用于收集引用
        const collectedCitations: Array<{ title: string; url: string }> = [];
        
        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          [{ "google_search": {} }], // 强制使用 google_search tools
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const chunkJson = JSON.parse(text);

            // 提取引用信息
            if (chunkJson?.candidates?.[0]?.groundingMetadata?.groundingChunks) {
              const chunks = chunkJson.candidates[0].groundingMetadata.groundingChunks;
              // console.log("[Google Citations] Found grounding chunks:", chunks);
              
              const citations = chunks
                .filter((chunk: any) => chunk.web?.uri)
                .map((chunk: any) => ({
                  title: chunk.web.title || chunk.web.uri,
                  url: chunk.web.uri
                }))
                .filter((citation: any) => citation.url && citation.url.trim().length > 0);
              
              if (citations.length > 0) {
                // console.log("[Google Citations] Extracted citations:", citations);
                citations.forEach((citation: { title: string; url: string; }) => {
                  if (!collectedCitations.some(c => c.url === citation.url)) {
                    collectedCitations.push(citation);
                  }
                });
                // console.log("[Google Citations] Total collected citations:", collectedCitations);
              }
            }

            // 处理函数调用
            const functionCall = chunkJson?.candidates
              ?.at(0)
              ?.content.parts.at(0)?.functionCall;
            if (functionCall) {
              const { name, args } = functionCall;
              runTools.push({
                id: nanoid(),
                type: "function",
                function: {
                  name,
                  arguments: JSON.stringify(args), // utils.chat call function, using JSON.parse
                },
              });
            }
            
            // 分离思考内容和正文内容
            let thinkingContent = "";
            let regularContent = "";
            let hasThinking = false;
            
            if (chunkJson?.candidates?.[0]?.content?.parts) {
              const parts = chunkJson.candidates[0].content.parts;
              
              parts.forEach((part: any) => {
                if (part.text) {
                  if (part.thought === true) {
                    // 这是思考过程
                    thinkingContent += part.text;
                    hasThinking = true;
                  } else {
                    // 这是正文内容
                    regularContent += part.text;
                  }
                }
              });
            }

            // 处理图像数据
            const part = chunkJson?.candidates?.at(0)?.content?.parts?.at(0);
            if (part?.inlineData) {
              // 检查是否有多个部分
              const parts = chunkJson?.candidates?.at(0)?.content?.parts;
              let textContent = "";

              // 查找其他部分中的文本内容
              if (parts && parts.length > 1) {
                for (let i = 1; i < parts.length; i++) {
                  if (parts[i].text) {
                    textContent += parts[i].text;
                  }
                }
              }

              // 返回图像数据和文本内容
              return {
                isThinking: false,
                content: JSON.stringify({
                  data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                  type: "base64_image",
                  text: textContent,
                })
              };
            }

            // 如果有思考内容，返回思考模式
            if (hasThinking && thinkingContent) {
              return {
                isThinking: true,
                content: thinkingContent
              };
            }

            // 返回正文内容
            return {
              isThinking: false,
              content: regularContent || chunkJson?.candidates?.at(0)?.content.parts.at(0)?.text || ""
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // @ts-ignore
            requestPayload?.contents?.splice(
              // @ts-ignore
              requestPayload?.contents?.length,
              0,
              {
                role: "model",
                parts: toolCallMessage.tool_calls.map(
                  (tool: ChatMessageTool) => ({
                    functionCall: {
                      name: tool?.function?.name,
                      args: JSON.parse(tool?.function?.arguments as string),
                    },
                  }),
                ),
              },
              // @ts-ignore
              ...toolCallResult.map((result) => ({
                role: "function",
                parts: [
                  {
                    functionResponse: {
                      name: result.name,
                      response: {
                        name: result.name,
                        content: result.content, // TODO just text content...
                      },
                    },
                  },
                ],
              })),
            );
          },
          {
            ...options,
            onFinish: (message: string, res: Response) => {
              // Pass citations to the callback if available
              // console.log("[Google Citations] onFinish - collectedCitations:", collectedCitations);
              if (collectedCitations.length > 0 && options.onCitations) {
                // console.log("[Google Citations] Calling onCitations with:", collectedCitations);
                options.onCitations(collectedCitations);
              }
              options.onFinish(message, res);
            },
          },
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);
        const resJson = await res.json();
        if (resJson?.promptFeedback?.blockReason) {
          // being blocked
          options.onError?.(
            new Error(
              "Message is being blocked for reason: " +
                resJson.promptFeedback.blockReason,
            ),
          );
        }
        const message = apiClient.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  usage(): Promise<LLMUsage> {
    throw new Error("Method not implemented.");
  }
  async models(): Promise<LLMModel[]> {
    return [];
  }
}
