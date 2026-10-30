import { join, resolve } from 'path'
import { getConfig } from '../../cli/getConfig'

export async function getOutputDir(): Promise<string> {
  const configPath = join(process.cwd(), 'pf-docs.config.mjs')
  const config = await getConfig(configPath)
  if (!config) {
    throw new Error(
      'No config found, please run the `setup` command or manually create a pf-docs.config.mjs file',
    )
  }

  if (!config.outputDir) {
    throw new Error(
      'No outputDir found in config file, an output directory must be defined in your config file e.g. "dist"',
    )
  }

  return resolve(process.cwd(), config.outputDir)
}
