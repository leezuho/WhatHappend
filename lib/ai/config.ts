// Which AI provider and key to use. SDK-free: read by both the worker (to call
// the model) and the web server (to show "needs key" states).
//
//   AI_PROVIDER     gemini | anthropic   (optional: guessed from the key)
//   AI_API_KEY      the provider's key   (or GEMINI_API_KEY / GOOGLE_API_KEY / ANTHROPIC_API_KEY)
//   AI_MODEL_BRIEF  model for the daily brief
//   AI_MODEL_FAST   model for bulk headline translation + tagging

export type AiProviderName = "gemini" | "anthropic";

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  models: { brief: string; fast: string };
}

export type AiStatus = { ok: true; config: AiConfig } | { ok: false; reason: string };

const DEFAULT_MODELS: Record<AiProviderName, AiConfig["models"]> = {
  // "-latest" aliases follow Google's newest stable models, so they don't break on deprecations.
  // Flash (not Pro) for the brief: Pro has no free-tier quota; set AI_MODEL_BRIEF=gemini-pro-latest on a paid plan.
  gemini: { brief: "gemini-flash-latest", fast: "gemini-flash-lite-latest" },
  anthropic: { brief: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
};

export const AI_ENV_HINT = "AI_API_KEY (Gemini or Claude)";

function guessProvider(key: string): AiProviderName {
  return key.startsWith("sk-ant-") ? "anthropic" : "gemini";
}

export function aiStatus(env: NodeJS.ProcessEnv = process.env): AiStatus {
  const raw = env.AI_PROVIDER?.trim().toLowerCase();
  if (raw && raw !== "gemini" && raw !== "anthropic") {
    return { ok: false, reason: `AI_PROVIDER must be "gemini" or "anthropic" (got "${env.AI_PROVIDER}")` };
  }
  const specific: Record<AiProviderName, string | undefined> = {
    gemini: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  };
  const generic = env.AI_API_KEY?.trim();
  const provider: AiProviderName | null =
    (raw as AiProviderName | undefined) ??
    (generic ? guessProvider(generic) : specific.gemini ? "gemini" : specific.anthropic ? "anthropic" : null);
  if (!provider) return { ok: false, reason: `set ${AI_ENV_HINT} in .env.local` };
  const apiKey = generic || specific[provider];
  if (!apiKey) return { ok: false, reason: `AI_PROVIDER=${provider} but no key: set AI_API_KEY` };
  return {
    ok: true,
    config: {
      provider,
      apiKey,
      models: {
        brief: env.AI_MODEL_BRIEF?.trim() || DEFAULT_MODELS[provider].brief,
        fast: env.AI_MODEL_FAST?.trim() || DEFAULT_MODELS[provider].fast,
      },
    },
  };
}

export function isAiConfigured(): boolean {
  return aiStatus().ok;
}
