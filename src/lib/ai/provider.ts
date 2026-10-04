import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError, GoogleGenAI, type Content, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";

/**
 * AI features are optional: they switch on when a Gemini or an Anthropic key is
 * configured. Gemini wins when both are set (its free tier is enough for this app).
 */
type Provider = "gemini" | "anthropic";

function provider(): Provider | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return null;
}

export function isAiEnabled(): boolean {
  return provider() !== null;
}

export class AiUnavailableError extends Error {}

// "Latest flash" follows Google's current free-tier model, so a retired model name can't break the feature.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// The free tier is sometimes overloaded; one retry on the lighter model usually gets through.
const GEMINI_FALLBACK = "gemini-flash-lite-latest";

let gemini: GoogleGenAI | undefined;
let anthropic: Anthropic | undefined;

async function geminiGenerate(contents: string | Content[], config: GenerateContentConfig) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    return await gemini.models.generateContent({ model: GEMINI_MODEL, contents, config });
  } catch (error) {
    const busy = error instanceof ApiError && (error.status === 429 || error.status >= 500);
    if (!busy || GEMINI_MODEL === GEMINI_FALLBACK) throw error;
    return gemini.models.generateContent({ model: GEMINI_FALLBACK, contents, config });
  }
}

function unavailable(error: unknown, what: string): never {
  const status = error instanceof ApiError ? error.status : error instanceof Anthropic.APIError ? error.status : undefined;
  if (status === 429 || status === 503) throw new AiUnavailableError("The AI service is busy. Try again in a minute.");
  if (status === 401 || status === 403) throw new AiUnavailableError("The AI service rejected this server's key.");
  if (error instanceof ApiError || error instanceof Anthropic.APIError) throw new AiUnavailableError(`The AI service couldn't ${what} right now.`);
  throw error;
}

/** Plain text. Returns null when the model declines or says nothing. */
export async function generateText(input: { system: string; prompt: string; maxTokens: number; what: string }): Promise<string | null> {
  const which = provider();
  if (!which) throw new AiUnavailableError("AI features aren't configured on this server.");
  try {
    if (which === "gemini") {
      const res = await geminiGenerate(input.prompt, { systemInstruction: input.system, maxOutputTokens: input.maxTokens });
      return res.text?.trim() || null;
    }
    anthropic ??= new Anthropic();
    const res = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: input.maxTokens,
      output_config: { effort: "low" },
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (error) {
    unavailable(error, input.what);
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** A conversation: earlier turns plus the latest question. Returns null when the model says nothing. */
export async function generateChat(input: { system: string; turns: ChatTurn[]; maxTokens: number; what: string }): Promise<string | null> {
  const which = provider();
  if (!which) throw new AiUnavailableError("AI features aren't configured on this server.");
  try {
    if (which === "gemini") {
      const contents: Content[] = input.turns.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] }));
      const res = await geminiGenerate(contents, { systemInstruction: input.system, maxOutputTokens: input.maxTokens });
      return res.text?.trim() || null;
    }
    anthropic ??= new Anthropic();
    const res = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: input.maxTokens,
      output_config: { effort: "low" },
      system: input.system,
      messages: input.turns.map((t) => ({ role: t.role, content: t.text })),
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (error) {
    unavailable(error, input.what);
  }
}

/** Gemini takes plain JSON Schema; the "$schema" dialect marker is noise to it. */
function jsonSchema(schema: z.ZodType) {
  const out: Record<string, unknown> = z.toJSONSchema(schema);
  delete out.$schema;
  return out;
}

/** Structured output checked against `schema`. Returns null when the model declines or the shape is wrong. */
export async function generateJson<T extends z.ZodType>(input: {
  system: string;
  prompt: string;
  schema: T;
  maxTokens: number;
  what: string;
}): Promise<z.infer<T> | null> {
  const which = provider();
  if (!which) throw new AiUnavailableError("AI features aren't configured on this server.");
  try {
    if (which === "gemini") {
      const res = await geminiGenerate(input.prompt, {
        systemInstruction: input.system,
        maxOutputTokens: input.maxTokens,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(input.schema),
      });
      if (!res.text) return null;
      let json: unknown;
      try {
        json = JSON.parse(res.text);
      } catch {
        return null;
      }
      const parsed = input.schema.safeParse(json);
      return parsed.success ? parsed.data : null;
    }
    anthropic ??= new Anthropic();
    const res = await anthropic.beta.messages.parse({
      model: ANTHROPIC_MODEL,
      max_tokens: input.maxTokens,
      // Simple extraction: low effort is enough and keeps it fast.
      output_config: { effort: "low", format: betaZodOutputFormat(input.schema) },
      // If a safety classifier declines, retry on a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output as z.infer<T>;
  } catch (error) {
    unavailable(error, input.what);
  }
}
