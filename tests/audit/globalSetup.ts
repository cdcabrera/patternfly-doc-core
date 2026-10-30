import { auditArtifactsReady, auditPaths } from './utils/paths'
import { runPairedApiIndexBuild } from './utils/runPairedApiIndexBuild'

export default async function globalSetup(): Promise<void> {
  if (process.env.AUDIT_SKIP_BUILD === '1') {
    if (!auditArtifactsReady()) {
      throw new Error(
        `AUDIT_SKIP_BUILD=1 but audit artifacts are incomplete under ${auditPaths.outputDir}. ` +
          'Run npm run test:audit without AUDIT_SKIP_BUILD first.',
      )
    }
    return
  }

  await runPairedApiIndexBuild()
}
