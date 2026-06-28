import { createHash } from 'node:crypto'
import { GENERIC_HASHTAGS, normalizeHashtags, resolveHashtagStrategy, strategyWithHashtagNotes } from './hashtags.js'

export const QUALITY_REPORT_VERSION = 3

export const PLATFORM_RULES = Object.freeze({
  instagram: { captionMax: 2200, hashtagWarn: 15, mediaMax: 10, formats: ['carousel', 'image', 'video'] },
  facebook: { captionMax: 63206, hashtagWarn: 12, mediaMax: 10, formats: ['carousel', 'image', 'video'] },
  tiktok: { captionMax: 2200, hashtagWarn: 10, mediaMax: 35, formats: ['carousel', 'image', 'video'] },
  twitter: { captionMax: 280, hashtagWarn: 5, mediaMax: 4, formats: ['carousel', 'image', 'video'] },
  linkedin: { captionMax: 3000, hashtagWarn: 8, mediaMax: 20, formats: ['carousel', 'image', 'video'] },
  youtube: { captionMax: 5000, hashtagWarn: 15, mediaMax: 1, formats: ['video'] },
  pinterest: { captionMax: 500, hashtagWarn: 8, mediaMax: 1, formats: ['image', 'video'] },
  bluesky: { captionMax: 300, hashtagWarn: 5, mediaMax: 4, formats: ['carousel', 'image', 'video'] },
  threads: { captionMax: 500, hashtagWarn: 5, mediaMax: 10, formats: ['carousel', 'image', 'video'] },
  google_business: { captionMax: 1500, hashtagWarn: 8, mediaMax: 1, formats: ['image'] },
})

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u
const PLACEHOLDER_RE = /(?:\[\s*(?:insert|placeholder|your .* here)[^\]]*\]|\b(?:todo|tbd|undefined|null)\b|```json|"slides"\s*:)/i
const PROMPT_LEAK_RE = /(?:system prompt|developer message|as an ai(?: language model)?|the user (?:asked|requested)|follow these instructions|internal instructions)/i

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

export function qualityVersion(post, context = {}) {
  const source = {
    hook: post?.hook || '',
    caption: post?.caption || '',
    hashtags: post?.hashtags || [],
    format: post?.format || 'standard',
    slides: (post?.slides || []).map((slide) => ({ text: slide.text || '', imageUrl: slide.imageUrl || '' })),
    notesData: post?.notesData || null,
    generationNotes: post?.generationNotes || '',
    hashtagNotes: post?.hashtagNotes || '',
    topic: post?.topic || '',
    productEmphasis: post?.productEmphasis || '',
    hashtagStrategy: context.hashtagStrategy ? resolveHashtagStrategy(context.hashtagStrategy, context.brain) : null,
    requiredProduct: post?.requiredProduct || post?.productRequirement || null,
    promotional: !!post?.promotional,
    scheduledAt: context.scheduledAt || null,
    socialAccounts: [...(context.socialAccounts || [])].map(Number).sort((a, b) => a - b),
    postType: context.postType || null,
    videoId: context.videoId || null,
  }
  return createHash('sha256').update(JSON.stringify(stable(source))).digest('hex').slice(0, 20)
}

export function isQualityStale(post, report = post?.qualityReport, context = {}) {
  return !report || report.version !== QUALITY_REPORT_VERSION || report.contentVersion !== qualityVersion(post, context)
}

function finding(id, check, severity, explanation, field, suggestion, extra = {}) {
  return { id, check, severity, explanation, field, suggestion, ...extra }
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function allCopy(post) {
  return [
    post?.hook,
    post?.caption,
    ...(post?.slides || []).map((slide) => slide.text),
    post?.notesData?.noteTitle,
    ...(post?.notesData?.points || []).flatMap((point) => [point.heading, point.body]),
  ].filter(Boolean).join(' ')
}

const PRODUCT_STOP_WORDS = new Set(['a', 'an', 'and', 'app', 'for', 'of', 'offer', 'our', 'plan', 'product', 'the', 'your'])
const CTA_INSTRUCTION_RE = /^(?:please\s+)?(?:add|create|include|use|write)(?:\s+(?:an?|the))?\s+(?:cta|call[ -]?to[ -]?action)(?:\s+(?:in|on|to)\s+(?:the\s+)?(?:caption|captions|post|posts|slide|slides))?[.!]*$/i
const CTA_COPY_RE = /\b(?:buy now|click(?: the)? link|comment(?: below)?|download|follow(?: for)?|get started|learn more|link in bio|order now|save this|send (?:me|us) a dm|share this|shop now|sign up|subscribe|try it|visit (?:our|the))\b/i

function cleanRequirement(value) {
  const raw = String(value || '').trim().replace(/[.!]+$/, '')
  if (!raw || CTA_INSTRUCTION_RE.test(raw)) return ''
  return raw
    .replace(/^(?:required\s+)?(?:product|offer)(?:\s+(?:mention|emphasis))?\s*[:=-]\s*/i, '')
    .replace(/^(?:mention|promote|feature|include)\s+(?:the\s+)?(?:product|offer\s+)?/i, '')
    .replace(/^["'“”]|["'“”]$/g, '')
    .trim()
}

function noteProductRequirement(notes) {
  const source = String(notes || '')
  const patterns = [
    /(?:^|[\n;])\s*(?:required\s+)?(?:product|offer)(?:\s+(?:mention|emphasis))?\s*[:=-]\s*([^\n;]+)/i,
    /(?:^|[\n;])\s*(?:please\s+)?(?:mention|promote|feature|include)\s+(?:the\s+)?(?:product|offer)\s+["“]?([^\n;."”]+)/i,
    /(?:^|[\n;])\s*(?:must|required to)\s+mention\s+["“]?([^\n;."”]+)/i,
    /(?:^|[\n;])\s*(?:please\s+)?(?:mention|promote|feature)\s+["“]?([^\n;."”]+)/i,
  ]
  for (const pattern of patterns) {
    const value = cleanRequirement(source.match(pattern)?.[1])
    if (value && !/^(?:(?:it|this|our|the)\s+(?:app|offer|product)|benefits?|features?|a\s+(?:cta|call[ -]?to[ -]?action))$/i.test(value)) return value
  }
  return ''
}

function contentRequirements(post, context) {
  const explicit = typeof post?.productRequirement === 'object' && post.productRequirement?.required
    ? post.productRequirement.value
    : post?.requiredProduct
  const promotionalProduct = (post?.promotional || context.promotional)
    ? (post?.productName || post?.offerName || context.productName || context.offerName)
    : ''
  const configured = cleanRequirement(explicit || post?.productEmphasis || promotionalProduct)
  const notesRequireCta = String(post?.generationNotes || '').split(/\r?\n|;/).some((line) => CTA_INSTRUCTION_RE.test(line.trim()))
  return {
    product: configured || noteProductRequirement(post?.generationNotes),
    cta: notesRequireCta || CTA_INSTRUCTION_RE.test(String(post?.productEmphasis || '').trim()),
  }
}

function productMentioned(copy, product) {
  const normalize = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const haystack = normalize(copy)
  const needle = normalize(product)
  if (!needle) return true
  if (haystack.includes(needle) || haystack.replace(/\s/g, '').includes(needle.replace(/\s/g, ''))) return true
  const words = needle.split(' ').filter((word) => word.length > 1 && !PRODUCT_STOP_WORDS.has(word))
  const haystackWords = new Set(haystack.split(' ').filter(Boolean).map((word) => word.replace(/s$/, '')))
  const matched = words.filter((word) => haystackWords.has(word.replace(/s$/, ''))).length
  return words.length === 1 ? matched === 1 : matched >= 2 && matched / words.length >= 0.66
}

function excludedPhrases(notes) {
  const phrases = []
  for (const line of String(notes || '').split(/\r?\n|;/)) {
    const match = line.trim().match(/^(?:no|avoid|exclude|without|do not|don't|never use|never mention)\s+(.+)$/i)
    if (!match) continue
    const phrase = match[1].replace(/[.!]+$/, '').trim().toLowerCase()
    if (phrase && !/^(?:emoji|emojis)$/.test(phrase)) phrases.push(phrase)
  }
  return phrases
}

function estimateWrappedLines(text, charsPerLine) {
  let lines = 0
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) { lines++; continue }
    let length = 0
    lines++
    for (const word of words) {
      if (length && length + 1 + word.length > charsPerLine) {
        lines++
        length = word.length
      } else {
        length += (length ? 1 : 0) + word.length
      }
    }
  }
  return lines
}

export function detectTextOverflow(post) {
  const issues = []
  if (post?.format === 'notes' && post.notesData) {
    const data = post.notesData
    let height = 35 + 44
    if (data.noteTitle) height += estimateWrappedLines(data.noteTitle, 38) * 52 + 22
    for (const [index, point] of (data.points || []).slice(0, 5).entries()) {
      height += estimateWrappedLines(`${index + 1}. ${point.heading || ''}`, 52) * 40
      if (point.body) height += 6 + estimateWrappedLines(point.body, 58) * 38
      if (index < data.points.length - 1) height += 18
    }
    if (height > 1676) issues.push({ field: 'notesData', explanation: 'The complete text-note date, heading, and numbered points do not fit inside the renderer safe area.' })
  } else {
    for (const [index, slide] of (post?.slides || []).entries()) {
      const lines = estimateWrappedLines(slide.text, 32)
      if (lines * 62 > 1612) issues.push({ field: `slides.${index}.text`, slideIndex: index, explanation: 'Slide text extends beyond the renderer safe area and would be clipped.' })
    }
  }
  return issues
}

function pngInfo(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/s)
  if (!match) return null
  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null
  return { bytes: buffer.length, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function isTimezone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function minuteKey(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16)
}

function luminance(hex) {
  const match = String(hex || '').match(/^#([0-9a-f]{6})$/i)
  if (!match) return null
  const values = [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16) / 255)
  return values.map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

export function runQualityGate(post, context = {}) {
  const findings = []
  const add = (...args) => findings.push(finding(...args))
  const slides = Array.isArray(post?.slides) ? post.slides : []
  const text = allCopy(post)
  const normalizedSlides = slides.map((slide) => normalizedText(slide.text)).filter(Boolean)

  if (!String(post?.hook || '').trim()) add('empty-hook', 'Hook present', 'blocking', 'The hook is empty.', 'hook', 'Add a clear hook before publishing.')
  if (!String(post?.caption || '').trim()) add('empty-caption', 'Caption present', 'blocking', 'The caption is empty.', 'caption', 'Add a caption before publishing.')
  if (!slides.length) add('missing-slides', 'Media source present', 'blocking', 'The post has no slides or media source.', 'slides', 'Generate or add at least one slide.')
  slides.forEach((slide, index) => {
    if (!String(slide?.text || '').trim()) add(`empty-slide-${index}`, 'Slide text present', 'blocking', `Slide ${index + 1} is empty.`, `slides.${index}.text`, 'Add text or remove the empty slide.', { slideIndex: index })
    if (/^\s*(?:\d+[).:-]\s*){2,}/.test(String(slide?.text || ''))) add(`numbering-${index}`, 'Numbering', 'warning', `Slide ${index + 1} starts with duplicate numbering.`, `slides.${index}.text`, 'Remove the repeated number.', { slideIndex: index, fix: 'safe' })
    if (String(slide?.text || '').length > 650) add(`long-slide-${index}`, 'Paragraph length', 'warning', `Slide ${index + 1} contains unusually long copy.`, `slides.${index}.text`, 'Shorten the paragraph for easier reading.', { slideIndex: index })
  })
  if (new Set(normalizedSlides).size < normalizedSlides.length) add('duplicate-slide-copy', 'Unique slide copy', 'blocking', 'Two or more slides repeat the exact same content.', 'slides', 'Remove or rewrite the repeated slide before publishing.')

  const hashtagInput = post?.hashtags
  const rawTags = Array.isArray(hashtagInput)
    ? hashtagInput.map((tag) => String(tag))
    : typeof hashtagInput === 'string' ? [hashtagInput] : []
  const simpleTags = rawTags.map((tag) => tag.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean)
  const inspectedTags = rawTags.flatMap((value) => String(value || '').replace(/([^\s,])#/g, '$1 #').split(/[,\s]+/))
    .map((tag) => tag.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/^#+/, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9_]+/g, ''))
    .filter(Boolean)
  const cleanTags = normalizeHashtags(rawTags, { brain: context.brain, max: 20, applyStrategy: false, includeBrand: false, includeFyp: false })
  const strategy = strategyWithHashtagNotes(context.hashtagStrategy, post?.hashtagNotes, context.brain)
  if (rawTags.length && !cleanTags.length) {
    add('hashtags-unusable', 'Hashtag output', 'blocking', 'The hashtag output cannot be normalized into any valid tags.', 'hashtags', 'Replace the malformed hashtag output or regenerate hashtags.')
  } else if (new Set(simpleTags).size < simpleTags.length || cleanTags.length !== simpleTags.length || rawTags.some((tag) => /\s|[^#a-z0-9_]/i.test(tag))) {
    add('hashtags-format', 'Hashtag formatting', 'warning', 'Hashtags contain duplicates or malformed values.', 'hashtags', 'Apply the safe hashtag cleanup.', { fix: 'safe' })
  }
  const bannedUsed = [...new Set(inspectedTags.filter((tag) => strategy.banned.includes(tag)))]
  if (bannedUsed.length) add('hashtags-banned', 'Banned hashtags', 'blocking', `Banned hashtag${bannedUsed.length === 1 ? '' : 's'} used: ${bannedUsed.map((tag) => `#${tag}`).join(', ')}.`, 'hashtags', 'Remove every banned hashtag before publishing.', { fix: 'safe' })
  const missingRequired = strategy.required.filter((tag) => !cleanTags.includes(tag) && !strategy.banned.includes(tag))
  if (missingRequired.length) add('hashtags-required', 'Required hashtags', 'blocking', `Required hashtag${missingRequired.length === 1 ? '' : 's'} missing: ${missingRequired.map((tag) => `#${tag}`).join(', ')}.`, 'hashtags', 'Add the required hashtag strategy tags.', { fix: 'safe' })
  if (cleanTags.length < strategy.count) add('hashtags-too-few', 'Hashtag count', 'warning', `This post has ${cleanTags.length} hashtag${cleanTags.length === 1 ? '' : 's'}; the project strategy targets ${strategy.count}.`, 'hashtags', `Use up to ${strategy.count} strong, relevant hashtags.`)
  if (cleanTags.length > strategy.count) add('hashtags-too-many', 'Hashtag count', 'warning', `This post has ${cleanTags.length} hashtags; the project strategy targets ${strategy.count}.`, 'hashtags', `Keep the strongest ${strategy.count} hashtags.`, { fix: 'safe' })
  const genericUsed = cleanTags.filter((tag) => GENERIC_HASHTAGS.has(tag))
  if (strategy.avoidGeneric && genericUsed.length) add('hashtags-generic', 'Generic hashtags', 'warning', `Generic hashtag${genericUsed.length === 1 ? '' : 's'} used: ${genericUsed.map((tag) => `#${tag}`).join(', ')}.`, 'hashtags', 'Replace generic discovery tags with topic-specific tags.', { fix: 'safe' })
  if (post?.topicMode === 'custom' && post?.topic && cleanTags.length) {
    const topicWords = String(post.topic).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3)
    if (topicWords.length && !cleanTags.some((tag) => topicWords.some((word) => tag.includes(word)))) {
      add('hashtags-topic', 'Topic-relevant hashtags', 'warning', 'None of the hashtags clearly matches the selected custom topic.', 'hashtags', 'Add at least one precise hashtag for the selected topic.')
    }
  }

  if (String(post?.caption || '').length > 1800) add('long-caption', 'Caption length', 'warning', 'The caption is unusually long and may be truncated on some platforms.', 'caption', 'Shorten it or verify each selected platform limit.')
  if (PLACEHOLDER_RE.test(text)) add('broken-output', 'Complete AI output', 'blocking', 'The post contains placeholder, JSON, or incomplete-output text.', 'content', 'Replace the placeholder or regenerate the affected content.')
  if (PROMPT_LEAK_RE.test(text)) add('prompt-leak', 'No internal instructions', 'blocking', 'The post appears to expose prompt or internal instruction text.', 'content', 'Remove the leaked instructions and regenerate if needed.')

  const notes = String(post?.generationNotes || '')
  if (/\b(?:no|avoid|without|do not use|don't use)\s+emojis?\b/i.test(notes) && EMOJI_RE.test(text)) {
    add('excluded-emoji', 'Generation Notes exclusions', 'blocking', 'Generation Notes exclude emojis, but the post contains one.', 'content', 'Remove the emoji or explicitly change Generation Notes.')
  }
  for (const phrase of excludedPhrases(notes)) {
    if (normalizedText(text).includes(normalizedText(phrase))) add(`excluded-${createHash('sha1').update(phrase).digest('hex').slice(0, 8)}`, 'Generation Notes exclusions', 'blocking', `Generation Notes exclude “${phrase}”, but it appears in the post.`, 'content', 'Remove the excluded wording or confirm a different instruction.')
  }
  const requirements = contentRequirements(post, context)
  if (requirements.product && !productMentioned(text, requirements.product)) {
    add('missing-product', 'Required product mention', 'blocking', `The required product or offer “${requirements.product}” is missing.`, 'content', 'Mention the actual product or an unmistakable variation without changing the selected topic.')
  }
  if (requirements.cta && !CTA_COPY_RE.test(text)) {
    add('missing-required-cta', 'Required call to action', 'blocking', 'Generation Notes explicitly require a call to action, but the completed post has none.', 'content', 'Add a clear action such as save, comment, visit, buy, or learn more.')
  }
  if (post?.topic && post?.topicMode === 'custom' && !normalizedText(text).includes(normalizedText(post.topic))) {
    add('topic-focus', 'Selected topic', 'warning', `The selected topic “${post.topic}” is not clearly present in the post.`, 'content', 'Review the copy for topic drift before approval.')
  }
  if ((context.recentHooks || []).some((hook) => normalizedText(hook) === normalizedText(post?.hook))) {
    add('repeated-hook', 'Unique hook', 'warning', 'This hook repeats another hook in the same batch or plan.', 'hook', 'Rewrite the hook while preserving the topic.')
  }

  for (const overflow of detectTextOverflow(post)) {
    add(`overflow-${overflow.field}`, 'Renderer fit', 'blocking', overflow.explanation, overflow.field, 'Shorten the copy or use a supported smaller layout.', overflow.slideIndex === undefined ? {} : { slideIndex: overflow.slideIndex })
  }

  for (const [index, slide] of slides.entries()) {
    if (!slide.imageUrl) {
      const from = luminance(slide.bgFrom)
      const to = luminance(slide.bgTo)
      if (from !== null && to !== null && from > 0.72 && to > 0.72) add(`contrast-${index}`, 'Text contrast', 'warning', `Slide ${index + 1} uses a very light gradient behind white text.`, `slides.${index}`, 'Choose a darker background or verify the outlined text remains readable.', { slideIndex: index })
    }
  }

  if (context.scheduling) {
    const accountIds = (context.socialAccounts || []).map(Number).filter(Number.isFinite)
    if (!context.postbridgeConfigured) add('missing-postbridge', 'Postbridge credentials', 'blocking', 'Postbridge is not configured.', 'credentials', 'Add and validate the Postbridge API key in Settings.')
    if (!accountIds.length) add('missing-account', 'Social account selected', 'blocking', 'No target social account is selected.', 'socialAccounts', 'Select at least one connected account.')
    const connectedIds = new Set((context.connectedAccountIds || []).map(Number))
    if (context.postbridgeConfigured && accountIds.some((id) => !connectedIds.has(id))) add('disconnected-account', 'Connected accounts', 'blocking', 'One or more selected social accounts are no longer connected.', 'socialAccounts', 'Refresh accounts and choose connected targets.')
    if (context.mode === 'schedule') {
      const when = new Date(context.scheduledAt)
      if (!context.scheduledAt || Number.isNaN(when.getTime())) add('invalid-date', 'Schedule date', 'blocking', 'The scheduled date or time is invalid.', 'scheduledAt', 'Choose a valid future date and time.')
      else if (when.getTime() <= Date.now()) add('past-date', 'Future schedule', 'blocking', 'The scheduled time is in the past.', 'scheduledAt', 'Choose a future date and time.')
      if (!context.timezone || !isTimezone(context.timezone)) add('invalid-timezone', 'Timezone', 'blocking', 'The selected timezone is invalid.', 'timezone', 'Choose a valid IANA timezone.')
      const targetMinute = minuteKey(context.scheduledAt)
      const conflict = (context.existingSlots || []).find((slot) => minuteKey(slot.scheduledAt) === targetMinute && (slot.socialAccounts || []).some((id) => accountIds.includes(Number(id))) && slot.localPostId !== context.localPostId)
      if (conflict) add('schedule-conflict', 'Unique account time slot', 'blocking', 'Another post already targets the same account and minute.', 'scheduledAt', 'Move this post to another time slot.')
    }
    if (context.alreadyScheduled) add('duplicate-schedule', 'Duplicate scheduling protection', 'blocking', 'This local post already has a scheduling attempt or Postbridge ID.', 'id', 'Refresh the plan or Queue before trying again.')
    if (context.sourceStatus && ['generating', 'quality_check', 'scheduling'].includes(context.sourceStatus)) add('incomplete-state', 'Post generation complete', 'blocking', `The post is still ${context.sourceStatus.replace('_', ' ')}.`, 'status', 'Wait for the current stage to finish.')

    const postType = context.postType || (slides.length > 1 ? 'carousel' : 'image')
    const mediaCount = context.mediaCount ?? (context.renderedMedia || []).length
    const platforms = [...new Set((context.platforms || []).map((platform) => String(platform).toLowerCase()))]
    for (const platform of platforms) {
      const rule = PLATFORM_RULES[platform]
      if (!rule) continue
      if (!rule.formats.includes(postType)) add(`platform-format-${platform}`, `${platform} post type`, 'blocking', `${platform} does not support the selected ${postType} format in this workflow.`, 'postType', 'Choose a supported format or remove that account.')
      if (mediaCount > rule.mediaMax) add(`platform-media-${platform}`, `${platform} media count`, 'blocking', `${platform} supports at most ${rule.mediaMax} media item${rule.mediaMax === 1 ? '' : 's'} for this workflow.`, 'media', 'Reduce the media count or choose different accounts.')
      if (String(context.fullCaption || post?.caption || '').length > rule.captionMax) add(`platform-caption-${platform}`, `${platform} caption limit`, 'blocking', `The caption exceeds ${platform}’s ${rule.captionMax}-character limit.`, 'caption', 'Shorten the caption for this platform.')
      if (simpleTags.length > rule.hashtagWarn) add(`platform-hashtags-${platform}`, `${platform} hashtag count`, 'warning', `${platform} may perform poorly with ${simpleTags.length} hashtags.`, 'hashtags', `Consider using ${rule.hashtagWarn} or fewer hashtags.`)
    }

    if (postType === 'video') {
      if (!context.video?.exists) add('missing-video', 'Video source', 'blocking', 'The selected background video is missing.', 'videoId', 'Select an available video asset.')
      if (context.video?.duration && (context.video.duration < 1 || context.video.duration > 180)) add('video-duration', 'Video duration', 'blocking', 'The rendered video duration is outside the supported range.', 'video', 'Use a video between 1 and 180 seconds.')
      if (context.video?.sizeBytes === 0) add('empty-video', 'Rendered video file', 'blocking', 'The rendered video file is empty.', 'video', 'Render the video again.')
    } else {
      const rendered = context.renderedMedia || []
      if (!rendered.length) add('missing-render', 'Rendered media', 'blocking', 'No rendered media was supplied for publishing.', 'media', 'Render the post before scheduling.')
      rendered.forEach((item, index) => {
        const info = pngInfo(item)
        if (!info || info.bytes < 512) add(`broken-render-${index}`, 'Rendered media file', 'blocking', `Rendered slide ${index + 1} is empty or invalid.`, `media.${index}`, 'Render the slide again.', { slideIndex: index })
        else if (info.width !== 1080 || info.height !== 1920) add(`render-dimensions-${index}`, 'Output dimensions', 'blocking', `Rendered slide ${index + 1} is ${info.width}×${info.height}, not 1080×1920.`, `media.${index}`, 'Re-render with the Postfarm vertical canvas.', { slideIndex: index })
      })
    }
  }

  const blocking = findings.filter((item) => item.severity === 'blocking').length
  const warnings = findings.filter((item) => item.severity === 'warning').length
  const score = Math.max(0, 100 - blocking * 25 - warnings * 6)
  return {
    version: QUALITY_REPORT_VERSION,
    contentVersion: qualityVersion(post, context.scheduling
      ? context
      : { brain: context.brain, hashtagStrategy: context.hashtagStrategy }),
    checkedAt: new Date().toISOString(),
    status: blocking ? 'blocked' : warnings ? 'warnings' : 'passed',
    score,
    summary: { blocking, warnings, passed: Math.max(0, 12 - findings.length) },
    findings,
  }
}

export function repairQuality(post, { brain, hashtagStrategy } = {}) {
  const cleanNumbering = (value) => String(value || '').replace(/^\s*(?:\d+[).:-]\s*){2,}/, (prefix) => {
    const first = prefix.match(/\d+/)?.[0]
    return first ? `${first}. ` : ''
  }).replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
  return {
    ...post,
    hook: cleanNumbering(post?.hook),
    caption: String(post?.caption || '').replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim(),
    hashtags: normalizeHashtags(post?.hashtags || [], { brain, strategy: strategyWithHashtagNotes(hashtagStrategy, post?.hashtagNotes, brain) }),
    slides: (post?.slides || []).map((slide) => ({ ...slide, text: cleanNumbering(slide.text) })),
    notesData: post?.notesData ? {
      ...post.notesData,
      noteTitle: post.notesData.noteTitle ? cleanNumbering(post.notesData.noteTitle) : post.notesData.noteTitle,
      points: (post.notesData.points || []).map((point) => ({
        ...point,
        heading: cleanNumbering(point.heading),
        body: String(point.body || '').replace(/[ \t]+/g, ' ').trim(),
      })),
    } : post?.notesData,
  }
}

export function assertPublishable(report, { warningsAcknowledged = false } = {}) {
  if (report.status === 'blocked') {
    const first = report.findings.find((item) => item.severity === 'blocking')
    const error = new Error(`Quality Gate blocked publishing: ${first?.explanation || 'Resolve the blocking findings first.'}`)
    error.status = 409
    error.qualityReport = report
    throw error
  }
  if (report.status === 'warnings' && !warningsAcknowledged) {
    const error = new Error('Quality Gate found warnings. Review and acknowledge them before publishing.')
    error.status = 409
    error.qualityReport = report
    throw error
  }
  return report
}
