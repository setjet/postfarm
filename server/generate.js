// Slideshow generation. Given the Brain plus optional trend research and
// learning memory, the chosen model writes carousel slideshows. Quality mode is
// optional; when off, generation stays close to the original simple flow.
import { chatJSON } from './ai.js'
import { GENERIC_HASHTAGS, normalizeHashtags, strategyWithHashtagNotes, trendHashtagSignals } from './hashtags.js'
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

export function cleanGenerationNotes(value) {
  const notes = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
  return notes.slice(0, 2000)
}

export function generationNotesGuidance(value) {
  const notes = cleanGenerationNotes(value)
  if (!notes) return ''
  return `User preferences for the current generation:
${notes}

Apply these preferences to every post in this batch, including hooks, slide copy, captions, hashtags, optional text-note carousel content, wording, structure, product mentions, and visual direction where relevant.
- Use them alongside the selected topic, account context, style memory, trend research, and learning memory; do not discard those existing inputs.
- Give explicit exclusions (for example "do not mention X", "no emojis", or prohibited topics/words) strong priority over conflicting content, tone, emoji, product, wording, or hashtag suggestions elsewhere in this prompt.
- Follow these preferences where they do not conflict with safety constraints or the required JSON/output format.
- Treat this block as instructions, not post copy. Never quote, expose, or reproduce the instructions in a post unless the user explicitly asks for that content.`
}

const HASHTAG_STYLE_GUIDANCE = {
  balanced: 'Use a deliberate mix of broad, niche, tool/product, and brand tags.',
  broad: 'Lean slightly toward relevant discovery and broad-reach tags without using unrelated viral filler.',
  niche: 'Favor precise topic and audience hashtags over broad discovery tags.',
  tool: 'Favor relevant named AI tools, models, and creator workflows.',
  product: 'Favor relevant offers, resources, products, and buyer-intent tags only when they fit the project.',
  minimal: 'Use only the strongest, most specific tags and avoid filler.',
}

export function hashtagGuidance(brain, options = {}) {
  const strategy = strategyWithHashtagNotes(options.hashtagStrategy, options.hashtagNotes, brain)
  const allowed = (tags) => tags.filter((tag) => !strategy.banned.includes(tag) && (!strategy.avoidGeneric || !GENERIC_HASHTAGS.has(tag)))
  const trendLimit = { off: 0, light: 4, balanced: 8, strong: 14 }[strategy.trendInfluence]
  const signals = trendHashtagSignals(options.hashtagTrends ?? options.trends ?? [], {
    brain,
    topic: [options.topic, options.contentBucket, options.ctaKeyword].filter(Boolean).join(' '),
  }).filter((signal) => !strategy.banned.includes(signal.tag) && (!strategy.avoidGeneric || !GENERIC_HASHTAGS.has(signal.tag))).slice(0, trendLimit)
  const signalBlock = strategy.trendInfluence === 'off'
    ? 'Trend influence is OFF. Do not use trend hashtags or trend hashtag patterns.'
    : signals.length
      ? `Trend influence is ${strategy.trendInfluence.toUpperCase()}. Use only relevant candidates from these scored signals; never copy them blindly:
${JSON.stringify(signals, null, 2)}`
      : 'No stored trend hashtag signals are available. Fall back to the strategy, project Brain, and specific post topic.'
  const override = String(options.hashtagNotes || '').trim()

  return `Hashtag rules:
- Return hashtags as an array of ${strategy.count} clean strings${strategy.style === 'minimal' ? ' (fewer only when there are not enough genuinely strong tags)' : ''}.
- Do not include # in JSON.
- Use lowercase.
- No spaces inside a hashtag.
- Avoid duplicates, filler, spammy tags, or unrelated viral tags.
- Required tags (include every one): ${allowed(strategy.required).join(', ') || '(none)'}.
- Banned tags (never include, even if trends suggest them): ${strategy.banned.join(', ') || '(none)'}.
- Preferred tags (use only when relevant): ${allowed(strategy.preferred).join(', ') || '(none)'}.
- Brand tags (include when appropriate): ${allowed(strategy.brand).join(', ') || allowed([brandTagForPrompt(brain)])[0] || '(none)'}.
- Niche tags to prefer when relevant: ${allowed(strategy.niche).join(', ') || '(none)'}.
- Tool/product tags to prefer when relevant: ${allowed(strategy.tools).join(', ') || '(none)'}.
- Style: ${strategy.style}. ${HASHTAG_STYLE_GUIDANCE[strategy.style]}
- ${strategy.avoidGeneric ? 'Never use generic tags such as fyp, viral, or explorepage.' : 'Generic discovery tags are allowed only when directly relevant; never use them as filler.'}
- Keep every tag relevant to the specific post topic. Custom-topic posts must use topic-specific tags.
- Extra project instructions: ${strategy.notes || '(none)'}.
- Current-batch hashtag override: ${override || '(none)'}.
${signalBlock}`
}

function brandTagForPrompt(brain) {
  return String(brain?.appName || '').toLowerCase().replace(/[^a-z0-9_]+/g, '')
}

function topicGuidance(options = {}) {
  const topic = String(options.topic || '').trim()
  if (options.topicMode === 'custom' && topic) {
    return `Topic focus:
Generate content specifically about: ${topic}.
Stay inside this topic. Do not drift into unrelated AI content. Hooks, slides, captions, hashtags, and rationale should all fit this topic.`
  }
  return `Topic focus:
General mode. Generate the best-performing content based on the project Brain, style memory, trend data, learning memory, and content buckets.`
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

export function buildPrompt(brain, count, options = {}) {
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
  const hashtagBlock = hashtagGuidance(brain, options)
  const topicBlock = topicGuidance(options)
  const notesBlock = generationNotesGuidance(options.generationNotes)
  const topicAndNotes = notesBlock ? `${topicBlock}\n\n${notesBlock}` : topicBlock
  const captionShape = notesBlock
    ? 'the post caption with 1-2 emoji unless the user preferences above request otherwise'
    : 'the post caption with 1-2 emoji'

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

${topicAndNotes}

${hashtagBlock}

Write ${count} distinct slideshows. Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "the first slide - a scroll-stopping line, max ~8 words",
      "slides": ["the hook again as slide 1", "slide 2", "...5-6 lines total, each max ~8 words, last is a CTA like 'Save this'"],
      "caption": "${captionShape}",
      "hashtags": ["aiprompts", "aiimages", "promptengineering", "facelesscontent", "aicreators"],
      "rationale": "one sentence on why this should perform, tied to the style memory/research"
    }
  ]
}

Keep them on-brand, varied, and genuinely good. Do not write generic filler. Return ONLY the JSON object.`
}

export function buildNotesPrompt(brain, count, options = {}) {
  const trends = compactTrends(options.trends || [])
  const trendBlock = trends.length
    ? `Trend research to study, not copy:
${JSON.stringify(trends, null, 2)}`
    : ''
  const learningBlock = options.learning ? learningForPrompt(options.learning) : ''
  const bucket = options.contentBucket ? `Preferred content bucket: ${options.contentBucket}` : ''
  const cta = options.ctaKeyword ? `CTA keyword preference: ${options.ctaKeyword}` : ''
  const hashtagBlock = hashtagGuidance(brain, options)
  const topicBlock = topicGuidance(options)
  const notesBlock = generationNotesGuidance(options.generationNotes)
  const topicAndNotes = notesBlock ? `${topicBlock}\n\n${notesBlock}` : topicBlock

  return `You create original TikTok/Instagram minimal text-note carousel posts.

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

${topicAndNotes}

${hashtagBlock}

Create ${count} distinct optional text-note carousel concepts. Each concept is exactly 2 slides:
1. A curiosity hook over a lifestyle image. It should make the viewer swipe and not reveal all the value.
2. A clean minimal note-style slide with 3-5 numbered points that deliver the actual value.

Writing style:
- lowercase
- casual, personal, slightly unpolished
- social-native
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
4. a soft product, offer, or resource mention only if relevant to the configured project

Return ONLY this JSON shape:
{
  "slideshows": [
    {
      "format": "notes",
      "hook": "short curiosity hook",
      "notesData": {
        "hookText": "slide 1 overlay hook",
        "noteTitle": "optional short note title",
        "noteDate": "optional realistic date/time",
        "points": [
          { "heading": "short heading", "body": "short casual explanation" }
        ]
      },
      "caption": "caption",
      "hashtags": ["aitools", "aiprompts", "contentcreator", "facelesscontent", "aicreators"],
      "rationale": "why this should perform"
    }
  ]
}`
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
          { heading: 'start with the hook', body: 'make people curious before explaining the takeaway.' },
          { heading: 'keep it skimmable', body: 'use short points that feel easy to save and revisit.' },
          { heading: 'make it useful', body: 'give them one thing they can try today.' },
        ],
  }
}

function normalizeRawSlideshow(raw, i, stamp, brain, options = {}) {
  const [from, to] = PALETTE[i % PALETTE.length]
  const format = raw.format === 'notes' || options.postFormat === 'notes' ? 'notes' : 'standard'
  const notesData = format === 'notes' ? normalizeNotesData(raw, raw.hook) : undefined
  const slides = format === 'notes'
    ? [notesData.hookText || raw.hook || '', notesData.noteTitle || 'quick notes']
    : Array.isArray(raw.slides) && raw.slides.length ? raw.slides : [raw.hook || '']
  return {
    id: options.id || `q-${stamp}-${i}`,
    format,
    hook: raw.hook || slides[0] || '',
    notesData,
    caption: raw.caption || '',
    hashtags: normalizeHashtags(raw.hashtags, { brain, strategy: strategyWithHashtagNotes(options.hashtagStrategy, options.hashtagNotes, brain) }),
    rationale: raw.rationale || '',
    createdAt: options.createdAt || new Date(stamp).toISOString(),
    generationMode: options.generationMode,
    contentBucket: options.contentBucket || undefined,
    ctaKeyword: options.ctaKeyword || undefined,
    topicMode: options.topicMode || undefined,
    topic: options.topic || undefined,
    generationNotes: cleanGenerationNotes(options.generationNotes) || undefined,
    hashtagNotes: String(options.hashtagNotes || '').trim().slice(0, 1000) || undefined,
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

function mergeRewrite(existing, raw, brain, hashtagStrategy) {
  if (existing.format === 'notes') {
    const notesData = normalizeNotesData(raw, raw.hook || existing.hook)
    return {
      ...existing,
      format: 'notes',
      hook: raw.hook || notesData.hookText || existing.hook,
      notesData,
      caption: raw.caption || existing.caption,
      hashtags: normalizeHashtags(raw.hashtags || existing.hashtags, { brain, strategy: strategyWithHashtagNotes(hashtagStrategy, existing.hashtagNotes, brain) }),
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
          text: notesData.noteTitle || 'quick notes',
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
    hashtags: normalizeHashtags(raw.hashtags || existing.hashtags, { brain, strategy: strategyWithHashtagNotes(hashtagStrategy, existing.hashtagNotes, brain) }),
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
    topicMode: slideshow.topicMode,
    topic: slideshow.topic,
  }
}

function statusFor(score, threshold) {
  if (!Number.isFinite(score)) return 'needs-review'
  if (score >= 8.5) return 'strong'
  if (score >= threshold) return 'ready'
  if (score >= 5.5) return 'needs-review'
  return 'weak'
}

function scoreKeysFor(slideshow) {
  return slideshow?.generationNotes ? [...SCORE_KEYS, 'instructionAdherence'] : SCORE_KEYS
}

function parseScore(parsed, threshold, scoreKeys = SCORE_KEYS) {
  const breakdown = {}
  const source = parsed.qualityBreakdown || parsed.breakdown || parsed.scores || {}
  for (const key of scoreKeys) breakdown[key] = clampNumber(source[key] ?? parsed[key], 0)
  const average = scoreKeys.reduce((sum, key) => sum + breakdown[key], 0) / scoreKeys.length
  const overall = clampNumber(parsed.overallScore ?? parsed.overall ?? parsed.score, average)
  return {
    qualityScore: overall,
    qualityBreakdown: breakdown,
    qualityFeedback: String(parsed.qualityFeedback || parsed.feedback || ''),
    qualityStatus: statusFor(overall, threshold),
  }
}

function fallbackScore(error, threshold, scoreKeys = SCORE_KEYS) {
  return {
    qualityScore: 0,
    qualityBreakdown: Object.fromEntries(scoreKeys.map((key) => [key, 0])),
    qualityFeedback: `Quality scoring failed: ${error.message || String(error)}`,
    qualityStatus: statusFor(0, threshold),
  }
}

export function buildScorePrompt({ brain, slideshow, hashtagStrategy, hashtagTrends = [] }) {
  const notesBlock = generationNotesGuidance(slideshow.generationNotes)
  const adherenceCriterion = notesBlock
    ? '\n- instructionAdherence (strongly penalize any ignored requirement or explicit exclusion)'
    : ''
  const adherenceShape = notesBlock ? ',\n    "instructionAdherence": 0' : ''
  const instructionContext = notesBlock
    ? `\n${notesBlock}\n\nCheck the complete post for prohibited words, topics, emojis, styles, elements, missing requested content, and other instruction violations. Preserve deliberate spelling and brand names. Put exact violations and concrete repair instructions in qualityFeedback.\n`
    : ''
  const hashtagBlock = hashtagGuidance(brain, {
    hashtagStrategy,
    hashtagTrends,
    hashtagNotes: slideshow.hashtagNotes,
    topic: slideshow.topic,
    topicMode: slideshow.topicMode,
  })
  return `Score this short-form carousel for ${brain.appName || 'this brand'}.

Audience: ${brain.audience || '(unspecified)'}
Niche: ${brain.niche || '(unspecified)'}
${instructionContext}

${hashtagBlock}
Flag hashtag-strategy violations explicitly in qualityFeedback.

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
- nonGenericWording${adherenceCriterion}

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
    "nonGenericWording": 0${adherenceShape}
  },
  "qualityFeedback": "specific rewrite advice"
}`
}

async function scoreSlideshow({ provider, apiKey, model, brain, slideshow, threshold, hashtagStrategy, hashtagTrends }) {
  const scoreKeys = scoreKeysFor(slideshow)
  const prompt = buildScorePrompt({ brain, slideshow, hashtagStrategy, hashtagTrends })
  try {
    return parseScore(await chatJSON({ provider, apiKey, model, prompt }), threshold, scoreKeys)
  } catch (e) {
    log.warn(`quality scoring failed: ${e.message || String(e)}`)
    return fallbackScore(e, threshold, scoreKeys)
  }
}

export function buildRewritePrompt({ brain, slideshow, feedback, note, trends = [], hashtagTrends = [], hashtagStrategy, learning = null }) {
  const hashtagBlock = hashtagGuidance(brain, {
    trends,
    hashtagTrends,
    hashtagStrategy,
    hashtagNotes: slideshow.hashtagNotes,
    topic: slideshow.topic,
    topicMode: slideshow.topicMode,
  })
  const topicBlock = topicGuidance({ topic: slideshow.topic, topicMode: slideshow.topicMode })
  const notesBlock = generationNotesGuidance(slideshow.generationNotes)
  const topicAndNotes = notesBlock ? `${topicBlock}\n\n${notesBlock}` : topicBlock
  if (slideshow.format === 'notes') {
    const prompt = `Rewrite this text-note carousel while keeping it exactly 2 slides:
1. lifestyle/photo curiosity hook
2. clean minimal note-style slide with 3-5 numbered points

Account:
- Niche: ${brain.niche || '(unspecified)'}
- Brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

Rewrite guidance:
${note || feedback || 'Make it more specific, more casual, and less generic.'}

${topicAndNotes}

Trend research to study, not copy:
${JSON.stringify(compactTrends(trends || []).slice(0, 12), null, 2)}

${hashtagBlock}

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
    "hashtags": ["aitools", "aiprompts", "facelesscontent", "aicreators"],
    "rationale": "why this is stronger"
  }
}`
    return prompt
  }

  const prompt = `Rewrite this carousel to improve quality while preserving the idea and brand fit.

Account:
- Niche: ${brain.niche || '(unspecified)'}
- Brand: ${brain.appName || '(unspecified)'} - ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

Rewrite guidance:
${note || feedback || 'Make it sharper, more specific, and less generic.'}

${topicAndNotes}

Trend research to study, not copy:
${JSON.stringify(compactTrends(trends || []).slice(0, 12), null, 2)}

${hashtagBlock}

${learning ? learningForPrompt(learning) : ''}

Current post:
${JSON.stringify(slideshowForPrompt(slideshow), null, 2)}

Return ONLY JSON:
{
  "slideshow": {
    "hook": "max ~8 words",
    "slides": ["5-6 short slide lines, last is a CTA"],
    "caption": "${notesBlock ? 'caption with 1-2 emoji unless the user preferences above request otherwise' : 'caption with 1-2 emoji'}",
    "hashtags": ["aiprompts", "aiimages", "promptengineering", "aicreators"],
    "rationale": "why the rewrite is stronger"
  }
}`
  return prompt
}

async function rewriteSlideshow({ provider, apiKey, model, brain, slideshow, feedback, note, trends, hashtagTrends, hashtagStrategy, learning }) {
  const prompt = buildRewritePrompt({ brain, slideshow, feedback, note, trends, hashtagTrends, hashtagStrategy, learning })
  const parsed = await chatJSON({ provider, apiKey, model, prompt })
  return mergeRewrite(slideshow, parsed.slideshow || parsed, brain, hashtagStrategy)
}

async function applyQuality({ provider, apiKey, model, brain, slideshow, options }) {
  const qualityMode = options.qualityMode || 'off'
  const threshold = clampNumber(options.minScore ?? 7, 7)
  const maxAttempts = Math.min(Math.max(Math.round(Number(options.maxRewriteAttempts) || 1), 0), 5)
  if (qualityMode === 'off') return slideshow

  let current = slideshow
  let attempts = 0
  let score = await scoreSlideshow({
    provider, apiKey, model, brain, slideshow: current, threshold,
    hashtagStrategy: options.hashtagStrategy,
    hashtagTrends: options.hashtagTrends,
  })
  while (score.qualityScore < threshold && attempts < maxAttempts) {
    attempts++
    try {
      current = await rewriteSlideshow({
        apiKey,
        provider,
        model,
        brain,
        slideshow: current,
        feedback: score.qualityFeedback,
        trends: options.trends,
        hashtagTrends: options.hashtagTrends,
        hashtagStrategy: options.hashtagStrategy,
        learning: options.learning,
      })
      score = await scoreSlideshow({
        provider, apiKey, model, brain, slideshow: current, threshold,
        hashtagStrategy: options.hashtagStrategy,
        hashtagTrends: options.hashtagTrends,
      })
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

export async function generateSlideshows({ provider = 'openrouter', apiKey, model, brain, count = 4, options = {} }) {
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
    const parsed = await chatJSON({ provider, apiKey, model, prompt: buildPrompt(brain, n, options) })
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
    topicMode: options.topicMode,
    topic: options.topic,
    generationNotes: cleanGenerationNotes(options.generationNotes) || undefined,
    hashtagNotes: String(options.hashtagNotes || '').trim().slice(0, 1000) || undefined,
    hashtagStrategy: options.hashtagStrategy,
    trendSourcesUsed: options.trends?.length ? options.trends.map((t) => t.id).slice(0, 40) : undefined,
  }
  const normalized = raw.slice(0, count).map((s, i) => normalizeRawSlideshow(s, i, stamp, brain, baseMeta))
  if (qualityMode === 'off') {
    log.ok(`Generated ${normalized.length} slideshow${normalized.length === 1 ? '' : 's'}`)
    return normalized
  }

  const reviewed = []
  for (const show of normalized) {
    const improved = await applyQuality({ provider, apiKey, model, brain, slideshow: show, options })
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

export async function improveSlideshow({ provider = 'openrouter', apiKey, model, brain, hashtagStrategy, slideshow, note, trends = [], hashtagTrends = [], learning = null, threshold = 7 }) {
  const currentFeedback = slideshow.qualityFeedback || ''
  const rewritten = await rewriteSlideshow({
    apiKey,
    provider,
    model,
    brain,
    slideshow,
    feedback: currentFeedback,
    note,
    trends,
    hashtagTrends,
    hashtagStrategy,
    learning,
  })
  const score = await scoreSlideshow({ provider, apiKey, model, brain, slideshow: rewritten, threshold, hashtagStrategy, hashtagTrends })
  return {
    ...rewritten,
    ...score,
    rewriteAttempts: Number(slideshow.rewriteAttempts || 0) + 1,
    generationMode: slideshow.generationMode || 'manual-rewrite',
  }
}
