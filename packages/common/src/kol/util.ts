import {fileToArray, toInt} from 'kolmafia';

/**
 * Factory function for functions that parse a text file into a Map using
 * KoLmafia's file I/O API.
 * Any comments and empty lines in the text file are ignored.
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
 *    If the file cannot be found or is empty, this function will return an
 *    empty map.
 */
export function createMapLoader<K, V>(
  parse: (row: string[], rowNum: number, filename: string) => [K, V]
) {
  return (filename: string) => {
    const entries = new Map<K, V>();
    const rawData = fileToArray(filename);

    for (const indexStr of Object.keys(rawData)) {
      const row = rawData[indexStr as unknown as number].split('\t');
      const [key, value] = parse(row, Number(indexStr), filename);
      entries.set(key, value);
    }

    return entries.size ? entries : null;
  };
}

/**
 * Encodes an item object as a string for saving to a data (TXT) file.
 */
export function encodeItem(item: Item) {
  return `[${toInt(item)}]${item.name}`;
}

/**
 * Converts an object to a Map, converting each key to an `Item` object.
 * @param items Object whose keys are item names
 * @return Mapping of Item to amount
 */
export function toItemMap<T>(items: {[itemName: string]: T}): Map<Item, T> {
  return new Map(
    Object.keys(items).map(itemStr => [Item.get(itemStr), items[itemStr]])
  );
}
