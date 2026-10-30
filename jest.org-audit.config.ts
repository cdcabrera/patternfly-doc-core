import type { Config } from 'jest'

import base from './jest.config'

/** Org container audit only — not part of default `npm test`. */
const config: Config = {
  ...base,
  roots: ['<rootDir>/tests/container'],
  testEnvironment: 'node',
}

export default config
