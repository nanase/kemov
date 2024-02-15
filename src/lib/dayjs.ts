import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import duration from 'dayjs/plugin/duration';
import 'dayjs/locale/ja';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);
dayjs.extend(duration);

type DayjsDate = Parameters<typeof dayjs>[0];

export function JST(date?: DayjsDate): Dayjs {
  return dayjs(date).tz('Asia/Tokyo').locale('ja');
}

export function UTC(date?: DayjsDate): Dayjs {
  return dayjs.utc(date);
}

export function toDateTimeText(datetime: string, baseDayjs?: ((date?: DayjsDate) => Dayjs) | Dayjs): string {
  const date = baseDayjs == null ? dayjs(datetime) : typeof baseDayjs === 'function' ? baseDayjs(datetime) : baseDayjs;

  if (date.isValid()) {
    if (datetime.indexOf(':') !== -1) {
      return date.format('YYYY/MM/DD (ddd) HH:mm');
    } else {
      return date.format('YYYY/MM/DD (ddd)');
    }
  } else {
    return datetime;
  }
}

export { Dayjs, utc, timezone, advancedFormat, duration };
export default dayjs;
