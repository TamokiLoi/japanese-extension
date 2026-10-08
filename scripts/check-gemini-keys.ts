// Check configured Gemini API keys without exposing their values or account data.
// Keys are read only from the ignored local _scratch/.env.gemini file.
//
// Usage:
//   node --experimental-strip-types scripts/check-gemini-keys.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.1-flash-lite";
const REQUEST_DELAY_MS = 1_000;

function readApiKeys(): Array<{ label: string; value: string }> {
  const path = join(ROOT, "_scratch/.env.gemini");
  const text = readFileSync(path, "utf8");
  const entries = text.split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^(GEMINI_API_KEY(?:_[A-Z0-9_]+)?)=(.*)$/u);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value ? [{ label: match[1], value }] : [];
  });
  if (!entries.length) throw new Error("No Gemini API keys found in _scratch/.env.gemini");
  const labels = new Set<string>();
  for (const { label } of entries) {
    if (labels.has(label)) throw new Error(`Duplicate Gemini key label: ${label}`);
    labels.add(label);
  }
  return entries;
}

async function checkKey(label: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with OK." }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      await response.arrayBuffer();
      console.log(`${label}: READY (HTTP ${response.status})`);
      return true;
    }

    let apiStatus = "API_ERROR";
    try {
      const body = await response.json() as { error?: { status?: string } };
      apiStatus = body.error?.status || apiStatus;
    } catch {
      // Keep the report limited to the HTTP/API status; never echo response bodies.
    }
    console.log(`${label}: UNAVAILABLE (HTTP ${response.status}, ${apiStatus})`);
    return false;
  } catch (error) {
    const name = error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR";
    console.log(`${label}: INCONCLUSIVE (${name})`);
    return false;
  }
}

async function main() {
  const entries = readApiKeys();
  let ready = 0;
  console.log(`Checking ${entries.length} Gemini key(s) with ${MODEL}; secret values are never printed.`);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (await checkKey(entry.label, entry.value)) ready++;
    if (index < entries.length - 1) await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
  console.log(`Ready: ${ready}/${entries.length}`);
  if (ready === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
