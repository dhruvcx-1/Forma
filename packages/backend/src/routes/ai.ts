import type { FastifyPluginAsync } from 'fastify';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../auth/plugin.js';

type CoachMode = 'experienced' | 'friend' | 'edgy' | 'custom';

interface AiSettingsRow {
  profile_id: string;
  enabled: number;
  base_url: string;
  model: string;
  coach_mode: CoachMode;
  custom_coach_prompt: string;
  api_key_ciphertext: Buffer | null;
  api_key_iv: Buffer | null;
  api_key_tag: Buffer | null;
  updated_at: string;
}

const CoachModeSchema = z.enum(['experienced', 'friend', 'edgy', 'custom']);
const UpdateAiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().max(512).optional(),
  model: z.string().trim().max(128).optional(),
  apiKey: z.string().max(512).optional(),
  coachMode: CoachModeSchema.optional(),
  customCoachPrompt: z.string().max(8000).optional(),
});
const ChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
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

const REPORT_PROMPT = `You write a concise, supportive weekly progress report for a self-tracking app. Use only the supplied records. Compare the latest 7-day period with the previous 7 days when data allows. Mention what changed, what stayed consistent, and one to three optional next steps. Do not diagnose, moralize weight or food, or invent missing data. Make clear when a body-composition value is an estimate. Keep the report useful even when tracking is incomplete.`;

function getEncryptionKey(): Buffer {
  const encoded = process.env.FORMA_AI_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'AI key encryption is not configured. Set FORMA_AI_ENCRYPTION_KEY to a base64-encoded 32-byte key on the Forma server.',
    );
  }
  return key;
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

function publicSettings(row: AiSettingsRow | undefined) {
  return {
    enabled: Boolean(row?.enabled),
    baseUrl: row?.base_url ?? 'https://api.openai.com/v1',
    model: row?.model ?? '',
    coachMode: row?.coach_mode ?? 'friend',
    customCoachPrompt: row?.custom_coach_prompt ?? '',
    hasApiKey: Boolean(row?.api_key_ciphertext),
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
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error('Could not connect to the configured AI provider. Check the base URL and try again.');
  }
  if (!response.ok) {
    throw new Error(`The AI provider returned HTTP ${response.status}. Check the token, model, and provider settings.`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const combined = content.map((part) => part.text ?? '').join('').trim();
    if (combined) return combined;
  }
  throw new Error('The AI provider returned an empty response.');
}

function accountIdentifiers(profileId: string): string[] {
  const row = db
    .prepare('SELECT username, display_name FROM profiles WHERE id = ?')
    .get(profileId) as { username: string; display_name: string | null } | undefined;
  return [row?.username, row?.display_name ?? undefined]
    .filter((value): value is string => Boolean(value && value.length > 2));
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
      `SELECT md.name AS site, md.slug, md.unit, me.value, me.recorded_at, me.notes
       FROM measurement_entries me
       JOIN measurement_definitions md ON md.id = me.definition_id
       WHERE me.profile_id = ? ORDER BY me.recorded_at ASC`,
    )
    .all(profileId) as Array<{
    site: string;
    slug: string;
    unit: string;
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
        `SELECT md.name AS site, md.unit, me.value, me.recorded_at, me.notes
         FROM measurement_entries me JOIN measurement_definitions md ON md.id = me.definition_id
         WHERE me.profile_id = ? AND me.recorded_at >= ? AND me.recorded_at < ?
         ORDER BY me.recorded_at ASC`,
      )
      .all(profileId, `${from}T00:00:00`, `${shiftDate(to, 1)}T00:00:00`)
      .map((entry: any) => ({
        ...entry,
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
  const persona = row.coach_mode === 'custom'
    ? row.custom_coach_prompt.trim()
    : COACH_PRESETS[row.coach_mode] ?? COACH_PRESETS.friend;
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
        return reply.code(503).send({ error: (error as Error).message });
      }
    }
    if (enabled && !encrypted && !current?.api_key_ciphertext) {
      return reply.code(400).send({ error: 'Add an API token before enabling AI features.' });
    }

    db.prepare(
      `INSERT INTO ai_provider_settings
       (profile_id, enabled, base_url, model, coach_mode, custom_coach_prompt,
        api_key_ciphertext, api_key_iv, api_key_tag, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(profile_id) DO UPDATE SET
         enabled = excluded.enabled,
         base_url = excluded.base_url,
         model = excluded.model,
         coach_mode = excluded.coach_mode,
         custom_coach_prompt = excluded.custom_coach_prompt,
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
    );
    return reply.send(publicSettings(getSettings(profileId)));
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
      const key = decryptApiKey(row);
      await callChatCompletion(row, key, [
        { role: 'user', content: 'Reply with the single word OK.' },
      ], 8);
      return reply.send({ ok: true });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
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
      const content = await callChatCompletion(row, apiKey, [
        { role: 'system', content: REPORT_PROMPT },
        { role: 'user', content: JSON.stringify(snapshot) },
      ]);
      const id = nanoid();
      db.prepare(
        `INSERT INTO ai_weekly_reports (id, profile_id, week_start, week_end, content)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, profileId, start, end, content);
      return reply.send({ id, weekStart: start, weekEnd: end, content });
    } catch (error) {
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

  fastify.get('/api/ai/chat', { preHandler: requireAuth }, async (request, reply) => {
    const messages = db
      .prepare(
        `SELECT role, content, created_at AS createdAt FROM (
           SELECT role, content, created_at, id FROM ai_chat_messages
           WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT 100
         ) ORDER BY created_at ASC, id ASC`,
      )
      .all(request.profile!.id);
    return reply.send(messages);
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
           SELECT role, content, created_at, id FROM ai_chat_messages
           WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT 12
         ) ORDER BY created_at ASC, id ASC`,
      )
      .all(profileId) as Array<{ role: 'user' | 'assistant'; content: string }>;
    const context = buildUserContext(profileId);
    const messages = [
      {
        role: 'system' as const,
        content: `${coachInstructions(row)}\n\nComplete health and activity context (account identity and photos excluded):\n${JSON.stringify(context)}`,
      },
      ...history.map((message) => ({
        role: message.role,
        content: redactAccountNames(message.content, identifiers) ?? '',
      })),
      { role: 'user' as const, content: userMessage },
    ];
    try {
      const content = await callChatCompletion(row, apiKey, messages);
      const insert = db.prepare(
        `INSERT INTO ai_chat_messages (id, profile_id, role, content) VALUES (?, ?, ?, ?)`,
      );
      const saveTurn = db.transaction(() => {
        insert.run(nanoid(), profileId, 'user', userMessage);
        insert.run(nanoid(), profileId, 'assistant', content);
        db.prepare(
          `DELETE FROM ai_chat_messages WHERE profile_id = ? AND id NOT IN (
             SELECT id FROM ai_chat_messages WHERE profile_id = ?
             ORDER BY created_at DESC, id DESC LIMIT 100
           )`,
        ).run(profileId, profileId);
      });
      saveTurn();
      return reply.send({ role: 'assistant', content });
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });
};

export default aiRoutes;
