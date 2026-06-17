import { chatJSON as openRouterChatJSON, validateKey as validateOpenRouterKey } from './openrouter.js'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'

export const DEEPSEEK_MODEL_OPTIONS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
]

const DEEPSEEK_BASE = 'https://api.deepseek.com'

function extractJson(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : String(text || '')
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

export function normalizeProvider(provider) {
  return provider === 'deepseek' ? 'deepseek' : 'openrouter'
}

export function providerKey(keys, provider) {
  return normalizeProvider(provider) === 'deepseek' ? keys?.deepseek : keys?.openrouter
}

export function providerModel(config, provider) {
  const p = normalizeProvider(provider)
  if (p === 'deepseek') return config?.models?.deepseek || config?.deepseekModel || DEFAULT_DEEPSEEK_MODEL
  return config?.models?.openrouter || config?.model || 'openai/gpt-4o-mini'
}

function missingKeyMessage(provider) {
  return provider === 'deepseek'
    ? 'Missing DeepSeek API key. Add it in Settings.'
    : 'Missing OpenRouter API key. Add it in Settings.'
}

async function deepSeekChatJSON({ apiKey, model, prompt, options = {} }) {
  if (!apiKey) throw new Error(missingKeyMessage('deepseek'))
  if (!model) throw new Error('No DeepSeek model selected. Pick one in Settings.')

  const body = {
    model,
    max_tokens: options.maxTokens || 6000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You return valid JSON only. Do not include markdown, prose, or code fences.',
      },
      { role: 'user', content: prompt },
    ],
  }
  if (/^deepseek-v4-/i.test(model)) body.thinking = { type: options.thinking === 'enabled' ? 'enabled' : 'disabled' }

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const parsedBody = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = parsedBody?.error?.message || parsedBody?.message || res.statusText
    throw new Error(`DeepSeek ${res.status}: ${msg}`)
  }
  const content = parsedBody?.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek returned no content.')
  return extractJson(content)
}

export async function chatJSON({ provider = 'openrouter', apiKey, model, prompt, options }) {
  const p = normalizeProvider(provider)
  if (p === 'deepseek') return deepSeekChatJSON({ apiKey, model, prompt, options })
  return openRouterChatJSON({ apiKey, model, prompt })
}

export async function validateDeepSeekKey(apiKey, model = DEFAULT_DEEPSEEK_MODEL) {
  if (!apiKey) throw new Error(missingKeyMessage('deepseek'))
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: 'Return {"ok":true}' },
      ],
      ...(model && /^deepseek-v4-/i.test(model) ? { thinking: { type: 'disabled' } } : {}),
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body?.error?.message || body?.message || 'invalid key'}`)
  return true
}

export async function validateProviderKey({ provider, apiKey, model }) {
  const p = normalizeProvider(provider)
  if (p === 'deepseek') return validateDeepSeekKey(apiKey, model || DEFAULT_DEEPSEEK_MODEL)
  return validateOpenRouterKey(apiKey)
}

export async function listDeepSeekModels(apiKey) {
  if (!apiKey) return DEEPSEEK_MODEL_OPTIONS
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return DEEPSEEK_MODEL_OPTIONS
    const body = await res.json()
    const remote = (body?.data || [])
      .map((m) => ({ id: m.id, name: m.id }))
      .filter((m) => m.id)
    const ids = new Set(remote.map((m) => m.id))
    return [...remote, ...DEEPSEEK_MODEL_OPTIONS.filter((m) => !ids.has(m.id))]
  } catch {
    return DEEPSEEK_MODEL_OPTIONS
  }
}
