import { EDITING_TEXT } from '@/admin/lib/editing';
import { confirmDiscard, useUnsavedGuard } from '@/admin/lib/unsaved-guard';

// useUnsavedGuard is called from a panel's setup. The hooks it registers -
// the tab-close warning, the route-leave confirmation, clearing itself on
// unmount - need a mounted component; what is tested here is what the page's
// own controls rely on: confirmDiscard asks the current panel.
vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: vi.fn(),
  onBeforeUnmount: vi.fn(),
}));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));

describe('confirmDiscard', () => {
  const confirm = vi.fn<(message: string) => boolean>();

  beforeEach(() => {
    vi.stubGlobal('window', { confirm });
  });

  afterEach(() => {
    confirm.mockReset();
    vi.unstubAllGlobals();
  });

  test('a panel with nothing unsaved lets the action go without asking', () => {
    const discard = vi.fn();

    useUnsavedGuard(() => false, discard);

    expect(confirmDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  test('declining keeps the unsaved changes and stops the action', () => {
    const discard = vi.fn();

    useUnsavedGuard(() => true, discard);
    confirm.mockReturnValue(false);

    expect(confirmDiscard()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(EDITING_TEXT.confirmDiscard);
    expect(discard).not.toHaveBeenCalled();
  });

  test('agreeing throws the changes away before the action goes', () => {
    const discard = vi.fn();

    useUnsavedGuard(() => true, discard);
    confirm.mockReturnValue(true);

    expect(confirmDiscard()).toBe(true);
    expect(confirm).toHaveBeenCalledWith(EDITING_TEXT.confirmDiscard);
    expect(discard).toHaveBeenCalledOnce();
  });

  // A panel keyed by row: the next row's panel is set up before the last one
  // is unmounted, and only the newer one is asked.
  test('the panel set up last is the one asked', () => {
    const before = vi.fn();
    const after = vi.fn();

    useUnsavedGuard(() => true, before);
    useUnsavedGuard(() => false, after);

    expect(confirmDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
  });
});
