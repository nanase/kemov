import { entityLabel } from '@/admin/lib/genet-publish';

describe('entityLabel', () => {
  test.each([
    ['genet_stream', '配信'],
    ['genet_tune', '曲'],
    ['genet_person', '人'],
  ] as const)('labels %s as %s', (entity, label) => {
    expect(entityLabel(entity)).toEqual(label);
  });
});
