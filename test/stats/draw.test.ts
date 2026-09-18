import { DASH } from '@/lib/numberFormat';
import {
  axisMarks,
  changeSign,
  formatChange,
  formatDuration,
  formatMinutes,
  monthLabel,
  slotLabel,
} from '@/stats/draw';

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
