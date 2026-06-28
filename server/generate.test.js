import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNotesPrompt,
  buildPrompt,
  buildRewritePrompt,
  buildScorePrompt,
  cleanGenerationNotes,
  cleanPostStyle,
  generationNotesGuidance,
  hashtagGuidance,
  postStyleGuidance,
} from './generate.js'

const brain = {
  niche: 'Creator education',
  appName: 'Example Brand',
  appDescription: 'Practical creator workflows',
  audience: 'independent creators',
  styleMemory: 'clear, useful, and specific',
}

function slideshow(format = 'standard') {
  return {
    id: 'show-1',
    format,
    hook: 'try this ai tool',
    caption: 'a useful caption',
    hashtags: ['aitools', 'fyp'],
    rationale: 'useful',
    generationNotes: 'do not mention making money\nno emojis',
    postStyle: '2-slide lowercase explainer',
    slides: [{ id: 'slide-1', text: 'try this ai tool' }],
    ...(format === 'notes'
      ? { notesData: { hookText: 'try this ai tool', points: [{ heading: 'start here', body: 'open the tool' }] } }
      : {}),
  }
}

test('generation notes are normalized, trimmed, and capped at 2,000 characters', () => {
  assert.equal(cleanGenerationNotes('  first line  \r\nsecond line\t \r\n'), 'first line\nsecond line')
  assert.equal(cleanGenerationNotes('x'.repeat(2100)).length, 2000)
  assert.equal(cleanGenerationNotes(' \n\t '), '')
})

test('post style is normalized and separated from generation notes', () => {
  assert.equal(cleanPostStyle('  2-slide post  \r\nlowercase\t \r\n'), '2-slide post\nlowercase')
  const style = postStyleGuidance('2-slide post\nlowercase')
  assert.match(style, /User post style preference:/)
  assert.match(style, /2-slide post\nlowercase/)
  assert.match(style, /do not copy them word-for-word/)
  assert.match(style, /Required JSON schema, platform rules, safety constraints, and quality rules win/)
})

test('empty notes leave the existing generation prompt unchanged', () => {
  assert.equal(buildPrompt(brain, 2, {}), buildPrompt(brain, 2, { generationNotes: ' \r\n ' }))
  assert.equal(generationNotesGuidance(''), '')
  assert.equal(postStyleGuidance(''), '')
})

test('standard and text-note prompts apply notes to the entire batch without treating them as copy', () => {
  const options = { generationNotes: 'focus on beginners\nno emojis', postStyle: 'exactly 3 slides, lowercase' }
  for (const prompt of [buildPrompt(brain, 3, options), buildNotesPrompt(brain, 3, options)]) {
    assert.match(prompt, /User preferences for the current generation:/)
    assert.match(prompt, /User post style preference:/)
    assert.match(prompt, /focus on beginners\nno emojis/)
    assert.match(prompt, /exactly 3 slides, lowercase/)
    assert.match(prompt, /Apply these preferences to every post in this batch/)
    assert.match(prompt, /Treat this block as instructions, not post copy/)
    assert.match(prompt, /explicit exclusions.*strong priority/i)
  }
})

test('quality scoring checks adherence and explicit exclusions only when notes exist', () => {
  const withNotes = buildScorePrompt({ brain, slideshow: slideshow() })
  assert.match(withNotes, /instructionAdherence/)
  assert.match(withNotes, /prohibited words, topics, emojis, styles, elements/)

  const withoutNotes = buildScorePrompt({ brain, slideshow: { ...slideshow(), generationNotes: undefined, postStyle: undefined } })
  assert.doesNotMatch(withoutNotes, /instructionAdherence/)
  assert.doesNotMatch(withoutNotes, /User preferences for the current generation/)
  assert.doesNotMatch(withoutNotes, /User post style preference/)

  const withStyle = buildScorePrompt({ brain, slideshow: { ...slideshow(), generationNotes: undefined, postStyle: 'lowercase only' } })
  assert.match(withStyle, /instructionAdherence/)
  assert.match(withStyle, /User post style preference:/)
})

test('standard, text-note, automatic, and manual rewrite prompts retain generation notes', () => {
  for (const format of ['standard', 'notes']) {
    const prompt = buildRewritePrompt({
      brain,
      slideshow: slideshow(format),
      feedback: 'make this more specific',
      note: 'shorter hook',
      trends: [],
      learning: null,
    })
    assert.match(prompt, /User preferences for the current generation:/)
    assert.match(prompt, /User post style preference:/)
    assert.match(prompt, /do not mention making money\nno emojis/)
    assert.match(prompt, /2-slide lowercase explainer/)
    assert.match(prompt, /shorter hook/)
  }
})

test('hashtag strategy is explicit in standard, text-note, scoring, and rewrite prompts', () => {
  const hashtagStrategy = {
    preferred: ['creatorworkflow'], required: ['yourbrand'], banned: ['fyp'], brand: ['yourbrand'],
    style: 'niche', count: 5, trendInfluence: 'off', avoidGeneric: true,
    notes: 'attract independent creators',
  }
  const options = { hashtagStrategy, hashtagNotes: 'prefer image-generation tags' }
  for (const prompt of [
    buildPrompt(brain, 2, options),
    buildNotesPrompt(brain, 2, options),
    buildScorePrompt({ brain, slideshow: { ...slideshow(), hashtagNotes: options.hashtagNotes }, hashtagStrategy }),
    buildRewritePrompt({ brain, slideshow: { ...slideshow(), hashtagNotes: options.hashtagNotes }, hashtagStrategy }),
  ]) {
    assert.match(prompt, /Required tags.*yourbrand/)
    assert.match(prompt, /Banned tags.*fyp/)
    assert.match(prompt, /Style: niche/)
    assert.match(prompt, /array of 5 clean strings/)
    assert.match(prompt, /prefer image-generation tags/)
    assert.match(prompt, /Trend influence is OFF/)
  }
})

test('strong trend influence exposes scored relevant candidates while Off exposes none', () => {
  const hashtagTrends = [{
    hashtags: ['aiimages'], hook: 'AI images', caption: 'AI image prompts', query: 'AI images',
    views: 10000, likes: 500, comments: 20, shares: 10, scrapedAt: new Date().toISOString(),
  }]
  const strong = hashtagGuidance(brain, { hashtagStrategy: { trendInfluence: 'strong' }, hashtagTrends, topic: 'AI images' })
  const off = hashtagGuidance(brain, { hashtagStrategy: { trendInfluence: 'off' }, hashtagTrends, topic: 'AI images' })
  assert.match(strong, /"tag": "aiimages"/)
  assert.doesNotMatch(off, /"tag": "aiimages"/)
})
