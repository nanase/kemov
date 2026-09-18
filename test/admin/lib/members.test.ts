import { fieldForSaveError, toFormFields, type Member } from '@/admin/lib/members';

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
  test('carries over every field a PUT needs, including ones this screen does not show', () => {
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
      displayOrder: 1,
    });
  });

  test('leaves out channelId, customUrl, thumbnailUrl and fetchedAt - none of them are in EDITABLE_MEMBER_KEYS', () => {
    const fields = toFormFields(MEMBER) as unknown as Record<string, unknown>;

    expect(fields.channelId).toBeUndefined();
    expect(fields.customUrl).toBeUndefined();
    expect(fields.thumbnailUrl).toBeUndefined();
    expect(fields.fetchedAt).toBeUndefined();
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['name must be a non-empty string', 'name'],
    ['colorKey must be #RRGGBB', 'colorKey'],
    ['colorSub must be #RRGGBB', 'colorSub'],
    ['activityStartDate must be YYYY-MM-DD', 'activityStartDate'],
    ['activityEndDate must be YYYY-MM-DD or null', 'activityEndDate'],
    ['activityEndDate is before activityStartDate', 'activityEndDate'],
    ['displayOrder must be a non-negative integer', 'displayOrder'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForSaveError(message)).toEqual(field);
  });

  test('answers null for a field this screen does not show', () => {
    expect(fieldForSaveError('fullname must be a non-empty string')).toBeNull();
    expect(fieldForSaveError('twitter must be a handle without the @, or null')).toBeNull();
  });
});
