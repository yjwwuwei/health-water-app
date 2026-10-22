import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
export function javaEnvironment() {
  const env = { ...process.env }
  if (!env.JAVA_HOME || !existsSync(path.join(env.JAVA_HOME, 'bin'))) {
    const portable = existsSync('.tools') && readdirSync('.tools').find((name) => name.startsWith('jdk-21'))
    if (portable) env.JAVA_HOME = path.resolve('.tools', portable)
  }
  if (!env.JAVA_HOME || !existsSync(path.join(env.JAVA_HOME, 'bin')))
    throw new Error('需要 JDK 21：请将 JAVA_HOME 指向实际 JDK 目录，再重新运行。')
  env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env.PATH ?? env.Path ?? '')
  return env
}
