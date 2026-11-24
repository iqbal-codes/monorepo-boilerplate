import { describe, expect, test } from "bun:test";

import {
  formatGeminiModelLabel,
  parseConfiguredModels,
  resolveGeminiMode,
  resolveGeminiModels,
  type FetchLike,
  type GeminiEnvConfig,
} from "../src/lib/gemini";

describe("resolveGeminiMode", () => {
  test("selects google in auto mode when GOOGLE_GENERATIVE_AI_API_KEY is set", () => {
    const config: GeminiEnvConfig = {
      nodeEnv: "production",
      provider: "auto",
      googleApiKey: "AIza-test-key",
    };
    expect(resolveGeminiMode(config)).toEqual({ mode: "google" });
  });

  test("selects vertex in auto mode when Vertex project or API key is set", () => {
    expect(
      resolveGeminiMode({
        nodeEnv: "production",
        provider: "auto",
        vertexProject: "my-gcp-project",
      }),
    ).toEqual({ mode: "vertex" });

    expect(
      resolveGeminiMode({
        nodeEnv: "production",
        provider: "auto",
        vertexApiKey: "vertex-express-key",
      }),
    ).toEqual({ mode: "vertex" });
  });

  test("falls back to dev mock only in development when unconfigured", () => {
    expect(resolveGeminiMode({ nodeEnv: "development", provider: "auto" })).toEqual({
      mode: "mock",
    });
    expect(resolveGeminiMode({ nodeEnv: "production", provider: "auto" })).toEqual({
      mode: "unconfigured",
      reason:
        "Configure GOOGLE_GENERATIVE_AI_API_KEY or Google Vertex AI credentials to enable the Assistant.",
    });
  });

  test("respects explicit provider selection even when the other credentials exist", () => {
    expect(
      resolveGeminiMode({
        nodeEnv: "production",
        provider: "vertex",
        googleApiKey: "AIza-test-key",
        vertexProject: "proj-1",
      }),
    ).toEqual({ mode: "vertex" });

    expect(
      resolveGeminiMode({
        nodeEnv: "production",
        provider: "google",
        vertexProject: "proj-1",
      }),
    ).toEqual({
      mode: "unconfigured",
      reason: "GEMINI_PROVIDER is set to google, but GOOGLE_GENERATIVE_AI_API_KEY is missing.",
    });
  });
});

describe("parseConfiguredModels", () => {
  test("parses comma-separated ids and optional custom labels, ensuring default model is included", () => {
    expect(
      parseConfiguredModels(
        "gemini-3.8-flash, gemini-4-carbon|Gemini 4 Carbon, gemini-3.8-flash",
        "gemini-4-hydrogen",
      ),
    ).toEqual([
      { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { id: "gemini-4-carbon", name: "Gemini 4 Carbon" },
    ]);
  });

  test("formats model ids into readable labels", () => {
    expect(formatGeminiModelLabel("gemini-3.8-flash")).toBe("Gemini 3.8 Flash");
    expect(formatGeminiModelLabel("gemini-4-argon")).toBe("Gemini 4 Argon");
  });
});

describe("resolveGeminiModels", () => {
  test("discovers updated Gemini models dynamically from Google AI Studio without hardcoding", async () => {
    const mockFetch: FetchLike = async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-3.8-flash",
              displayName: "Gemini 3.8 Flash",
              description: "Fast balanced Gemini model",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-4-hydrogen",
              displayName: "Gemini 4 Hydrogen",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-embedding-001",
              displayName: "Embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const result = await resolveGeminiModels(
      {
        nodeEnv: "development",
        provider: "google",
        googleApiKey: "AIza-test",
      },
      { fetchFn: mockFetch, bypassCache: true },
    );

    expect(result.mode).toBe("google");
    expect(result.models.map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-4-hydrogen"]);
    expect(result.defaultModelId).toBe("gemini-3.8-flash");
  });

  test("returns dev mock model when unconfigured in development", async () => {
    const result = await resolveGeminiModels({ nodeEnv: "development", provider: "auto" });
    expect(result.mode).toBe("mock");
    expect(result.defaultModelId).toBe("dev-mock");
    expect(result.models[0]?.id).toBe("dev-mock");
  });
});
