/**
 * @file General-purpose utilities for KoLmafia scripts.
 */

import {toInt} from 'kolmafia';

const _MONTH_STR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Converts a given date to Common Log Format string.
 */
export function formatDateClf(date: Date): string {
  // Example format: 05/Apr/2021:15:22:30 +0900
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = _MONTH_STR[date.getMonth()];
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  const tzOffset = date.getTimezoneOffset();
  const tz_hh = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const tz_mm = String(Math.abs(tzOffset) % 60).padStart(2, '0');
  // Displayed time zone sign must be reversed
  const timezone = `${tzOffset >= 0 ? '-' : '+'}${tz_hh}${tz_mm}`;

  return `${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} ${timezone}`;
}

/**
 * Converts a regular JavaScript object keyed by item IDs to an ES6 Map keyed by
 * `Item` objects.
 */
export function idMappingToItemMap<T>(itemMapping: {
  [itemId: number]: T;
}): Map<Item, T> {
  return new Map(
    Object.keys(itemMapping).map(itemId => [
      Item.get(Number(itemId)),
      itemMapping[itemId as unknown as number],
    ])
  );
}

/**
 * Converts an ES6 Map keyed by `Item` objects to a regular JavaScript object
 * keyed by item IDs.
 */
export function itemMapToIdMapping<T>(itemMap: ReadonlyMap<Item, T>): {
  [itemId: number]: T;
} {
  const itemMapping: {[itemId: number]: T} = {};
  for (const [item, value] of itemMap) {
    itemMapping[toInt(item)] = value;
  }
  return itemMapping;
}
