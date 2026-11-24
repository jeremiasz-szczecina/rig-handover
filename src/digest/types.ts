// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of runs/<night>.jsonl. */
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  /** Owner on the job's last line. `null` is kept; views show it as `—`. */
  owner: string | null;
  /** Number of lines for this job, any status. */
  runs: number;
  /** Number of lines for this job with status `retry`. */
  retries: number;
  lastStatus: RunStatus;
  /** `error` of the job's last line, or `null` when it has none. */
  lastError: string | null;
  /** `at` of the job's first and last line, as written in the log. */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  /** YYYY-MM-DD */
  night: string;
  /** Sorted by job (plain string order). Empty for an empty file. */
  rows: DigestRow[];
  /** Lines that did not parse or did not match RunLine. Counted, never thrown. */
  badLines: number;
  /** Parsed lines per status (the board shows these beside each night). */
  counts: Record<RunStatus, number>;
};

/**
 * Reads runs/<night>.jsonl from `runsDir`.
 * Returns `null` when the file does not exist or `night` is not a YYYY-MM-DD date
 * (routes answer 404). Never throws on bad lines. Never writes to `runsDir`.
 */
// Implemented in src/digest/reader.ts (issue #2) as `export const readNight: ReadNight`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
