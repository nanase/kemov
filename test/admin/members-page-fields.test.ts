/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * What writes the edit panel's `fields` in MembersPage.vue (#286). A response
 * must never write saved values over what is typed, and the way to keep that
 * true is to have one place a response can write them - `watch(selected)`,
 * through `fieldsOnReload`, which every read of the list reaches by replacing
 * `saved`. A second place that assigns `fields` would be a path nothing has
 * checked, so this fails until it is added here on purpose.
 *
 * Read from disk: the page cannot be mounted without the whole admin shell.
 */
const page = readFileSync(resolve(import.meta.dirname, '../../src/admin/pages/MembersPage.vue'), 'utf8');

/** Every `fields.value = ...` line of the page, trimmed. `==` and `===` are comparisons, not writes. */
function assignments(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /(^|[^.\w])fields\.value\s*=(?!=)/.test(line));
}

describe('MembersPage.vue fields', () => {
  test('are written only by a read of the list (fieldsOnReload) and by the user confirming 変更を捨てる', () => {
    expect(assignments(page)).toEqual([
      'fields.value = toFormFields(selected.value);',
      'fields.value = fieldsOnReload(fields.value, previous, member);',
    ]);
  });

  test('the write that follows a read of the list keeps what is typed, and sits in the watch on `selected`', () => {
    expect(page).toMatch(
      /watch\(selected, \(member, previous\) => \{\s*fields\.value = fieldsOnReload\(fields\.value, previous, member\);/,
    );
  });

  test('the saved list is replaced in one place, so no read of it can skip the rule', () => {
    expect([...page.matchAll(/\bsaved\.value\s*=(?!=)/g)]).toHaveLength(1);
  });

  // Whatever is asked of the server - a row's 保存, a 削除, a read of the list, the list's 保存 -
  // the panel and the choice of row are not open to the user while it is under way, so
  // the answer cannot land on a member chosen meanwhile or meet a field typed in just then.
  test('the edit panel is inert while any request is in flight', () => {
    expect(page).toContain('class="inspector" :inert="loading || busy || undefined"');
  });

  // `busy` is a row's 保存 or 削除, or the list's 保存. Whatever would start another request or change what
  // the panel shows is refused while it is on: the handler returns, and the button is disabled.
  test.each(['selectRow', 'addMember', 'openErrorRow', 'discard', 'saveList'])(
    '%s returns while a request is under way',
    (name) => {
      const start = page.search(new RegExp(`function ${name}\\(`));

      expect(start).toBeGreaterThan(-1);

      const body = page.slice(start).split(/\n(?:async )?function /)[0]!;

      expect(body).toContain('busy.value');
    },
  );

  test.each(['discard', 'saveList', 'addMember', 'openErrorRow'])(
    'the button for %s is disabled while a request is under way',
    (name) => {
      expect(page).toMatch(new RegExp(`:disabled="busy" @click="${name}"`));
    },
  );

  test('再読み込み is disabled while a request is under way', () => {
    expect(page).toContain(':disabled="loading || busy" @click="confirmDiscard() && load()"');
  });

  // 「メンバーを足す」 is open with no row chosen (`selectedId` null): neither a read of the
  // list nor 元に戻す may choose the first row behind the form.
  test('a row is not chosen behind the open new-member form', () => {
    expect(page).toContain('if (selectedId.value === null && newForm.value === null && rows.value.length > 0) {');
    expect(page).toContain('if (newForm.value === null && selectedAdded.value === null && selected.value === null) {');
  });
});
