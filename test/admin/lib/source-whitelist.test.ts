import { AdminApiError } from '@/admin/lib/api';
import { SIDEBAR_GROUPS, pageTitle } from '@/admin/lib/sidebar';
import { addedOn, addErrorMessage, entryPath, noteChanged, noteFromInput } from '@/admin/lib/source-whitelist';

const ENTRY = {
  prefix: 'https://prtimes.jp/',
  note: '運営会社・提携先の発表',
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
};

describe('entryPath', () => {
  // A prefix is a URL: left as it is, its slashes would read as more path segments.
  test('percent-encodes the prefix into one path segment', () => {
    expect(entryPath('https://x.com/KEMOVP_staff')).toEqual('/source-whitelist/https%3A%2F%2Fx.com%2FKEMOVP_staff');
  });
});

describe('addedOn', () => {
  test('gives the Japan-time day, with no time of day', () => {
    expect(addedOn('2026-09-15T00:00:00Z')).toEqual('2026-09-15');
  });

  // 15:00 UTC is already the next day in Japan.
  test('follows the Japan-time calendar, not UTC', () => {
    expect(addedOn('2026-09-15T15:00:00Z')).toEqual('2026-09-16');
  });
});

describe('noteFromInput', () => {
  test('trims the text', () => {
    expect(noteFromInput('  提携先  ')).toEqual('提携先');
  });

  test('saves an empty or blank input as no note', () => {
    expect(noteFromInput('')).toBeNull();
    expect(noteFromInput('   ')).toBeNull();
  });
});

describe('noteChanged', () => {
  test('is false for the note as saved', () => {
    expect(noteChanged(ENTRY, '運営会社・提携先の発表')).toEqual(false);
  });

  test('is false for the same note with spaces around it', () => {
    expect(noteChanged(ENTRY, ' 運営会社・提携先の発表 ')).toEqual(false);
  });

  test('is true once the text differs', () => {
    expect(noteChanged(ENTRY, '別のメモ')).toEqual(true);
  });

  test('treats an empty input as no note, for a row that has none', () => {
    expect(noteChanged({ ...ENTRY, note: null }, '')).toEqual(false);
    expect(noteChanged({ ...ENTRY, note: null }, 'メモ')).toEqual(true);
    expect(noteChanged(ENTRY, '')).toEqual(true);
  });
});

describe('addErrorMessage', () => {
  test('words a prefix already on the list in Japanese', () => {
    expect(addErrorMessage(new AdminApiError(409, { error: 'https://x.com/ is already on the list' }))).toEqual(
      'この URL はすでに一覧にあります。',
    );
  });

  test("shows the worker's own message for any other failure", () => {
    expect(addErrorMessage(new AdminApiError(400, { error: 'prefix must start with https://' }))).toEqual(
      'prefix must start with https://',
    );
  });

  test('shows a failure that is not an API answer as text', () => {
    expect(addErrorMessage(new TypeError('offline'))).toEqual('TypeError: offline');
  });
});

describe('the sidebar', () => {
  test('lists 出典ホワイトリスト under 運用, after 版の履歴', () => {
    const group = SIDEBAR_GROUPS.find((g) => g.label === '運用');

    expect(group?.items.map((item) => item.page)).toEqual(['publish', 'history', 'source-whitelist']);
    expect(pageTitle('source-whitelist')).toEqual('出典ホワイトリスト');
  });
});
