import {
  axisMarks,
  changeSign,
  DASH,
  formatChange,
  formatCount,
  formatDuration,
  formatMinutes,
  memberAccent,
  memberColor,
  monthLabel,
  plotOf,
  slotLabel,
  toHsl,
} from '@/stats/draw';

describe('memberColor', () => {
  // The hue is what tells eleven members apart, so it survives the move.
  test('keeps the hue and moves the lightness into the readable band', () => {
    const hex = '#F38E0A';
    const { hue } = toHsl(hex);

    expect(memberColor(hex, false)).toEqual(`hsl(${hue} 92% 42%)`);
    expect(memberColor(hex, true)).toEqual(`hsl(${hue} 92% 60%)`);
  });

  test('raises a washed-out colour to the saturation floor rather than lowering it', () => {
    expect(memberColor('#9a9490', false)).toMatch(/^hsl\(\d+ 46% /);
    expect(memberColor('#9a9490', true)).toMatch(/^hsl\(\d+ 42% /);
  });

  test('carries an alpha when one is asked for', () => {
    expect(memberColor('#F38E0A', false, 0.09)).toMatch(/ \/ 0\.09\)$/);
  });

  test('the month being pointed at is the same hue, not the page accent', () => {
    const hex = '#F38E0A';

    expect(memberAccent(hex, false)).toMatch(new RegExp(`^hsl\\(${toHsl(hex).hue} `));
    expect(memberAccent(hex, false)).not.toEqual(memberColor(hex, false));
  });

  test('reads a grey with no hue at all', () => {
    expect(toHsl('#808080')).toMatchObject({ hue: 0, saturation: 0 });
  });
});

describe('plotOf', () => {
  test('gives a bar per month that has one', () => {
    const plot = plotOf([null, 4, 0, 2], 'flow');

    expect(plot.bars.map((bar) => bar.index)).toEqual([1, 3]);
    expect(plot.width).toEqual(4);
  });

  // Each row is scaled inside itself (#134): the tallest bar fills the row
  // whatever the numbers are, so no two members can be read against each other.
  test('scales to the series own largest value', () => {
    const small = plotOf([1, 2], 'flow');
    const large = plotOf([1000, 2000], 'flow');

    expect(small.bars[1]!.height).toBeCloseTo(large.bars[1]!.height);
  });

  test('puts a negative bar under the baseline', () => {
    const plot = plotOf([10, -5], 'flow');

    expect(plot.bars[0]!.y).toBeLessThan(plot.baseline);
    expect(plot.bars[1]!.y).toEqual(plot.baseline);
  });

  test('draws a line and its area for a level', () => {
    const plot = plotOf([100, 120, 150], 'level');

    expect(plot.line.startsWith('M')).toBe(true);
    expect(plot.area.endsWith('Z')).toBe(true);
  });

  // The subscriber history starts with one reading (#125). It has to draw
  // something rather than throw.
  test('draws a single reading without a line', () => {
    const plot = plotOf([null, null, 1000], 'level');

    expect(plot.line).toEqual('');
    expect(plot.area).not.toEqual('');
  });

  test('draws nothing at all for a series with no readings', () => {
    const plot = plotOf([null, null], 'level');

    expect(plot.line).toEqual('');
    expect(plot.area).toEqual('');
    expect(plot.bars).toEqual([]);
  });

  test('survives an empty series', () => {
    expect(plotOf([], 'flow')).toMatchObject({ width: 1, bars: [] });
  });
});

describe('axisMarks', () => {
  const months = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => `${from + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);

  test('always names both ends', () => {
    const marks = axisMarks(months(2021, 60), 600);

    expect(marks[0]).toMatchObject({ label: '2021-01', edge: 'left' });
    expect(marks.at(-1)).toMatchObject({ label: '2025-12', edge: 'right' });
  });

  test('names the years in between', () => {
    const marks = axisMarks(months(2021, 60), 600);

    expect(marks.slice(1, -1).map((m) => m.label)).toEqual(['2022年', '2023年', '2024年', '2025年']);
  });

  test('drops the year marks that would collide at a narrow width', () => {
    const wide = axisMarks(months(2021, 60), 600);
    const narrow = axisMarks(months(2021, 60), 180);

    expect(narrow.length).toBeLessThan(wide.length);
    expect(narrow[0]).toMatchObject({ edge: 'left' });
  });

  test('has nothing to mark on an empty axis', () => {
    expect(axisMarks([], 600)).toEqual([]);
  });

  test('a single month is one mark', () => {
    expect(axisMarks(['2026-09'], 600)).toEqual([{ left: 0, label: '2026-09', edge: 'left' }]);
  });
});

describe('the words numbers are written in', () => {
  test('a count is grouped, and an absent one is a dash', () => {
    expect(formatCount(1234567)).toEqual('1,234,567');
    expect(formatCount(null)).toEqual(DASH);
    expect(formatCount(2.51, 1)).toEqual('2.5');
  });

  test('a change carries its sign, and zero carries none', () => {
    expect(formatChange(1200)).toEqual('+1,200');
    expect(formatChange(-30)).toEqual('−30');
    expect(formatChange(0)).toEqual('0');
    expect(formatChange(null)).toEqual(DASH);
  });

  test.each([
    [5, 'pos'],
    [-5, 'neg'],
    [0, 'zero'],
    [null, 'zero'],
  ])('%s reads as %s', (value, expected) => {
    expect(changeSign(value)).toEqual(expected);
  });

  test('a month is written the way it is said', () => {
    expect(monthLabel('2026-09')).toEqual('2026年9月');
  });

  test('a stream length is hours and minutes', () => {
    expect(formatDuration(7200)).toEqual('2:00');
    expect(formatDuration(5430)).toEqual('1:30');
    expect(formatDuration(null)).toEqual(DASH);
  });

  test('airtime is said in whole units', () => {
    expect(formatMinutes(0)).toEqual('0 分');
    expect(formatMinutes(45)).toEqual('45 分');
    expect(formatMinutes(120)).toEqual('2 時間');
    expect(formatMinutes(150)).toEqual('2 時間 30 分');
  });

  test('a heatmap cell is named by the step it was cut with', () => {
    expect(slotLabel(21, 60)).toEqual('21 時台');
    expect(slotLabel(43, 30)).toEqual('21:30–22:00');
    expect(slotLabel(128, 10)).toEqual('21:20–21:30');
  });
});
