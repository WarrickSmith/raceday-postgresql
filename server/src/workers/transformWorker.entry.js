import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'
const compiledModule = new URL('./transformWorker.js', import.meta.url)
const sourceModule = new URL('./transformWorker.ts', import.meta.url)

const targetUrl = await (async () => {
  try {
    await access(fileURLToPath(compiledModule), fsConstants.F_OK)
    return compiledModule
  } catch {
    return null
  }
})()

if (targetUrl != null) {
  await import(targetUrl.href)
} else {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'transformWorker.js missing in production. Run the build step to generate compiled workers.'
    )
  }

  let register
  try {
    ;({ register } = await import('tsx/esm/api'))
  } catch (error) {
    const help =
      error instanceof Error
        ? error.message
        : 'Unable to load tsx runtime. Ensure dev dependencies are installed.'
    throw new Error(
      `Cannot execute TypeScript worker without "tsx" runtime. ${help}`
    )
  }

  await register()
  await import(sourceModule.href)
}
