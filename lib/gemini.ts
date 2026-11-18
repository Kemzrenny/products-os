import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

// Gemini, set up the way The Doer Life uses it: the interactions API, a light model for
// short work, a careful one where judgement matters, and a fallback when one is busy.
// AI_FAKE=1 swaps in canned answers, for local testing without a key.

export class AiError extends Error {
  kind: "not_configured" | "rate_limit" | "invalid_output" | "other";
  constructor(kind: AiError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new AiError("not_configured", "AI isn't set up yet. Add GEMINI_API_KEY in Vercel.");
  client ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 120_000, retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 2 } },
  });
  return client;
}

export const aiFake = () => process.env.AI_FAKE === "1";
export const aiConfigured = () => aiFake() || !!process.env.GEMINI_API_KEY;

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.1-flash-lite";
const CAREFUL_MODEL = process.env.GEMINI_CAREFUL_MODEL ?? "gemini-3.5-flash";

type InteractionsInput = Parameters<GoogleGenAI["interactions"]["create"]>[0]["input"];

function errorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number") return status;
  const m = (err instanceof Error ? err.message : "").match(/^\D*(\d{3})\b/);
  return m ? Number(m[1]) : undefined;
}

function classify(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const message = err instanceof Error ? err.message : "The AI request failed.";
  if (errorStatus(err) === 429 || /rate limit|quota/i.test(message)) {
    return new AiError("rate_limit", "The AI is busy right now (rate limit). Try again in a minute.");
  }
  return new AiError("other", message);
}

async function call(input: InteractionsInput, schema: object | undefined, model: string): Promise<{ text: string; model: string }> {
  let current = model;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const interaction = await ai().interactions.create({
        model: current,
        input,
        response_format: schema ? { type: "text", mime_type: "application/json", schema } : undefined,
      });
      const text = interaction.output_text?.trim();
      if (!text) throw new AiError("invalid_output", "The AI returned nothing.");
      return { text, model: current };
    } catch (err) {
      lastError = err;
      if (err instanceof AiError && err.kind === "not_configured") throw err;
      const status = errorStatus(err);
      const transient = status === undefined || status === 429 || status >= 500;
      if (!transient) break;
      if (current !== FALLBACK_MODEL) current = FALLBACK_MODEL;
      else await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw classify(lastError);
}

// House style for everything the AI writes.
const STYLE = `Write in plain, specific British English. Short sentences. No hype, no filler.
Never use em dashes or en dashes; use commas, colons or full stops.
Only state what the provided context supports. When evidence is missing, say "no evidence" rather than inventing numbers, customers or revenue.`;

export async function aiJson<T>(opts: {
  instruction: string;
  context: string;
  schema: object;
  parse: z.ZodType<T>;
  careful?: boolean;
  fake: () => T;
}): Promise<{ data: T; model: string }> {
  if (aiFake()) return { data: opts.parse.parse(opts.fake()), model: "fake" };
  const { text, model } = await call(
    [{ type: "text", text: `${opts.instruction}\n\n${STYLE}\nRespond only with the JSON described by the schema.\n\n---\n${opts.context}` }],
    opts.schema,
    opts.careful ? CAREFUL_MODEL : PRIMARY_MODEL,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError("invalid_output", "The AI's answer couldn't be read. Try again.");
  }
  const parsed = opts.parse.safeParse(raw);
  if (!parsed.success) throw new AiError("invalid_output", "The AI's answer was incomplete. Try again.");
  return { data: parsed.data, model };
}

export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiError) return err.message;
  console.error(err);
  return "The AI request failed. Try again.";
}

// ---------- Audio ----------

// Transcribes one part of a recording. Parts are a couple of minutes long, so each call is
// quick and a failed part can be retried on its own. The audio goes to Gemini's file store
// (kept 48 hours there) and is deleted straight after.
export async function aiTranscribe(audio: Buffer, mimeType: string, instruction: string, fake: () => string): Promise<{ text: string; model: string }> {
  if (aiFake()) return { text: fake(), model: "fake" };
  const { writeFile, unlink } = await import("fs/promises");
  const { tmpdir } = await import("os");
  const path = await import("path");
  const { randomUUID } = await import("crypto");
  const tmp = path.join(tmpdir(), `${randomUUID()}.audio`);
  await writeFile(tmp, audio);
  let name = "";
  try {
    const uploaded = await ai().files.upload({ file: tmp, config: { mimeType } });
    name = uploaded.name ?? "";
    const files = ai().files as unknown as { get: (a: { name: string }) => Promise<{ state?: unknown }> };
    let state: unknown = uploaded.state;
    for (let i = 0; i < 20 && name && String(state ?? "").toUpperCase() === "PROCESSING"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      state = (await files.get({ name })).state;
    }
    if (!uploaded.uri) throw new AiError("other", "The audio couldn't be sent for transcription.");
    const { text, model } = await call(
      [
        { type: "text", text: instruction },
        { type: "audio", uri: uploaded.uri, mime_type: uploaded.mimeType ?? mimeType },
      ] as InteractionsInput,
      undefined,
      CAREFUL_MODEL,
    );
    return { text, model };
  } catch (err) {
    throw classify(err);
  } finally {
    await unlink(tmp).catch(() => {});
    if (name) await (ai().files as unknown as { delete: (a: { name: string }) => Promise<unknown> }).delete({ name }).catch(() => {});
  }
}
