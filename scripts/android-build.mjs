import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { javaEnvironment } from './java-env.mjs'
const env = javaEnvironment()
if (!env.ANDROID_HOME && existsSync('.tools/android-sdk'))
  env.ANDROID_HOME = path.resolve('.tools/android-sdk')
const tasks = process.argv.slice(2)
if (!tasks.length) tasks.push('testDebugUnitTest', 'assembleDebug')
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', tasks, {
  cwd: 'android',
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
