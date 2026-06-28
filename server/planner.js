import { createHash, randomUUID } from 'node:crypto'

export const PLAN_STATUSES = Object.freeze([
  'planned', 'generating', 'quality_check', 'needs_attention', 'ready_for_review',
  'approved', 'scheduling', 'scheduled', 'failed', 'removed',
])

const GOAL_TOPICS = {
  growth: ['audience discovery', 'shareable insight', 'common mistake', 'quick transformation'],
  engagement: ['conversation starter', 'strong opinion', 'audience question', 'myth versus reality'],
  education: ['beginner guide', 'step-by-step workflow', 'mistake to avoid', 'advanced tip'],
  promotion: ['problem and solution', 'product use case', 'customer outcome', 'offer breakdown'],
  traffic: ['searchable how-to', 'resource roundup', 'curiosity gap', 'next-step guide'],
}

const pad = (value) => String(value).padStart(2, '0')

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function zonedDateTimeToUtc(date, time, timezone) {
  const matchDate = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const matchTime = String(time || '').match(/^(\d{2}):(\d{2})$/)
  if (!matchDate || !matchTime) throw new Error('Use a valid date and HH:mm time.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { throw new Error('Choose a valid timezone.') }
  const desired = {
    year: Number(matchDate[1]), month: Number(matchDate[2]), day: Number(matchDate[3]),
    hour: Number(matchTime[1]), minute: Number(matchTime[2]),
  }
  if (desired.hour > 23 || desired.minute > 59) throw new Error('Use a valid HH:mm time.')
  let instant = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute)
    const delta = target - shown
    instant += delta
    if (!delta) break
  }
  const result = new Date(instant)
  if (Number.isNaN(result.getTime())) throw new Error('The selected local date and time is invalid.')
  const finalParts = Object.fromEntries(formatter.formatToParts(result).map((part) => [part.type, part.value]))
  const matchesWallClock = Number(finalParts.year) === desired.year
    && Number(finalParts.month) === desired.month
    && Number(finalParts.day) === desired.day
    && Number(finalParts.hour) === desired.hour
    && Number(finalParts.minute) === desired.minute
  if (!matchesWallClock) throw new Error('That local time does not exist in the selected timezone because of daylight-saving time.')
  return result.toISOString()
}

function dateRange(start, end) {
  const output = []
  const current = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime()) || current > last) throw new Error('Choose a valid start and end date.')
  for (let count = 0; current <= last && count < 120; count++) {
    output.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  if (current <= last) throw new Error('Custom plans are limited to 120 days.')
  return output
}

function endForPreset(start, preset) {
  const days = Number(preset)
  if (![7, 14, 30].includes(days)) return null
  const end = new Date(`${start}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() + days - 1)
  return end.toISOString().slice(0, 10)
}

function cleanList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))]
}

export function recommendedPostingTimes(postsPerDay, goal = 'growth') {
  const windows = {
    growth: [9, 20],
    engagement: [11, 21],
    education: [8, 19],
    promotion: [10, 20],
    traffic: [9, 19],
  }
  const count = Math.min(Math.max(Math.round(Number(postsPerDay) || 1), 1), 6)
  const [start, end] = windows[goal] || windows.growth
  if (count === 1) return [`${pad(Math.round((start + end) / 2))}:00`]
  return Array.from({ length: count }, (_, index) => {
    const raw = start + (end - start) * index / (count - 1)
    const halfHours = Math.round(raw * 2)
    return `${pad(Math.floor(halfHours / 2))}:${halfHours % 2 ? '30' : '00'}`
  })
}

function normalizePillars(values) {
  const input = (Array.isArray(values) ? values : []).map((item) => ({
    name: String(item?.name || '').trim(),
    percentage: Math.max(0, Number(item?.percentage) || 0),
  })).filter((item) => item.name)
  if (!input.length) return []
  const total = input.reduce((sum, item) => sum + item.percentage, 0) || input.length
  return input.map((item) => ({ ...item, percentage: item.percentage ? item.percentage * 100 / total : 100 / input.length }))
}

function distributeWeighted(pillars, count) {
  if (!pillars.length) return Array(count).fill('General')
  const remaining = pillars.map((pillar) => ({
    name: pillar.name,
    count: Math.floor(count * pillar.percentage / 100),
    remainder: count * pillar.percentage / 100 % 1,
  }))
  let assigned = remaining.reduce((sum, item) => sum + item.count, 0)
  for (const item of [...remaining].sort((a, b) => b.remainder - a.remainder)) {
    if (assigned++ >= count) break
    item.count++
  }
  const result = []
  let last = ''
  while (result.length < count) {
    const candidates = remaining.filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    const pick = candidates.find((item) => item.name !== last) || candidates[0]
    if (!pick) break
    result.push(pick.name)
    pick.count--
    last = pick.name
  }
  return result
}

function rotateAvoiding(values, count) {
  const clean = cleanList(values)
  if (!clean.length) return Array(count).fill('General')
  const result = []
  for (let index = 0; index < count; index++) {
    let value = clean[index % clean.length]
    if (value === result[index - 1] && clean.length > 1) value = clean[(index + 1) % clean.length]
    result.push(value)
  }
  return result
}

function conflictFor(slot, existing) {
  const minute = slot.scheduledAt.slice(0, 16)
  const accounts = new Set(slot.socialAccountIds.map(Number))
  return (existing || []).filter((post) => {
    if (!post?.scheduledAt || String(post.status || '').toLowerCase() !== 'scheduled') return false
    if (new Date(post.scheduledAt).toISOString().slice(0, 16) !== minute) return false
    return (post.socialAccounts || []).some((id) => accounts.has(Number(id)))
  }).map((post) => ({ postId: post.id, scheduledAt: post.scheduledAt, socialAccounts: post.socialAccounts }))
}

export function normalizePlanConfig(input = {}) {
  const timezone = String(input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { throw new Error('Choose a valid timezone.') }
  const startDate = String(input.startDate || localDateString())
  const preset = ['7', '14', '30', 'custom'].includes(String(input.rangePreset)) ? String(input.rangePreset) : '7'
  const endDate = endForPreset(startDate, preset) || String(input.endDate || startDate)
  const postsPerDay = Math.min(Math.max(Math.round(Number(input.postsPerDay) || 1), 1), 6)
  const preferredTimeMode = input.preferredTimeMode === 'ai' ? 'ai' : 'manual'
  const preferredTimes = preferredTimeMode === 'ai'
    ? recommendedPostingTimes(postsPerDay, input.goal)
    : cleanList(input.preferredTimes || ['10:00'])
  if (preferredTimes.length < postsPerDay) throw new Error('Add at least one preferred time for every daily post.')
  preferredTimes.forEach((time) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Invalid posting time: ${time}`)
  })
  const postingDays = [...new Set((input.postingDays || [0, 1, 2, 3, 4, 5, 6]).map(Number).filter((day) => day >= 0 && day <= 6))]
  if (!postingDays.length) throw new Error('Choose at least one posting day.')
  const formats = cleanList(input.formats || ['standard']).filter((format) => ['standard', 'notes', 'image', 'video'].includes(format))
  if (!formats.length) throw new Error('Choose at least one post format.')
  const socialAccountIds = [...new Set((input.socialAccountIds || []).map(Number).filter(Number.isFinite))]
  const topicMode = input.topicMode === 'custom' ? 'custom' : 'general'
  const topics = cleanList(input.topics)
  if (topicMode === 'custom' && !topics.length) throw new Error('Add at least one custom topic.')
  return {
    name: String(input.name || 'Content plan').trim().slice(0, 120) || 'Content plan',
    goal: ['growth', 'engagement', 'education', 'promotion', 'traffic'].includes(input.goal) ? input.goal : 'growth',
    rangePreset: preset,
    startDate,
    endDate,
    timezone,
    postingDays,
    postsPerDay,
    preferredTimeMode,
    preferredTimes,
    socialAccountIds,
    topicMode,
    topics,
    contentPillars: normalizePillars(input.contentPillars),
    formats,
    backgroundSelections: cleanList(input.backgroundSelections),
    generationNotes: String(input.generationNotes || '').trim().slice(0, 2000),
    postStyle: String(input.postStyle || '').trim().slice(0, 2000),
    productEmphasis: String(input.productEmphasis || '').trim().slice(0, 200),
    videoId: String(input.videoId || '').trim() || null,
    approvalMode: input.approvalMode === 'automatic' ? 'automatic' : 'manual',
    useTrends: input.useTrends !== false,
  }
}

export function buildPlanSlots(input, existingPosts = [], now = new Date()) {
  const config = normalizePlanConfig(input)
  const validDates = dateRange(config.startDate, config.endDate).filter((date) => config.postingDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
  const count = validDates.length * config.postsPerDay
  if (!count) throw new Error('The selected date range contains no chosen posting days.')
  const pillars = distributeWeighted(config.contentPillars, count)
  const topicPool = config.topicMode === 'custom'
    ? config.topics
    : (config.topics.length ? config.topics : config.contentPillars.map((pillar) => pillar.name).filter(Boolean).concat(GOAL_TOPICS[config.goal] || GOAL_TOPICS.growth))
  const topics = rotateAvoiding(topicPool, count)
  const formats = rotateAvoiding(config.formats, count)
  const backgrounds = rotateAvoiding(config.backgroundSelections.length ? config.backgroundSelections : ['Automatic'], count)
  const slots = []
  let index = 0
  for (const date of validDates) {
    for (let daily = 0; daily < config.postsPerDay; daily++) {
      const localTime = config.preferredTimes[daily]
      const scheduledAt = zonedDateTimeToUtc(date, localTime, config.timezone)
      const slot = {
        id: `slot-${randomUUID()}`,
        localDate: date,
        localTime,
        scheduledAt,
        timezone: config.timezone,
        topic: topics[index],
        pillar: pillars[index],
        format: formats[index],
        backgroundSelection: backgrounds[index] === 'Automatic' ? null : backgrounds[index],
        socialAccountIds: [...config.socialAccountIds],
        status: 'planned',
        conflicts: [],
        postStyleOverride: null,
        post: null,
        qualityReport: null,
        approvedAt: null,
        postbridgeId: null,
        scheduleFingerprint: null,
        scheduleAttemptedAt: null,
        scheduleUncertain: false,
        error: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
      slot.conflicts = conflictFor(slot, existingPosts)
      slots.push(slot)
      index++
    }
  }
  return { config, slots }
}

export function createPlan(input, { projectId, existingPosts = [], now = new Date() } = {}) {
  const { config, slots } = buildPlanSlots(input, existingPosts, now)
  return {
    id: `plan-${randomUUID()}`,
    projectId,
    name: config.name,
    config,
    slots,
    automaticSchedulingConfirmedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function movePlanSlot(plan, slotId, { localDate, localTime }, existingPosts = [], now = new Date()) {
  const slot = plan.slots.find((item) => item.id === slotId)
  if (!slot) throw new Error('Planned slot not found.')
  if (['scheduling', 'scheduled'].includes(slot.status)) throw new Error('A scheduling or scheduled slot cannot be moved.')
  const scheduledAt = zonedDateTimeToUtc(localDate, localTime, plan.config.timezone)
  const updated = { ...slot, localDate, localTime, scheduledAt, approvedAt: null, qualityReport: null, status: slot.post ? 'needs_attention' : 'planned', updatedAt: now.toISOString() }
  const otherSlots = plan.slots.filter((item) => item.id !== slotId && item.status !== 'removed').map((item) => ({
    id: item.id, status: 'scheduled', scheduledAt: item.scheduledAt, socialAccounts: item.socialAccountIds,
  }))
  updated.conflicts = conflictFor(updated, [...existingPosts, ...otherSlots])
  return { ...plan, slots: plan.slots.map((item) => item.id === slotId ? updated : item), updatedAt: now.toISOString() }
}

export function scheduleFingerprint(planId, slot) {
  return createHash('sha256').update(JSON.stringify({
    planId,
    slotId: slot.id,
    scheduledAt: slot.scheduledAt,
    accounts: [...slot.socialAccountIds].sort((a, b) => a - b),
    qualityVersion: slot.qualityReport?.contentVersion || null,
  })).digest('hex').slice(0, 24)
}

export function plannerStatusForQualityReport(report) {
  return report?.status === 'blocked' || Number(report?.summary?.blocking) > 0
    ? 'needs_attention'
    : 'ready_for_review'
}

export function planProgress(plan) {
  const active = plan.slots.filter((slot) => slot.status !== 'removed')
  const complete = active.filter((slot) => ['ready_for_review', 'needs_attention', 'approved', 'scheduled', 'failed'].includes(slot.status)).length
  const failures = active.filter((slot) => slot.status === 'failed').length
  return { total: active.length, complete, failures, remaining: Math.max(0, active.length - complete) }
}
