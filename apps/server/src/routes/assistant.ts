import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";

import { ENV } from "../env.server";
import {
  createGeminiLanguageModel,
  resolveGeminiModels,
  type GeminiEnvConfig,
} from "../lib/gemini";
import { auth } from "../services";

const DEFAULT_SYSTEM_PROMPT = [
  "You are a concise, helpful Assistant embedded inside an internal tool.",
  "Use Markdown formatting when helpful.",
  "You have access to tools for reading runtime info, inspecting the active screen, and navigating between screens.",
].join(" ");

function getGeminiConfig(): GeminiEnvConfig {
  return {
    nodeEnv: ENV.NODE_ENV,
    provider: ENV.GEMINI_PROVIDER,
    defaultModel: ENV.GEMINI_MODEL,
    configuredModels: ENV.GEMINI_MODELS,
    googleApiKey: ENV.GOOGLE_GENERATIVE_AI_API_KEY,
    vertexProject: ENV.GOOGLE_VERTEX_PROJECT,
    vertexLocation: ENV.GOOGLE_VERTEX_LOCATION,
    vertexApiKey: ENV.GOOGLE_VERTEX_API_KEY,
    googleApplicationCredentials: ENV.GOOGLE_APPLICATION_CREDENTIALS,
  };
}

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== "user") continue;
    const textPart = msg.parts?.find(
      (part): part is Extract<typeof part, { type: "text" }> => part.type === "text",
    );
    if (textPart?.text) return textPart.text;
  }
  return "";
}

function deriveFallbackTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "New thread";
  return normalized.length > 48 ? `${normalized.slice(0, 45).trimEnd()}…` : normalized;
}

const chatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  system: z.string().optional(),
  tools: z.record(z.string(), z.unknown()).optional(),
  config: z
    .object({
      modelName: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

const titleRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        text: z.string(),
      }),
    )
    .min(1),
});

export const assistant = new Hono();

assistant.get("/models", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const resolution = await resolveGeminiModels(getGeminiConfig());
  return c.json(resolution);
});

assistant.post("/title", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const parsed = titleRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ title: "New thread" });
  }

  const firstUserText =
    parsed.data.messages.find((m) => m.role === "user")?.text ?? parsed.data.messages[0]!.text;
  const fallback = deriveFallbackTitle(firstUserText);

  const resolved = createGeminiLanguageModel(getGeminiConfig());
  if (resolved.kind !== "model") {
    return c.json({ title: fallback });
  }

  try {
    const transcript = parsed.data.messages
      .slice(0, 4)
      .map((m) => `${m.role}: ${m.text.slice(0, 300)}`)
      .join("\n");

    const { text } = await generateText({
      model: resolved.model,
      system:
        "Generate a concise 3 to 6 word title for this conversation. Return only the title text without quotes or trailing punctuation.",
      prompt: transcript,
    });
    const cleaned = text.replace(/^["'\s]+|["'\s.]+$/g, "").trim();
    return c.json({ title: cleaned.length > 0 ? cleaned.slice(0, 80) : fallback });
  } catch {
    return c.json({ title: fallback });
  }
});

assistant.post("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const rawBody = await c.req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: "Invalid chat request payload" }, 400);
  }

  const { messages, system, tools, config } = parsed.data;
  const requestedModelId = typeof config?.modelName === "string" ? config.modelName : undefined;
  const resolved = createGeminiLanguageModel(getGeminiConfig(), requestedModelId);

  if (resolved.kind === "unconfigured") {
    return c.json({ error: resolved.reason }, 503);
  }

  if (resolved.kind === "mock") {
    const prompt = extractLastUserText(messages);
    const reply = [
      prompt ? `Received: "${prompt}"` : "Assistant dev mock is active.",
      "",
      "Configure **Google AI Studio** (`GOOGLE_GENERATIVE_AI_API_KEY`) or **Vertex AI** (`GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_API_KEY`) in `apps/server/.env` to stream live Gemini responses.",
    ].join("\n");

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const partId = crypto.randomUUID();
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: partId });
        writer.write({ type: "text-delta", id: partId, delta: reply });
        writer.write({ type: "text-end", id: partId });
        writer.write({ type: "finish" });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  const combinedSystem = system ? `${DEFAULT_SYSTEM_PROMPT}\n\n${system}` : DEFAULT_SYSTEM_PROMPT;
  const uploadedFrontendTools = frontendTools((tools ?? {}) as Parameters<typeof frontendTools>[0]);

  const result = streamText({
    model: resolved.model,
    system: combinedSystem,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      ...uploadedFrontendTools,
      get_runtime_info: tool({
        description:
          "Return current server time, runtime environment, and authenticated user summary.",
        inputSchema: z.object({}),
        execute: async () => ({
          serverTimeIso: new Date().toISOString(),
          environment: ENV.NODE_ENV,
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            role: session.user.role ?? "user",
          },
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return { usage: part.totalUsage };
      }
      if (part.type === "finish-step") {
        return { modelId: part.response.modelId };
      }
      return undefined;
    },
  });
});
