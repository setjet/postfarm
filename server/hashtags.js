const SPAMMY_TAGS = new Set([
  'followforfollow',
  'likeforlike',
  'follow4follow',
  'like4like',
  'spam',
])

export const GENERIC_HASHTAGS = new Set(['fyp', 'viral', 'explore', 'explorepage', 'trending', 'reels', 'reelsinstagram'])
export const DEFAULT_HASHTAG_STRATEGY = Object.freeze({
  preferred: [],
  required: [],
  banned: [],
  brand: [],
  niche: [],
  tools: [],
  style: 'balanced',
  count: 8,
  trendInfluence: 'balanced',
  avoidGeneric: true,
  notes: '',
})

const STYLES = new Set(['balanced', 'broad', 'niche', 'tool', 'product', 'minimal'])
const TREND_INFLUENCES = new Set(['off', 'light', 'balanced', 'strong'])
const COUNTS = new Set([3, 5, 8, 10])

function brandTag(brain) {
  const source = String(brain?.appName || '').trim()
  if (!source) return ''
  return cleanTag(source, brain)
}

function cleanTag(value, brain) {
  let tag = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9_]+/g, '')

  return tag
}

function rawParts(input) {
  const values = Array.isArray(input) ? input : [input]
  return values.flatMap((value) =>
    String(value || '')
      .replace(/([^\s,])#/g, '$1 #')
      .split(/[,\s]+/)
      .filter(Boolean)
  )
}

export function normalizeHashtags(input, options = {}) {
  const brain = options.brain || null
  const strategy = resolveHashtagStrategy(options.strategy, brain)
  const applyStrategy = options.applyStrategy !== false
  const max = Math.min(Math.max(Math.round(Number(options.max ?? (applyStrategy ? strategy.count : 20)) || 8), 1), 20)
  const banned = new Set([
    ...SPAMMY_TAGS,
    ...(applyStrategy ? strategy.banned : []),
    ...(applyStrategy && strategy.avoidGeneric ? GENERIC_HASHTAGS : []),
  ])
  const required = applyStrategy ? strategy.required.filter((tag) => !banned.has(tag)) : []
  if (options.includeFyp === true && !banned.has('fyp')) required.push('fyp')
  if (applyStrategy && options.includeBrand !== false) {
    const selectedBrand = [...strategy.brand, brandTag(brain)].find((tag) => tag && !banned.has(tag))
    if (selectedBrand) required.push(selectedBrand)
  }
  const seen = new Set()
  const tags = []

  for (const part of rawParts(input)) {
    const tag = cleanTag(part, brain)
    if (!tag || tag.length < 2 || tag.length > 40 || banned.has(tag) || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }

  const cleanRequired = [...new Set(required.map((tag) => cleanTag(tag, brain)).filter((tag) => tag && !banned.has(tag)))]
  const slots = Math.max(max - cleanRequired.length, 0)
  const next = tags.filter((tag) => !cleanRequired.includes(tag)).slice(0, slots)
  for (const tag of cleanRequired) if (!next.includes(tag)) next.push(tag)
  return next.slice(0, max)
}

function strategyTags(input, brain) {
  const seen = new Set()
  return rawParts(input).flatMap((part) => {
    const tag = cleanTag(part, brain)
    if (!tag || tag.length < 2 || tag.length > 40 || seen.has(tag)) return []
    seen.add(tag)
    return [tag]
  }).slice(0, 50)
}

export function resolveHashtagStrategy(input = {}, brain = null) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    preferred: strategyTags(source.preferred, brain),
    required: strategyTags(source.required, brain),
    banned: strategyTags(source.banned, brain),
    brand: strategyTags(source.brand, brain),
    niche: strategyTags(source.niche, brain),
    tools: strategyTags(source.tools, brain),
    style: STYLES.has(source.style) ? source.style : DEFAULT_HASHTAG_STRATEGY.style,
    count: COUNTS.has(Number(source.count)) ? Number(source.count) : DEFAULT_HASHTAG_STRATEGY.count,
    trendInfluence: TREND_INFLUENCES.has(source.trendInfluence) ? source.trendInfluence : DEFAULT_HASHTAG_STRATEGY.trendInfluence,
    avoidGeneric: source.avoidGeneric !== false,
    notes: String(source.notes || '').trim().slice(0, 1000),
  }
}

export function strategyWithHashtagNotes(input, notes, brain = null) {
  const strategy = resolveHashtagStrategy(input, brain)
  const banned = [...strategy.banned]
  const source = String(notes || '')
  for (const match of source.matchAll(/\b(?:avoid|ban|exclude|without|no)\s+#?([a-z0-9_]+)/gi)) {
    const tag = cleanTag(match[1], brain)
    if (tag && !banned.includes(tag)) banned.push(tag)
  }
  return { ...strategy, banned }
}

function trendScore(item) {
  const performance =
    Number(item.views || 0) +
    Number(item.likes || 0) * 8 +
    Number(item.comments || 0) * 16 +
    Number(item.shares || 0) * 20
  const base = Math.max(1, Math.log10(performance + 10))
  const date = new Date(item.uploadDate || item.scrapedAt || 0).getTime()
  if (!date) return base
  const ageDays = Math.max(0, (Date.now() - date) / 86_400_000)
  return base * (ageDays <= 14 ? 1.25 : ageDays <= 45 ? 1 : 0.8)
}

function relevanceBoost(tag, item, topic) {
  const haystack = [
    topic,
    item.hook,
    item.caption,
    item.query,
    item.contentType,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
  const needle = tag.replace(/_/g, ' ')
  if (!needle) return 0
  if (haystack.includes(needle)) return 2
  return needle.split(/\s+/).some((part) => part.length > 3 && haystack.includes(part)) ? 0.75 : 0
}

export function trendHashtagSignals(trends = [], options = {}) {
  const topic = [options.topic, options.brain?.niche, options.brain?.appName]
    .filter(Boolean)
    .join(' ')
  const stats = new Map()

  for (const item of (trends || []).slice(0, 80)) {
    const weight = trendScore(item)
    for (const tag of normalizeHashtags(item.hashtags || '', {
      brain: options.brain,
      max: 20,
      applyStrategy: false,
      includeFyp: false,
      includeBrand: false,
    })) {
      const current = stats.get(tag) || { tag, score: 0, frequency: 0, views: 0 }
      current.frequency += 1
      current.score += weight + relevanceBoost(tag, item, topic)
      current.views += Number(item.views || 0)
      stats.set(tag, current)
    }
  }

  return [...stats.values()]
    .map((item) => ({
      tag: item.tag,
      frequency: item.frequency,
      avgViews: item.frequency ? Math.round(item.views / item.frequency) : 0,
      score: Math.round(item.score * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score || b.frequency - a.frequency)
    .slice(0, 14)
}
