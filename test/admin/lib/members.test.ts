import {
  blankNewMember,
  editWouldBeLost,
  fieldForSaveError,
  fieldsAfterReload,
  isHexColor,
  keepEdit,
  memberOfListSaveError,
  moveId,
  normalizeColor,
  pickerValue,
  reconcileOrder,
  sameOrder,
  toFormFields,
  type Member,
} from '@/admin/lib/members';

const MEMBER: Member = {
  channelId: 'UCEcMIuGR8WO2TwL9XIpjKtw',
  name: 'ケープペンギン',
  fullname: 'けもV ケープペンギン',
  globalname: 'Cape Penguin',
  twitter: 'kemov_cape',
  twitch: null,
  colorKey: '#F38E0A',
  colorSub: '#F8C112',
  colorLight: '#FFE9C2',
  colorBack: '#FFF6E8',
  activityStartDate: '2021-04-26',
  activityEndDate: '2022-05-21',
  customUrl: 'https://youtube.com/@kemov_cape',
  thumbnailUrl: 'https://example.com/cape.jpg',
  fetchedAt: '2026-09-16T06:40:00Z',
  displayOrder: 1,
};

describe('toFormFields', () => {
  test('carries over every field a PUT needs, including ones the screen shows only in the edit panel', () => {
    expect(toFormFields(MEMBER)).toEqual({
      name: 'ケープペンギン',
      fullname: 'けもV ケープペンギン',
      globalname: 'Cape Penguin',
      twitter: 'kemov_cape',
      twitch: null,
      colorKey: '#F38E0A',
      colorSub: '#F8C112',
      colorLight: '#FFE9C2',
      colorBack: '#FFF6E8',
      activityStartDate: '2021-04-26',
      activityEndDate: '2022-05-21',
    });
  });

  test('leaves out channelId, displayOrder, customUrl, thumbnailUrl and fetchedAt - none of them are in EDITABLE_MEMBER_KEYS', () => {
    const fields = toFormFields(MEMBER) as unknown as Record<string, unknown>;

    expect(fields.channelId).toBeUndefined();
    expect(fields.displayOrder).toBeUndefined();
    expect(fields.customUrl).toBeUndefined();
    expect(fields.thumbnailUrl).toBeUndefined();
    expect(fields.fetchedAt).toBeUndefined();
  });
});

describe('blankNewMember', () => {
  test('has exactly the keys a new member is sent with', () => {
    expect(Object.keys(blankNewMember()).sort()).toEqual(['channelId', ...Object.keys(toFormFields(MEMBER))].sort());
  });
});

describe('moveId', () => {
  test('swaps a member with its neighbour', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  test('leaves the list as it is at either end, or for an id that is not in it', () => {
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'z', 1)).toEqual(['a', 'b', 'c']);
  });

  test('does not change the list it was given', () => {
    const order = ['a', 'b'];

    moveId(order, 'a', 1);

    expect(order).toEqual(['a', 'b']);
  });
});

describe('reconcileOrder', () => {
  test('keeps the draft order, drops what is gone and puts what is new at the end', () => {
    expect(reconcileOrder(['c', 'a', 'x'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  test('is the existing order when the draft is empty', () => {
    expect(reconcileOrder([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('sameOrder', () => {
  test('compares position by position', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['name must be a non-empty string', 'name'],
    ['fullname must be a non-empty string', 'fullname'],
    ['globalname must be a non-empty string or null', 'globalname'],
    ['twitter must be a handle without the @, or null', 'twitter'],
    ['twitch must be a Twitch login, or null', 'twitch'],
    ['colorKey must be #RRGGBB', 'colorKey'],
    ['colorSub must be #RRGGBB', 'colorSub'],
    ['colorLight must be #RRGGBB', 'colorLight'],
    ['colorBack must be #RRGGBB', 'colorBack'],
    ['activityStartDate must be YYYY-MM-DD', 'activityStartDate'],
    ['activityEndDate must be YYYY-MM-DD or null', 'activityEndDate'],
    ['activityEndDate is before activityStartDate', 'activityEndDate'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForSaveError(message)).toEqual(field);
  });

  test('answers null for a message that names none of the fields', () => {
    expect(fieldForSaveError('channelId must be a YouTube channel id')).toBeNull();
    expect(fieldForSaveError('displayOrder cannot be saved')).toBeNull();
  });
});

describe('memberOfListSaveError', () => {
  const ADDED = ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCbbbbbbbbbbbbbbbbbbbbbb'];

  test('answers the added member the body names', () => {
    expect(memberOfListSaveError({ error: 'colorKey must be #RRGGBB', channelId: ADDED[1] }, ADDED)).toEqual(ADDED[1]);
  });

  test.each([
    ['a body that names no member', { error: 'add must be a list of members' }],
    [
      'a member this screen does not hold',
      { error: 'colorKey must be #RRGGBB', channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz' },
    ],
    ['a channelId that is not a string', { error: 'x', channelId: 1 }],
    ['a body that is not an object', 'colorKey must be #RRGGBB'],
    ['no body', null],
  ])('answers null for %s', (_label, body) => {
    expect(memberOfListSaveError(body, ADDED)).toBeNull();
  });
});

describe('normalizeColor', () => {
  test.each([
    ['1a2b3c', '#1a2b3c'],
    ['1A2B3C', '#1A2B3C'],
    ['#1a2b3c', '#1a2b3c'],
  ])('%s becomes %s', (value, expected) => {
    expect(normalizeColor(value)).toEqual(expected);
  });

  test.each([
    ['five digits', '1a2b3'],
    ['seven digits', '1a2b3c4'],
    ['not hex', 'ggggg0'],
    ['empty', ''],
    ['only the #', '#'],
    ['three digits', 'abc'],
    ['a colour name', 'red'],
  ])('leaves %s as it is', (_label, value) => {
    expect(normalizeColor(value)).toEqual(value);
  });
});

describe('isHexColor', () => {
  test.each(['#1a2b3c', '#1A2B3C'])('accepts %s', (text) => {
    expect(isHexColor(text)).toBe(true);
  });

  test.each(['', '#', '1a2b3c', '#1a2b3', '#1a2b3c4', 'red'])('refuses "%s"', (text) => {
    expect(isHexColor(text)).toBe(false);
  });
});

describe('pickerValue', () => {
  test('gives the picker a colour box in lowercase', () => {
    expect(pickerValue('#1A2B3C')).toEqual('#1a2b3c');
  });

  test.each(['', '#', '1a2b3c', '#1a2b3', 'red'])('gives the default for "%s", which is not a colour yet', (text) => {
    expect(pickerValue(text)).toEqual('#000000');
  });
});

describe('editWouldBeLost', () => {
  test('is false when nothing is open', () => {
    expect(editWouldBeLost(null, null, null)).toBe(false);
  });

  test('is false for a new-member form nobody has typed in', () => {
    expect(editWouldBeLost(blankNewMember(), null, null)).toBe(false);
  });

  test.each([
    ['channelId', { channelId: 'UC' }],
    ['name', { name: 'あ' }],
    ['a colour', { colorKey: '1a2b3c' }],
    ['a nullable field', { twitter: 'kemov_x' }],
  ])('is true for a new-member form with %s typed in', (_label, typed) => {
    expect(editWouldBeLost({ ...blankNewMember(), ...typed }, null, null)).toBe(true);
  });

  test('is false for a saved member shown as it was saved', () => {
    expect(editWouldBeLost(null, toFormFields(MEMBER), MEMBER)).toBe(false);
  });

  test.each([
    ['a text field', { name: 'ケープ' }],
    ['a colour', { colorBack: '#000000' }],
    ['a field cleared to null', { twitter: null }],
    ['an end date cleared', { activityEndDate: null }],
  ])('is true for a saved member with %s changed', (_label, changed) => {
    expect(editWouldBeLost(null, { ...toFormFields(MEMBER), ...changed }, MEMBER)).toBe(true);
  });

  // The same test the other edit panels use (editing.ts's sameFields): a box
  // typed in and erased again holds '' where the saved value is null.
  test.each(['twitch', 'twitter', 'globalname'] as const)(
    'is false for a saved member whose %s was typed in and erased again',
    (key) => {
      expect(editWouldBeLost(null, { ...toFormFields(MEMBER), [key]: '' }, { ...MEMBER, [key]: null })).toBe(false);
    },
  );

  test('is false for a new-member form whose nullable box was typed in and erased again', () => {
    expect(editWouldBeLost({ ...blankNewMember(), twitter: '', globalname: '' }, null, null)).toBe(false);
  });

  test('is true for a saved member whose required box was erased, which is not the same as null', () => {
    expect(editWouldBeLost(null, { ...toFormFields(MEMBER), name: '' }, MEMBER)).toBe(true);
  });

  test('looks at the new-member form first when both are there', () => {
    expect(editWouldBeLost(blankNewMember(), { ...toFormFields(MEMBER), name: 'x' }, MEMBER)).toBe(false);
  });
});

describe('keepEdit', () => {
  test('is null when nothing is open', () => {
    expect(keepEdit(null, null)).toBeNull();
    expect(keepEdit(toFormFields(MEMBER), null)).toBeNull();
  });

  test('is null for a saved member shown as it was saved, or typed in and erased again', () => {
    expect(keepEdit(toFormFields(MEMBER), MEMBER)).toBeNull();
    expect(keepEdit({ ...toFormFields(MEMBER), twitch: '' }, MEMBER)).toBeNull();
  });

  test('keeps only the fields that were typed in, for the member they were typed for', () => {
    expect(keepEdit({ ...toFormFields(MEMBER), name: 'ケープ編集中', twitch: 'kemov_tw' }, MEMBER)).toEqual({
      channelId: MEMBER.channelId,
      changes: { name: 'ケープ編集中', twitch: 'kemov_tw' },
    });
  });

  test('keeps a field cleared to null, which is a change', () => {
    expect(keepEdit({ ...toFormFields(MEMBER), twitter: null }, MEMBER)?.changes).toEqual({ twitter: null });
  });
});

describe('fieldsAfterReload', () => {
  const kept = { channelId: MEMBER.channelId, changes: { name: 'ケープ編集中' } };

  test('is null when no member is open', () => {
    expect(fieldsAfterReload(kept, null)).toBeNull();
    expect(fieldsAfterReload(null, null)).toBeNull();
  });

  test('shows the saved values when nothing was kept', () => {
    expect(fieldsAfterReload(null, MEMBER)).toEqual(toFormFields(MEMBER));
  });

  test('puts what was kept over the saved values when the same member is open', () => {
    expect(fieldsAfterReload(kept, { ...MEMBER, displayOrder: 0 })).toEqual({
      ...toFormFields(MEMBER),
      name: 'ケープ編集中',
    });
  });

  test('shows what somebody else changed meanwhile in a field that was not typed in', () => {
    // The list was saved while another person gave the member a twitter id.
    const reloaded = { ...MEMBER, twitter: 'kemov_new' };

    expect(fieldsAfterReload(kept, reloaded)).toEqual({ ...toFormFields(reloaded), name: 'ケープ編集中' });
  });

  test('shows what was typed in a field somebody else also changed meanwhile', () => {
    const reloaded = { ...MEMBER, name: '別の人が付けた名前' };

    expect(fieldsAfterReload(kept, reloaded)?.name).toEqual('ケープ編集中');
  });

  test('shows the saved values of another member, not what was kept for this one', () => {
    const other = { ...MEMBER, channelId: 'UCother', name: '別のメンバー' };

    expect(fieldsAfterReload(kept, other)).toEqual(toFormFields(other));
  });
});
