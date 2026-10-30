import { execFileSync, spawn } from 'child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'

import { auditPaths } from './paths'

const repoRoot = join(__dirname, '../../..')
const cliPath = join(repoRoot, 'dist/cli/cli.js')
const nodeOptions = process.env.AUDIT_NODE_OPTS?.split(/\s+/) ?? [
  '--max-old-space-size=8192',
]

function appendLog(outputDir: string, message: string | Buffer): void {
  appendFileSync(join(outputDir, 'build.log'), message)
}

function gitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

function prepareOutputDir(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'build.log'), '')
  for (const artifact of [
    'apiIndex.pairA.docs.json',
    'apiIndex.pairB.docs.json',
    'apiIndex.docs.json',
    'apiIndex.dist-root.json',
    'audit-meta.json',
    'audit-run.json',
  ]) {
    rmSync(join(outputDir, artifact), { force: true })
  }
}

function runCliBuild(label: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let buildComplete = false
    let stopScheduled = false
    let stopTimer: NodeJS.Timeout | undefined
    const child = spawn(
      process.execPath,
      [...nodeOptions, cliPath, 'build', '--api-only'],
      { cwd: repoRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const stopCompletedBuild = (): void => {
      if (stopScheduled || !child.pid) {
        return
      }
      stopScheduled = true
      // The Cloudflare adapter leaves worker handles alive after its success log.
      // The artifacts below are still required before accepting this build.
      stopTimer = setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            child.kill('SIGTERM')
          } else if (child.pid) {
            process.kill(-child.pid, 'SIGTERM')
          }
        } catch {
          // The process may have exited between scheduling and signalling.
        }
      }, 100)
    }

    const captureOutput = (chunk: Buffer, output: NodeJS.WriteStream): void => {
      output.write(chunk)
      appendLog(outputDir, chunk)
      if (chunk.toString().includes('[build] Complete!')) {
        buildComplete = true
        stopCompletedBuild()
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      captureOutput(chunk, process.stdout)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      captureOutput(chunk, process.stderr)
    })
    child.once('error', (error) => {
      if (!buildComplete) {
        reject(error)
      }
    })
    child.once('close', (code) => {
      if (stopTimer) {
        clearTimeout(stopTimer)
      }
      if (code === 0 || buildComplete) {
        resolve()
      } else {
        reject(new Error(`audit: ${label} build --api-only failed (exit ${code})`))
      }
    })
  })
}

async function runCleanApiOnlyBuild(
  label: string,
  outputDir: string,
): Promise<void> {
  appendLog(outputDir, `audit: ${label} clean build --api-only\n`)
  rmSync(join(repoRoot, 'dist'), { recursive: true, force: true })
  rmSync(join(repoRoot, '.astro'), { recursive: true, force: true })

  appendLog(outputDir, `audit: ${label} build CLI\n`)
  execFileSync('npm', ['run', 'build:cli'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await runCliBuild(label, outputDir)

  for (const indexPath of [
    join(repoRoot, 'dist/docs/apiIndex.json'),
    join(repoRoot, 'dist/apiIndex.json'),
  ]) {
    if (!existsSync(indexPath)) {
      throw new Error(`audit: missing ${indexPath} after ${label}`)
    }
  }
}

/** Runs two independent, clean local builds and publishes the shared audit contract. */
export async function runPairedApiIndexBuild(
  outputDir = auditPaths.outputDir,
): Promise<void> {
  prepareOutputDir(outputDir)

  await runCleanApiOnlyBuild('run A', outputDir)
  cpSync(
    join(repoRoot, 'dist/docs/apiIndex.json'),
    join(outputDir, 'apiIndex.pairA.docs.json'),
  )

  await runCleanApiOnlyBuild('run B', outputDir)
  cpSync(
    join(repoRoot, 'dist/docs/apiIndex.json'),
    join(outputDir, 'apiIndex.pairB.docs.json'),
  )
  cpSync(
    join(repoRoot, 'dist/docs/apiIndex.json'),
    join(outputDir, 'apiIndex.docs.json'),
  )
  cpSync(
    join(repoRoot, 'dist/apiIndex.json'),
    join(outputDir, 'apiIndex.dist-root.json'),
  )

  const runId = `audit-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${process.pid}`
  writeFileSync(
    join(outputDir, 'audit-meta.json'),
    `${JSON.stringify({ tier: 'audit', gitSha: gitHead() }, null, 2)}\n`,
  )
  writeFileSync(
    join(outputDir, 'audit-run.json'),
    `${JSON.stringify({ runId, tier: 'audit' }, null, 2)}\n`,
  )
  appendLog(outputDir, `audit: published artifacts for ${runId}\n`)
}
