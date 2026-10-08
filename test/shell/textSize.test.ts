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

  test('a browser that does not report one is taken to apply none', () => {
    expect(zoomOf({} as Element)).toBe(1);
    expect(zoomOf({ currentCSSZoom: 0 } as unknown as Element)).toBe(1);
  });
});
