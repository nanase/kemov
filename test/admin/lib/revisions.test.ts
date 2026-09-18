import { actionLabel, entityLabel, formatBytes, revisionsQuery, targetLabel } from '@/admin/lib/revisions';

describe('entityLabel and actionLabel and targetLabel', () => {
  test('label a known value', () => {
    expect(entityLabel('channel')).toEqual('メンバー');
    expect(actionLabel('publish')).toEqual('公開');
    expect(targetLabel('footprints')).toEqual('あしあと');
  });

  test('fall back to the raw value for an unknown one', () => {
    expect(entityLabel('future_entity')).toEqual('future_entity');
    expect(actionLabel('future_action')).toEqual('future_action');
    expect(targetLabel('future_target')).toEqual('future_target');
  });
});

describe('revisionsQuery', () => {
  test('is empty when every filter is null', () => {
    expect(revisionsQuery({ entity: null, action: null, from: null, to: null })).toEqual('');
  });

  test('carries only the filters that are set', () => {
    expect(revisionsQuery({ entity: 'channel', action: null, from: null, to: null })).toEqual('?entity=channel');
  });

  test('carries every filter together', () => {
    const qs = revisionsQuery({ entity: 'channel', action: 'save', from: '2026-09-01', to: '2026-09-19' });

    expect(qs).toEqual('?entity=channel&action=save&from=2026-09-01&to=2026-09-19');
  });
});

describe('formatBytes', () => {
  test.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2.0 KB'],
    [15360, '15 KB'],
    [1572864, '1.5 MB'],
  ])('formats %s as %s', (byteLength, expected) => {
    expect(formatBytes(byteLength)).toEqual(expected);
  });
});
