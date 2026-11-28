import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils';

import type { Member } from '@/admin/lib/members';
import { clearDraft } from '@/admin/lib/members-draft';
import MembersPage from '@/admin/pages/MembersPage.vue';

import { mountPage } from './mount-page';

/**
 * MembersPage.vue while a row's 保存 is under way (#292, #296): nothing changes
 * what the edit panel shows or starts another request until it is answered,
 * and everything does again once it is.
 *
 * A button is stopped twice: it is disabled, and its handler returns while
 * `busy`. A disabled button gets no click, here as in a browser, so each test
 * that presses one checks that it is disabled and then presses it with the
 * attribute taken off, for the handler's own refusal to be what is seen.
 */

function member(channelId: string, name: string, displayOrder: number): Member {
  return {
    channelId,
    name,
    fullname: name,
    globalname: null,
    twitter: null,
    twitch: null,
    colorKey: '#111111',
    colorSub: '#222222',
    colorLight: '#333333',
    colorBack: '#444444',
    activityStartDate: '2020-01-01',
    activityEndDate: null,
    customUrl: null,
    thumbnailUrl: null,
    fetchedAt: null,
    displayOrder,
  };
}

const FIRST = member('UCaaaaaaaaaaaaaaaaaaaaaa', 'いちばん', 0);
const SECOND = member('UCbbbbbbbbbbbbbbbbbbbbbb', 'にばん', 1);
const THIRD = member('UCcccccccccccccccccccccc', 'さんばん', 2);

/** Not on the server: added on the screen, and refused by the list's 保存 in the test that needs that. */
const ADDED = { channelId: 'UCdddddddddddddddddddddd', name: 'ついか' };

/** The request the server holds unanswered until `release`, as `METHOD /path`. */
const HELD = `PUT /members/${FIRST.channelId}`;

/** Every request the page made, as `METHOD /path` under /admin/api. */
let requests: string[];
let release: () => void;
/** What the list's 保存 is answered with. */
let listSaveAnswer: { status: number; body: unknown };
let wrapper: VueWrapper;

function answerFor(request: string): { status: number; body: unknown } {
  if (request === 'GET /members') return { status: 200, body: { members: [FIRST, SECOND, THIRD] } };
  if (request === 'PUT /members') return listSaveAnswer;
  if (request.startsWith('GET /channel-lookup/')) {
    return { status: 200, body: { channelId: ADDED.channelId, title: ADDED.name, iconDataUrl: null } };
  }

  return { status: 200, body: {} };
}

beforeEach(async () => {
  requests = [];
  release = () => {
    throw new Error(`${HELD} was never asked`);
  };
  listSaveAnswer = { status: 200, body: {} };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = `${init?.method ?? 'GET'} ${String(input).replace(/^\/admin\/api/, '')}`;

      requests.push(request);

      if (request === HELD) await new Promise<void>((resolve) => (release = resolve));

      const { status, body } = answerFor(request);

      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );

  wrapper = await mountPage(MembersPage);
  await flushPromises();
});

afterEach(() => {
  wrapper.unmount();
  // Module state, which outlives the page: the next test starts with no unsaved list.
  clearDraft();
  vi.unstubAllGlobals();
});

function row(name: string): DOMWrapper<HTMLTableRowElement> {
  const found = wrapper.findAll<HTMLTableRowElement>('tbody tr').find((tr) => tr.text().includes(name));

  if (found === undefined) throw new Error(`no row for ${name}`);

  return found;
}

/** The member the edit panel shows: the row marked chosen, and the panel's own 名前. */
function shown(): { row: string; field: string } {
  return {
    row: wrapper.get('tbody tr[aria-selected="true"]').text(),
    field: wrapper.get<HTMLInputElement>('#f-name').element.value,
  };
}

function button(within: string, label: string): DOMWrapper<HTMLButtonElement> {
  const found = wrapper.findAll<HTMLButtonElement>(`${within} button`).find((b) => b.text() === label);

  if (found === undefined) throw new Error(`no button ${label} in ${within}`);

  return found;
}

/** Presses `target` with its `disabled` taken off: what its handler does when a click does reach it. */
async function pressPastDisabled(target: DOMWrapper<HTMLButtonElement>): Promise<void> {
  target.element.disabled = false;
  await target.trigger('click');
  await flushPromises();
}

/** Presses the first member's own 保存, which the server holds. */
async function startRowSave(): Promise<void> {
  await wrapper.get('.inspector-foot button.primary').trigger('click');
  await flushPromises();

  expect(requests.at(-1)).toBe(HELD);
}

async function answerRowSave(): Promise<void> {
  release();
  await flushPromises();
}

/** Moves a row, so that 元に戻す and the list's 保存 are on the toolbar. */
async function moveARow(): Promise<void> {
  await wrapper.get(`button[aria-label="${SECOND.name}を下へ移動"]`).trigger('click');
}

describe('MembersPage.vue while a row is being saved', () => {
  test('the edit panel cannot be typed in, and can be again once the save is answered', async () => {
    await startRowSave();

    expect(wrapper.get('.inspector').attributes('inert')).toBeDefined();

    await answerRowSave();

    expect(wrapper.get('.inspector').attributes('inert')).toBeUndefined();
  });

  test.each([
    ['a click', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('click')],
    ['Enter', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('keydown', { key: 'Enter' })],
    ['Space', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('keydown', { key: ' ' })],
  ])('%s on another row keeps the member being saved, and chooses the row once it is saved', async (_, press) => {
    await startRowSave();
    await press(row(SECOND.name));

    expect(shown()).toEqual({ row: expect.stringContaining(FIRST.name), field: FIRST.name });
    expect(requests).toEqual(['GET /members', HELD]);

    await answerRowSave();
    await press(row(SECOND.name));

    expect(shown()).toEqual({ row: expect.stringContaining(SECOND.name), field: SECOND.name });
  });

  // What each button does, told apart from its doing nothing.
  test.each([
    ['再読み込み', () => expect(requests.filter((r) => r === 'GET /members')).toHaveLength(3)],
    ['元に戻す', () => expect(wrapper.get('.toolbar').text()).not.toContain('未保存')],
    ['保存', () => expect(requests).toContain('PUT /members')],
    ['＋ メンバーを追加', () => expect(wrapper.get('.inspector h3').text()).toBe('新しいメンバー')],
  ])('the toolbar’s %s is refused, and does what it does once the save is answered', async (label, done) => {
    await moveARow();
    await startRowSave();

    expect(button('.toolbar', label).element.disabled).toBe(true);

    await pressPastDisabled(button('.toolbar', label));

    expect(shown()).toEqual({ row: expect.stringContaining(FIRST.name), field: FIRST.name });
    expect(wrapper.get('.toolbar').text()).toContain('未保存');
    expect(requests).toEqual(['GET /members', HELD]);

    await answerRowSave();
    await button('.toolbar', label).trigger('click');
    await flushPromises();

    done();
  });

  // The banner a list save's 400 leaves over the list when moving to the member would lose what is typed.
  test('該当の行を表示 is refused, and shows the added member once the save is answered', async () => {
    // What is typed over the first member is still there when the banner's button moves away from it.
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    await button('.toolbar', '＋ メンバーを追加').trigger('click');
    await wrapper.get('#f-cid').setValue(ADDED.channelId);
    await flushPromises();
    await wrapper.get('#f-name').setValue(ADDED.name);
    await wrapper.get('.inspector-foot button.primary').trigger('click');
    await row(FIRST.name).trigger('click');
    await wrapper.get('#f-name').setValue(`${FIRST.name}（直した）`);

    listSaveAnswer = { status: 400, body: { error: '誤りがあります', channelId: ADDED.channelId } };
    await button('.toolbar', '保存').trigger('click');
    await flushPromises();

    await startRowSave();

    const before = [...requests];

    expect(button('.panel', '該当の行を表示').element.disabled).toBe(true);

    await pressPastDisabled(button('.panel', '該当の行を表示'));

    expect(shown()).toEqual({ row: expect.stringContaining(FIRST.name), field: `${FIRST.name}（直した）` });
    expect(wrapper.text()).toContain('該当の行を表示');
    expect(requests).toEqual(before);

    await answerRowSave();
    await button('.panel', '該当の行を表示').trigger('click');
    await flushPromises();

    expect(shown()).toEqual({ row: expect.stringContaining(ADDED.name), field: ADDED.name });
    expect(wrapper.text()).not.toContain('該当の行を表示');
  });
});
