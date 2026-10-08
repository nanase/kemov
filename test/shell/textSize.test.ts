import { TEXT_SIZES, parseTextSize, zoomOf } from '@/shell/textSize';

describe('parseTextSize', () => {
  test.each([
    ['125', 125],
    ['150', 150],
    ['200', 200],
    [null, 100],
    [undefined, 100],
    ['', 100],
    // 100 is the absence of a setting, so it is never stored or read as one.
    ['100', 100],
    ['175', 100],
    ['1.25', 100],
  ])('%s means %s', (value, expected) => {
    expect(parseTextSize(value)).toBe(expected);
  });

  test('offers the sizes in the order the menu lists them', () => {
    expect(TEXT_SIZES).toEqual([100, 125, 150, 200]);
  });
});

describe('zoomOf', () => {
  test('reads the zoom the element is drawn at', () => {
    expect(zoomOf({ currentCSSZoom: 1.5 } as unknown as Element)).toBe(1.5);
  });

  describe('in a browser that does not report one', () => {
    const root = {};
    const element = { ownerDocument: { documentElement: root } } as unknown as Element;

    afterEach(() => vi.unstubAllGlobals());

    test('reads the zoom on the root, which is the one the site applies', () => {
      vi.stubGlobal('getComputedStyle', (target: unknown) => ({ zoom: target === root ? '1.5' : '1' }));

      expect(zoomOf(element)).toBe(1.5);
    });

    test('takes no zoom when the root has none either', () => {
      vi.stubGlobal('getComputedStyle', () => ({ zoom: 'normal' }));

      expect(zoomOf(element)).toBe(1);
    });

    test('takes no zoom for an element outside a document', () => {
      expect(zoomOf({} as Element)).toBe(1);
    });
  });
});
