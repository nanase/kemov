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

/**
 * Whether a handler's source refuses to run while `busy`. The refusal is its first statement - only
 * `const` copies of a value (`const error = rowError.value;`) may come before it - and is
 * `if (...) return;` over a plain chain of `||`, one term of which is `busy.value` itself. A comparison
 * (`busy.value === false`) or a negation makes that term something else, and an `&&` or a `?` could
 * put the chain under another condition. No term before it has a bracket, so nothing (a confirm
 * dialog, say) runs first and no group (`!(...)`) can wrap `busy.value`.
 */
function refusesWhileBusy(handler: string): boolean {
  const statements = handler
    .slice(handler.indexOf('{') + 1)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'));
  const first = statements.findIndex((line) => !/^const \w+ = \w+(?:\.\w+)*;$/.test(line));
  const guard = statements[first]?.match(/^if \((.*)\) return;$/);

  if (!guard || /&&|\?/.test(guard[1]!)) return false;

  const terms = guard[1]!.split(' || ');
  const at = terms.indexOf('busy.value');

  return at > -1 && terms.slice(0, at).every((term) => !term.includes('('));
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

      expect(refusesWhileBusy(body)).toBe(true);
    },
  );

  test.each([
    ['a reversed guard', 'function f(): void {\n  if (!busy.value) return;\n}'],
    ['a guard compared the wrong way', 'function f(): void {\n  if (busy.value === false) return;\n}'],
    ['a guard that also needs something else', 'function f(): void {\n  if (busy.value && open.value) return;\n}'],
    ['a guard after a change', 'function f(): void {\n  selectedId.value = id;\n  if (busy.value) return;\n}'],
    ['a guard after a dialog', 'function f(): void {\n  if (!confirmDiscard() || busy.value) return;\n}'],
    ['a guard that does not return', 'function f(): void {\n  if (busy.value) {\n    log();\n  }\n}'],
    [
      'a guard after a change made in a const',
      'function f(): void {\n  const id = (selectedId.value = channelId);\n  if (busy.value) return;\n}',
    ],
    ['a guard under a ?', 'function f(): void {\n  if (allow ? false || busy.value || false : false) return;\n}'],
    [
      'a guard under a negated group',
      'function f(): void {\n  if (!(open.value || busy.value || ready.value)) return;\n}',
    ],
  ])('%s does not count as refusing while busy', (_, handler) => {
    expect(refusesWhileBusy(handler)).toBe(false);
  });

  test.each(['discard', 'saveList', 'addMember', 'openErrorRow'])(
    'the button for %s is disabled while a request is under way',
    (name) => {
      expect(page).toMatch(new RegExp(`:disabled="busy" @click="${name}"`));
    },
  );

  test('再読み込み is disabled while a request is under way', () => {
    expect(page).toContain(':disabled="loading || busy" @click="confirmDiscard() && load()"');
  });

  // 「新しいメンバー」 is open with no row chosen (`selectedId` null): neither a read of the
  // list nor 元に戻す may choose the first row behind the form.
  test('a row is not chosen behind the open new-member form', () => {
    expect(page).toContain('if (selectedId.value === null && newForm.value === null && rows.value.length > 0) {');
    expect(page).toContain('if (newForm.value === null && selectedAdded.value === null && selected.value === null) {');
  });
});
