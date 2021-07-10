/**
 * @file Tools for managing `ItemInfo` objects.
 */

import {ItemInfo} from '@philter/common';
import {toItemMap} from '@philter/common/kol';
import {
  autosellPrice,
  craftType,
  fileToArray,
  getRelated,
  historicalPrice,
  isDisplayable,
  isGiftable,
  toInt,
  toItem,
} from 'kolmafia';

const BREAKABLE_ITEMS = Item.get([
  'BRICKO hat',
  'BRICKO sword',
  'BRICKO pants',
]);

function isBreakable(item: Item) {
  return BREAKABLE_ITEMS.includes(item);
}

/** Cache used by `isCraftable()` */
const CRAFTABLES = new Set<Item>();

/**
 * Checks if the given item can be crafted into another item.
 * @param item Item to check
 * @return Whether `item` is an ingredient
 */
function isCraftable(item: Item): boolean {
  if (CRAFTABLES.size === 0) {
    // Populate the cache on first call
    const rawCrafty = fileToArray('data/concoctions.txt');

    for (const key of Object.keys(rawCrafty)) {
      const row = rawCrafty[key as unknown as number].split('\t');

      // We assume that concoctions.txt looks like this:
      //
      //    <produced item> <TAB> <crafting method> <TAB> <tab-separated list of ingredients>
      const [, , ...ingredients] = row;
      for (const ingredientName of ingredients) {
        CRAFTABLES.add(toItem(ingredientName));
      }
    }

    for (const item of Item.get([
      'hot nuggets',
      'cold nuggets',
      'spooky nuggets',
      'stench nuggets',
      'sleaze nuggets',
      'titanium assault umbrella',
    ])) {
      CRAFTABLES.add(item);
    }
  }

  return CRAFTABLES.has(item);
}

const USELESS_POWDER = Item.get('useless powder');
const MALUSABLES: ReadonlySet<Item> = new Set(
  Item.get([
    'twinkly powder',
    'hot powder',
    'cold powder',
    'spooky powder',
    'stench powder',
    'sleaze powder',
    'twinkly nuggets',
    'hot nuggets',
    'cold nuggets',
    'spooky nuggets',
    'stench nuggets',
    'sleaze nuggets',
    'sewer nuggets',
    'floaty sand',
    'floaty pebbles',
    'floaty gravel',
  ])
);

function isPulverizable(item: Item): boolean {
  const pulvy = toItemMap(getRelated(item, 'pulverize'));
  return !pulvy.has(USELESS_POWDER) && (pulvy.size > 0 || MALUSABLES.has(item));
}

/**
 * Converts a native `Item` to an `ItemInfo` object.
 */
export function toItemInfo(item: Item): ItemInfo {
  return {
    canAutosell: item.discardable && autosellPrice(item) > 0,
    canBreak: isBreakable(item),
    canCloset: isDisplayable(item),
    canDiscard: item.discardable,
    canDisplay: isDisplayable(item),
    canGift: isGiftable(item),
    canMake: isCraftable(item),
    canMall: item.tradeable,
    canPulverize: isPulverizable(item),
    canStash: isGiftable(item),
    canUntinker: craftType(item) === 'Meatpasting',
    canUse: item.usable || item.multi,
    descid: item.descid,
    id: toInt(item),
    image: item.image,
    isMallPriceAtMinimum:
      historicalPrice(item) <= Math.max(autosellPrice(item) * 2, 100),
    isTradable: item.tradeable,
    mallPrice: historicalPrice(item) || null,
    name: item.name,
  };
}
