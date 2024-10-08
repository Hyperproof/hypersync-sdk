import '@js-joda/timezone';

import { HypersyncPeriod } from '@hyperproof/hypersync-models';
import {
  ChronoUnit,
  convert,
  DateTimeFormatter,
  DayOfWeek,
  Instant,
  LocalDateTime,
  TemporalAdjusters,
  ZonedDateTime,
  ZoneId,
  ZoneOffset
} from '@js-joda/core';

const fallbackLocale = 'en-US';
const fallbackTimeZone = 'UTC';

/**
 * @typedef {Object} PeriodRange
 * @property {ZonedDateTime} from
 * @property {ZonedDateTime} to
 */
/**
 * For the given HypersyncPeriod, return the start and end date of the last full period
 * For example, if it is March 30, it will return {Feb 1 at 00:00:00 and Feb 28 at 23:59:59} for a monthly period
 *
 * @param {HypersyncPeriod} period The period of the hypersync that determines the range of time
 * @param {Date} syncStartDate When the sync was initiated
 * @param {string} timeZone The syncing user's timezone
 * @returns {PeriodRange} An object with two {ZonedDateTime} objects, "to" and "from"
 */
export const getLastPeriod = (
  period: HypersyncPeriod,
  syncStartDate: Date,
  timeZone: string
) => {
  // Convert millis to Unix timestamp
  const now = syncStartDate
    ? dateToZonedDateTime(syncStartDate, timeZone)
    : ZonedDateTime.now(timeZone ? ZoneId.of(timeZone) : ZoneId.UTC);

  switch (period) {
    case HypersyncPeriod.Daily: {
      const today = now.truncatedTo(ChronoUnit.DAYS);
      const yesterday = today.minusDays(1);
      return {
        from: yesterday,
        to: today.minusSeconds(1)
      };
    }
    case HypersyncPeriod.Weekly: {
      const startOfWeek = TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY);
      const currentWeek = now.truncatedTo(ChronoUnit.DAYS);
      const lastWeek = currentWeek.minusWeeks(1);
      return {
        from: lastWeek.with(startOfWeek),
        to: currentWeek.with(startOfWeek).minusSeconds(1)
      };
    }
    case HypersyncPeriod.Monthly: {
      const currentMonth = now.truncatedTo(ChronoUnit.DAYS);
      const lastMonth = currentMonth.minusMonths(1);
      return {
        from: lastMonth.withDayOfMonth(1),
        to: currentMonth.withDayOfMonth(1).minusSeconds(1)
      };
    }
    case HypersyncPeriod.Quarterly: {
      // Month is 1 - 12
      // Quarter is 1 - 4
      const thisMonth = now.truncatedTo(ChronoUnit.DAYS).withDayOfMonth(1);
      const thisQuarter = Math.ceil(thisMonth.monthValue() / 3);
      const startOfThisQuarter = thisMonth.withMonth(thisQuarter * 3 - 2);
      const lastQuarterStartDate = startOfThisQuarter.minusMonths(3);
      const lastQuarterEndDate = startOfThisQuarter.minusSeconds(1);
      return {
        from: lastQuarterStartDate,
        to: lastQuarterEndDate
      };
    }
    case HypersyncPeriod.Yearly: {
      const startOfThisYear = now
        .truncatedTo(ChronoUnit.DAYS)
        .withMonth(1)
        .withDayOfMonth(1);
      const lastYearStartDate = startOfThisYear.minusYears(1);
      const lastYearEndDate = startOfThisYear.minusSeconds(1);
      return {
        from: lastYearStartDate,
        to: lastYearEndDate
      };
    }
    default:
      throw new Error(`HypersyncPeriod "${period}" is not supported`);
  }
};

/**
 * Convert Date to Unix timestamp
 *
 * @param {Date} date The Javscript Date object to convert
 */
export const dateToUnixTimestamp = (date: Date) => {
  return Math.floor(date.valueOf() / 1000);
};

/**
 * Convert Date to LocalDateTime object
 *
 * @param {Date} date The Javascript Date object to convert
 * @param {string} timeZone The timezone to use
 */
const dateToZonedDateTime = (date: Date, timeZone: string) => {
  return ZonedDateTime.ofInstant(
    Instant.ofEpochSecond(dateToUnixTimestamp(date)),
    timeZone
      ? ZoneId.of(timeZone).rules().offset(Instant.now())
      : ZoneOffset.UTC
  );
};

/**
 * Convert js-joda LocalDateTime to JS Date object
 *
 * @param {LocalDateTime} localDateTime The js-joda object to convert
 */
const localDateTimeToDate = (localDateTime: LocalDateTime | ZonedDateTime) => {
  return convert(localDateTime).toDate();
};

/**
 * Convert ISO Date to formatted Date String using caller's prefrences
 *
 * @param {Date | string} date The date to convert.
 * @param {string} timeZone  The time zone to use for conversion, defaults to UTC
 * @param {string} lang  The language used for string formatting, defaults to 'en'
 * @param {string} locale  The locale used for string formatting, defaults to 'US'
 */
export const dateToLocalizedString = (
  date: Date | string,
  timeZone: string,
  lang: string,
  locale: string
) => {
  if (!date) {
    return undefined;
  }

  const localDate = new Date(date);
  const locales = combineLangLocale(lang, locale);

  return localDate.toLocaleString(locales, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: timeZone ? timeZone : fallbackTimeZone,
    timeZoneName: 'short'
  });
};

/**
 * Convert JsJoda LocalDateTime object and HypersyncPeriod to a user-friendly date string
 *
 * Day:   Jan 01, 2021
 * Week:  Week of Jan 01, 2021
 * Month: Jan-2021
 *
 * @param {LocalDateTime} periodStart The first day of the time period
 * @param {HypersyncPeriod} period The range of time or frequency of the hypersync
 * @param {string} lang Language code for the user (e.g. en)
 * @param {string} locale Locale code for the user (e.g. US)
 */
export const formatJsJodaDateRange = (
  periodStart: LocalDateTime | ZonedDateTime,
  period: HypersyncPeriod,
  lang: string,
  locale: string
) => {
  const date = localDateTimeToDate(periodStart);

  const locales = combineLangLocale(lang, locale);

  const year = Intl.DateTimeFormat(locales, { year: 'numeric' }).format(date);
  const month = Intl.DateTimeFormat(locales, { month: 'short' }).format(date);
  const day = Intl.DateTimeFormat(locales, { day: '2-digit' }).format(date);

  switch (period) {
    case HypersyncPeriod.Daily:
      return `${month} ${day}, ${year}`;
    case HypersyncPeriod.Weekly:
      // TODO: HYP-11821 Localize text
      return `Week of ${month} ${day}, ${year}`;
    case HypersyncPeriod.Monthly:
      return `${month}-${year}`;
    default:
      throw new Error(`HypersyncPeriod "${period}" is not supported`);
  }
};

export const zonedDateTimeToISOString = (zdt: ZonedDateTime) => {
  return zdt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
};

/**
 * Combines a given language and locale abbreviations into one. If only lang is provided, only
 * lang is returned. If both are provided, they will be combined with hyphen. Otherwise, the default
 * lang and locale are returned
 *
 * @param {string} lang The language of the user
 * @param {string} locale The locale of the user
 */
const combineLangLocale = (lang: string, locale: string) => {
  return lang ? (locale ? `${lang}-${locale}` : lang) : fallbackLocale;
};
