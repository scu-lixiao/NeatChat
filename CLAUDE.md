# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NeatChat** (NextChat) is a premium multi-platform AI chat application built with Next.js 14, TypeScript, and a proprietary Holographic Design System. It supports 13+ AI providers including OpenAI, Claude, Gemini, DeepSeek, and Grok with a unified streaming interface.

## Development Commands

### Core Development
```bash
# Development with hot reload and mask watching
yarn dev

# Build prompt masks from app/masks/
yarn mask

# Production build (standalone mode)
yarn build

# Static export for deployment
yarn export

# Desktop app development (Tauri)
yarn app:dev

# Desktop app build
yarn app:build
```

### Testing
```bash
# Run tests in watch mode
yarn test

# Run tests in CI mode
yarn test:ci

# Run tests with Jest (full command)
node --no-warnings --experimental-vm-modules $(yarn bin jest) --watch
```

### Code Quality
```bash
# Lint with ESLint
yarn lint

# Format and prepare for commit (uses Husky)
yarn prepare
```

## Architecture

### State Management Pattern

Uses **Zustand** with persistent storage (IndexedDB/localStorage) and cross-tab synchronization. All stores follow this pattern:

```typescript
export const useXxxStore = createPersistStore(
  { /* state */ },
  {
    name: StoreKey.Xxx,
    storage: createPersistStorage()
  }
);
```

**Key Stores:**
- `app/store/chat.ts` - Chat sessions and messages
- `app/store/config.ts` - App configuration
- `app/store/access.ts` - API keys and access control
- `app/store/mask.ts` - Prompt templates
- `app/store/plugin.ts` - Plugin management

### Multi-Provider AI Architecture

The app abstracts 13+ AI providers through a unified `ClientApi` interface:

```typescript
// app/client/api.ts - Unified interface
interface ClientApi {
  chat(options: ChatOptions): Promise<void>;
  toolAgentChat(options: ChatOptions): Promise<void>;
  usage(): Promise<LLMUsage>;
}

// Each provider implements this interface
// app/client/platforms/
├── openai.ts        // OpenAI + Azure
├── anthropic.ts     // Claude
├── google.ts        // Gemini
├── deepseek.ts      // DeepSeek (with thinking support)
├── xai.ts           // Grok (with citations)
├── alibaba.ts       // Qwen
├── baidu.ts         // Ernie
├── bytedance.ts     // Doubao
├── tencent.ts       // Hunyuan
├── moonshot.ts      // Moonshot
├── iflytek.ts       // Spark
├── glm.ts           // ChatGLM
└── siliconflow.ts   // SiliconFlow
```

### Message System Architecture

The `ChatMessage` type extends `RequestMessage` with rich features:

```typescript
interface ChatMessage extends RequestMessage {
  id: string;                      // nanoid
  date: string;                    // Localized timestamp
  streaming?: boolean;             // Real-time streaming state
  tools?: ChatMessageTool[];       // Tool calls (function calling)
  thinkingContent?: string;        // DeepSeek thinking support
  citations?: Citation[];          // XAI citations
  audio_url?: string;              // TTS audio URL
  isError?: boolean;               // Error state
  model?: ModelType;               // Model used
}
```

### API Route Proxy Pattern

Next.js rewrites handle CORS and proxy requests:

```typescript
// next.config.mjs defines API proxies
/api/openai/*    → https://api.openai.com/*
/api/anthropic/* → https://api.anthropic.com/*
/api/google/*    → https://generativelanguage.googleapis.com/*

// API routes implement provider-specific logic
app/api/openai/[...path]/route.ts
app/api/anthropic/[...path]/route.ts
```

## Holographic Design System

This project uses a proprietary **Holographic Design Language System** with specific patterns.

### Component Structure

All holographic components are in `app/components/holo/`:
- `HoloButton.tsx` - Interactive buttons with quantum effects
- `HoloCard.tsx` - Container cards with holographic backgrounds
- `HoloInput.tsx` - Input fields with energy field effects
- `HoloModal.tsx` - Modal dialogs with premium animations

### Style Patterns

**CSS Variables:**
```scss
// Use premium-prefixed variables for holographic effects
--premium-primary-color
--premium-accent-color
--premium-glass-bg
--premium-glow-color
```

**Performance Modes:**
All components support three performance tiers:
- `high` - Full GPU acceleration, all effects enabled
- `balanced` - Moderate effects, optimized for most devices
- `eco` - Minimal effects, CPU-friendly

**GPU Optimization:**
```scss
// All animated elements use GPU acceleration
will-change: transform, opacity;
transform: translate3d(0, 0, 0);
```

## Special Features & Integration Patterns

### 1. Thinking Window (DeepSeek)

DeepSeek models return thinking content in `<think>` tags:

```typescript
// Separate callback for thinking content
onThinkingUpdate?: (thinkingContent: string, chunk: string) => void;

// Thinking content is stored separately in ChatMessage
message.thinkingContent = "...";
```

### 2. Citations Support (XAI/Grok)

XAI returns structured citations with sources:

```typescript
interface Citation {
  title: string;
  url: string;
}

// Callback for citations
onCitationsUpdate?: (citations: Citation[]) => void;
```

### 3. Real-time Voice Chat (OpenAI)

WebRTC-based voice chat with Web Audio API:
- `app/lib/audio.ts` - Audio processing utilities
- `public/audio-processor.js` - Audio worklet processor
- Uses OpenAI Realtime API with WebSocket streaming

### 4. Tauri Desktop Integration

Desktop app built with Tauri 1.5.11:
- `src-tauri/` - Rust backend
- Native file system access
- System tray integration
- Auto-updater support

### 5. Plugin System

Extensible plugin architecture:
- `app/store/plugin.ts` - Plugin state management
- `app/components/plugin.tsx` - Plugin UI
- Supports network search, calculator, and custom APIs

## Build System & Environment

### Build Modes

Three build modes controlled by `BUILD_MODE` env var:

1. **standalone** (default) - Self-contained server deployment
2. **export** - Static site generation for hosting
3. **app** - Tauri desktop application

### Environment Variables

**Essential:**
```bash
# API Keys (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=sk-...

# Access Control
CODE=password1,password2

# Feature Flags
ENABLE_MCP=true              # Enable Model Context Protocol
HIDE_USER_API_KEY=1          # Hide API key input
DISABLE_GPT4=1               # Disable GPT-4 models
```

**See `app/constant.ts` for all supported providers and variables.**

### Mask Generation

The build process includes a mask generation step:

```bash
yarn mask  # Compiles app/masks/*.ts → public/masks.json
```

Masks are prompt templates that initialize conversations with pre-defined context.

## Testing Strategy

### Test Infrastructure

- **Jest** with jsdom environment
- **React Testing Library** for component tests
- **TypeScript strict mode** enabled
- **ESLint + Prettier** for code quality

### Test Files

```
test/
├── model-available.test.ts      # Model availability checks
├── model-provider.test.ts       # Provider integration tests
├── vision-model-checker.test.ts # Vision model detection
└── sum-module.test.ts           # Utility function tests
```

### Running Tests

```bash
# Watch mode (development)
yarn test

# CI mode (no watch)
yarn test:ci

# With coverage
node --no-warnings --experimental-vm-modules $(yarn bin jest) --coverage
```

## Code Patterns & Conventions

### 1. Streaming Response Pattern

All AI providers use a consistent streaming pattern:

```typescript
const controller = new AbortController();
options.onController?.(controller);

const reader = response.body.getReader();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  // Parse SSE chunks and call onUpdate
}
```

### 2. State Update Pattern

Zustand updates with immutable patterns:

```typescript
// Update nested state immutably
set((state) => ({
  sessions: state.sessions.map((session) =>
    session.id === sessionId
      ? { ...session, messages: [...session.messages, newMessage] }
      : session
  ),
}));
```

### 3. Platform Detection

```typescript
import { getClientApi } from "@/app/client/api";

// Returns appropriate API client based on model
const api = getClientApi(modelConfig.model);
await api.chat(options);
```

### 4. Component Development Pattern

```tsx
import { HoloButton, HoloCard } from '@/app/components/holo';

interface Props extends HoloTypes.HoloMaterialProps {
  holoEffect?: 'quantum' | 'matrix' | 'plasma';
  performanceMode?: 'high' | 'balanced' | 'eco';
}

export function MyComponent({ holoEffect = 'quantum', ...props }: Props) {
  return (
    <HoloCard holoEffect={holoEffect}>
      <HoloButton energyField={true}>
        Click Me
      </HoloButton>
    </HoloCard>
  );
}
```

## Common Tasks

### Adding a New AI Provider

1. Create provider file in `app/client/platforms/new-provider.ts`
2. Implement `ClientApi` interface
3. Add provider to `ServiceProvider` enum in `app/constant.ts`
4. Add API route in `app/api/new-provider/[...path]/route.ts`
5. Add environment variable handling
6. Update model lists in `app/constant.ts`

### Creating UI Components

1. Use holographic design system patterns from `app/components/holo/`
2. Support three performance modes
3. Use `--premium-*` CSS variables
4. Implement GPU acceleration with `will-change` and `transform3d`
5. Test with different performance modes

### Extending Message Features

1. Add new field to `ChatMessage` type in `app/store/chat.ts`
2. Update message rendering in `app/components/chat.tsx`
3. Add streaming callback to `ChatOptions` if needed
4. Update message persistence logic

### Desktop App Development

1. Start dev server: `yarn app:dev`
2. Modify Rust backend in `src-tauri/src/`
3. Update Tauri config in `src-tauri/tauri.conf.json`
4. Build for distribution: `yarn app:build`

## Performance Considerations

### Optimization Strategies

1. **Automatic GPU acceleration** for holographic effects
2. **Performance mode detection** adapts to device capabilities
3. **Memory management** - Long conversations use token compression
4. **Streaming optimization** - Chunked rendering for real-time responses
5. **IndexedDB storage** - Offload from localStorage for large data
6. **Code splitting** - Disabled in export mode, enabled in standalone

### Bundle Size

- Standalone build: ~5MB for desktop apps
- Webpack chunk optimization controlled by `DISABLE_CHUNK` env var
- SVG optimization with `@svgr/webpack`

## Key Files Reference

- `app/client/api.ts` - Unified AI provider interface
- `app/store/chat.ts` - Core chat state management
- `app/components/chat.tsx` - Main chat UI (84KB, highly complex)
- `app/components/holo/` - Holographic design system
- `app/constant.ts` - Configuration constants and enums
- `next.config.mjs` - Build configuration and API proxies
- `package.json` - Available scripts and dependencies
- `tsconfig.json` - TypeScript configuration

## Internationalization (i18n)

Supports 18+ languages via `app/locales/`:
- English, 简体中文, 繁体中文, 日本語, Français, Español, Italiano
- Türkçe, Deutsch, Tiếng Việt, Русский, Čeština, 한국어, Indonesia
- Português, العربية, বাংলা, Norsk, Slovenčina, Dansk

Language detection is automatic based on browser settings.

## Important Notes

1. **Always run `yarn mask`** before building - masks must be compiled
2. **IndexedDB is primary storage** - localStorage is fallback only
3. **Cross-tab sync** is enabled by default for multi-window support
4. **Streaming is mandatory** - All providers must support streaming responses
5. **Holographic UI is not optional** - Maintain design system consistency
6. **Desktop and web share codebase** - Consider both platforms when coding

## Deployment Notes

### Vercel/Static Hosting
```bash
yarn export
# Outputs to out/ directory
```

### Docker
```bash
docker build -t nextchat .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-... nextchat
```

### Environment-Specific Configuration

Check `app/config/client.ts` and `app/config/server.ts` for runtime config handling. Client config uses `RUNTIME_CONFIG_DOM` for injecting environment variables at runtime.
