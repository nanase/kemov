import { AdminApiError } from '@/admin/lib/api';
import { SIDEBAR_GROUPS, pageTitle } from '@/admin/lib/sidebar';
import {
  addedOn,
  addErrorMessage,
  entryPath,
  noteChanged,
  noteFromInput,
  savedToast,
} from '@/admin/lib/source-whitelist';

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
  // #291: the worker's `error` is the sentence to show, a prefix already on the list included.
  test("shows the worker's own sentence", () => {
    const error = new AdminApiError(409, {
      error: 'この URL の先頭は既に一覧に存在します',
      detail: 'https://x.com/ is already on the list',
    });

    expect(addErrorMessage(error)).toEqual('この URL の先頭は既に一覧に存在します');
  });

  test('shows a failure that is not an API answer as text', () => {
    expect(addErrorMessage(new TypeError('offline'))).toEqual('TypeError: offline');
  });
});

describe('the sidebar', () => {
  test('lists 出典ホワイトリスト under 運用, after 版の履歴', () => {
    const group = SIDEBAR_GROUPS.find((g) => g.label === '運用');

    expect(group?.items.map((item) => item.page)).toEqual(['history', 'source-whitelist']);
    expect(pageTitle('source-whitelist')).toEqual('出典ホワイトリスト');
  });
});

describe('savedToast', () => {
  test('says what was done when the timeline was brought up to date', () => {
    expect(savedToast('追加しました', true)).toEqual('追加しました');
  });

  test('says the timeline was not, when it could not be written', () => {
    expect(savedToast('削除しました', false)).toEqual('本番の年表への反映に失敗しました');
  });
});
