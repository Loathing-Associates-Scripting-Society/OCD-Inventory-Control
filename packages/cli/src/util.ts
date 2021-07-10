import {toItemMap} from '@philter/common/kol';
import {
  availableAmount,
  canInteract,
  closetAmount,
  equippedAmount,
  getCampground,
  getIngredients,
  getProperty,
  isDisplayable,
  itemAmount,
  myClass,
  stashAmount,
  storageAmount,
  toBoolean,
  todayToString,
  toInt,
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

export function is_OCDable(it: Item): boolean {
  switch (it) {
    case Item.get('none'): // For some reason Item.get(`none`) is displayable
      return false;
    case Item.get("Boris's key"):
    case Item.get("Jarlsberg's key"):
    case Item.get("Richard's star key"):
    case Item.get("Sneaky Pete's key"):
    case Item.get('digital key'):
    case Item.get("the Slug Lord's map"):
    case Item.get("Dr. Hobo's map"):
    case Item.get("Dolphin King's map"):
    case Item.get('Degrassi Knoll shopping list'):
    case Item.get('31337 scroll'):
    case Item.get('dead mimic'):
    case Item.get("fisherman's sack"):
    case Item.get('fish-oil smoke bomb'):
    case Item.get('vial of squid ink'):
    case Item.get('potion of fishy speed'):
    case Item.get('blessed large box'):
      return true;
    case Item.get('DNOTC Box'): // Let these hide in your inventory until it is time for them to strike!
      if (
        todayToString().slice(4, 6) === '12' &&
        Number(todayToString().slice(6, 8)) < 25
      )
        return false;
      break;
  }
  if (isDisplayable(it)) return true;
  return false;
}

export function is_wadable(it: Item): boolean {
  // twinkly powder to sleaze nuggets
  if (1438 <= toInt(it) && toInt(it) <= 1449) return true;
  switch (it) {
    case Item.get('sewer nuggets'):
    case Item.get('floaty sand'):
    case Item.get('floaty pebbles'):
    case Item.get('floaty gravel'):
      return true;
  }
  return false;
}

/**
 * Returns the "Malus order" of items.
 * Items with the same order are processed together, and items with a smaller
 * order are processed first.
 * @param it Item to check
 * @return Integer beteween 1 and 3 for malusable items.
 *      0 if the item cannot be malused.
 */
export function get_malus_order(it: Item): number {
  switch (it) {
    // Process nuggets after powders
    case Item.get('twinkly nuggets'):
    case Item.get('hot nuggets'):
    case Item.get('cold nuggets'):
    case Item.get('spooky nuggets'):
    case Item.get('stench nuggets'):
    case Item.get('sleaze nuggets'):
      return 2;
    // Process floaty sand -> floaty pebbles -> floaty gravel
    case Item.get('floaty pebbles'):
      return 2;
    case Item.get('floaty gravel'):
      return 3;
    // Non-malusable items (includes equipment that can be Pulverized)
    default:
      // 1 for other malusable items
      // 0 for non-malusable items (including pulverizable equipment)
      return is_wadable(it) ? 1 : 0;
  }
}

/**
 * Returns the alternate form of a ten-leaf clover or disassembled clover.
 * @param it ten-leaf clover or disassembled clover
 * @return
 */
export function other_clover(it: Item): Item {
  return it === Item.get('ten-leaf clover')
    ? Item.get('disassembled clover')
    : Item.get('ten-leaf clover');
}

const SAUCE_MULT_POTIONS: ReadonlySet<Item> = new Set(
  Item.get([
    'philter of phorce',
    'Frogade',
    'potion of potency',
    'oil of stability',
    'ointment of the occult',
    'salamander slurry',
    'cordial of concentration',
    'oil of expertise',
    'serum of sarcasm',
    'eyedrops of newt',
    'eyedrops of the ermine',
    'oil of slipperiness',
    'tomato juice of powerful power',
    'banana smoothie',
    'perfume of prejudice',
    'libation of liveliness',
    'milk of magnesium',
    'papotion of papower',
    'oil of oiliness',
    'cranberry cordial',
    'concoction of clumsiness',
    'phial of hotness',
    'phial of coldness',
    'phial of stench',
    'phial of spookiness',
    'phial of sleaziness',
    "Ferrigno's Elixir of Power",
    'potent potion of potency',
    'plum lozenge',
    "Hawking's Elixir of Brilliance",
    'concentrated cordial of concentration',
    'pear lozenge',
    "Connery's Elixir of Audacity",
    'eyedrops of the ocelot',
    'peach lozenge',
    'cologne of contempt',
    'potion of temporary gr8ness',
    'blackberry polite',
  ])
);

/**
 * Returns the number of `itm` that will be crafted by your character per craft.
 * This returns 3 for Sauceror potions (only if you are a Sauceror).
 * Otherwise, this returns 1.
 * @param itm Item to check
 * @return Amount that will be created by your character
 */
export function sauce_mult(itm: Item): number {
  if (myClass() === Class.get('Sauceror') && SAUCE_MULT_POTIONS.has(itm)) {
    return 3;
  }
  return 1;
}

/**
 * Splits a collection of items into equal-sized chunks, sorted
 * alphabetically by item name.
 * @param items Collection of items. Only the keys (item) are used, and
 *      values (quantities) are ignored.
 * @param chunk_size Number of items per chunk (must be positive)
 * @yield 0-indexed list of lists of items.
 *      If the input item collection is empty, returns an empty list.
 */
export function* split_items_sorted(
  items: ReadonlyMap<Item, number>,
  chunk_size: number
): IterableIterator<Map<Item, number>> {
  if (chunk_size <= 0) {
    throw new Error(`chunk_size must be greater than 0 (got ${chunk_size})`);
  }

  const sorted = new Map(
    Array.from(items).sort(([itemA], [itemB]) =>
      itemA.name.localeCompare(itemB.name)
    )
  );

  let itemChunk = new Map<Item, number>();
  for (const [it, qty] of sorted) {
    itemChunk.set(it, qty);
    if (itemChunk.size >= chunk_size) {
      yield itemChunk;
      itemChunk = new Map<Item, number>();
    }
  }
  if (itemChunk.size > 0) yield itemChunk;
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
