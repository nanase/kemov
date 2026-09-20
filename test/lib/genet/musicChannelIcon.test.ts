import { channelIconURL } from '@/lib/genet/musicChannelIcon';

describe('channelIconURL', () => {
  test('asks the relay for the 88px icon of the channel the JSON names', () => {
    expect(channelIconURL({ channel_id: 'UCabc' })).toBe('/api/image/channel/UCabc?size=88');
  });

  // A JSON published before the field existed has no `channel_id` at all, and
  // one published when no channel was clear has `null`. Both draw the circle.
  test.each<[string, { channel_id?: string | null }]>([
    ['is null', { channel_id: null }],
    ['is absent', {}],
    ['is undefined', { channel_id: undefined }],
    ['is empty', { channel_id: '' }],
  ])('gives no address when channel_id %s', (_name, data) => {
    expect(channelIconURL(data)).toBeNull();
  });

  test('gives no address before the data has loaded', () => {
    expect(channelIconURL(null)).toBeNull();
  });
});
