# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NeatChat is a heavily customized fork of NextChat (ChatGPT-Next-Web). It's a Next.js 14 + TypeScript app that ships as a web app (standalone server or static export) and as a Tauri desktop app. It supports ~14 LLM providers. Most of the ongoing work is keeping model lists and per-model request parameters current (reasoning effort, thinking budgets, max tokens, Responses API tools).

## Commands

Package manager is **yarn 1** (`yarn.lock`; there is also a stale `package-lock.json`).

```bash
yarn dev                 # next dev on port 3500 + mask watcher
yarn build               # yarn mask + BUILD_MODE=standalone next build
yarn export              # yarn mask + BUILD_MODE=export BUILD_APP=1 (static, used by Tauri)
yarn app:dev / app:build # Tauri desktop (src-tauri/, Tauri CLI 1.5)
yarn lint                # next lint (eslint: next/core-web-vitals + prettier + unused-imports)
yarn mask                # compile app/masks/*.ts → public/masks.json (build/dev run this for you)

yarn test                # jest --watch
yarn test:ci             # jest --ci (whole suite)
# Single test file / single test:
node --no-warnings --experimental-vm-modules $(yarn bin jest) --ci test/deepseek-reasoning.test.ts
node --no-warnings --experimental-vm-modules $(yarn bin jest) --ci app/utils/__tests__/openai-models.test.ts -t "gpt-6"
```

Tests live in two places: `test/` and `app/utils/__tests__/`. Jest runs under jsdom via `next/jest`, `@/` maps to the repo root, and `jest.setup.ts` stubs `global.fetch` globally. The per-provider model tests in `app/utils/__tests__/*-models.test.ts` are the usual place to add coverage when models change.

The Husky pre-commit hook runs lint-staged (`eslint --fix` + `prettier --write` on `app/**`). Commit messages follow conventional-commit style, e.g. `feat(anthropic): ...` or `fix(xai): ...`.

## Request flow (spans client → store → server)

1. **UI → store**: `app/components/chat.tsx` calls `useChatStore().onUserInput()` (`app/store/chat.ts`). That builds the message context (memory, history count, compression via `summarizeSession`), then calls `getClientApi(modelConfig.providerName).llm.chat({...callbacks})`.
2. **Client platform** (`app/client/api.ts` → `app/client/platforms/<provider>.ts`): `getClientApi` maps `ServiceProvider` → `ModelProvider` → a `LLMApi` subclass. Each platform builds its own provider-specific payload and streams the response with the shared SSE helpers `stream()` / `streamWithThink()` in `app/utils/chat.ts`. A platform supplies a `parseSSE` callback and an optional stream-termination detector (`detect*StreamTermination` in the same file). `ChatOptions` callbacks carry the side channels back to the store: `onThinkingUpdate`, `onCitations`, `onGoogleParts` (Gemini thought signatures), and `onOpenAIResponseId` / `onXAIResponseId` (Responses API `previous_response_id` chaining). These end up as fields on `ChatMessage`.
3. **URL resolution** (each platform's `path()`): uses the user's custom endpoint if `accessStore.useCustomConfig` is set. Otherwise the Tauri app (`clientConfig.isApp`) calls the provider's real base URL directly, and the web app calls `/api/<provider>/...`.
4. **Server proxy**: `app/api/[provider]/[...path]/route.ts` (edge runtime) dispatches on `ApiPath` to `app/api/<provider>.ts`. Each handler checks an allow-list of subpaths, calls `auth()` (`app/api/auth.ts`), and forwards the request to `<PROVIDER>_URL || BASE_URL || <default base>`. Tencent is the exception: it has its own `app/api/tencent/route.ts`. `auth()` accepts either a user API key or an access code. An access code arrives as `Bearer nk-<code>` and is md5-checked against `CODE`. When the user supplies no key, `auth()` injects the server's key. The `/api/proxy/*` rewrites in `next.config.mjs` are a separate CORS passthrough, used by plugins (`app/store/plugin.ts`). They aren't available in export mode.

Header/auth selection per provider is centralized in `getHeaders()` in `app/client/api.ts`. For example, Anthropic uses `x-api-key` and Google uses `x-goog-api-key`.

## Adding or updating a model

Recent commits (`git log --stat`) show the pattern, and a change usually touches several of these:

- `app/constant.ts`: the provider's model array (feeds `DEFAULT_MODELS`), `KnowledgeCutOffDate`, `VISION_MODEL_REGEXES`, and the special lists `OPENAI_REASONING_MODELS` / `OPENAI_IMAGE_MODELS` / `XAI_IMAGE_MODELS`. `DEFAULT_OPENAI_MODEL` and `SUMMARIZE_MODEL` are indexes into `OPENAI_REASONING_MODELS`, so reordering that array changes the defaults.
- `app/client/platforms/<provider>.ts`: per-model capability tables and payload shaping. Anthropic, for example, has module-level sets such as `ANTHROPIC_ADAPTIVE_THINKING_MODELS`, `ANTHROPIC_ALWAYS_ON_THINKING_MODELS` and `ANTHROPIC_DEFAULT_SAMPLING_MODELS`, a `ANTHROPIC_MAX_OUTPUT_TOKENS` map, and effort resolvers.
- `app/components/model-config.tsx`: the settings UI **re-derives** capabilities from model-name checks (`isGpt5ReasoningModel`, `isAnthropicAdaptiveThinkingModel`, `supportsXHigh`, `supportsMax`, `maxTokensLimit`, ...). It doesn't read the platform tables, so the two must be kept in sync by hand.
- `app/utils.ts` / `app/utils/model.ts`: capability helpers such as `isGPT5ImageGenModel` and the DeepSeek reasoning-effort resolver, plus custom-model parsing (`collectModelTable`, which handles `CUSTOM_MODELS` syntax like `+name@Provider=Display,-all`).
- `app/store/config.ts`: new `modelConfig` fields go into `DEFAULT_CONFIG`.

## State & persistence

- All stores (`app/store/*.ts`) are built with `createPersistStore` (`app/utils/store.ts`): zustand `persist` + `combine`, always backed by IndexedDB (`app/utils/indexedDB-storage.ts`). Every store gets `update(updater)` (deep-clone then mutate), `markUpdate()`, `lastUpdateTime`, and `_hasHydrated`.
- Persisted state survives upgrades. If existing users need a new field backfilled, bump the store's `version` and add a `migrate` step. `useAppConfig.merge` merges persisted `models` into `DEFAULT_MODELS` by `name + provider`, so persisted entries win over code defaults.
- Server-side env config lives in `app/config/server.ts`, and the full env var list is documented in `README.md`. Build-time client config (`app/config/build.ts`: version from `src-tauri/tauri.conf.json`, commit info, `isApp`, `buildMode`) is injected into a `<meta name="config">` tag and read by `getClientConfig()`.

## Other conventions

- Client-side routing uses react-router's `HashRouter` (`app/components/home.tsx`) inside a single Next page. Paths are defined in the `Path` enum in `app/constant.ts`.
- i18n: `app/locales/cn.ts` defines `LocaleType`, and the other locales are `PartialLocaleType`. Add new strings to `cn.ts` and `en.ts` at minimum.
- Many files contain `// {{CHENGQI: Action/Timestamp/Reason/...}}` comment blocks from earlier AI-assisted work. Recent commits don't add new ones.
- `app/components/holo/` (the "Holographic Design System") and the `app/test-*.html` pages are experiments that the app does not import. `.github/copilot-instructions.md` presents them as mandatory; they aren't. Match the styling of the existing `*.module.scss` for whatever component you're editing.
- `docs/*.md` in upper-case (e.g. `PLATFORM_STREAM_FIX_GUIDE.md`, `OPENAI_MODEL_CLASSIFICATION_SYSTEM.md`) are fork-specific design notes on streaming and iPad fixes. The lower-case docs are upstream NextChat deployment guides.
- The share message text in `ClientApi.share()` is upstream-mandated. Don't change it.
