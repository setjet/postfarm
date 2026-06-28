// Server-side renderer for short vertical "background video + text overlay"
// posts. This is intentionally separate from the browser PNG carousel renderer.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FONT_CANDIDATES = [
  process.env.POSTFARM_FONT,
  'C:\\Windows\\Fonts\\arialbd.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
].filter(Boolean)

function runFfmpeg(args, { timeoutMs = 180_000, unavailableMessage } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stderr = ''
    let stdout = ''
    const child = spawn(FFMPEG, args, { windowsHide: true })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('Video render timed out. Try a shorter background video or lower duration.'))
    }, timeoutMs)

    const finish = (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }

    child.stdout.on('data', (d) => {
      stdout += String(d)
      if (stdout.length > 8000) stdout = stdout.slice(-8000)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    child.on('error', () => {
      finish(new Error(unavailableMessage || 'FFmpeg is not available. Install FFmpeg or set FFMPEG_PATH to render videos.'))
    })
    child.on('close', (code) => {
      if (code === 0) return finish()
      finish(new Error(`Video render failed: ${stderr.trim().slice(-1200) || `ffmpeg exited with ${code}`}`))
    })
  })
}

async function assertFfmpeg() {
  try {
    await runFfmpeg(['-version'], {
      timeoutMs: 8000,
      unavailableMessage: 'FFmpeg is not installed or not available on PATH. Install FFmpeg or set FFMPEG_PATH to render videos.',
    })
  } catch (e) {
    if (e instanceof Error && /Video render failed/.test(e.message)) {
      throw new Error('FFmpeg is not installed or not available on PATH. Install FFmpeg or set FFMPEG_PATH to render videos.')
    }
    throw e
  }
}

function escapeFilterText(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\n/g, '\\n')
}

function escapeFilterPath(path) {
  return String(path).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function fontOption() {
  const font = FONT_CANDIDATES.find((p) => p && existsSync(p))
  return font ? `fontfile='${escapeFilterPath(font)}':` : ''
}

function wrapLine(line, max = 24) {
  const words = String(line).trim().split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (`${current} ${word}`.length <= max) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.join('\n')
}

function slideTexts(slideshow) {
  const fromSlides = (slideshow.slides || [])
    .map((s) => String(s.text || '').trim())
    .filter(Boolean)
  if (fromSlides.length) return fromSlides
  return [slideshow.hook || slideshow.caption || 'Your Brand'].filter(Boolean)
}

function buildFilter({ texts, duration, textPosition, watermark, watermarkText }) {
  const parts = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    'setsar=1',
    'format=yuv420p',
    'drawbox=x=0:y=0:w=iw:h=ih:color=black@0.20:t=fill',
  ]
  const font = fontOption()
  const y = textPosition === 'top' ? '260' : '(h-text_h)/2'
  const segment = duration / texts.length

  texts.forEach((raw, i) => {
    const start = (i * segment).toFixed(2)
    const end = (i === texts.length - 1 ? duration : (i + 1) * segment).toFixed(2)
    const text = escapeFilterText(wrapLine(raw, textPosition === 'top' ? 28 : 24))
    parts.push(
      `drawtext=${font}text='${text}':fontcolor=white:fontsize=${textPosition === 'top' ? 66 : 74}:` +
        `x=(w-text_w)/2:y=${y}:line_spacing=14:borderw=5:bordercolor=black@0.90:` +
        `shadowx=2:shadowy=2:shadowcolor=black@0.90:box=1:boxcolor=black@0.24:boxborderw=28:` +
        `fix_bounds=1:enable='between(t,${start},${end})'`
    )
  })

  if (watermark) {
    const label = escapeFilterText(String(watermarkText || 'Your Brand').slice(0, 80))
    parts.push(
      `drawtext=${font}text='${label}':fontcolor=white@0.72:fontsize=34:` +
        `x=(w-text_w)/2:y=h-150:borderw=2:bordercolor=black@0.65:shadowx=1:shadowy=1:shadowcolor=black@0.65`
    )
  }
  return parts.join(',')
}

export async function renderVideoPost({ slideshow, videoFile, duration, textPosition, watermark, watermarkText }) {
  if (!videoFile || !existsSync(videoFile)) throw new Error('Selected background video is missing.')
  await assertFfmpeg()
  const targetDuration = Math.min(Math.max(Math.round(Number(duration) || 12), 8), 15)
  const tmp = mkdtempSync(join(tmpdir(), 'postfarm-video-'))
  const out = join(tmp, 'post.mp4')
  try {
    const filter = buildFilter({
      texts: slideTexts(slideshow),
      duration: targetDuration,
      textPosition: textPosition === 'top' ? 'top' : 'center',
      watermark: watermark !== false,
      watermarkText,
    })
    await runFfmpeg([
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      videoFile,
      '-t',
      String(targetDuration),
      '-vf',
      filter,
      '-an',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      out,
    ])
    return { buffer: readFileSync(out), duration: targetDuration }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
