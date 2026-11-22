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
    expect(page).toContain('class="inspector" :inert="loading || listSaving || saving || undefined"');
  });

  test('a row cannot be chosen while a row or the list is being saved or deleted', () => {
    expect(page).toMatch(
      /function selectRow\([^)]*\): void \{\s*(\/\/[^\n]*\n\s*)*if \(listSaving\.value \|\| saving\.value\) return;/,
    );
  });

  test('a new member cannot be started while a row or the list is being saved or deleted', () => {
    expect(page).toContain(':disabled="listSaving || saving" @click="addMember"');
  });
});
