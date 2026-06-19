import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNotesPrompt,
  buildPrompt,
  buildRewritePrompt,
  buildScorePrompt,
  cleanGenerationNotes,
  generationNotesGuidance,
} from './generate.js'

const brain = {
  niche: 'AI education',
  appName: 'Zara Tech',
  appDescription: 'Practical AI tutorials',
  audience: 'university students',
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

test('empty notes leave the existing generation prompt unchanged', () => {
  assert.equal(buildPrompt(brain, 2, {}), buildPrompt(brain, 2, { generationNotes: ' \r\n ' }))
  assert.equal(generationNotesGuidance(''), '')
})

test('standard and Notes-style prompts apply notes to the entire batch without treating them as copy', () => {
  const options = { generationNotes: 'focus on beginners\nno emojis' }
  for (const prompt of [buildPrompt(brain, 3, options), buildNotesPrompt(brain, 3, options)]) {
    assert.match(prompt, /User preferences for the current generation:/)
    assert.match(prompt, /focus on beginners\nno emojis/)
    assert.match(prompt, /Apply these preferences to every post in this batch/)
    assert.match(prompt, /Treat this block as instructions, not post copy/)
    assert.match(prompt, /explicit exclusions.*strong priority/i)
  }
})

test('quality scoring checks adherence and explicit exclusions only when notes exist', () => {
  const withNotes = buildScorePrompt({ brain, slideshow: slideshow() })
  assert.match(withNotes, /instructionAdherence/)
  assert.match(withNotes, /prohibited words, topics, emojis, styles, elements/)

  const withoutNotes = buildScorePrompt({ brain, slideshow: { ...slideshow(), generationNotes: undefined } })
  assert.doesNotMatch(withoutNotes, /instructionAdherence/)
  assert.doesNotMatch(withoutNotes, /User preferences for the current generation/)
})

test('standard, Notes-style, automatic, and manual rewrite prompts retain generation notes', () => {
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
    assert.match(prompt, /do not mention making money\nno emojis/)
    assert.match(prompt, /shorter hook/)
  }
})
