// Slideshow generation. Given the Brain plus optional trend research and
// learning memory, the chosen model writes carousel slideshows. Quality mode is
// optional; when off, generation stays close to the original simple flow.
import { chatJSON } from './openrouter.js'
import { logger } from './log.js'

const log = logger('generate')

const PALETTE = [
  ['#0f172a', '#1e293b'],
  ['#1a1a2e', '#16213e'],
  ['#2d1b1b', '#1a1010'],
  ['#0a1f1c', '#0f2922'],
  ['#1f1147', '#160d33'],
  ['#26120a', '#1a0c06'],
]

const SCORE_KEYS = [
  'hookStrength',
  'clarity',
  'originality',
  'brandFit',
  'audienceFit',
  'ctaStrength',
  'viralPotential',
  'usefulness',
  'nonGenericWording',
]

function clampNumber(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n * 10) / 10, 0), 10)
}

function compactTrends(trends = []) {
  return trends.slice(0, 40).map((t) => ({
    hook: t.hook,
    caption: t.caption?.slice(0, 300),
    hashtags: t.hashtags,
    platform: t.platform,
    contentType: t.contentType,
    views: t.views,
    likes: t.likes,
    comments: t.comments,
    shares: t.shares,
    query: t.query,
  }))
}

function learningForPrompt(memory) {
  if (!memory) return ''
  return `Analytics learning memory:
Summary: ${memory.summary || '(none)'}
What is working: ${(memory.working || []).join(' | ') || '(none)'}
Avoid: ${(memory.avoid || []).join(' | ') || '(none)'}
Best CTAs: ${(memory.bestCtas || []).join(', ') || '(none)'}
Best hook formulas: ${(memory.bestHookFormulas || []).join(' | ') || '(none)'}
Recommended next posts: ${(memory.recommendedNextPosts || []).join(' | ') || '(none)'}
Suggested buckets: ${(memory.suggestedBuckets || []).join(', ') || '(none)'}`
}

function buildPrompt(brain, count, options = {}) {
  if (options.postFormat === 'notes') return buildNotesPrompt(brain, count, options)
  const trends = compactTrends(options.trends || [])
  const trendBlock = trends.length
    ? `Trend interpretation system prompt:
Use the trend data only as market research. Create original ${brain.appName || 'brand'} posts with similar psychological structure but different wording, different examples, and brand-specific value.
Do not copy creators word-for-word. Do not reuse captions verbatim. Study hook formulas, CTA styles, topics, and hashtag patterns.

Trend research:
${JSON.stringify(trends, null, 2)}`
    : ''
  const learningBlock = options.learning ? learningForPrompt(options.learning) : ''
  const bucket = options.contentBucket ? `Preferred content bucket: ${options.contentBucket}` : ''
  const cta = options.ctaKeyword ? `CTA keyword preference: ${options.ctaKeyword}` : ''

  return `You write short-form social media carousel slideshows (TikTok/Instagram).

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

What's working for this account (style memory - respect this closely):
${brain.styleMemory || '(none yet - use proven short-form patterns)'}

${trendBlock}

${learningBlock}

${bucket}
${cta}

Write ${count} distinct slideshows. Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "the first slide - a scroll-stopping line, max ~8 words",
      "slides": ["the hook again as slide 1", "slide 2", "...5-6 lines total, each max ~8 words, last is a CTA like 'Save this'"],
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"],
      "rationale": "one sentence on why this should perform, tied to the style memory/research"
    }
  ]
}

Keep them on-brand, varied, and genuinely good. Do not write generic filler. Return ONLY the JSON object.`
}

function buildNotesPrompt(brain, count, options = {}) {
  const trends = compactTrends(options.trends || [])
  const trendBlock = trends.length
    ? `Trend research to study, not copy:
${JSON.stringify(trends, null, 2)}`
    : ''
  const learningBlock = options.learning ? learningForPrompt(options.learning) : ''
  const bucket = options.contentBucket ? `Preferred content bucket: ${options.contentBucket}` : ''
  const cta = options.ctaKeyword ? `CTA keyword preference: ${options.ctaKeyword}` : ''

  return `You create original TikTok/Instagram "lifestyle hook + iPhone Notes screenshot" carousel posts.

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

Style memory:
${brain.styleMemory || '(none yet - use proven short-form patterns)'}

${trendBlock}

${learningBlock}

${bucket}
${cta}

Create ${count} distinct notes-style viral carousel concepts. Each concept is exactly 2 slides:
1. A curiosity hook over a lifestyle image. It should make the viewer swipe and not reveal all the value.
2. A fake iPhone Notes app screenshot with 3-5 numbered points that deliver the actual value.

Writing style:
- lowercase
- casual, personal, slightly unpolished
- gen z / TikTok-native
- natural use of words like "u", "ppl", "bc", "kinda", "literally"
- short sentences
- minimal emoji if any
- no corporate language
- no polished blog-style paragraphs
- original content only; do not copy creators

Notes points should usually include:
1. a surprising insight
2. a practical tip
3. a mistake to avoid
4. a soft product/tool mention if relevant

Return ONLY this JSON shape:
{
  "slideshows": [
    {
      "format": "notes",
      "hook": "short curiosity hook",
      "notesData": {
        "hookText": "slide 1 overlay hook",
        "noteTitle": "optional short notes title",
        "noteDate": "optional realistic date/time",
        "points": [
          { "heading": "short heading", "body": "short casual explanation" }
        ]
      },
      "caption": "caption",
      "hashtags": ["tag1", "tag2", "tag3"],
      "rationale": "why this should perform"
    }
  ]
}`
}

function normalizeHashtags(tags) {
  return (Array.isArray(tags) ? tags : String(tags || '').split(/[,\s]+/))
    .map((tag) => String(tag).replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeNotesData(raw, hook) {
  const data = raw?.notesData || raw?.notes || {}
  const points = (Array.isArray(data.points) ? data.points : [])
    .map((point) => ({
      heading: String(point?.heading || '').trim(),
      body: String(point?.body || '').trim(),
    }))
    .filter((point) => point.heading || point.body)
    .slice(0, 5)
  return {
    hookText: String(data.hookText || raw?.hook || hook || '').trim(),
    noteTitle: data.noteTitle ? String(data.noteTitle).trim() : undefined,
    noteDate: data.noteDate ? String(data.noteDate).trim() : undefined,
    points: points.length
      ? points
      : [
          { heading: 'start with the hook', body: 'make ppl curious before u explain anything.' },
          { heading: 'keep it private', body: 'notes work bc they feel like something u found.' },
          { heading: 'make it useful', body: 'give them one thing they can try today.' },
        ],
  }
}

function normalizeRawSlideshow(raw, i, stamp, options = {}) {
  const [from, to] = PALETTE[i % PALETTE.length]
  const format = raw.format === 'notes' || options.postFormat === 'notes' ? 'notes' : 'standard'
  const notesData = format === 'notes' ? normalizeNotesData(raw, raw.hook) : undefined
  const slides = format === 'notes'
    ? [notesData.hookText || raw.hook || '', notesData.noteTitle || 'notes']
    : Array.isArray(raw.slides) && raw.slides.length ? raw.slides : [raw.hook || '']
  return {
    id: options.id || `q-${stamp}-${i}`,
    format,
    hook: raw.hook || slides[0] || '',
    notesData,
    caption: raw.caption || '',
    hashtags: normalizeHashtags(raw.hashtags),
    rationale: raw.rationale || '',
    createdAt: options.createdAt || new Date(stamp).toISOString(),
    generationMode: options.generationMode,
    contentBucket: options.contentBucket || undefined,
    ctaKeyword: options.ctaKeyword || undefined,
    trendSourcesUsed: options.trendSourcesUsed || undefined,
    slides: slides.map((text, j) => ({
      id: options.slideIds?.[j] || `slide-${stamp}-${i}-${j}`,
      text: String(text || ''),
      bgFrom: options.bgFrom || from,
      bgTo: options.bgTo || to,
      imageUrl: options.imageUrls?.[j],
    })),
  }
}

function mergeRewrite(existing, raw) {
  if (existing.format === 'notes') {
    const notesData = normalizeNotesData(raw, raw.hook || existing.hook)
    return {
      ...existing,
      format: 'notes',
      hook: raw.hook || notesData.hookText || existing.hook,
      notesData,
      caption: raw.caption || existing.caption,
      hashtags: normalizeHashtags(raw.hashtags || existing.hashtags),
      rationale: raw.rationale || existing.rationale,
      slides: [
        {
          ...(existing.slides[0] || {}),
          id: existing.slides[0]?.id || `slide-${Date.now()}-0`,
          text: notesData.hookText || raw.hook || existing.hook,
        },
        {
          ...(existing.slides[1] || {}),
          id: existing.slides[1]?.id || `slide-${Date.now()}-1`,
          text: notesData.noteTitle || 'notes',
          imageUrl: undefined,
        },
      ],
    }
  }
  const slides = Array.isArray(raw.slides) && raw.slides.length ? raw.slides : existing.slides.map((s) => s.text)
  const first = existing.slides[0] || {}
  return {
    ...existing,
    hook: raw.hook || slides[0] || existing.hook,
    caption: raw.caption || existing.caption,
    hashtags: normalizeHashtags(raw.hashtags || existing.hashtags),
    rationale: raw.rationale || existing.rationale,
    slides: slides.map((text, i) => ({
      ...(existing.slides[i] || {}),
      id: existing.slides[i]?.id || `slide-${Date.now()}-${i}`,
      text: String(text || ''),
      bgFrom: existing.slides[i]?.bgFrom || first.bgFrom,
      bgTo: existing.slides[i]?.bgTo || first.bgTo,
    })),
  }
}

function slideshowForPrompt(slideshow) {
  return {
    format: slideshow.format || 'standard',
    hook: slideshow.hook,
    notesData: slideshow.notesData,
    slides: slideshow.slides?.map((s) => s.text) || [],
    caption: slideshow.caption,
    hashtags: slideshow.hashtags,
    rationale: slideshow.rationale,
  }
}

function statusFor(score, threshold) {
  if (!Number.isFinite(score)) return 'needs-review'
  if (score >= 8.5) return 'strong'
  if (score >= threshold) return 'ready'
  if (score >= 5.5) return 'needs-review'
  return 'weak'
}

function parseScore(parsed, threshold) {
  const breakdown = {}
  const source = parsed.qualityBreakdown || parsed.breakdown || parsed.scores || {}
  for (const key of SCORE_KEYS) breakdown[key] = clampNumber(source[key] ?? parsed[key], 0)
  const average = SCORE_KEYS.reduce((sum, key) => sum + breakdown[key], 0) / SCORE_KEYS.length
  const overall = clampNumber(parsed.overallScore ?? parsed.overall ?? parsed.score, average)
  return {
    qualityScore: overall,
    qualityBreakdown: breakdown,
    qualityFeedback: String(parsed.qualityFeedback || parsed.feedback || ''),
    qualityStatus: statusFor(overall, threshold),
  }
}

function fallbackScore(error, threshold) {
  return {
    qualityScore: 0,
    qualityBreakdown: Object.fromEntries(SCORE_KEYS.map((key) => [key, 0])),
    qualityFeedback: `Quality scoring failed: ${error.message || String(error)}`,
    qualityStatus: statusFor(0, threshold),
  }
}

async function scoreSlideshow({ apiKey, model, brain, slideshow, threshold }) {
  const prompt = `Score this short-form carousel for ${brain.appName || 'this brand'}.

Audience: ${brain.audience || '(unspecified)'}
Niche: ${brain.niche || '(unspecified)'}

Post:
${JSON.stringify(slideshowForPrompt(slideshow), null, 2)}

Evaluate on a 1-10 scale:
- hookStrength
- clarity
- originality
- brandFit
- audienceFit
- ctaStrength
- viralPotential
- usefulness
- nonGenericWording

Return ONLY JSON:
{
  "overallScore": 0,
  "qualityBreakdown": {
    "hookStrength": 0,
    "clarity": 0,
    "originality": 0,
    "brandFit": 0,
    "audienceFit": 0,
    "ctaStrength": 0,
    "viralPotential": 0,
    "usefulness": 0,
    "nonGenericWording": 0
  },
  "qualityFeedback": "specific rewrite advice"
}`
  try {
    return parseScore(await chatJSON({ apiKey, model, prompt }), threshold)
  } catch (e) {
    log.warn(`quality scoring failed: ${e.message || String(e)}`)
    return fallbackScore(e, threshold)
  }
}

async function rewriteSlideshow({ apiKey, model, brain, slideshow, feedback, note, trends, learning }) {
  if (slideshow.format === 'notes') {
    const prompt = `Rewrite this notes-style viral carousel while keeping it exactly 2 slides:
1. lifestyle/photo curiosity hook
2. iPhone Notes screenshot with 3-5 numbered points

Account:
- Niche: ${brain.niche || '(unspecified)'}
- Brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

Rewrite guidance:
${note || feedback || 'Make it more specific, more casual, and less generic.'}

Trend research to study, not copy:
${JSON.stringify(compactTrends(trends || []).slice(0, 12), null, 2)}

${learning ? learningForPrompt(learning) : ''}

Current post:
${JSON.stringify(slideshowForPrompt(slideshow), null, 2)}

Return ONLY JSON:
{
  "slideshow": {
    "format": "notes",
    "hook": "short curiosity hook",
    "notesData": {
      "hookText": "slide 1 overlay hook",
      "noteTitle": "optional short title",
      "noteDate": "optional realistic date/time",
      "points": [
        { "heading": "short heading", "body": "short casual body" }
      ]
    },
    "caption": "caption",
    "hashtags": ["three", "relevant", "hashtags"],
    "rationale": "why this is stronger"
  }
}`
    const parsed = await chatJSON({ apiKey, model, prompt })
    return mergeRewrite(slideshow, parsed.slideshow || parsed)
  }

  const prompt = `Rewrite this carousel to improve quality while preserving the idea and brand fit.

Account:
- Niche: ${brain.niche || '(unspecified)'}
- Brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

Rewrite guidance:
${note || feedback || 'Make it sharper, more specific, and less generic.'}

Trend research to study, not copy:
${JSON.stringify(compactTrends(trends || []).slice(0, 12), null, 2)}

${learning ? learningForPrompt(learning) : ''}

Current post:
${JSON.stringify(slideshowForPrompt(slideshow), null, 2)}

Return ONLY JSON:
{
  "slideshow": {
    "hook": "max ~8 words",
    "slides": ["5-6 short slide lines, last is a CTA"],
    "caption": "caption with 1-2 emoji",
    "hashtags": ["three", "relevant", "hashtags"],
    "rationale": "why the rewrite is stronger"
  }
}`
  const parsed = await chatJSON({ apiKey, model, prompt })
  return mergeRewrite(slideshow, parsed.slideshow || parsed)
}

async function applyQuality({ apiKey, model, brain, slideshow, options }) {
  const qualityMode = options.qualityMode || 'off'
  const threshold = clampNumber(options.minScore ?? 7, 7)
  const maxAttempts = Math.min(Math.max(Math.round(Number(options.maxRewriteAttempts) || 1), 0), 5)
  if (qualityMode === 'off') return slideshow

  let current = slideshow
  let attempts = 0
  let score = await scoreSlideshow({ apiKey, model, brain, slideshow: current, threshold })
  while (score.qualityScore < threshold && attempts < maxAttempts) {
    attempts++
    try {
      current = await rewriteSlideshow({
        apiKey,
        model,
        brain,
        slideshow: current,
        feedback: score.qualityFeedback,
        trends: options.trends,
        learning: options.learning,
      })
      score = await scoreSlideshow({ apiKey, model, brain, slideshow: current, threshold })
    } catch (e) {
      score = {
        ...score,
        qualityFeedback: `Rewrite failed after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${e.message || String(e)}`,
        qualityStatus: score.qualityStatus || 'needs-review',
      }
      break
    }
  }

  return {
    ...current,
    ...score,
    rewriteAttempts: attempts,
  }
}

const BATCH = 6

export async function generateSlideshows({ apiKey, model, brain, count = 4, options = {} }) {
  const qualityMode = options.qualityMode || 'off'
  log.start(`Generating ${count} slideshow${count === 1 ? '' : 's'} with ${model}`)
  if (brain?.niche) log.info(`niche: ${brain.niche}${brain.appName ? ` - ${brain.appName}` : ''}`)
  if (options.trends?.length) log.info(`using ${options.trends.length} trend item${options.trends.length === 1 ? '' : 's'} as research`)
  if (options.learning) log.info('using analytics learning memory')

  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)...`)
    const parsed = await chatJSON({ apiKey, model, prompt: buildPrompt(brain, n, options) })
    const batch = parsed.slideshows || []
    if (!batch.length) {
      log.warn('model returned no slideshows - stopping early')
      break
    }
    raw.push(...batch)
    log.progress(Math.min(raw.length, count), count, 'written')
  }

  const stamp = Date.now()
  const baseMeta = {
    generationMode: options.postFormat === 'notes'
      ? 'notes'
      : options.trends?.length ? 'trend-assisted' : options.learning ? 'learning-assisted' : 'standard',
    postFormat: options.postFormat,
    contentBucket: options.contentBucket,
    ctaKeyword: options.ctaKeyword,
    trendSourcesUsed: options.trends?.length ? options.trends.map((t) => t.id).slice(0, 40) : undefined,
  }
  const normalized = raw.slice(0, count).map((s, i) => normalizeRawSlideshow(s, i, stamp, baseMeta))
  if (qualityMode === 'off') {
    log.ok(`Generated ${normalized.length} slideshow${normalized.length === 1 ? '' : 's'}`)
    return normalized
  }

  const reviewed = []
  for (const show of normalized) {
    const improved = await applyQuality({ apiKey, model, brain, slideshow: show, options })
    const passes = Number(improved.qualityScore || 0) >= Number(options.minScore || 7)
    if (qualityMode === 'strict' && !passes) {
      log.warn(`dropping ${show.id}: quality score ${improved.qualityScore}/10 below threshold`)
      continue
    }
    reviewed.push(improved)
  }
  log.ok(`Generated ${reviewed.length} reviewed slideshow${reviewed.length === 1 ? '' : 's'}`)
  return reviewed
}

export async function improveSlideshow({ apiKey, model, brain, slideshow, note, trends = [], learning = null, threshold = 7 }) {
  const currentFeedback = slideshow.qualityFeedback || ''
  const rewritten = await rewriteSlideshow({
    apiKey,
    model,
    brain,
    slideshow,
    feedback: currentFeedback,
    note,
    trends,
    learning,
  })
  const score = await scoreSlideshow({ apiKey, model, brain, slideshow: rewritten, threshold })
  return {
    ...rewritten,
    ...score,
    rewriteAttempts: Number(slideshow.rewriteAttempts || 0) + 1,
    generationMode: slideshow.generationMode || 'manual-rewrite',
  }
}
