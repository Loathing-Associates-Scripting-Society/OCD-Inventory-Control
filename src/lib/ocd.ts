/**
 * @file OCD data structure handling
 */

import {fileToArray, toItem} from 'kolmafia';

export type OcdAction =
  | 'AUTO'
  | 'BREAK'
  | 'CLAN'
  | 'CLST'
  | 'DISC'
  | 'DISP'
  | 'GIFT'
  | 'KEEP'
  | 'MAKE'
  | 'MALL'
  | 'PULV'
  | 'TODO'
  | 'UNTN'
  | 'USE';

/**
 * Type predicate that checks if the given stirng is a valid OCD action.
 * @param action String to check
 * @return Whether the given string is a valid OCD action
 */
export function isOcdAction(action: string): action is OcdAction {
  switch (action as OcdAction) {
    case 'AUTO':
    case 'BREAK':
    case 'CLAN':
    case 'CLST':
    case 'DISC':
    case 'DISP':
    case 'GIFT':
    case 'KEEP':
    case 'MAKE':
    case 'MALL':
    case 'PULV':
    case 'TODO':
    case 'UNTN':
    case 'USE':
      return true;
  }
  // @ts-expect-error Should be unreachable with static analysis, unless we
  // omitted a value
  return false;
}

/**
 * Factory function for functions that parse a text file into an ES2015 Map
 * using KoLmafia's file I/O API.
 * @param parse Callback used to parse each row.
 *    The callback may accept the following arguments:
 *
 *    - `row`: Array of strings representing each cell
 *    - `rowNum`: Row number, _starts at 1_
 *    - `filename`: Path to the text file being parsed
 *
 *    The callback must return a tuple of `[key, value]`.
 *    If the row is malformed, the callback may throw an exception.
 * @return Function that accepts a file name as a parameter, and returns a Map.
 *    If the file cannot be found or is empty, this function will return
 *    `undefined` instead.
 */
function createMapLoader<K, V>(
  parse: (row: readonly string[], rowNum: number, filename: string) => [K, V]
) {
  return (filename: string) => {
    const entries = new Map<K, V>();
    const rawData = fileToArray(filename);

    for (const indexStr of Object.keys(rawData)) {
      const row = rawData[(indexStr as unknown) as number].split('\t');
      const [key, value] = parse(row, Number(indexStr), filename);
      entries.set(key, value);
    }

    return entries.size ? entries : undefined;
  };
}

/**
 * Describes how OCD should clean up an item.
 */
export interface OcdInfo {
  /** What to do */
  action: OcdAction;
  /** How many of them to keep */
  q: number;
  /** Extra information (whom to send the gift) */
  info: string;
  /** Message to send with a gift */
  message: string;
}

/**
 * Loads OCD item data from a text file into a map.
 * @param filename Path to the data file
 * @return Map of each item to its item info, or `undefined` if the file cannot
 *    be loaded or is empty
 * @throws {TypeError} If the file contains invalid data
 */
export const loadOcdInfoFile = createMapLoader(
  (
    [itemName, action, quantityStr, info, message],
    _,
    filename
  ): [Item, OcdInfo] => {
    if (!isOcdAction(action)) {
      throw new TypeError(
        `${action} is not a valid OCD action (file: ${filename}, entry: ${itemName})`
      );
    }

    const q = Number(quantityStr);
    if (!Number.isInteger(q)) {
      throw new TypeError(
        `Invalid quantity ${quantityStr} (file: ${filename}, entry: ${itemName})`
      );
    }

    return [toItem(itemName), {action, q, info, message}];
  }
);

/**
 * Describes how OCD should restock an item.
 */
export interface OcdStock {
  type: string;
  q: number;
}

/**
 * Loads OCD item restocking data from a text file into a map.
 * @param filename Path to the data file
 * @return Map of each item to its stocking info, or `undefined` if the file
 *    cannot be loaded or is empty
 * @throws {TypeError} If the file contains invalid data
 */
export const loadOcdStockFile = createMapLoader(
  ([itemName, type, quantityStr], _, filename): [Item, OcdStock] => {
    const q = Number(quantityStr);
    if (!Number.isInteger(q)) {
      throw new TypeError(
        `Invalid quantity ${quantityStr} (file: ${filename}, entry: ${itemName})`
      );
    }

    return [toItem(itemName), {type, q}];
  }
);
