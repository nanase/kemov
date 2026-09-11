import {
  BACKUP_STALE_GRACE_DAYS,
  CHAT_REPLAY_ACTIVITY_STALE_MINUTES,
  isBackupStale,
  isTimestampStale,
  JOB_SUCCESS_STALE_MINUTES,
} from '../src/lib/health-thresholds';

/**
 * The pure rules /api/health grades everything against, per #110. health.ts
 * tests that these are wired to the right field for each job and table; this
 * is where the boundary itself is pinned down.
 */

describe('isTimestampStale', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  test('is not stale a minute under the threshold', () => {
    const at = new Date(now.getTime() - (JOB_SUCCESS_STALE_MINUTES - 1) * 60_000).toISOString();

    expect(isTimestampStale(at, JOB_SUCCESS_STALE_MINUTES, now)).toBe(false);
  });

  test('is stale a minute over the threshold', () => {
    const at = new Date(now.getTime() - (JOB_SUCCESS_STALE_MINUTES + 1) * 60_000).toISOString();

    expect(isTimestampStale(at, JOB_SUCCESS_STALE_MINUTES, now)).toBe(true);
  });

  test('is stale exactly at the threshold', () => {
    const at = new Date(now.getTime() - JOB_SUCCESS_STALE_MINUTES * 60_000).toISOString();

    expect(isTimestampStale(at, JOB_SUCCESS_STALE_MINUTES, now)).toBe(true);
  });

  // Null is "never", which a job that has crossed the threshold and one that
  // has simply never run must not be told apart from - both mean nobody
  // should trust this job right now.
  test('is stale when there is no timestamp at all', () => {
    expect(isTimestampStale(null, JOB_SUCCESS_STALE_MINUTES, now)).toBe(true);
  });
});

describe('isBackupStale', () => {
  test('is not stale within its own table baseline plus the grace', () => {
    expect(isBackupStale('video', 0)).toBe(false);
    expect(isBackupStale('video', 0 + BACKUP_STALE_GRACE_DAYS - 1)).toBe(false);
  });

  test('is stale once it reaches baseline plus the grace', () => {
    expect(isBackupStale('video', 0 + BACKUP_STALE_GRACE_DAYS)).toBe(true);
  });

  // channel_snapshot's normal reading is 1, not 0, because it names
  // yesterday's file even on a healthy night. A shared threshold would fire
  // on it one night after a healthy backup.
  test('grades channel_snapshot against its own baseline of 1, not 0', () => {
    expect(isBackupStale('channel_snapshot', 1 + BACKUP_STALE_GRACE_DAYS - 1)).toBe(false);
    expect(isBackupStale('channel_snapshot', 1 + BACKUP_STALE_GRACE_DAYS)).toBe(true);
  });

  test('is stale when there is no file at all', () => {
    expect(isBackupStale('video', null)).toBe(true);
  });

  test('grades a table it does not recognise against the stricter baseline of 0', () => {
    expect(isBackupStale('unknown-table', BACKUP_STALE_GRACE_DAYS - 1)).toBe(false);
    expect(isBackupStale('unknown-table', BACKUP_STALE_GRACE_DAYS)).toBe(true);
  });
});

test('CHAT_REPLAY_ACTIVITY_STALE_MINUTES is shorter than the ten-minute jobs read, matching its one-minute cron', () => {
  expect(CHAT_REPLAY_ACTIVITY_STALE_MINUTES).toBeLessThan(JOB_SUCCESS_STALE_MINUTES);
});
