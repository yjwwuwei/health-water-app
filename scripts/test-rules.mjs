import { spawnSync } from 'node:child_process'
import { javaEnvironment } from './java-env.mjs'
const result = spawnSync(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'demo-health-water',
    'vitest run --config vitest.rules.config.ts',
  ],
  { stdio: 'inherit', env: javaEnvironment() },
)
process.exit(result.status ?? 1)
