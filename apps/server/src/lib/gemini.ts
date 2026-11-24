import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import type { LanguageModel } from "ai";

export type GeminiProviderPreference = "auto" | "google" | "vertex";

export type GeminiEnvConfig = {
  nodeEnv: "development" | "production" | "test";
  provider?: GeminiProviderPreference | undefined;
  defaultModel?: string | undefined;
  configuredModels?: string | undefined;
  googleApiKey?: string | undefined;
  vertexProject?: string | undefined;
  vertexLocation?: string | undefined;
  vertexApiKey?: string | undefined;
  googleApplicationCredentials?: string | undefined;
};

export type GeminiModeResolution =
  | { mode: "google" }
  | { mode: "vertex" }
  | { mode: "mock" }
  | { mode: "unconfigured"; reason: string };

export type GeminiModelOption = {
  id: string;
  name: string;
  description?: string | undefined;
};

export type GeminiModelsResolution = {
  mode: GeminiModeResolution["mode"];
  defaultModelId: string;
  models: GeminiModelOption[];
  reason?: string | undefined;
};

type CachedModels = {
  cacheKey: string;
  expiresAt: number;
  models: GeminiModelOption[];
};

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_GEMINI_MODEL = "gemini-3.8-flash";
const NON_CHAT_MODEL_RE = /(embedding|aqa|imagen|veo|tts|robotics|lyria|native-audio)/i;

let cachedStudioModels: CachedModels | null = null;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveGeminiMode(config: GeminiEnvConfig): GeminiModeResolution {
  const preference = config.provider ?? "auto";
  const hasGoogleKey = Boolean(nonEmpty(config.googleApiKey));
  const hasVertex = Boolean(
    nonEmpty(config.vertexApiKey) ||
    nonEmpty(config.vertexProject) ||
    nonEmpty(config.googleApplicationCredentials),
  );

  if (preference === "google") {
    return hasGoogleKey
      ? { mode: "google" }
      : {
          mode: "unconfigured",
          reason: "GEMINI_PROVIDER is set to google, but GOOGLE_GENERATIVE_AI_API_KEY is missing.",
        };
  }

  if (preference === "vertex") {
    return hasVertex
      ? { mode: "vertex" }
      : {
          mode: "unconfigured",
          reason:
            "GEMINI_PROVIDER is set to vertex, but Vertex AI credentials (GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_API_KEY, or GOOGLE_APPLICATION_CREDENTIALS) are missing.",
        };
  }

  if (hasGoogleKey) return { mode: "google" };
  if (hasVertex) return { mode: "vertex" };
  if (config.nodeEnv === "development") return { mode: "mock" };

  return {
    mode: "unconfigured",
    reason:
      "Configure GOOGLE_GENERATIVE_AI_API_KEY or Google Vertex AI credentials to enable the Assistant.",
  };
}

export function formatGeminiModelLabel(id: string): string {
  return id
    .split("-")
    .map((part) => {
      if (part.toLowerCase() === "gemini") return "Gemini";
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      if (part.length <= 2 && /^[a-z]+$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function parseConfiguredModels(
  raw: string | undefined,
  defaultModel?: string,
): GeminiModelOption[] {
  const seen = new Set<string>();
  const models: GeminiModelOption[] = [];

  const pushEntry = (idRaw: string, customName?: string) => {
    const id = idRaw.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    models.push({
      id,
      name: nonEmpty(customName) ?? formatGeminiModelLabel(id),
    });
  };

  const defaultId = nonEmpty(defaultModel);
  if (defaultId) {
    pushEntry(defaultId);
  }

  if (raw) {
    for (const chunk of raw.split(",")) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const [idPart, labelPart] = trimmed.split("|", 2);
      if (idPart) {
        pushEntry(idPart, labelPart);
      }
    }
  }

  return models;
}

type GoogleStudioModelRecord = {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
};

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchGoogleStudioModels(
  apiKey: string,
  options?: { fetchFn?: FetchLike; bypassCache?: boolean },
): Promise<GeminiModelOption[]> {
  const now = Date.now();
  if (
    !options?.bypassCache &&
    cachedStudioModels &&
    cachedStudioModels.cacheKey === apiKey &&
    cachedStudioModels.expiresAt > now
  ) {
    return cachedStudioModels.models;
  }

  const fetchImpl = options?.fetchFn ?? fetch;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
  );

  if (!response.ok) {
    throw new Error(`Google AI Studio model list failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { models?: GoogleStudioModelRecord[] };
  const models: GeminiModelOption[] = [];
  const seen = new Set<string>();

  for (const entry of payload.models ?? []) {
    const rawName = entry.name ?? "";
    if (!rawName.startsWith("models/gemini-")) continue;
    const id = rawName.slice("models/".length);
    if (NON_CHAT_MODEL_RE.test(id)) continue;
    if (!entry.supportedGenerationMethods?.includes("generateContent")) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: nonEmpty(entry.displayName) ?? formatGeminiModelLabel(id),
      description: nonEmpty(entry.description),
    });
  }

  cachedStudioModels = {
    cacheKey: apiKey,
    expiresAt: now + MODEL_CACHE_TTL_MS,
    models,
  };

  return models;
}

export async function resolveGeminiModels(
  config: GeminiEnvConfig,
  deps?: { fetchFn?: FetchLike; bypassCache?: boolean },
): Promise<GeminiModelsResolution> {
  const resolution = resolveGeminiMode(config);
  const configuredDefault = nonEmpty(config.defaultModel);
  const configuredList = parseConfiguredModels(config.configuredModels, configuredDefault);

  if (resolution.mode === "mock") {
    return {
      mode: "mock",
      defaultModelId: configuredDefault ?? "dev-mock",
      models:
        configuredList.length > 0
          ? configuredList
          : [
              {
                id: "dev-mock",
                name: "Gemini (Dev Mock)",
                description: "Local fallback — set GOOGLE_GENERATIVE_AI_API_KEY or Vertex env",
              },
            ],
    };
  }

  if (resolution.mode === "unconfigured") {
    return {
      mode: "unconfigured",
      defaultModelId: configuredDefault ?? "",
      models: configuredList,
      reason: resolution.reason,
    };
  }

  if (configuredList.length > 0 && nonEmpty(config.configuredModels)) {
    return {
      mode: resolution.mode,
      defaultModelId: configuredDefault ?? configuredList[0]!.id,
      models: configuredList,
    };
  }

  if (resolution.mode === "google") {
    const apiKey = nonEmpty(config.googleApiKey);
    if (apiKey) {
      try {
        const discovered = await fetchGoogleStudioModels(apiKey, deps);
        if (discovered.length > 0) {
          const hasDefault = configuredDefault
            ? discovered.some((model) => model.id === configuredDefault)
            : false;
          const merged =
            configuredDefault && !hasDefault
              ? [
                  { id: configuredDefault, name: formatGeminiModelLabel(configuredDefault) },
                  ...discovered,
                ]
              : discovered;
          return {
            mode: "google",
            defaultModelId: configuredDefault ?? merged[0]!.id,
            models: merged,
          };
        }
      } catch {
        // Fall through to env-configured default when Google model discovery is unreachable.
      }
    }
  }

  const fallbackId = configuredDefault ?? FALLBACK_GEMINI_MODEL;
  return {
    mode: resolution.mode,
    defaultModelId: fallbackId,
    models: [{ id: fallbackId, name: formatGeminiModelLabel(fallbackId) }],
  };
}

export type ResolvedLanguageModelResult =
  | { kind: "model"; model: LanguageModel; modelId: string; mode: "google" | "vertex" }
  | { kind: "mock"; modelId: string }
  | { kind: "unconfigured"; reason: string };

export function createGeminiLanguageModel(
  config: GeminiEnvConfig,
  requestedModelId?: string,
): ResolvedLanguageModelResult {
  const resolution = resolveGeminiMode(config);
  const modelId =
    nonEmpty(requestedModelId) ?? nonEmpty(config.defaultModel) ?? FALLBACK_GEMINI_MODEL;

  if (resolution.mode === "mock") {
    return { kind: "mock", modelId: "dev-mock" };
  }

  if (resolution.mode === "unconfigured") {
    return { kind: "unconfigured", reason: resolution.reason };
  }

  if (resolution.mode === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: nonEmpty(config.googleApiKey),
    });
    return { kind: "model", model: google(modelId), modelId, mode: "google" };
  }

  const vertex = createVertex({
    project: nonEmpty(config.vertexProject),
    location: nonEmpty(config.vertexLocation),
    apiKey: nonEmpty(config.vertexApiKey),
  });
  return { kind: "model", model: vertex(modelId), modelId, mode: "vertex" };
}
