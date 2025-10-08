#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const runs = Number(process.env.VITEST_STABILITY_RUNS ?? '2')

if (!Number.isFinite(runs) || runs < 1) {
  console.error(
    `[vitest stability] Invalid VITEST_STABILITY_RUNS value (${process.env.VITEST_STABILITY_RUNS}); expected positive integer.`,
  )
  process.exit(1)
}

for (let attempt = 1; attempt <= runs; attempt += 1) {
  console.log(`[vitest stability] Starting run ${attempt}/${runs}`)

  const result = spawnSync(
    'npx',
    [
      '--yes',
      'vitest',
      'run',
      'tests/unit',
      '--reporter=verbose',
      '--no-color',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        VITEST_SEGFAULT_RETRY: '0', // Ensure worker crashes surface immediately
      },
    },
  )

  if (result.status !== 0) {
    console.error(`[vitest stability] Run ${attempt} failed with exit code ${result.status ?? 'null'}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`[vitest stability] All ${runs} runs passed successfully`)
