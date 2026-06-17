const SPAMMY_TAGS = new Set([
  'followforfollow',
  'likeforlike',
  'follow4follow',
  'like4like',
  'spam',
])

function brandTag(brain) {
  const source = String(brain?.appName || '').trim()
  if (!source) return ''
  return cleanTag(source)
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

  const brand = brandTag(brain)
  if (brand === 'zaratech' && tag === 'zartech') tag = 'zaratech'
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
  const max = Math.min(Math.max(Math.round(Number(options.max) || 8), 1), 20)
  const includeFyp = options.includeFyp !== false
  const includeBrand = options.includeBrand !== false
  const brain = options.brain || null
  const required = [
    ...(includeFyp ? ['fyp'] : []),
    ...(includeBrand && brandTag(brain) ? [brandTag(brain)] : []),
  ]
  const seen = new Set()
  const tags = []

  for (const part of rawParts(input)) {
    const tag = cleanTag(part, brain)
    if (!tag || tag.length < 2 || tag.length > 40 || SPAMMY_TAGS.has(tag) || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }

  const cleanRequired = required.filter((tag) => tag && !SPAMMY_TAGS.has(tag))
  const slots = Math.max(max - cleanRequired.length, 0)
  const next = tags.filter((tag) => !cleanRequired.includes(tag)).slice(0, slots)
  for (const tag of cleanRequired) if (!next.includes(tag)) next.push(tag)
  return next.slice(0, max)
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
