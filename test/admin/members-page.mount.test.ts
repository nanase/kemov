import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils';

import type { Member } from '@/admin/lib/members';
import { clearDraft } from '@/admin/lib/members-draft';
import MembersPage from '@/admin/pages/MembersPage.vue';

import { mountPage } from './mount-page';

/**
 * MembersPage.vue while a request is under way (#292, #296): nothing changes
 * what the edit panel shows or starts another request until it is answered,
 * and everything does again once it is.
 *
 * A button is stopped twice: it is disabled, and its handler returns. A
 * disabled button gets no click, here as in a browser, so each test that
 * presses one checks that it is disabled and then presses it with the
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

/** What is typed over the first member's 名前 before a request starts. */
const TYPED = `${FIRST.name}（直した）`;

/** Every request the page made, as `METHOD /path` under /admin/api. */
let requests: string[];
/** The request the server holds unanswered until `answerHeld`. */
let held: string;
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

const fakeFetch = vi.fn<typeof fetch>(async (input, init) => {
  const request = `${init?.method ?? 'GET'} ${String(input).replace(/^\/admin\/api/, '')}`;

  requests.push(request);

  if (request === held) await new Promise<void>((resolve) => (release = resolve));

  const { status, body } = answerFor(request);

  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
});

/** Says yes to 変更を破棄しますか, so that a test can see whether it was asked. */
const fakeConfirm = vi.fn(() => true);

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

/** Answers the request the server holds, and what the page asks after it. The same request is not held again. */
async function answerHeld(): Promise<void> {
  held = '';
  release();
  await flushPromises();
}

/** Moves a row, so that 元に戻す and the list's 保存 are on the toolbar. */
async function moveARow(): Promise<void> {
  await wrapper.get(`button[aria-label="${SECOND.name}を下へ移動"]`).trigger('click');
}

/**
 * Adds a member, types over the first one, and has the list's 保存 refused
 * about the added member: the banner with 該当の行を表示 is left over the list,
 * as moving to the added member would lose what is typed.
 */
async function leaveRowErrorBanner(): Promise<void> {
  await button('.toolbar', '＋ メンバーを追加').trigger('click');
  await wrapper.get('#f-cid').setValue(ADDED.channelId);
  await flushPromises();
  await wrapper.get('#f-name').setValue(ADDED.name);
  await wrapper.get('.inspector-foot button.primary').trigger('click');
  await row(FIRST.name).trigger('click');
  await wrapper.get('#f-name').setValue(TYPED);

  listSaveAnswer = { status: 400, body: { error: '誤りがあります', channelId: ADDED.channelId } };
  await button('.toolbar', '保存').trigger('click');
  await flushPromises();
}

/** The requests that make `busy`, each with what presses it for the first member. */
const BUSY = [
  {
    name: 'a row’s 保存',
    request: `PUT /members/${FIRST.channelId}`,
    press: () => wrapper.get('.inspector-foot button.primary').trigger('click'),
  },
  {
    name: 'a 削除',
    request: `DELETE /members/${FIRST.channelId}`,
    press: async () => {
      await button('.inspector-foot', '削除').trigger('click');
      await button('.inspector-foot', '削除を確定').trigger('click');
    },
  },
  {
    name: 'the list’s 保存',
    request: 'PUT /members',
    press: () => button('.toolbar', '保存').trigger('click'),
  },
];

type Busy = (typeof BUSY)[number];

/**
 * Starts `busy`'s request, which the server holds, with a row moved and the
 * first member's 名前 typed over: an unsaved list, and typing that 変更を破棄
 * would be asked about.
 */
async function start(busy: Busy): Promise<void> {
  await moveARow();
  await wrapper.get('#f-name').setValue(TYPED);
  held = busy.request;
  await busy.press();
  await flushPromises();

  expect(requests.at(-1)).toBe(busy.request);
}

/** Nothing has moved: the first member is shown as typed, the list is unsaved, nobody was asked to discard. */
function expectUnmoved(): void {
  expect(shown()).toEqual({ row: expect.stringContaining(FIRST.name), field: TYPED });
  expect(wrapper.get('.toolbar').text()).toContain('未保存');
  expect(fakeConfirm).not.toHaveBeenCalled();
}

beforeEach(async () => {
  requests = [];
  held = '';
  release = () => {
    throw new Error('no request is held');
  };
  listSaveAnswer = { status: 200, body: {} };
  vi.stubGlobal('fetch', fakeFetch);
  vi.stubGlobal('confirm', fakeConfirm);

  wrapper = await mountPage(MembersPage);
  await flushPromises();
});

afterEach(() => {
  wrapper.unmount();
  // Module state, which outlives the page: the next test starts with no unsaved list.
  clearDraft();
  vi.unstubAllGlobals();
  fakeFetch.mockClear();
  fakeConfirm.mockClear();
});

describe.each(BUSY)('MembersPage.vue while $name is under way', (busy) => {
  test('the edit panel cannot be typed in, and can be again once it is answered', async () => {
    await start(busy);

    expect(wrapper.get('.inspector').attributes('inert')).toBeDefined();

    await answerHeld();

    expect(wrapper.get('.inspector').attributes('inert')).toBeUndefined();
  });

  test.each([
    ['a click', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('click')],
    ['Enter', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('keydown', { key: 'Enter' })],
    ['Space', (tr: DOMWrapper<HTMLTableRowElement>) => tr.trigger('keydown', { key: ' ' })],
  ])('%s on another row keeps the first member, and chooses the row once it is answered', async (_, press) => {
    await start(busy);
    await press(row(SECOND.name));

    expectUnmoved();
    expect(requests).toEqual(['GET /members', busy.request]);

    await answerHeld();
    await press(row(SECOND.name));

    expect(shown()).toEqual({ row: expect.stringContaining(SECOND.name), field: SECOND.name });
  });

  // What each button does, told apart from its doing nothing.
  test.each([
    ['再読み込み', () => expect(requests.filter((r) => r === 'GET /members')).toHaveLength(3)],
    ['元に戻す', () => expect(wrapper.get('.toolbar').text()).not.toContain('未保存')],
    ['保存', () => expect(requests.slice(-2)).toEqual(['PUT /members', 'GET /members'])],
    ['＋ メンバーを追加', () => expect(wrapper.get('.inspector h3').text()).toBe('新しいメンバー')],
  ])('the toolbar’s %s is refused, and does what it does once it is answered', async (label, expectItRan) => {
    await start(busy);

    expect(button('.toolbar', label).element.disabled).toBe(true);

    await pressPastDisabled(button('.toolbar', label));

    expectUnmoved();
    expect(requests).toEqual(['GET /members', busy.request]);

    await answerHeld();
    // The list's 保存 has kept the moved row by then; one more move brings 元に戻す and 保存 back.
    await moveARow();
    await button('.toolbar', label).trigger('click');
    await flushPromises();

    expectItRan();
  });
});

// The list's 保存 is left out: it clears the banner as it starts.
describe.each(BUSY.slice(0, 2))('MembersPage.vue while $name is under way over the 該当の行を表示 banner', (busy) => {
  test('該当の行を表示 is refused, and shows the added member once it is answered', async () => {
    await leaveRowErrorBanner();
    await start(busy);

    const before = [...requests];

    expect(button('.panel', '該当の行を表示').element.disabled).toBe(true);

    await pressPastDisabled(button('.panel', '該当の行を表示'));

    expect(shown()).toEqual({ row: expect.stringContaining(FIRST.name), field: TYPED });
    expect(fakeConfirm).not.toHaveBeenCalled();
    expect(requests).toEqual(before);

    await answerHeld();
    await button('.panel', '該当の行を表示').trigger('click');
    await flushPromises();

    expect(shown()).toEqual({ row: expect.stringContaining(ADDED.name), field: ADDED.name });
    expect(wrapper.text()).not.toContain('該当の行を表示');
  });
});

describe('MembersPage.vue while the list is being read', () => {
  test('再読み込み is refused and the edit panel cannot be typed in, until the list is read', async () => {
    held = 'GET /members';
    await button('.toolbar', '再読み込み').trigger('click');
    await flushPromises();

    expect(wrapper.get('.inspector').attributes('inert')).toBeDefined();
    expect(button('.toolbar', '再読み込み').element.disabled).toBe(true);

    await pressPastDisabled(button('.toolbar', '再読み込み'));

    expect(requests).toEqual(['GET /members', 'GET /members']);

    await answerHeld();

    expect(wrapper.get('.inspector').attributes('inert')).toBeUndefined();
    expect(button('.toolbar', '再読み込み').element.disabled).toBe(false);
  });
});
