import {
  sub,
  addHours,
  addMinutes,
  format,
  startOfHour,
  startOfDay,
  eachHourOfInterval,
  eachDayOfInterval,
  eachMinuteOfInterval,
} from 'date-fns';

export interface ResolvedTimeRange {
  start: string;
  end: string;
  /** Whether this is a custom (fixed) range vs a rolling preset */
  isCustom: boolean;
  intervals: Date[];
  formatKey: (date: Date) => string;
  getIntervalStart: (date: Date) => Date;
  bucketStrategy: 'five-minute' | 'hourly' | 'daily';
}

/**
 * Parse a timeRange string (preset like "24h" or custom like "custom:<start>|<end>")
 * and always return concrete start + end ISO strings.
 */
export function resolveTimeRange(timeRangeOption: string): ResolvedTimeRange {
  if (timeRangeOption.startsWith('custom:')) {
    const [startISO, endISO] = timeRangeOption.slice('custom:'.length).split('|');
    return buildResolved(new Date(startISO), new Date(endISO), true);
  }

  const now = new Date();
  let startDate: Date;
  switch (timeRangeOption) {
    case '1h':  startDate = sub(now, { hours: 1 });  break;
    case '6h':  startDate = sub(now, { hours: 6 });  break;
    case '24h': startDate = sub(now, { hours: 24 }); break;
    case '3d':  startDate = sub(now, { days: 3 });   break;
    default:    startDate = sub(now, { hours: 24 });
  }

  return buildResolved(startDate, now, false);
}

function buildResolved(startDate: Date, endDate: Date, isCustom: boolean): ResolvedTimeRange {
  const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

  let intervals: Date[];
  let formatKey: (date: Date) => string;
  let getIntervalStart: (date: Date) => Date;
  let bucketStrategy: ResolvedTimeRange['bucketStrategy'];

  if (durationHours <= 2) {
    bucketStrategy = 'five-minute';
    intervals = eachMinuteOfInterval(
      { start: roundToFiveMin(startDate), end: roundToFiveMin(addMinutes(endDate, 5)) },
      { step: 5 },
    );
    formatKey = d => format(d, 'HH:mm');
    getIntervalStart = roundToFiveMin;
  } else if (durationHours <= 72) {
    bucketStrategy = 'hourly';
    intervals = eachHourOfInterval({
      start: startOfHour(startDate),
      end: startOfHour(addHours(endDate, 1)),
    });
    formatKey = d => format(d, 'HH:mm');
    getIntervalStart = startOfHour;
  } else {
    bucketStrategy = 'daily';
    intervals = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    formatKey = d => format(d, 'MMM d');
    getIntervalStart = startOfDay;
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    isCustom,
    intervals,
    formatKey,
    getIntervalStart,
    bucketStrategy,
  };
}

function roundToFiveMin(date: Date): Date {
  const rounded = new Date(date);
  rounded.setMinutes(Math.floor(rounded.getMinutes() / 5) * 5, 0, 0);
  return rounded;
}
