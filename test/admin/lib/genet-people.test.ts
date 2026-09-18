import { fieldForSaveError, linkIsWellFormed } from '@/admin/lib/genet-people';

describe('fieldForSaveError', () => {
  test.each([
    ['name must be a non-empty string', 'name'],
    ['link must start with one of wiki:, wikien:, https://, or be null', 'link'],
    ['memo must be a string or null', 'memo'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForSaveError(message)).toEqual(field);
  });

  test('answers null for a message naming no field this screen tracks', () => {
    expect(fieldForSaveError('this person is credited on a tune; remove them there first')).toBeNull();
  });
});

describe('linkIsWellFormed', () => {
  test.each(['wiki:Ado', 'wikien:Ado', 'https://example.com'])('accepts %s', (link) => {
    expect(linkIsWellFormed(link)).toBe(true);
  });

  test.each(['http://example.com', 'Ado', ''])('rejects %s', (link) => {
    expect(linkIsWellFormed(link)).toBe(false);
  });
});
