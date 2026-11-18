import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

type CoachMode = 'experienced' | 'friend' | 'edgy' | 'custom';

const COACH_AVATARS_PATH = path.resolve(
  process.env.PHOTOS_PATH ?? './data/photos',
  'coach-avatars',
);
const COACH_AVATAR_MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
fs.mkdirSync(COACH_AVATARS_PATH, { recursive: true });

function safeCoachAvatarPath(filename: string): string {
  const resolved = path.resolve(COACH_AVATARS_PATH, path.basename(filename));
  if (!resolved.startsWith(COACH_AVATARS_PATH + path.sep)) {
    throw new Error('Invalid coach avatar filename.');
  }
  return resolved;
}

interface AiSettingsRow {
  profile_id: string;
  enabled: number;
  base_url: string;
  model: string;
  coach_mode: CoachMode;
  custom_coach_prompt: string;
  custom_coach_name: string;
  share_user_name: number;
  chat_history_limit: number;
  coach_avatar_url: string | null;
  api_key_ciphertext: Buffer | null;
  api_key_iv: Buffer | null;
  api_key_tag: Buffer | null;
  updated_at: string;
}

class AiProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const CoachModeSchema = z.enum(['experienced', 'friend', 'edgy', 'custom']);
const UpdateAiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().max(512).optional(),
  model: z.string().trim().max(128).optional(),
  apiKey: z.string().max(512).optional(),
  coachMode: CoachModeSchema.optional(),
  customCoachPrompt: z.string().max(8000).optional(),
  customCoachName: z.string().trim().max(48).optional(),
  shareUserName: z.boolean().optional(),
  chatHistoryLimit: z.number().int().min(4).max(100).optional(),
});
const ChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});
const EditAssistantChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
const EditChatMessageSchema = z.union([
  ChatSchema,
  EditAssistantChatMessageSchema,
]);
const ListModelsSchema = z.object({
  baseUrl: z.string().max(512).optional(),
  apiKey: z.string().max(512).optional(),
});
const ChatMemorySchema = z.object({
  summary: z.string().max(12000),
});

const COACH_PRESETS: Record<Exclude<CoachMode, 'custom'>, string> = {
  experienced:
    'You are an experienced gym coach who helps adult men with weight-loss and strength-training goals. Be practical, direct, and specific about progressive resistance training. Do not assume the user is male or wants weight loss; follow their profile and stated goals, and adapt your language accordingly.',
  friend:
    'You are a knowledgeable, encouraging training friend: warm, patient, honest, and easy to talk to. Explain training ideas in plain language, celebrate consistency, and offer realistic next steps without pressure.',
  edgy:
    'You are a high-energy, witty gym coach with an edgy sense of humor. Be bold and playful, but never insult or shame the user about body size, weight, ability, or missed workouts. Keep advice practical, safe, and respectful.',
};

const COACH_SAFETY = `
Fixed coaching boundaries:
- Be weight-inclusive and respectful. Never shame, demean, or moralize body size, food, or missed sessions.
- Offer training education and general exercise suggestions, not diagnosis, treatment, or medication advice.
- Adapt suggestions to the person's experience, stated goals, equipment, mobility, pain, and recovery. Do not assume what their body can do from weight alone.
- Favor gradual progression, manageable effort, rest, and low-impact or seated alternatives when appropriate. Do not prescribe extreme exercise, rapid weight loss, or dangerous restriction.
- If the user reports chest pain, fainting, severe shortness of breath, acute injury, or another urgent symptom, stop training advice and recommend urgent professional care. For chronic conditions or uncertainty about safe activity, suggest discussing an appropriate plan with a healthcare professional.
- Use only the health context supplied below. Account name, username, biography, avatar, and progress photos are deliberately excluded.
- If data is missing, say so and ask a focused question rather than inventing facts. Distinguish measured values from estimates.`;

const REPORT_PROMPT = `Write the coaching narrative for a weekly progress report. Adopt the selected coach personality above so the report sounds like that coach, not a generic analyst. This is a report-only style instruction: use a moderate-to-high amount of relevant emojis (roughly one or two per bullet, around 5–8 overall); do not let this instruction affect normal coach chat. Keep the first three sections brief and specific. Do more than recap the metrics: interpret the direction and reliability of the available signals, connect related habits and outcomes when the records support it, recognize a real win or useful pattern, and give a practical focus for the coming week. Consider every measurement field, including user-created custom fields, by its supplied name and unit. Distinguish a new baseline from a trend, note when there is too little data, and never claim that one behavior caused a body change. Use only supplied records; do not repeat or recalculate the metrics because Forma displays them in a fixed table. Return exactly these four headings, in this order: "## Coach's read", "## Wins & patterns", "## Your focus this week", and "## Overall summary". Under each of the first three headings use one or two concise bullets; include one to three realistic, specific actions in the focus section and briefly say why they fit. Under Overall summary write a single personal, encouraging paragraph of 500–1,000 characters in the selected coach's voice. Make it feel like the coach's considered view of the person's progress and what deserves attention next, with grounded motivation rather than generic cheerleading. Do not use tables, add other headings, diagnose, shame, moralize, or invent missing data.`;

function reportNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function reportMetric(
  label: string,
  latest: number | null,
  previous: number | null,
  unit: string,
  latestCount?: number,
  previousCount?: number,
): string {
  const latestText = latest === null
    ? 'No data'
    : `${reportNumber(latest)}${unit ? ` ${unit}` : ''}${latestCount === undefined ? '' : ` (${latestCount} ${latestCount === 1 ? 'reading' : 'readings'})`}`;
  const previousText = previous === null
    ? 'No data'
    : `${reportNumber(previous)}${unit ? ` ${unit}` : ''}${previousCount === undefined ? '' : ` (${previousCount} ${previousCount === 1 ? 'reading' : 'readings'})`}`;
  let change = 'Not enough data to compare';
  if (latest !== null && previous !== null) {
    const delta = latest - previous;
    change = delta === 0
      ? 'No change'
      : `${delta < 0 ? '↓' : '↑'} ${reportNumber(Math.abs(delta))}${unit ? ` ${unit}` : ''}`;
  } else if (latest !== null) {
    change = 'New data this week';
  } else if (previous !== null) {
    change = 'No data this week';
  }
  return `| ${label} | ${latestText} | ${previousText} | ${change} |`;
}

function reportMetrics(latest: any, previous: any): string {
  const sections: string[] = [];
  const average = (items: any[], selector: (item: any) => number) =>
    items.length ? items.reduce((sum, item) => sum + selector(item), 0) / items.length : null;
  const latestWeights = latest.weights as Array<{ value: number; unit: string }>;
  const previousWeights = previous.weights as Array<{ value: number; unit: string }>;
  const weightUnit = latestWeights[0]?.unit ?? previousWeights[0]?.unit ?? '';
  const latestUnitWeights = latestWeights.filter((entry) => entry.unit === weightUnit);
  const previousUnitWeights = previousWeights.filter((entry) => entry.unit === weightUnit);
  sections.push(reportMetric(
    'Weight',
    average(latestUnitWeights, (entry) => entry.value),
    average(previousUnitWeights, (entry) => entry.value),
    weightUnit, latestUnitWeights.length, previousUnitWeights.length,
  ));

  const groupMeasurements = (items: any[]) => {
    const groups = new Map<string, { unit: string; values: number[] }>();
    for (const item of items as Array<{ site: string; unit: string; value: number }>) {
      const key = item.site;
      const group = groups.get(key) ?? { unit: item.unit, values: [] };
      group.values.push(Number(item.value));
      groups.set(key, group);
    }
    return groups;
  };
  const latestMeasurements = groupMeasurements(latest.measurements);
  const previousMeasurements = groupMeasurements(previous.measurements);
  for (const [site, current] of latestMeasurements) {
    const prior = previousMeasurements.get(site);
    sections.push(reportMetric(
      site,
      average(current.values, (value) => value),
      prior ? average(prior.values, (value) => value) : null,
      current.unit, current.values.length, prior?.values.length,
    ));
  }
  for (const [site, prior] of previousMeasurements) {
    if (!latestMeasurements.has(site)) {
      sections.push(reportMetric(
        site, null,
        average(prior.values, (value) => value), prior.unit, 0, prior.values.length,
      ));
    }
  }

  const latestLogs = latest.nutritionLogs as unknown[];
  const previousLogs = previous.nutritionLogs as unknown[];
  sections.push(reportMetric('Nutrition logs', latestLogs.length, previousLogs.length, 'days'));
  const fastingCount = (items: any[]) => (items as Array<{ status: string }>).filter((item) => item.status === 'completed').length;
  sections.push(reportMetric(
    'Completed fasting sessions', fastingCount(latest.fastingSessions),
    fastingCount(previous.fastingSessions), 'sessions',
  ));
  return [
    '| Metric | Latest Week | Previous Week | Change |',
    '| --- | --- | --- | --- |',
    ...sections,
  ].join('\n');
}

function getEncryptionKey(): Buffer {
  const encoded = (process.env.FORMA_AI_ENCRYPTION_KEY ?? '').trim();
  if (!encoded) {
    throw new Error(
      'FORMA_AI_ENCRYPTION_KEY is missing from the running Forma server. Add it to the container environment and recreate the container.',
    );
  }
  const normalized = encoded.replace(/\s/g, '');
  const key = Buffer.from(normalized, 'base64');
  const canonical = key.toString('base64').replace(/=+$/, '');
  if (key.length !== 32 || canonical !== normalized.replace(/=+$/, '')) {
    throw new Error(
      'FORMA_AI_ENCRYPTION_KEY is invalid. It must be base64 that decodes to exactly 32 bytes. Generate one with: openssl rand -base64 32',
    );
  }
  return key;
}

function isEncryptionKeyReady(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptApiKey(value: string): {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decryptApiKey(row: AiSettingsRow): string {
  if (!row.api_key_ciphertext || !row.api_key_iv || !row.api_key_tag) {
    throw new Error('Add an API token in AI settings first.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    row.api_key_iv,
  );
  decipher.setAuthTag(row.api_key_tag);
  return Buffer.concat([
    decipher.update(row.api_key_ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid AI API base URL.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('The AI API URL must be an HTTP(S) base URL without credentials or query parameters.');
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const host = url.hostname.toLowerCase();
  const ipv4 = host.split('.').map(Number);
  const privateIpv4 = isIP(host) === 4 && (
    ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 ||
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168)
  );
  const privateIpv6 = isIP(host.replace(/^\[|\]$/g, '')) === 6 &&
    /^(\[::1\]|\[fc|\[fd|\[fe80:)/i.test(host);
  if (!isLoopback && (privateIpv4 || privateIpv6 || host.endsWith('.local') || host.endsWith('.internal'))) {
    throw new Error('Private network provider URLs are not allowed. Use a public HTTPS provider URL.');
  }
  if (
    url.protocol === 'http:' &&
    !isLoopback &&
    process.env.FORMA_AI_ALLOW_HTTP_BASE_URL !== 'true'
  ) {
    throw new Error('Use HTTPS for remote AI providers. HTTP is limited to localhost unless the server administrator enables it.');
  }
  return url.toString().replace(/\/+$/, '');
}

function getSettings(profileId: string): AiSettingsRow | undefined {
  return db
    .prepare('SELECT * FROM ai_provider_settings WHERE profile_id = ?')
    .get(profileId) as AiSettingsRow | undefined;
}

function getChatMemory(profileId: string) {
  return db
    .prepare(
      'SELECT summary, updated_at AS updatedAt FROM ai_chat_memory WHERE profile_id = ?',
    )
    .get(profileId) as { summary: string; updatedAt: string } | undefined;
}

function publicSettings(row: AiSettingsRow | undefined) {
  return {
    enabled: Boolean(row?.enabled),
    baseUrl: row?.base_url ?? 'https://api.openai.com/v1',
    model: row?.model ?? '',
    coachMode: row?.coach_mode ?? 'friend',
    customCoachPrompt: row?.custom_coach_prompt ?? '',
    customCoachName: row?.custom_coach_name ?? '',
    shareUserName: Boolean(row?.share_user_name),
    chatHistoryLimit: row?.chat_history_limit ?? 20,
    customCoachAvatarUrl: row?.coach_avatar_url ?? null,
    hasApiKey: Boolean(row?.api_key_ciphertext),
    serverEncryptionReady: isEncryptionKeyReady(),
  };
}

function requireUsableSettings(profileId: string): AiSettingsRow {
  const row = getSettings(profileId);
  if (!row?.enabled) throw new Error('Enable AI features in AI settings first.');
  if (!row.model.trim()) throw new Error('Choose an AI model in AI settings first.');
  if (!row.api_key_ciphertext) throw new Error('Add an API token in AI settings first.');
  return row;
}

async function callChatCompletion(
  row: AiSettingsRow,
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens = 1400,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(row.base_url);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: row.model,
        messages,
        temperature: 0.6,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: unknown } })?.cause;
    const code = typeof cause?.code === 'string'
      ? cause.code
      : error instanceof Error
        ? error.name
        : undefined;
    throw new AiProviderError(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The AI provider request timed out. Try again or use a provider with a faster response.'
        : 'Could not connect to the configured AI provider. Check the base URL and server network connection.',
      undefined,
      code,
    );
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? `The AI provider rejected the API token (HTTP ${response.status}). Check the token and provider account.`
      : response.status === 404
        ? 'The AI provider could not find the configured endpoint or model (HTTP 404). Check the base URL and model ID.'
        : response.status === 429
          ? 'The AI provider rate limited this request (HTTP 429). Check your provider quota or try again later.'
          : response.status >= 500
            ? `The AI provider is unavailable (HTTP ${response.status}). Try again later.`
            : `The AI provider rejected the request (HTTP ${response.status}). Check that the model supports Chat Completions.`;
    throw new AiProviderError(message, response.status);
  }
  const data = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        content?: string | Array<{ text?: string }> | null;
        tool_calls?: unknown[];
        reasoning?: unknown;
      };
    }>;
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const combined = content.map((part) => part.text ?? '').join('').trim();
    if (combined) return combined;
  }
  const details = choice?.finish_reason === 'length'
    ? ' The response reached its token limit before producing text; increase the output token limit or use a non-reasoning model.'
    : choice?.message?.tool_calls?.length
      ? ' The model returned a tool call, which Forma does not support.'
      : choice?.message?.reasoning
        ? ' The model returned reasoning without a text answer; try a model that returns a final chat message.'
        : '';
  throw new Error(`The AI provider returned an empty response.${details}`);
}

function logAiFailure(
  fastify: FastifyInstance,
  feature: string,
  row: AiSettingsRow | undefined,
  error: unknown,
): void {
  let providerHost: string | undefined;
  if (row?.base_url) {
    try {
      providerHost = new URL(row.base_url).hostname;
    } catch {
      providerHost = undefined;
    }
  }
  const providerError = error instanceof AiProviderError ? error : undefined;
  fastify.log.warn(
    {
      feature,
      providerHost,
      model: row?.model,
      providerStatus: providerError?.statusCode,
      providerErrorCode: providerError?.code,
      error: error instanceof Error ? error.message : 'Unknown AI provider error',
    },
    'AI provider request failed',
  );
}

function accountIdentifiers(profileId: string): string[] {
  const row = db
    .prepare('SELECT username, display_name FROM profiles WHERE id = ?')
    .get(profileId) as { username: string; display_name: string | null } | undefined;
  return [row?.username, row?.display_name ?? undefined]
    .filter((value): value is string => Boolean(value && value.length > 2));
}

function sharedDisplayName(row: AiSettingsRow, profileId: string): string | null {
  if (row.coach_mode !== 'custom' || !row.share_user_name) return null;
  const profile = db
    .prepare('SELECT display_name FROM profiles WHERE id = ?')
    .get(profileId) as { display_name: string | null } | undefined;
  const name = profile?.display_name?.trim();
  return name || null;
}

function aiIdentityContext(row: AiSettingsRow, profileId: string): string {
  const name = sharedDisplayName(row, profileId);
  return name
    ? `The user has opted to share their display name: ${JSON.stringify(name)}. Use it naturally and only when it feels helpful. Usernames, biographies, and photos remain excluded.`
    : 'The user’s name, username, biography, and photos are excluded.';
}

function redactAccountNames(value: string | null, identifiers: string[]): string | null {
  if (value == null) return null;
  let cleaned = value;
  for (const identifier of identifiers) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'giu'),
      '$1[redacted]',
    );
  }
  return cleaned;
}

function buildUserContext(profileId: string) {
  const identifiers = accountIdentifiers(profileId);
  const settingRows = db
    .prepare(
      `SELECT key, value FROM settings WHERE profile_id = ?
       AND key IN ('unit_system', 'height_cm', 'sex', 'date_of_birth')`,
    )
    .all(profileId) as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const row of settingRows) settings[row.key] = row.value;
  let ageYears: number | null = null;
  if (settings.date_of_birth) {
    const birthDate = new Date(`${settings.date_of_birth}T00:00:00Z`);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      ageYears = today.getUTCFullYear() - birthDate.getUTCFullYear();
      if (
        today.getUTCMonth() < birthDate.getUTCMonth() ||
        (today.getUTCMonth() === birthDate.getUTCMonth() &&
          today.getUTCDate() < birthDate.getUTCDate())
      ) {
        ageYears--;
      }
    }
  }

  const weights = db
    .prepare(
      `SELECT value, unit, recorded_at, notes FROM weight_entries
       WHERE profile_id = ? ORDER BY recorded_at ASC`,
    )
    .all(profileId) as Array<{
    value: number;
    unit: string;
    recorded_at: string;
    notes: string | null;
  }>;
  const measurements = db
    .prepare(
      `SELECT md.name AS site, md.slug, md.unit, md.is_system, me.value, me.recorded_at, me.notes
       FROM measurement_entries me
       JOIN measurement_definitions md ON md.id = me.definition_id
       WHERE me.profile_id = ? ORDER BY me.recorded_at ASC`,
    )
    .all(profileId) as Array<{
    site: string;
    slug: string;
    unit: string;
    is_system: number;
    value: number;
    recorded_at: string;
    notes: string | null;
  }>;
  const goals = db
    .prepare(
      `SELECT starting_weight, starting_weight_unit, target_weight, target_weight_unit,
              target_date, notes, created_at, updated_at
       FROM goals WHERE profile_id = ? ORDER BY updated_at ASC`,
    )
    .all(profileId) as Array<Record<string, unknown>>;
  const nutritionPlan = db
    .prepare(
      `SELECT diet_type, activity_level, daily_calories, protein_grams,
              carbs_grams, fat_grams, protein_pct, carbs_pct, fat_pct
       FROM nutrition_plans WHERE profile_id = ?`,
    )
    .get(profileId) ?? null;
  const nutritionLogs = db
    .prepare(
      `SELECT date, calories, protein_grams, carbs_grams, fat_grams, notes
       FROM daily_nutrition_logs WHERE profile_id = ? ORDER BY date ASC`,
    )
    .all(profileId) as Array<{
    date: string;
    calories: number | null;
    protein_grams: number | null;
    carbs_grams: number | null;
    fat_grams: number | null;
    notes: string | null;
  }>;
  const fastingSessions = db
    .prepare(
      `SELECT fast_type, target_duration_hours, started_at, ended_at,
              status, notes, mood
       FROM fasting_sessions WHERE profile_id = ? ORDER BY started_at ASC`,
    )
    .all(profileId) as Array<{
    fast_type: string;
    target_duration_hours: number;
    started_at: string;
    ended_at: string | null;
    status: string;
    notes: string | null;
    mood: string | null;
  }>;

  return {
    profile: {
      ageYears,
      sex: settings.sex ?? null,
      heightCm: settings.height_cm ? Number(settings.height_cm) : null,
      unitSystem: settings.unit_system ?? 'metric',
    },
    goals: goals.map((goal) => ({
      ...goal,
      notes: redactAccountNames(goal.notes as string | null, identifiers),
    })),
    weightHistory: weights.map((entry) => ({
      ...entry,
      notes: redactAccountNames(entry.notes, identifiers),
    })),
    measurementHistory: measurements.map((entry) => ({
      ...entry,
      isCustom: !entry.is_system,
      notes: redactAccountNames(entry.notes, identifiers),
    })),
    nutrition: {
      plan: nutritionPlan,
      dailyLogs: nutritionLogs.map((entry) => ({
        ...entry,
        notes: redactAccountNames(entry.notes, identifiers),
      })),
    },
    fastingHistory: fastingSessions.map((entry) => ({
      ...entry,
      notes: redactAccountNames(entry.notes, identifiers),
    })),
    excluded: ['account name and username', 'profile biography', 'avatar and progress photos'],
  };
}

function shiftDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function getWeeklySnapshot(profileId: string, from: string, to: string) {
  const identifiers = accountIdentifiers(profileId);
  return {
    period: { from, to },
    weights: db
      .prepare(
        `SELECT value, unit, recorded_at, notes FROM weight_entries
         WHERE profile_id = ? AND recorded_at >= ? AND recorded_at < ?
         ORDER BY recorded_at ASC`,
      )
      .all(profileId, `${from}T00:00:00`, `${shiftDate(to, 1)}T00:00:00`)
      .map((entry: any) => ({
        ...entry,
        notes: redactAccountNames(entry.notes, identifiers),
      })),
    measurements: db
      .prepare(
        `SELECT md.name AS site, md.unit, md.is_system, me.value, me.recorded_at, me.notes
         FROM measurement_entries me JOIN measurement_definitions md ON md.id = me.definition_id
         WHERE me.profile_id = ? AND me.recorded_at >= ? AND me.recorded_at < ?
         ORDER BY me.recorded_at ASC`,
      )
      .all(profileId, `${from}T00:00:00`, `${shiftDate(to, 1)}T00:00:00`)
      .map((entry: any) => ({
        ...entry,
        isCustom: !entry.is_system,
        notes: redactAccountNames(entry.notes, identifiers),
      })),
    nutritionLogs: db
      .prepare(
        `SELECT date, calories, protein_grams, carbs_grams, fat_grams, notes
         FROM daily_nutrition_logs WHERE profile_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`,
      )
      .all(profileId, from, to)
      .map((entry: any) => ({
        ...entry,
        notes: redactAccountNames(entry.notes, identifiers),
      })),
    fastingSessions: db
      .prepare(
        `SELECT fast_type, target_duration_hours, started_at, ended_at, status, notes, mood
         FROM fasting_sessions WHERE profile_id = ? AND started_at >= ? AND started_at < ?
         ORDER BY started_at ASC`,
      )
      .all(profileId, `${from}T00:00:00`, `${shiftDate(to, 1)}T00:00:00`)
      .map((entry: any) => ({
        ...entry,
        notes: redactAccountNames(entry.notes, identifiers),
      })),
  };
}

function coachInstructions(row: AiSettingsRow): string {
  if (row.coach_mode === 'custom') return row.custom_coach_prompt.trim();
  const persona = COACH_PRESETS[row.coach_mode] ?? COACH_PRESETS.friend;
  return `${persona}\n\n${COACH_SAFETY}`;
}

const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/ai/settings', { preHandler: requireAuth }, async (request, reply) =>
    reply.send(publicSettings(getSettings(request.profile!.id))),
  );

  fastify.put('/api/ai/settings', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = UpdateAiSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const profileId = request.profile!.id;
    const current = getSettings(profileId);
    const data = parsed.data;
    const enabled = data.enabled ?? Boolean(current?.enabled);
    const baseUrl = normalizeBaseUrl(data.baseUrl ?? current?.base_url ?? 'https://api.openai.com/v1');
    const model = (data.model ?? current?.model ?? '').trim();
    const coachMode = data.coachMode ?? current?.coach_mode ?? 'friend';
    const customPrompt = data.customCoachPrompt ?? current?.custom_coach_prompt ?? '';
    const customCoachName = data.customCoachName ?? current?.custom_coach_name ?? '';
    const shareUserName = data.shareUserName ?? Boolean(current?.share_user_name);
    const chatHistoryLimit = data.chatHistoryLimit ?? current?.chat_history_limit ?? 20;

    if (enabled && !model) {
      return reply.code(400).send({ error: 'Choose a model before enabling AI features.' });
    }
    if (coachMode === 'custom' && !customPrompt.trim()) {
      return reply.code(400).send({ error: 'Add a custom coach prompt or choose a preset.' });
    }

    let encrypted: ReturnType<typeof encryptApiKey> | null = null;
    if (data.apiKey?.trim()) {
      try {
        encrypted = encryptApiKey(data.apiKey.trim());
      } catch (error) {
      fastify.log.warn(
        { error: (error as Error).message },
        'AI settings could not encrypt the provider token',
      );
        return reply.code(503).send({ error: (error as Error).message });
      }
    }
    if (enabled && !encrypted && !current?.api_key_ciphertext) {
      return reply.code(400).send({ error: 'Add an API token before enabling AI features.' });
    }

    db.prepare(
      `INSERT INTO ai_provider_settings
       (profile_id, enabled, base_url, model, coach_mode, custom_coach_prompt,
        api_key_ciphertext, api_key_iv, api_key_tag, chat_history_limit,
        custom_coach_name, share_user_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(profile_id) DO UPDATE SET
         enabled = excluded.enabled,
         base_url = excluded.base_url,
         model = excluded.model,
         coach_mode = excluded.coach_mode,
         custom_coach_prompt = excluded.custom_coach_prompt,
         chat_history_limit = excluded.chat_history_limit,
         custom_coach_name = excluded.custom_coach_name,
         share_user_name = excluded.share_user_name,
         api_key_ciphertext = COALESCE(excluded.api_key_ciphertext, ai_provider_settings.api_key_ciphertext),
         api_key_iv = COALESCE(excluded.api_key_iv, ai_provider_settings.api_key_iv),
         api_key_tag = COALESCE(excluded.api_key_tag, ai_provider_settings.api_key_tag),
         updated_at = datetime('now')`,
    ).run(
      profileId,
      enabled ? 1 : 0,
      baseUrl,
      model,
      coachMode,
      customPrompt,
      encrypted?.ciphertext ?? null,
      encrypted?.iv ?? null,
      encrypted?.tag ?? null,
      chatHistoryLimit,
      customCoachName,
      shareUserName ? 1 : 0,
    );
    return reply.send(publicSettings(getSettings(profileId)));
  });

  fastify.post('/api/ai/coach-avatar', { preHandler: requireAuth }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: 'Choose an image to upload.' });
    const extension = COACH_AVATAR_MIME_TYPES.get(file.mimetype);
    if (!extension) {
      file.file.resume();
      return reply.code(400).send({ error: 'Use a JPEG, PNG, or WebP image.' });
    }
    const filename = `coach_${nanoid(16)}.${extension}`;
    const targetPath = safeCoachAvatarPath(filename);
    await pipeline(file.file, fs.createWriteStream(targetPath));
    if (file.file.truncated) {
      fs.unlink(targetPath, () => {});
      return reply.code(413).send({ error: 'Coach avatar must be 5 MB or smaller.' });
    }

    const profileId = request.profile!.id;
    const current = getSettings(profileId);
    if (current?.coach_avatar_url) {
      try {
        fs.unlinkSync(safeCoachAvatarPath(path.basename(current.coach_avatar_url)));
      } catch {
        // Replacing an avatar should still succeed if its previous file is missing.
      }
    }
    const avatarUrl = `/api/ai/coach-avatar/${filename}`;
    db.prepare(
      `INSERT INTO ai_provider_settings (profile_id, coach_avatar_url)
       VALUES (?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET coach_avatar_url = excluded.coach_avatar_url`,
    ).run(profileId, avatarUrl);
    return reply.send({ coachAvatarUrl: avatarUrl });
  });

  fastify.delete('/api/ai/coach-avatar', { preHandler: requireAuth }, async (request, reply) => {
    const profileId = request.profile!.id;
    const current = getSettings(profileId);
    if (current?.coach_avatar_url) {
      try {
        fs.unlinkSync(safeCoachAvatarPath(path.basename(current.coach_avatar_url)));
      } catch {
        // The stored URL is cleared even if the old file is already missing.
      }
      db.prepare(
        'UPDATE ai_provider_settings SET coach_avatar_url = NULL WHERE profile_id = ?',
      ).run(profileId);
    }
    return reply.send({ ok: true });
  });

  fastify.get('/api/ai/coach-avatar/:filename', { preHandler: requireAuth }, async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const avatarUrl = `/api/ai/coach-avatar/${path.basename(filename)}`;
    const current = getSettings(request.profile!.id);
    if (current?.coach_avatar_url !== avatarUrl) {
      return reply.code(404).send({ error: 'Coach avatar not found.' });
    }
    const filePath = safeCoachAvatarPath(filename);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Coach avatar not found.' });
    }
    const extension = path.extname(filename).toLowerCase();
    const contentType = extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
    return reply
      .type(contentType)
      .header('Cache-Control', 'private, max-age=3600')
      .send(fs.createReadStream(filePath));
  });

  fastify.post('/api/ai/models', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ListModelsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid provider settings.' });
    }
    const current = getSettings(request.profile!.id);
    const baseUrlValue = parsed.data.baseUrl?.trim() || current?.base_url;
    if (!baseUrlValue) {
      return reply.code(400).send({ error: 'Enter an API base URL first.' });
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(baseUrlValue);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
    let apiKey = parsed.data.apiKey?.trim();
    if (!apiKey && current?.api_key_ciphertext) {
      try {
        apiKey = decryptApiKey(current);
      } catch (error) {
        return reply.code(503).send({ error: (error as Error).message });
      }
    }
    if (!apiKey) {
      return reply.code(400).send({ error: 'Enter an API token first.' });
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? `The provider rejected the API token (HTTP ${response.status}). Check the token.`
          : response.status === 404
            ? 'The provider does not expose a compatible models endpoint. Enter a model ID manually.'
            : `The provider could not list models (HTTP ${response.status}). Enter a model ID manually.`;
        return reply.code(502).send({ error: message });
      }
      const data = await response.json() as { data?: Array<{ id?: unknown }> };
      const models = [...new Set((Array.isArray(data.data) ? data.data : [])
        .map((model) => typeof model.id === 'string' ? model.id.trim() : '')
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 1000);
      return reply.send({ models });
    } catch (error) {
      fastify.log.warn(
        { providerHost: new URL(baseUrl).hostname, error: error instanceof Error ? error.name : 'unknown' },
        'AI provider model listing failed',
      );
      return reply.code(502).send({ error: 'Could not load models from the provider. Check the URL and server network connection.' });
    }
  });

  fastify.delete('/api/ai/settings/key', { preHandler: requireAuth }, async (request, reply) => {
    db.prepare(
      `UPDATE ai_provider_settings SET enabled = 0, api_key_ciphertext = NULL,
       api_key_iv = NULL, api_key_tag = NULL, updated_at = datetime('now')
       WHERE profile_id = ?`,
    ).run(request.profile!.id);
    return reply.send(publicSettings(getSettings(request.profile!.id)));
  });

  fastify.post('/api/ai/test', { preHandler: requireAuth }, async (request, reply) => {
    const row = getSettings(request.profile!.id);
    if (!row) return reply.code(400).send({ error: 'Save AI provider settings first.' });
    try {
      getEncryptionKey();
      const key = decryptApiKey(row);
      await callChatCompletion(row, key, [
        { role: 'user', content: 'Reply with the single word OK.' },
      ], 256);
      return reply.send({ ok: true });
    } catch (error) {
      const message = (error as Error).message;
      logAiFailure(fastify, 'provider-test', row, error);
      return reply
        .code(message.includes('FORMA_AI_ENCRYPTION_KEY') ? 503 : 502)
        .send({ error: message });
    }
  });

  fastify.post('/api/ai/weekly-report', { preHandler: requireAuth }, async (request, reply) => {
    const profileId = request.profile!.id;
    let row: AiSettingsRow;
    let apiKey: string;
    try {
      row = requireUsableSettings(profileId);
      apiKey = decryptApiKey(row);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
    const end = new Date().toISOString().slice(0, 10);
    const start = shiftDate(end, -6);
    const priorStart = shiftDate(end, -13);
    const priorEnd = shiftDate(end, -7);
    const snapshot = {
      latestWeek: getWeeklySnapshot(profileId, start, end),
      previousWeek: getWeeklySnapshot(profileId, priorStart, priorEnd),
    };
    try {
      const narrative = await callChatCompletion(row, apiKey, [
        { role: 'system', content: `${coachInstructions(row)}\n\n${aiIdentityContext(row, profileId)}\n\n${REPORT_PROMPT}` },
        { role: 'user', content: JSON.stringify(snapshot) },
      ]);
      const content = `${narrative}\n\n## Metrics\n\n${reportMetrics(snapshot.latestWeek, snapshot.previousWeek)}`;
      const id = nanoid();
      db.prepare(
        `INSERT INTO ai_weekly_reports (id, profile_id, week_start, week_end, content)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, profileId, start, end, content);
      return reply.send({ id, weekStart: start, weekEnd: end, content });
    } catch (error) {
      logAiFailure(fastify, 'weekly-report', row, error);
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  fastify.get('/api/ai/weekly-reports', { preHandler: requireAuth }, async (request, reply) => {
    const reports = db
      .prepare(
        `SELECT id, week_start AS weekStart, week_end AS weekEnd, content, created_at AS createdAt
         FROM ai_weekly_reports WHERE profile_id = ? ORDER BY created_at DESC LIMIT 30`,
      )
      .all(request.profile!.id);
    return reply.send(reports);
  });

  fastify.delete('/api/ai/weekly-reports/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db
      .prepare('DELETE FROM ai_weekly_reports WHERE id = ? AND profile_id = ?')
      .run(id, request.profile!.id);
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'Weekly report not found.' });
    }
    return reply.send({ ok: true });
  });

  fastify.get('/api/ai/chat', { preHandler: requireAuth }, async (request, reply) => {
    const messages = db
      .prepare(
        `SELECT id, role, content, created_at AS createdAt FROM (
           SELECT id, role, content, created_at, sequence FROM ai_chat_messages
           WHERE profile_id = ? ORDER BY sequence DESC LIMIT 100
         ) ORDER BY sequence ASC`,
      )
      .all(request.profile!.id);
    return reply.send(messages);
  });

  fastify.delete('/api/ai/chat/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const profileId = request.profile!.id;
    const target = db.prepare(
      'SELECT id, role, sequence FROM ai_chat_messages WHERE id = ? AND profile_id = ?',
    ).get(id, profileId) as { id: string; role: string; sequence: number } | undefined;
    if (!target) return reply.code(404).send({ error: 'Message not found.' });

    const deletedIds = [target.id];
    if (target.role === 'user') {
      const answer = db.prepare(
        `SELECT id FROM ai_chat_messages
         WHERE profile_id = ? AND role = 'assistant' AND sequence > ?
         ORDER BY sequence ASC LIMIT 1`,
      ).get(profileId, target.sequence) as { id: string } | undefined;
      if (answer) deletedIds.push(answer.id);
    }
    const remove = db.prepare(
      'DELETE FROM ai_chat_messages WHERE id = ? AND profile_id = ?',
    );
    db.transaction(() => {
      for (const deletedId of deletedIds) remove.run(deletedId, profileId);
    })();
    return reply.send({ ok: true, deletedIds });
  });

  fastify.get('/api/ai/chat/memory', { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(getChatMemory(request.profile!.id) ?? { summary: '', updatedAt: null });
  });

  fastify.put('/api/ai/chat/memory', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ChatMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Memory must be 12,000 characters or fewer.' });
    }
    const profileId = request.profile!.id;
    db.prepare(
      `INSERT INTO ai_chat_memory (profile_id, summary, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(profile_id) DO UPDATE SET
         summary = excluded.summary, updated_at = datetime('now')`,
    ).run(profileId, parsed.data.summary.trim());
    return reply.send(getChatMemory(profileId));
  });

  fastify.post('/api/ai/chat/memory/generate', { preHandler: requireAuth }, async (request, reply) => {
    const profileId = request.profile!.id;
    let row: AiSettingsRow;
    let apiKey: string;
    try {
      row = requireUsableSettings(profileId);
      apiKey = decryptApiKey(row);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
    const identifiers = accountIdentifiers(profileId);
    const history = db.prepare(
      `SELECT role, content FROM (
         SELECT role, content, sequence FROM ai_chat_messages
         WHERE profile_id = ? ORDER BY sequence DESC LIMIT 100
       ) ORDER BY sequence ASC`,
    ).all(profileId) as Array<{ role: 'user' | 'assistant'; content: string }>;
    if (history.length < 4) {
      return reply.code(400).send({ error: 'Have a few more chat messages with your coach before generating a memory.' });
    }
    const previousMemory = getChatMemory(profileId)?.summary ?? '';
    try {
      const summary = await callChatCompletion(row, apiKey, [
        {
          role: 'system',
          content: 'Create a concise, durable conversation memory for a personal training coach. Keep useful user-shared goals, preferences, constraints, equipment, experience, ongoing plans, and unresolved questions. Update the existing memory with the new conversation: retain still-relevant details, replace outdated ones, and remove details no longer useful. Do not include account names or identifiers. Write only the memory itself, in plain language, under 1,200 words.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            existingMemory: redactAccountNames(previousMemory, identifiers) ?? '',
            recentConversation: history.map((message) => ({
              role: message.role,
              content: redactAccountNames(message.content, identifiers) ?? '',
            })),
          }),
        },
      ], 1800);
      db.prepare(
        `INSERT INTO ai_chat_memory (profile_id, summary, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(profile_id) DO UPDATE SET
           summary = excluded.summary, updated_at = datetime('now')`,
      ).run(profileId, summary);
      return reply.send(getChatMemory(profileId));
    } catch (error) {
      logAiFailure(fastify, 'coach-memory', row, error);
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  fastify.delete('/api/ai/chat', { preHandler: requireAuth }, async (request, reply) => {
    db.prepare('DELETE FROM ai_chat_messages WHERE profile_id = ?').run(request.profile!.id);
    return reply.send({ ok: true });
  });

  fastify.post('/api/ai/chat', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const profileId = request.profile!.id;
    let row: AiSettingsRow;
    let apiKey: string;
    try {
      row = requireUsableSettings(profileId);
      apiKey = decryptApiKey(row);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }

    const identifiers = accountIdentifiers(profileId);
    const userMessage = redactAccountNames(parsed.data.message, identifiers) ?? '';
    const history = db
      .prepare(
        `SELECT role, content FROM (
           SELECT role, content, sequence FROM ai_chat_messages
           WHERE profile_id = ? ORDER BY sequence DESC LIMIT ?
         ) ORDER BY sequence ASC`,
      )
      .all(profileId, row.chat_history_limit) as Array<{
        role: 'user' | 'assistant';
        content: string;
      }>;
    const context = buildUserContext(profileId);
    const memory = getChatMemory(profileId)?.summary.trim();
    const messages = [
      {
        role: 'system' as const,
        content: `${coachInstructions(row)}\n\n${aiIdentityContext(row, profileId)}\nComplete health and activity context. Measurement history includes standard and user-created custom fields; use each field's supplied name, unit, and history when relevant:\n${JSON.stringify(context)}${memory ? `\n\nConversation memory from earlier chats:\n${redactAccountNames(memory, identifiers)}` : ''}`,
      },
      ...history.map((message) => ({
        role: message.role,
        content: redactAccountNames(message.content, identifiers) ?? '',
      })),
      { role: 'user' as const, content: userMessage },
    ];
    try {
      const content = await callChatCompletion(row, apiKey, messages);
      const userMessageId = nanoid();
      const assistantMessageId = nanoid();
      const insert = db.prepare(
        `INSERT INTO ai_chat_messages (id, profile_id, role, content, sequence)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const saveTurn = db.transaction(() => {
        let sequence = (db.prepare(
          'SELECT COALESCE(MAX(sequence), 0) AS value FROM ai_chat_messages WHERE profile_id = ?',
        ).get(profileId) as { value: number }).value;
        insert.run(userMessageId, profileId, 'user', userMessage, ++sequence);
        insert.run(assistantMessageId, profileId, 'assistant', content, ++sequence);
        db.prepare(
          `DELETE FROM ai_chat_messages WHERE profile_id = ? AND id NOT IN (
             SELECT id FROM ai_chat_messages WHERE profile_id = ?
             ORDER BY sequence DESC LIMIT 100
           )`,
        ).run(profileId, profileId);
      });
      saveTurn();
      return reply.send({
        id: assistantMessageId,
        userMessageId,
        role: 'assistant',
        content,
      });
    } catch (error) {
      logAiFailure(fastify, 'coach-chat', row, error);
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  fastify.put('/api/ai/chat/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = EditChatMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Message must be 1 to 4,000 characters.' });
    }
    const { id } = request.params as { id: string };
    const profileId = request.profile!.id;
    if ('content' in parsed.data) {
      const settings = getSettings(profileId);
      if (settings?.coach_mode !== 'custom') {
        return reply.code(403).send({ error: 'AI replies can only be edited in Custom personality mode.' });
      }
      const target = db.prepare(
        `SELECT id FROM ai_chat_messages
         WHERE id = ? AND profile_id = ? AND role = 'assistant'`,
      ).get(id, profileId) as { id: string } | undefined;
      if (!target) return reply.code(404).send({ error: 'AI reply not found.' });
      db.prepare(
        'UPDATE ai_chat_messages SET content = ? WHERE id = ? AND profile_id = ?',
      ).run(parsed.data.content, id, profileId);
      return reply.send({ id, role: 'assistant', content: parsed.data.content });
    }

    let row: AiSettingsRow;
    let apiKey: string;
    try {
      row = requireUsableSettings(profileId);
      apiKey = decryptApiKey(row);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }

    const lastUser = db.prepare(
      `SELECT id, sequence FROM ai_chat_messages
       WHERE profile_id = ? AND role = 'user' ORDER BY sequence DESC LIMIT 1`,
    ).get(profileId) as { id: string; sequence: number } | undefined;
    if (!lastUser || lastUser.id !== id) {
      return reply.code(400).send({ error: 'Only your most recent message can be edited and regenerated.' });
    }

    const identifiers = accountIdentifiers(profileId);
    const userMessage = redactAccountNames(parsed.data.message, identifiers) ?? '';
    const history = db.prepare(
      `SELECT role, content FROM (
         SELECT role, content, sequence FROM ai_chat_messages
         WHERE profile_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT ?
       ) ORDER BY sequence ASC`,
    ).all(profileId, lastUser.sequence, row.chat_history_limit) as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
    const context = buildUserContext(profileId);
    const memory = getChatMemory(profileId)?.summary.trim();
    const messages = [
      {
        role: 'system' as const,
        content: `${coachInstructions(row)}\n\n${aiIdentityContext(row, profileId)}\nComplete health and activity context. Measurement history includes standard and user-created custom fields; use each field's supplied name, unit, and history when relevant:\n${JSON.stringify(context)}${memory ? `\n\nConversation memory from earlier chats:\n${redactAccountNames(memory, identifiers)}` : ''}`,
      },
      ...history.map((message) => ({
        role: message.role,
        content: redactAccountNames(message.content, identifiers) ?? '',
      })),
      { role: 'user' as const, content: userMessage },
    ];

    try {
      const content = await callChatCompletion(row, apiKey, messages);
      const answer = db.prepare(
        `SELECT id FROM ai_chat_messages
         WHERE profile_id = ? AND role = 'assistant' AND sequence > ?
         ORDER BY sequence ASC LIMIT 1`,
      ).get(profileId, lastUser.sequence) as { id: string } | undefined;
      const assistantMessageId = answer?.id ?? nanoid();
      db.transaction(() => {
        db.prepare('UPDATE ai_chat_messages SET content = ? WHERE id = ? AND profile_id = ?')
          .run(userMessage, id, profileId);
        if (answer) {
          db.prepare('UPDATE ai_chat_messages SET content = ?, created_at = datetime(\'now\') WHERE id = ? AND profile_id = ?')
            .run(content, assistantMessageId, profileId);
        } else {
          const nextSequence = (db.prepare(
            'SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM ai_chat_messages WHERE profile_id = ?',
          ).get(profileId) as { value: number }).value;
          db.prepare(
            `INSERT INTO ai_chat_messages (id, profile_id, role, content, sequence)
             VALUES (?, ?, 'assistant', ?, ?)`,
          ).run(assistantMessageId, profileId, content, nextSequence);
        }
      })();
      return reply.send({
        id: assistantMessageId,
        userMessageId: id,
        role: 'assistant',
        content,
      });
    } catch (error) {
      logAiFailure(fastify, 'coach-edit', row, error);
      return reply.code(502).send({ error: (error as Error).message });
    }
  });
};

export default aiRoutes;
