# Benchmark Tool Usage

Story 2.10D introduces a standalone benchmarking harness for the race processing pipeline. The tool runs the real `processRaces` implementation, captures timing breakdowns, and enforces the non-functional targets defined in the PRD and architecture specification.

## Prerequisites

- PostgreSQL test database configured and reachable via standard `.env` variables
- Valid NZTAB API credentials so the pipeline can fetch race data
- Representative race IDs to benchmark (recorded fixtures or live IDs)

## CLI Invocation

Run the tool through the new npm script:

```bash
npm run benchmark -- --race RACE123 --race RACE456 --iterations 5 --concurrency 5 --scenario smoke
```

Key flags:

- `--race <id>` / `--races <id1,id2>` – specify one or more race IDs (repeat flag as needed)
- `--race-file <path>` – JSON array of race IDs (merged with command-line values)
- `--iterations <n>` – number of full benchmark loops (default `3`)
- `--concurrency <n>` – upper bound for simultaneous race processing (default `5`)
- `--formats <json,csv>` – persisted output formats (default `json,csv`)
- `--scenario <label>` – label baked into report filenames and metadata
- Threshold overrides: `--single-target`, `--multi-target`, `--fetch-target`, `--transform-target`, `--write-target` (all in milliseconds)

Use `--help` to print the full switch reference.

## Outputs

- Reports saved to `benchmark-results/` by default using the pattern `<scenario>-<timestamp>.(json|csv)`
- JSON payload contains metadata, aggregated statistics (min/max/avg/p95/p99), individual run records, and threshold evaluation results
- CSV export lists every race/iteration combination with timing breakdowns for fetch/transform/write stages

## Pass/Fail Evaluation

The script enforces the acceptance criteria by default:

- Single race total duration must stay under **2,000 ms**
- Five-race (or larger) batches must complete under **15,000 ms**
- Stage maxima: fetch ≤ 500 ms, transform ≤ 1,000 ms, write ≤ 300 ms

The process exits with status code `1` if any threshold fails, enabling CI/CD gating and regression detection.

## Interpreting Results

- `summary.totals` – aggregate distribution of end-to-end durations across all successful runs
- `summary.fetch` / `summary.transform` / `summary.write` – stage-level timing distributions for spotting bottlenecks
- `thresholds.results` – explicit pass/fail entries that map directly to Story 2.10D acceptance criteria
- `runs[]` – raw observations suitable for long-term trend analysis or external dashboards

Use the JSON output as the source of truth for historical baselines and pipe the CSV into spreadsheet tooling or visualization suites when investigating regressions.
