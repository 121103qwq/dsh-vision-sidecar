import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pnpmEntry = process.env.npm_execpath

if (pnpmEntry === undefined) {
  throw new Error('smoke-install must run through pnpm so its exact CLI can be reused')
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-vision-sidecar-smoke-'))
const packDirectory = join(temporary, 'pack')
const home = join(temporary, 'dsh-home')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  })
  if (result.error !== undefined || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n')
    throw new Error(`${command} ${args.join(' ')} failed\n${detail}`)
  }
  return result.stdout
}

function pnpm(args, options = {}) {
  return run(process.execPath, [pnpmEntry, ...args], options)
}

function dsh(args, options = {}) {
  if (process.env.DSH_SMOKE_ENTRY !== undefined) {
    return run(process.execPath, [resolve(process.env.DSH_SMOKE_ENTRY), ...args], options)
  }
  return pnpm(['dlx', '@deepseek-ai/dsh@0.1.0-rc.6', ...args], options)
}

try {
  await mkdir(packDirectory)
  pnpm([
    'pack',
    '--pack-destination',
    packDirectory,
  ])
  const archives = (await readdir(packDirectory)).filter(file => file.endsWith('.tgz'))
  if (archives.length !== 1) throw new Error(`expected one packed archive, found ${archives.length}`)

  const env = { ...process.env, DSH_HOME: home }
  dsh(['plugin', '--profile', 'web', 'add', join(packDirectory, archives[0])], { env })
  const composed = dsh(['--profile', 'web', '--dump-config'], { env })

  for (const expected of [
    '# == dsh-vision-sidecar',
    'id: vision-sidecar',
    'provider: deepseek-vision',
    'model: deepseek-with-vision',
  ]) {
    if (!composed.includes(expected)) throw new Error(`composed config is missing ${JSON.stringify(expected)}`)
  }
  process.stdout.write('packed bundle installed and composed successfully\n')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
