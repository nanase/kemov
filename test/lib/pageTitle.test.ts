import { memberPageTitle, videoPageTitle } from '@/lib/pageTitle';

/**
 * These cases are copied from `worker/test/pages.test.ts`'s own - the two
 * sides build the same string in two places (see `@/lib/pageTitle.ts`'s own
 * comment for why it cannot be one), so a mismatch has to fail a test on
 * both sides, not just one.
 */

describe('memberPageTitle', () => {
  test('matches the worker: name, then " - けもV メンバー"', () => {
    expect(memberPageTitle('カラカル')).toEqual('カラカル - けもV メンバー');
  });
});

describe('videoPageTitle', () => {
  test('matches the worker: title, then " - けもV 配信・動画"', () => {
    expect(videoPageTitle('collected title')).toEqual('collected title - けもV 配信・動画');
  });

  test('matches the worker: an overridden title reads the same as any other', () => {
    expect(videoPageTitle('overridden title')).toEqual('overridden title - けもV 配信・動画');
  });

  test('matches the worker: unescapes an entity stored as literal text', () => {
    expect(videoPageTitle('O&#39;Brien &quot;Live&quot;')).toEqual('O\'Brien "Live" - けもV 配信・動画');
  });
});
