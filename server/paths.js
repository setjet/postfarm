import { homedir, platform, tmpdir } from 'node:os'
import { join } from 'node:path'

function defaultDataDir() {
  if (process.env.VERCEL) return join(tmpdir(), 'postfarm')
  if (platform() === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Postfarm')
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Postfarm')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'postfarm')
}

export function getDataDir() {
  return process.env.POSTFARM_DIR || defaultDataDir()
}

export const DATA_DIR = getDataDir()
