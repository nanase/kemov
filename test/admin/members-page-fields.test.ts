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
 * Read from disk: what is counted is where the source writes, which no click
 * shows.
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

  // 「新しいメンバー」 is open with no row chosen (`selectedId` null): neither a read of the
  // list nor 元に戻す may choose the first row behind the form.
  test('a row is not chosen behind the open new-member form', () => {
    expect(page).toContain('if (selectedId.value === null && newForm.value === null && rows.value.length > 0) {');
    expect(page).toContain('if (newForm.value === null && selectedAdded.value === null && selected.value === null) {');
  });
});
