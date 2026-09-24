import {
  blankNewMember,
  fieldForSaveError,
  moveId,
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
