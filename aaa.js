{
  "mcpServers": {
   "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "mcp-feedback-enhanced": {
      "command": "uvx",
      "args": ["mcp-feedback-enhanced@latest"],
      "timeout": 600,
      "autoApprove": ["interactive_feedback"]
    },
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest"
      ]
    },
    "mcp-server-time": {
      "command": "uvx",
      "args": ["mcp-server-time", "--local-timezone=Asia/Shanghai"]
    },
    "shrimp-task-manager": {
      "command": "npx",
      "args": ["-y", "mcp-shrimp-task-manager"],
      "env": {
        "DATA_DIR": "/Users/nuclear/mcp-shrimp-task-manager/data",
        "TEMPLATES_USE": "en",
        "ENABLE_GUI": "false"
      }
    },
    "mcp-deepwiki": {
      "command": "npx",
      "args": ["-y", "mcp-deepwiki@latest"]
    },
    "tavily-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "tavily-mcp@0.1.2"
      ],
      "env": {
        "TAVILY_API_KEY": "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"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-brave-search"
      ],
      "env": {
        "BRAVE_API_KEY": "BSA7LIFmsRNxMadLBu1cZeQ3XiYe-YI"
      }
    }
  }
}

// --- 全局变量和配置 ---
let cachedToken = null;
let tokenExpiry = 0;
// !!! 警告：硬编码凭证极度危险，请使用环境变量或 Secrets !!!
const clientEmail = 'vertex@fluid-door-464310-p1.iam.gserviceaccount.com';
const projectId = 'fluid-door-464310-p1';
const region = 'us-central1';
const privateKeyPem = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCcHFVmPpKLq4rX\njaqVAekR1B62Q/u1bZPw0NL67lERJloo3Yb9/vNjr7kYPQi24cj/2h55CFlJCeH+\nIB4BqWFb6TBDefx+uHxaNRlJWCNN6r+V6uootgUUrWDUbsDKxss9imigTKDI8VD7\nYDGwbeA2FsogrwVYTaSxfvR+hKkPi19ZZuA2I5gnkvHV/PlhR2leSc1Bb3FQnKCX\nTXhgChrex0PtWkadkOG2Ozd19Ls55Q0SNGgNUl1OA28B0v8e7CCheexvZxkWL/Zq\nHuibOSDSKSt58mDn3t/pMQA0+379qHCzHKS/XFrGIa3eLRkPeHAnKsy0BPVU58bj\nIKwS8kyTAgMBAAECggEAOCU+l6vIhAA5ysWyRK4vt5BNTWtM85cJ/rH0N3iP4nWj\nNpBZ9S8FNWSlUvDcmf3BjzdQ/2G/zvOFeqLtd9aF5AsNpy8P3zmVy9HOGuFerS7R\nIeefuO2iDSpAKZb9stBll2gYshJtP2f/IrGZnWUfHwT6RF/+MaCXK5lH8NrgfOyp\nGGpczP4cB1dDZtKqP2zKgIFNdTn9SvW6FUg+hHVXjLJcOn+Ge3lgso0cAyTyrjIP\n8Nad6n3Fj7alhzd5dETcw/3NiMgm+iFSpHUO2px/ZLEecW81qKYxdWlzd2k0mnmh\n+AgESCyUfg6Uy9l//MI/YvS5TfpPOw3xVtbcvGydhQKBgQDLODU+NZo9aD17zf8S\ns5Q8ZR1Hk5RFqy+DIQKq9eca4WJ5BacXIA1aK2L6Rw3Z+DGVSRu/jlnFGWEzANCv\nrb+yhoex7ijCW3AtFMQjLMY5HbJ/BICDhUmUsjo47KCZj0dp3Dmi2hLPgTt/tlJR\nqBtL9qKSjuvAFOqvmEDp3P8enwKBgQDEp+uHJlbfRja+UN5dhNtH5QX81dB/0z+s\nC66iPsaLmkFTotwl6pIpsACb2GC8t/QOl5HC6g2reSX3Gl/8IT/LgZ1kiUBiHqEg\n061VWsaUFXJxG6pzI3ioU0ClSgJu1QeN20e6rubzgED/Fa+x6ZL/6VkETfkE4b7d\nJRYZ2y4xjQKBgQCfNZoA8t2z3kbNB8YeULKB3nXh7azsKAFBKkt8xMoaNRmA1vzh\nEStkyTjx+1jOu7Oc0Xn7yPprgEa2Pp1ABU95/guxSnSEUD7CEtLW++0QMkP1XwGQ\nCIxtAnS6xCfOJoI8XVyKSW8TQpvqolw7vQglq0QSrgXkpn52s0Gn9ouo4QKBgQCW\nw3GCrDbfd1HSt+ax5X/C72aWvkjZJlfjCxW31s6aCglZGDsUam/hu8fLsqf/JjvZ\n0AN0XcFbG0aq2TKK9eaVmunSQJL2Zir7Iqz5Cd3Be2vAIQicuq3uxdyCm2mgFHt1\nGo40JZBzT3kE1lha2gnTXc7byPdG8dZEbgEyk2EnpQKBgEj44mAFDeHH98dcXLxP\nIsZMiMfmOkPqlTHhRvVPj3PJe+p46U8TYnQVoJGylJHFVZsQZzuX601SCy0yOwmE\nUAJUiuNnObxYakPh+4dw6pz/SRMRkUgMKubgwCtVGV6YjiNK/aBx/kMTZ9DPvco0\nbPgj/Plbt2yRsr1wKeEo05b4\n-----END PRIVATE KEY-----\n';

// --- 配置初始化 (增加 OpenAI 相关配置) ---
let CONFIG = {};
function initConfig(env) {
    CONFIG = {
        // Imagen 相关
        IMAGE_EXPIRATION: parseInt(env.IMAGE_EXPIRATION, 10) || 1800,

        // --- Prompt 优化配置 ---
        PROMPT_OPTIMIZATION: env.PROMPT_OPTIMIZATION === 'true', // 是否开启优化，默认 false
        OPENAI_API_KEY: env.OPENAI_API_KEY, // 你的 OpenAI API Key，必须！
        OPENAI_API_BASE: env.OPENAI_API_BASE || 'https://nuclearn.live', // OpenAI API 地址，可选
        OPENAI_MODEL: env.OPENAI_MODEL || 'gpt-4o-mini', // 用于优化的模型，可选
        OPTIMIZER_SYSTEM_PROMPT: env.OPTIMIZER_SYSTEM_PROMPT || `You are an expert prompt engineer specializing in creating highly detailed and effective prompts for text-to-image models like Google Imagen. Your goal is to take a user's simple description and enhance it into a professional-grade prompt.

        **Instructions:**
        1.  **Analyze:** Understand the core subject, style, and any specific elements in the user's input.
        2.  **Enhance:** Add descriptive details, artistic style keywords (e.g., "photorealistic", "cinematic lighting", "impressionist painting", "anime style"), composition hints (e.g., "wide angle shot", "close-up portrait"), and mood descriptors (e.g., "serene atmosphere", "dramatic shadows").
        3.  **Be Specific:** Use precise language. Instead of "a cat", try "A fluffy ginger tabby cat curled up asleep on a sunlit windowsill".
        4.  **Consider Aspect Ratio:** The user wants an image with the aspect ratio {aspect_ratio}. While you don't need to include the ratio string in your output, ensure your description naturally fits or suggests this format (e.g., describe a wider scene for 16:9, a taller composition for 9:16).
        5.  **Output Format:** Respond ONLY with the enhanced prompt text. No explanations, no greetings, just the prompt itself. Keep it concise yet descriptive. Ensure the output is in English.

        **Example:**
        User Input: "a dog playing in the park", Aspect Ratio: "16:9"
        Enhanced Prompt: "Photorealistic wide-angle shot of a joyful golden retriever leaping to catch a red frisbee mid-air in a lush green park, sunny day, cinematic lighting, shallow depth of field focusing on the dog."`
    };
    // 检查 OpenAI Key 是否配置 (如果开启了优化)
    if (CONFIG.PROMPT_OPTIMIZATION && !CONFIG.OPENAI_API_KEY) {
        console.warn("PROMPT_OPTIMIZATION is enabled, but OPENAI_API_KEY is not set in environment variables!");
        CONFIG.PROMPT_OPTIMIZATION = false; // 自动禁用
        console.warn("Prompt optimization has been disabled due to missing OPENAI_API_KEY.");
    }
}

// --- 认证和辅助函数 (需要包含在底部) ---
// importPrivateKey, signJwt, base64ToArrayBuffer, arrayBufferToBase64Url

export default {
  async fetch(request, env, ctx) {
    initConfig(env);
    let isImageRequest = false;

    try {
      // --- 配置获取和检查 (GCP) ---
      const effectiveClientEmail = clientEmail;
      const effectivePrivateKeyPem = privateKeyPem;
      const effectiveProjectId = projectId;
      const effectiveRegion = region;

      // --- 获取 Access Token (GCP) ---
      const nowSeconds = Math.floor(Date.now() / 1000);
      let accessToken;
      if (cachedToken && tokenExpiry > nowSeconds + 60) { accessToken = cachedToken; } else { /* ... 获取新 Token ... */
        console.log("Fetching new GCP Access Token");
        const tokenData = await getGcpAccessTokenData(effectiveClientEmail, effectivePrivateKeyPem);
        if (!tokenData?.access_token || !tokenData?.expires_in) {
             cachedToken = null; tokenExpiry = 0;
             throw new Error("Failed to obtain valid token data from GCP");
        }
        accessToken = tokenData.access_token;
        cachedToken = accessToken;
        tokenExpiry = nowSeconds + tokenData.expires_in;
        console.log(`New token obtained, expires around: ${new Date(tokenExpiry * 1000).toISOString()}`);
      }
      // --- Access Token 获取完毕 ---

      const url = new URL(request.url);
      const requestPath = url.pathname;
      const imageModelKeyword = 'imagen';
      isImageRequest = requestPath.includes(`/${imageModelKeyword}`);

      const pathSegments = requestPath.split('/');
      let modelId = pathSegments.find(segment => segment.startsWith(imageModelKeyword));
      if (modelId && modelId.includes(':')) { modelId = modelId.split(':')[0]; }
      if (!modelId || request.method !== 'POST') { isImageRequest = false; }

      const imageServeTrigger = '/images/';

      // --- 处理 OPTIONS 预检请求 ---
      if (request.method === 'OPTIONS') { return handleOptions(request); }
      // --- 处理图片服务请求 ---
      if (request.method === 'GET' && requestPath.startsWith(imageServeTrigger)) { return handleServeImage(request, env); }

      // --- 分支处理：图片生成 vs 其他 ---
      if (isImageRequest) {
        // --- 图片生成请求 ---
        console.log(`Image generation request detected for model: ${modelId}. Processing...`);

        let originalPromptText;
        let parsedAspectRatio = null; // 从用户输入解析出的宽高比
        let cleanedPromptForOptimization; // 用于优化的干净 prompt
        let effectiveAspectRatio; // 最终生效的宽高比 (包含默认值)

        try {
            const originalGeminiPayload = await request.json();
            originalPromptText = originalGeminiPayload?.contents?.[0]?.parts?.[0]?.text;
            if (!originalPromptText) { throw new Error("Missing 'contents[0].parts[0].text' in payload"); }

            // --- 步骤 1: 提取宽高比 ---
            const parseResult = parseAspectRatioFromPrompt(originalPromptText);
            parsedAspectRatio = parseResult.aspectRatio; // 可能为 null
            cleanedPromptForOptimization = parseResult.cleanedPrompt; // 没有宽高比的 prompt
            console.log(`Original prompt: "${originalPromptText}"`);
            console.log(`Parsed aspect ratio from prompt: ${parsedAspectRatio || 'None'}`);

            // --- 新增：设置默认宽高比 ---
            effectiveAspectRatio = parsedAspectRatio || "16:9"; // 如果用户没指定，默认 16:9
            console.log(`Effective aspect ratio for generation: ${effectiveAspectRatio}`);
            // --- 默认宽高比设置结束 ---

            console.log(`Cleaned prompt for optimization: "${cleanedPromptForOptimization}"`);

        } catch (e) {
            const errorHeaders = createCorsHeaders(new Headers({'Content-Type': 'application/json; charset=utf-8'}));
            return new Response(JSON.stringify({ error: { message: e.message || "Invalid request body for image generation" } }), { status: 400, headers: errorHeaders });
        }

        // --- 步骤 2: 如果开启优化，调用 OpenAI ---
        let finalPromptForImagen = cleanedPromptForOptimization; // 默认使用清理后的 prompt
        /* if (CONFIG.PROMPT_OPTIMIZATION) {
            console.log("Prompt optimization enabled. Calling OpenAI...");
            try {
                // --- 把最终生效的宽高比传给优化器 ---
                const optimizedPrompt = await optimizePromptWithOpenAI(
                    cleanedPromptForOptimization,
                    effectiveAspectRatio
                );
                finalPromptForImagen = optimizedPrompt.trim().replace(/^["']|["']$/g, '');
                console.log(`Optimized prompt received: "${finalPromptForImagen}"`);
            } catch (error) {
                console.error("Failed to optimize prompt with OpenAI, using cleaned prompt instead:", error);
                finalPromptForImagen = cleanedPromptForOptimization;
            }
        } else {
            console.log("Prompt optimization disabled. Using cleaned prompt.");
        } */

        // --- 步骤 3: 准备并发送 Imagen 请求 ---
        let imagenRequestBody;
        try {
            // --- 把最终 prompt 和最终生效的宽高比传给转换函数 ---
            imagenRequestBody = transformGeminiToImagenRequest(finalPromptForImagen, effectiveAspectRatio);
        } catch (e) {
             const errorHeaders = createCorsHeaders(new Headers({'Content-Type': 'application/json; charset=utf-8'}));
             return new Response(JSON.stringify({ error: { message: `Internal error preparing Imagen request: ${e.message}` } }), { status: 500, headers: errorHeaders });
        }

        const targetUrl = `https://${effectiveRegion}-aiplatform.googleapis.com/v1/projects/${effectiveProjectId}/locations/${effectiveRegion}/publishers/google/models/${modelId}:predict`;
        console.log(`Targeting Imagen URL: ${targetUrl}`);
        const forwardHeaders = new Headers();
        forwardHeaders.set('Authorization', `Bearer ${accessToken}`);
        forwardHeaders.set('Content-Type', 'application/json');

        const vertexResponse = await fetch(targetUrl, { method: 'POST', headers: forwardHeaders, body: imagenRequestBody });

        console.log(`Received response from Imagen: ${vertexResponse.status}`);
        const responseHeaders = createCorsHeaders(new Headers());

        if (!vertexResponse.ok) { /* ... Imagen 错误处理 ... */
            console.error(`Imagen API request failed: ${vertexResponse.status}`);
            let errorBody = await vertexResponse.text();
            console.error(`Imagen API Error Body: ${errorBody}`);
            responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify({ error: { message: `Imagen API Error: ${vertexResponse.status} - ${errorBody || vertexResponse.statusText}` } }), { status: vertexResponse.status, headers: responseHeaders });
        }

        // --- 处理成功响应，存 KV，生成 URL ---
        let imagenResponseData;
        let imageUrls = [];
        try { /* ... (存储 KV 部分不变) ... */
          imagenResponseData = await vertexResponse.json();
          if (!imagenResponseData?.predictions || !Array.isArray(imagenResponseData.predictions)) { throw new Error("Unexpected Imagen response format"); }
          for (const prediction of imagenResponseData.predictions) {
            if (prediction.bytesBase64Encoded && prediction.mimeType) {
              const imageBuffer = base64ToArrayBuffer(prediction.bytesBase64Encoded);
              if (!imageBuffer) { continue; }
              const key = `img_${Date.now()}_${Math.random().toString(16).substring(2, 10)}`;
              await env.IMAGE_KV.put(key, imageBuffer, { expirationTtl: CONFIG.IMAGE_EXPIRATION, metadata: { contentType: prediction.mimeType } });
              const imageUrl = `${url.origin}${imageServeTrigger}${key}`;
              imageUrls.push(imageUrl);
              finalPromptForImagen = prediction.prompt;
              console.log(`Stored image with key ${key}, URL: ${imageUrl}`);
            } else { console.warn("Skipping prediction due to missing data:", prediction); }
          }
        } catch (e) { /* ... KV 错误处理 ... */
          console.error("Failed to process Imagen response or store to KV:", e);
          responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
          return new Response(JSON.stringify({ error: { message: "Failed to process upstream Imagen response or store image" } }), { status: 502, headers: responseHeaders });
        }

        if (imageUrls.length === 0) { /* ... 无有效图片错误处理 ... */
            console.error("No valid images were generated or stored.");
            responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
             return new Response(JSON.stringify({ error: { message: "Image generation succeeded but failed to store or retrieve image URL." } }), { status: 500, headers: responseHeaders });
        }

                // --- 修改：返回 Markdown 格式 ---
        const imageUrlToDisplay = imageUrls[0];

        // 构造 Markdown 字符串
        const markdownContent = `**Final Prompt (Ratio: ${effectiveAspectRatio}):**\n\`\`\`\n${finalPromptForImagen}\n\`\`\`\n![Generated Image](${imageUrlToDisplay})`; // Markdown 图片语法

        console.log(`Returning Markdown content.`);
        // --- 修改 Content-Type 为 text/markdown ---
        responseHeaders.set('Content-Type', 'text/markdown; charset=utf-8');
        // 或者如果你的客户端只认 text/plain 里的 Markdown，可以试试下面这个
        // responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');

        return new Response(markdownContent, { status: 200, headers: responseHeaders });
        // --- Markdown 返回修改结束 ---


      } else {
        // --- 其他模型请求 (非图片生成，保持不变) ---
        /* ... (这部分代码不变) ... */
        console.log("Standard model request detected. Proxying and streaming...");
        let targetModelId = pathSegments[pathSegments.length - 1];
        if (targetModelId && targetModelId.includes(':')) { targetModelId = targetModelId.split(':')[0]; }
        else if (!targetModelId) { return new Response("Invalid request path", { status: 400 }); }

        let targetUrl = '';
        if (targetModelId.includes('exp-03-25') || targetModelId.includes('preview-06-05')) {
          targetUrl = `https://aiplatform.googleapis.com/v1/projects/${effectiveProjectId}/locations/global/publishers/google/models/${targetModelId}:streamGenerateContent?alt=sse`;
        } else {
          targetUrl = `https://${effectiveRegion}-aiplatform.googleapis.com/v1/projects/${effectiveProjectId}/locations/${effectiveRegion}/publishers/google/models/${targetModelId}:streamGenerateContent?alt=sse`;
        };
        console.log(`Targeting standard model URL: ${targetUrl}`);
        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set('Authorization', `Bearer ${accessToken}`);
        forwardHeaders.delete('Host');
        const vertexResponse = await fetch(targetUrl, { method: request.method, headers: forwardHeaders, body: request.body, redirect: 'manual' });
        console.log(`Received response from upstream: ${vertexResponse.status}`);
        const responseHeaders = createCorsHeaders(new Headers());
        const contentType = vertexResponse.headers.get('Content-Type');
        if (contentType) { responseHeaders.set('Content-Type', contentType); }
        const transferEncoding = vertexResponse.headers.get('Transfer-Encoding');
        if (transferEncoding) { responseHeaders.set('Transfer-Encoding', transferEncoding); }
        console.log("Streaming upstream response back to client.");
        return new Response(vertexResponse.body, { status: vertexResponse.status, statusText: vertexResponse.statusText, headers: responseHeaders });
      }

    } catch (error) { /* ... 统一错误处理 ... */
        if (error.message.includes("GCP access token") || error.message.includes("authenticate") || error.message.includes("token data")) { cachedToken = null; tokenExpiry = 0; }
        console.error("Worker Proxy Error:", error.stack || error);
        const errorResponse = { error: { code: 500, message: `Internal proxy error: ${error.message}`, status: "INTERNAL" } };
        const errorHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With' });
        return new Response(JSON.stringify(errorResponse), { status: 500, headers: errorHeaders });
    }
  }
};

// --- CORS 预检请求处理 (不变) ---
function handleOptions(request) { /* ... */
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    const respHeaders = new Headers({
      'Access-Control-Allow-Origin': headers.get('Origin'),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers'),
      'Access-Control-Max-Age': '86400',
    });
    return new Response(null, { status: 204, headers: respHeaders });
  } else {
    const simpleHeaders = new Headers({
        'Allow': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return new Response(null, { status: 200, headers: simpleHeaders });
  }
}

// --- 创建带 CORS 的响应头 (不变) ---
function createCorsHeaders(baseHeaders) { /* ... */
    baseHeaders.set('Access-Control-Allow-Origin', '*');
    baseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    baseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return baseHeaders;
}

// --- 从 Prompt 中解析宽高比 (不变) ---
function parseAspectRatioFromPrompt(promptText) { /* ... */
    const supportedAspectRatios = ["1:1", "9:16", "16:9", "3:4", "4:3"];
    let extractedAspectRatio = null;
    let cleanedPrompt = promptText.trim();

    for (const ratio of supportedAspectRatios) {
        if (cleanedPrompt.endsWith(` ${ratio}`)) {
            extractedAspectRatio = ratio;
            cleanedPrompt = cleanedPrompt.substring(0, cleanedPrompt.length - ratio.length - 1).trim();
            break;
        }
    }
    return { cleanedPrompt, aspectRatio: extractedAspectRatio };
}

// --- 调用 OpenAI API 优化 Prompt (不变) ---
async function optimizePromptWithOpenAI(originalPrompt, aspectRatio) { /* ... */
    if (!CONFIG.OPENAI_API_KEY) { throw new Error("OpenAI API key is not configured."); }
    const systemPrompt = CONFIG.OPTIMIZER_SYSTEM_PROMPT.replace('{aspect_ratio}', aspectRatio || 'default (likely 1:1)'); // aspectRatio is now guaranteed to be non-null here if default is applied
    const requestBody = {
        model: CONFIG.OPENAI_MODEL,
        messages: [ { role: "system", content: systemPrompt }, { role: "user", content: originalPrompt } ],
        temperature: 0.7, max_tokens: 300, top_p: 1, frequency_penalty: 0, presence_penalty: 0,
    };
    const apiUrl = `${CONFIG.OPENAI_API_BASE}/v1/chat/completions`;
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) { const errorBody = await response.text(); throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText} - ${errorBody}`); }
        const jsonResponse = await response.json();
        if (!jsonResponse.choices || jsonResponse.choices.length === 0 || !jsonResponse.choices[0].message || !jsonResponse.choices[0].message.content) { console.error("Invalid response format from OpenAI:", jsonResponse); throw new Error('Invalid or empty response format from OpenAI API.'); }
        return jsonResponse.choices[0].message.content;
    } catch (error) { console.error("Error calling OpenAI API:", error); throw error; }
}

// --- 请求转换：Gemini -> Imagen (不变, 因为 aspectRatio 参数已处理) ---
function transformGeminiToImagenRequest(promptText, aspectRatio) { /* ... */
  const imagenPayload = {
    instances: [{ prompt: promptText }],
    parameters: {
        sampleCount: 1,
        ...(aspectRatio && { aspectRatio: aspectRatio }), // aspectRatio is now the effective one
        "personGeneration": "allow_adult",
        "safetySetting": "block_only_high",
        "addWatermark": false,
        "enhancePrompt": true
    }
  };
  console.log("Final Imagen Payload:", JSON.stringify(imagenPayload, null, 2));
  return JSON.stringify(imagenPayload);
}

// --- 处理图片服务请求 (/images/:key) (不变) ---
async function handleServeImage(request, env) { /* ... */
  const url = new URL(request.url);
  const key = url.pathname.split('/').pop();
  if (!key) { return new Response('Image key missing', { status: 400 }); }
  console.log(`Serving image request for key: ${key}`);
  try {
      const { value: imageData, metadata } = await env.IMAGE_KV.getWithMetadata(key, 'arrayBuffer');
      if (!imageData) {
          console.warn(`Image not found in KV for key: ${key}`);
          return new Response('Image not found or expired', { status: 404 });
      }
      const contentType = metadata?.contentType || 'application/octet-stream';
      console.log(`Found image with contentType: ${contentType}`);
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'public, max-age=86400');
      createCorsHeaders(headers);
      return new Response(imageData, { headers });
  } catch (e) {
      console.error(`Error serving image for key ${key}:`, e);
      return new Response('Error retrieving image', { status: 500 });
  }
}

// --- 认证和辅助函数 (不变) ---
async function getGcpAccessTokenData(clientEmail, privateKeyPem) { /* ... */
  const scope = "https://www.googleapis.com/auth/cloud-platform";
  const aud = "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;
  const claims = { iss: clientEmail, sub: clientEmail, aud: aud, iat: now, exp: expiry, scope: scope };
  try {
      const privateKey = await importPrivateKey(privateKeyPem);
      const jwt = await signJwt(privateKey, claims);
      const tokenResponse = await fetch(aud, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      });
      if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error(`GCP Token Fetch Error: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
          return null;
      }
      const tokenData = await tokenResponse.json();
      if (typeof tokenData.access_token === 'string' && typeof tokenData.expires_in === 'number') {
           return tokenData;
      } else {
          console.error("GCP Token Response format invalid:", tokenData);
          return null;
      }
  } catch (e) {
      console.error("Error in getGcpAccessTokenData:", e);
      return null;
  }
}
async function importPrivateKey(pemKey) { /* ... */
  try {
      const pemHeader = "-----BEGIN PRIVATE KEY-----";
      const pemFooter = "-----END PRIVATE KEY-----";
      const pemContents = pemKey.substring(pemHeader.length, pemKey.indexOf(pemFooter)).replace(/\s+/g, '');
      const binaryDer = base64ToArrayBuffer(pemContents);
      if (!binaryDer || binaryDer.byteLength === 0) { throw new Error("Failed to decode PEM body (Base64)."); }
      return await crypto.subtle.importKey('pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
  } catch (e) {
      console.error("Error importing private key:", e.message);
      // console.error("PEM Key Snippet (check formatting):", pemKey.substring(0, 80) + "..."); // 私钥太敏感，注释掉
      throw new Error(`Could not import private key: ${e.message}. Check format (PKCS#8 PEM) and content.`);
  }
}
async function signJwt(privateKey, claims) { /* ... */
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedClaims = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  try {
      const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, dataToSign);
      const encodedSignature = arrayBufferToBase64Url(signature);
      return `${encodedHeader}.${encodedClaims}.${encodedSignature}`;
  } catch (e) {
      console.error("Error signing JWT:", e);
      throw new Error(`Could not sign JWT: ${e.message}`);
  }
}
function base64ToArrayBuffer(base64) { /* ... */
  try {
      let base64Standard = base64.replace(/-/g, '+').replace(/_/g, '/');
      while (base64Standard.length % 4) { base64Standard += '='; }
      const binary_string = atob(base64Standard);
      const len = binary_string.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
      return bytes.buffer;
  } catch (e) {
      console.error("Base64 decoding error:", e);
      return null;
  }
}
function arrayBufferToBase64Url(buffer) { /* ... */
  const binaryString = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binaryString).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
