import {toItemMap} from '@philter/common/kol';
import {
  availableAmount,
  canInteract,
  closetAmount,
  equippedAmount,
  getCampground,
  getIngredients,
  getProperty,
  itemAmount,
  stashAmount,
  storageAmount,
  toBoolean,
} from 'kolmafia';

function countIngredientRecurse(
  source: Item,
  target: Item,
  underConsideration: Set<Item>
): number {
  // If the source and target are the same item, return 0.
  // This prevents Philter from crafting an item into itself, even if a valid recipe chain exists.
  // (e.g. flat dough -> wad of dough -> flat dough)
  if (source === target) return 0;

  let total = 0;
  for (const [ingredient, qty] of toItemMap(getIngredients(target))) {
    if (ingredient === source) {
      total += qty;
    } else if (underConsideration.has(ingredient)) {
      // Prevent infinite recursion
      // This usually happens when `target` has a circular recipe
      // (e.g. flat dough <-> wad of dough) and `source` is an
      // unrelated item (e.g. pail).
      return 0;
    } else {
      // Recursively count how many `source` is needed to make
      // each `ingredient`
      underConsideration.add(ingredient);
      total +=
        qty * countIngredientRecurse(source, ingredient, underConsideration);
      underConsideration.delete(ingredient);
    }
  }
  return total;
}

/**
 * Counts how many of `source` item is needed to craft a `target` item.
 * If `target` requires multiple crafting steps, this checks all parent
 * for uses of `source`.
 *
 * @param source Ingredient item
 * @param target Item to be crafted
 * @return Number of `source` items required to craft `target`.
 *    If `source` and `target` are the same item, returns 0.
 */
export function countIngredient(source: Item, target: Item): number {
  return countIngredientRecurse(source, target, new Set());
}

function campAmount(it: Item): number {
  switch (it) {
    case Item.get('Little Geneticist DNA-Splicing Lab'):
    case Item.get('snow machine'):
    case Item.get('spinning wheel'):
    case Item.get('Warbear auto-anvil'):
    case Item.get('Warbear chemistry lab'):
    case Item.get('Warbear high-efficiency still'):
    case Item.get('Warbear induction oven'):
    case Item.get('Warbear jackhammer drill press'):
    case Item.get('Warbear LP-ROM burner'):
      if (toItemMap(getCampground()).has(it)) return 1;
  }
  return 0;
}

export function fullAmount(it: Item): number {
  return (
    availableAmount(it) +
    // Some items lurk in the campground
    campAmount(it) +
    // Include Closet
    (!toBoolean(getProperty('autoSatisfyWithCloset')) ? closetAmount(it) : 0) +
    // Include Hangk's Storage
    (!toBoolean(getProperty('autoSatisfyWithStorage')) || !canInteract()
      ? storageAmount(it)
      : 0) -
    // Don't include Clan Stash
    (toBoolean(getProperty('autoSatisfyWithStash')) ? stashAmount(it) : 0)
  );
}

/**
 * Splits an iterable into equal-sized chunks of `length`.
 * @param iter Iterable
 * @param size Max length of each chunk (must be at least 1)
 * @yields Arrays of equal length. The last array may have less than `size`
 *    items, but is never empty.
 *    If `iter` is empty, no array is yielded.
 */
export function* grouper<T>(iter: Iterable<T>, size: number) {
  if (size < 1) {
    throw new Error(`Chunk size must be at least 1 (got ${size})`);
  }

  let chunk: T[] = [];
  for (const value of iter) {
    chunk.push(value);
    if (chunk.length >= size) {
      yield chunk;
      chunk = [];
    }
  }
  if (chunk.length > 0) yield chunk;
}

/**
 * Splits a collection of items into equal-sized chunks, sorted
 * alphabetically by item name.
 * @param items Collection of items. Only the keys (item) are used, and values
 *      are ignored.
 * @param size Number of items per chunk (must be at least 1)
 * @yields Maps of items. If the input item collection is empty, yields nothing.
 */
export function* splitItemsSorted<T>(
  items: Iterable<[Item, T]>,
  size: number
): IterableIterator<Map<Item, T>> {
  const sortedChunks = grouper(
    Array.from(items).sort(([itemA], [itemB]) =>
      itemA.name.localeCompare(itemB.name)
    ),
    size
  );
  for (const chunk of sortedChunks) {
    yield new Map(chunk);
  }
}

// This is the amount equipped on unequipped familiars in the terrarium
export function terrarium_amount(it: Item): number {
  return (
    availableAmount(it) -
    equippedAmount(it) -
    itemAmount(it) -
    // Don't include Closet
    (toBoolean(getProperty('autoSatisfyWithCloset')) ? closetAmount(it) : 0) -
    // Don't include Hangk's Storage
    (toBoolean(getProperty('autoSatisfyWithStorage')) ? storageAmount(it) : 0) -
    // Don't include Clan Stash
    (toBoolean(getProperty('autoSatisfyWithStash')) ? stashAmount(it) : 0)
  );
}
