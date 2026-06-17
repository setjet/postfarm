// Local analytics learning memory. Stores compact AI summaries per project so
// future generations can learn from performance without keeping huge raw dumps.
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { chatJSON } from './ai.js'

const DEFAULT_DIR = process.env.VERCEL ? join(tmpdir(), '.slidesmith') : join(homedir(), '.slidesmith')
const DIR = process.env.SLIDESMITH_DIR || DEFAULT_DIR
const INDEX_PATH = join(DIR, 'learning.json')

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}

function writeJson(path, value) {
  ensureDir()
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function readMap() {
  const data = readJson(INDEX_PATH, {})
  return data && !Array.isArray(data) ? data : {}
}

function writeMap(map) {
  writeJson(INDEX_PATH, map)
  return map
}

export function getLearningMemory(projectId) {
  return readMap()[projectId] || null
}

export function saveLearningMemory(projectId, memory) {
  const map = readMap()
  map[projectId] = memory
  writeMap(map)
  return memory
}

export function clearLearningMemory(projectId) {
  const map = readMap()
  delete map[projectId]
  writeMap(map)
  return null
}

function metricNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function engagementRate(post) {
  const views = metricNumber(post.view_count ?? post.views)
  if (!views) return 0
  return (
    metricNumber(post.like_count ?? post.likes) +
    metricNumber(post.comment_count ?? post.comments) +
    metricNumber(post.share_count ?? post.shares)
  ) / views
}

function compactPost(post) {
  const caption = String(post.video_description || post.description || post.caption || '').slice(0, 500)
  return {
    id: String(post.id || ''),
    platform: String(post.platform || ''),
    views: metricNumber(post.view_count ?? post.views),
    likes: metricNumber(post.like_count ?? post.likes),
    comments: metricNumber(post.comment_count ?? post.comments),
    shares: metricNumber(post.share_count ?? post.shares),
    engagementRate: Number(engagementRate(post).toFixed(4)),
    caption,
    shareUrl: post.share_url || post.shareUrl || null,
    lastSyncedAt: post.last_synced_at || post.lastSyncedAt || null,
  }
}

function fallbackMemory(project, analytics) {
  const compact = analytics.map(compactPost)
  const ranked = compact.slice().sort((a, b) => (b.views + b.likes * 5 + b.comments * 10 + b.shares * 15) - (a.views + a.likes * 5 + a.comments * 10 + a.shares * 15))
  const best = ranked.slice(0, 3).map((p) => p.caption).filter(Boolean)
  const weak = ranked.slice(-3).map((p) => p.caption).filter(Boolean)
  return {
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    sourcePostCount: compact.length,
    summary: compact.length
      ? `Analyzed ${compact.length} posts. Prioritize the structures from the strongest captions and avoid repeating low-response wording.`
      : 'No analytics were available yet.',
    working: best.length ? best.map((t) => `Strong performer pattern: ${t.slice(0, 120)}`) : ['No strong performers identified yet.'],
    avoid: weak.length ? weak.map((t) => `Avoid overusing: ${t.slice(0, 120)}`) : ['No weak patterns identified yet.'],
    bestCtas: ['save this', 'try this', 'steal this'],
    bestHookFormulas: ['specific pain point + surprising fix', 'before/after transformation', 'mistake callout'],
    recommendedNextPosts: ['Test a sharper hook using the highest-performing topic.', 'Create one practical post with a clear save-worthy takeaway.'],
    suggestedBuckets: ['education', 'mistakes', 'quick wins'],
  }
}

export async function rebuildLearningMemory({ provider = 'openrouter', apiKey, model, project, analytics }) {
  const compact = (analytics || []).map(compactPost).filter((p) => p.caption || p.views || p.likes)
  if (!compact.length) {
    return saveLearningMemory(project.id, fallbackMemory(project, []))
  }
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings to rebuild learning memory.')

  const prompt = `You are SlideSmith's analytics strategist.

Brand/project:
- Name: ${project.name}
- Niche: ${project.brain?.niche || '(unspecified)'}
- App/brand: ${project.brain?.appName || '(unspecified)'} - ${project.brain?.appDescription || ''}
- Audience: ${project.brain?.audience || '(unspecified)'}

Analyze these published-post analytics. Summarize patterns, do not quote long captions back verbatim and do not overfit to one viral post.

Posts:
${JSON.stringify(compact.slice(0, 80), null, 2)}

Return ONLY this JSON shape:
{
  "summary": "compact strategic summary",
  "working": ["what is working"],
  "avoid": ["low-performing patterns to avoid"],
  "bestCtas": ["CTA keywords or phrases"],
  "bestHookFormulas": ["hook formulas that seem strong"],
  "recommendedNextPosts": ["specific next post ideas"],
  "suggestedBuckets": ["content bucket names"]
}`

  try {
    const parsed = await chatJSON({ provider, apiKey, model, prompt })
    return saveLearningMemory(project.id, {
      projectId: project.id,
      generatedAt: new Date().toISOString(),
      sourcePostCount: compact.length,
      summary: String(parsed.summary || ''),
      working: Array.isArray(parsed.working) ? parsed.working.map(String).slice(0, 8) : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid.map(String).slice(0, 8) : [],
      bestCtas: Array.isArray(parsed.bestCtas) ? parsed.bestCtas.map(String).slice(0, 8) : [],
      bestHookFormulas: Array.isArray(parsed.bestHookFormulas) ? parsed.bestHookFormulas.map(String).slice(0, 8) : [],
      recommendedNextPosts: Array.isArray(parsed.recommendedNextPosts) ? parsed.recommendedNextPosts.map(String).slice(0, 8) : [],
      suggestedBuckets: Array.isArray(parsed.suggestedBuckets) ? parsed.suggestedBuckets.map(String).slice(0, 8) : [],
    })
  } catch (e) {
    const fallback = fallbackMemory(project, analytics || [])
    fallback.summary = `AI insight parsing failed, so SlideSmith saved a fallback summary. ${e.message || String(e)}`
    return saveLearningMemory(project.id, fallback)
  }
}
