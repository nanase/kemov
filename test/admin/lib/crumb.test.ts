import { claimCrumb, crumbDetail, releaseCrumb } from '@/admin/lib/crumb';

describe('claimCrumb / releaseCrumb', () => {
  afterEach(() => {
    crumbDetail.value = null;
  });

  test('the name shows until its holder goes', () => {
    const editor = Symbol('editor');

    claimCrumb(editor, 'ウサコ4周年記念3D配信');
    expect(crumbDetail.value).toBe('ウサコ4周年記念3D配信');

    releaseCrumb(editor);
    expect(crumbDetail.value).toBeNull();
  });

  test.each([undefined, null, ''])('%s shows no name', (name) => {
    claimCrumb(Symbol('editor'), name);
    expect(crumbDetail.value).toBeNull();
  });

  // A re-keyed editor: the new one claims before the old one is unmounted.
  test('an older holder going does not clear a newer one', () => {
    const before = Symbol('before');
    const after = Symbol('after');

    claimCrumb(before, '前の出来事');
    claimCrumb(after, '次の出来事');
    releaseCrumb(before);

    expect(crumbDetail.value).toBe('次の出来事');
  });
});
