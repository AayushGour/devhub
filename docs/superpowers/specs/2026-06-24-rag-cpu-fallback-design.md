# RAG Studio — CPU Fallback Design

**Date:** 2026-06-24  
**Status:** Approved

## Problem

The RAG Studio LLM backend uses `@mlc-ai/web-llm`, which requires WebGPU. On machines without a GPU (or browsers without WebGPU support), the engine fails to load with "Unable to find a compatible GPU." The full pipeline — chunk summarization, query expansion, query routing, and chat generation — becomes unavailable.

## Goal

Add a CPU fallback so RAG Studio works on any machine, with zero changes to call sites (`ingest.ts`, `queryExpansion.ts`, `useRagEngine.ts`, `ChatPanel.tsx`). Detection and dispatch happen transparently inside `llm.ts`.

## Constraints

- Full pipeline on CPU: all four LLM call types (summarize, expand, route, generate) go through the CPU backend.
- Quality first: default CPU model is 1B-class, not 135M.
- No new npm dependencies — `@xenova/transformers` is already installed and used for embeddings.
- GPU path must be completely unchanged.

---

## Architecture

### Files changed

| File | Type | Summary |
|---|---|---|
| `src/features/rag-studio/utils/webgpu.ts` | New | One exported function `isWebGpuAvailable(): Promise<boolean>`. Calls `navigator.gpu?.requestAdapter()`, caches result. Defaults to `false` on any error. |
| `src/features/rag-studio/utils/llmCpu.ts` | New | CPU backend. Implements `complete()`, `streamComplete()`, `getEngine()`, `resetEngine()`, `interruptGenerate()` with identical signatures to `llm.ts`. Uses `@xenova/transformers` text-generation pipeline. |
| `src/features/rag-studio/utils/llm.ts` | Modified | Becomes a dispatcher. Calls `isWebGpuAvailable()` once, then routes every call to WebLLM (existing) or `llmCpu.ts`. |
| `src/features/rag-studio/utils/models.ts` | Modified | Adds `CPU_MODELS` list alongside `CURATED_MODELS`. Exports `getModelsForEnvironment(gpuAvailable: boolean)`. |
| `src/features/rag-studio/components/ModelOverlay.tsx` | Modified | Shows CPU-mode amber notice when GPU not detected. Updates error message copy. |
| `src/pages/SettingsPage.tsx` | Modified | Model picker reads `getModelsForEnvironment()`. Shows GPU or CPU list, never both. Adds GPU/CPU badge next to picker label. |

### Files not changed

`ingest.ts`, `queryExpansion.ts`, `retrieve.ts`, `vectorDb.ts`, `embed.ts`, `useRagEngine.ts`, `ChatPanel.tsx`, `DocList.tsx`, `DropZone.tsx`, `RagToolbar.tsx`.

---

## CPU Model List

All models are ONNX-format exports from HuggingFace, loaded and cached by `@xenova/transformers`. Quantized variants (q4/q8) are used where available.

| Model ID | Label | Approx size | Role |
|---|---|---|---|
| `Xenova/Llama-3.2-1B-Instruct` | Llama 3.2 1B | ~1 GB | **Default CPU model** |
| `Xenova/Qwen2.5-0.5B-Instruct` | Qwen2.5 0.5B | ~400 MB | Fast, lower quality |
| `Xenova/Qwen2.5-1.5B-Instruct` | Qwen2.5 1.5B | ~1.5 GB | Higher quality, slower |
| `HuggingFaceTB/SmolLM2-1.7B-Instruct` | SmolLM2 1.7B | ~1.7 GB | Strong for size |

GPU models (`CURATED_MODELS`) are unchanged. Settings shows one list or the other based on detected environment.

---

## Streaming Implementation

`@xenova/transformers` v2 provides a `callback_function` option on the text-generation pipeline that fires synchronously per token. `llmCpu.ts` wraps this in an `AsyncGenerator` using a token queue + promise chain, so `streamComplete()` yields tokens one-by-one — identical behaviour to the WebLLM stream from the caller's perspective.

`complete()` (summarization, routing, expansion) awaits the full generation string — no streaming needed.

The generation mutex (`_genLock`) from `llm.ts` is replicated in `llmCpu.ts` to prevent concurrent calls during ingest chunk loops.

---

## WebGPU Detection

`isWebGpuAvailable()` in `webgpu.ts`:

1. Check `'gpu' in navigator` — if missing, return `false`.
2. Call `navigator.gpu.requestAdapter()` — if returns `null`, return `false`.
3. On any thrown error, return `false`.
4. Cache the result as a module-level `Promise<boolean>` — only runs once per session.

Called once when `useRagEngine` mounts. Result stored as `gpuAvailable: boolean` in hook state and passed as a prop to `ModelOverlay` and as an argument to `getModelsForEnvironment()` in the settings page.

---

## UX

### ModelOverlay — CPU mode

Same spinner layout as GPU mode, with an additional amber notice below the progress bar:

> "Running in CPU mode — no GPU detected. Responses will be slower than usual."

### ModelOverlay — Error state

Generic "Model failed to load — check network and refresh" message. GPU-specific "WebGPU not available" copy is removed since on CPU the failure causes are network/storage, not GPU.

### Settings page

- Model picker label shows a small badge: **GPU** or **CPU** based on detected environment.
- Default model is set automatically on first load (`Xenova/Llama-3.2-1B-Instruct` for CPU, existing default for GPU).
- No manual mode toggle — detection is automatic and transparent.

---

## Model ID Validation

The `ragLlmModel` value in `settingsStore` is persisted across sessions. A user may have a GPU model ID stored but open the app on a CPU-only machine. The dispatcher in `llm.ts` validates the stored model ID against `getModelsForEnvironment(gpuAvailable)` before loading. If the stored ID is not in the valid list for the current environment, it silently substitutes the appropriate default (`DEFAULT_CPU_MODEL_ID` or `DEFAULT_MODEL_ID`). This prevents the CPU backend from receiving a GPU model ID it cannot load.

---

## Error Handling

- WebGPU detection failure → silently falls back to CPU, no error shown.
- CPU model load failure → `indexingSetError('Failed to load LLM. Check network & refresh.')` — same pattern as current GPU error handling.
- CPU generation failure → same error message surfaces in the chat message, same as GPU path.
- `interruptGenerate()` on CPU: sets a stop flag checked in the token callback loop; generation halts within one token.
