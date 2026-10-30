import type { Config } from 'jest'

import base from './jest.config'

/** Local paired build audit — not part of default `npm test`. */
const config: Config = {
  ...base,
  roots: ['<rootDir>/tests/audit'],
  testEnvironment: 'node',
  globalSetup: '<rootDir>/tests/audit/globalSetup.ts',
}

export default config
