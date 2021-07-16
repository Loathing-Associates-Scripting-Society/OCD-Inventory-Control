import {PhilterConfig} from '@philter/common';
import {
  canEquip,
  cliExecute,
  equip,
  itemAmount,
  retrieveItem,
  use,
} from 'kolmafia';
import {withOutfitCheckpoint} from 'kolmafia-util';
import * as assert from 'kolmafia-util/assert';
import {cleanupSimpleExecute} from './base';

/**
 * Apply temporary setup while using the `item`.
 * @param item Item to use
 * @param required Item to equip
 */
function useWithSetup(item: Item, required: Item): boolean {
  return withOutfitCheckpoint(() => {
    assert.ok(retrieveItem(1, required), `Cannot retrieve ${required}`);
    assert.ok(equip(required), `Failed to equip ${required}`);
    return use(1, item);
  });
}

/**
 * Use `amount` of `item`, applying custom logic for some special items.
 * @param item Item to use
 * @param amount Amount of item to use
 * @return Whether the item was used successfully
 */
function useItemForCleanup(item: Item, amount: number): boolean {
  if (item === Item.get("the Slug Lord's map")) {
    return withOutfitCheckpoint(() => {
      assert.ok(cliExecute('maximize stench resistance, 1 min'));
      return use(amount, item);
    });
  }

  if (item === Item.get("Dr. Hobo's map")) {
    assert.equal(amount, 1, `Cannot use ${amount} of ${item}, must use 1`);
    const whip =
      Item.get([
        'Bar whip',
        'Bat whip',
        'Clown whip',
        'Demon whip',
        'Dishrag',
        'Dreadlock whip',
        'Gnauga hide whip',
        'Hippo whip',
        'Palm-frond whip',
        'Penguin whip',
        'Rattail whip',
        'Scorpion whip',
        "Tail o' nine cats",
        'White whip',
        'Wumpus-hair whip',
        'Yak whip',
      ]).find(it => itemAmount(it) && canEquip(it)) || Item.get('cool whip');
    assert.ok(retrieveItem(1, Item.get('asparagus knife')));
    return useWithSetup(item, whip);
  }

  if (item === Item.get("Dolphin King's map")) {
    assert.equal(amount, 1, `Cannot use ${amount} of ${item}, must use 1`);
    const breather =
      Item.get(['aerated diving helmet', 'makeshift SCUBA gear']).find(
        it => itemAmount(it) && canEquip(it)
      ) || Item.get('snorkel');
    return useWithSetup(item, breather);
  }

  if (item === Item.get('Degrassi Knoll shopping list')) {
    assert.equal(amount, 1, `Cannot use ${amount} of ${item}, must use 1`);
    if (itemAmount(Item.get("bitchin' meatcar")) === 0) return false;
    // continue
  }

  return use(amount, item);
}

/**
 * Uses items for cleanup.
 * @param items Items to use
 * @param config Configuration object
 * @return Whether to replan
 */
export function cleanupUseItems(
  items: ReadonlyMap<Item, number>,
  config: Readonly<PhilterConfig>
) {
  return cleanupSimpleExecute({
    items,
    config,
    commandPrefix: 'use',
    process: (item, amount) => {
      assert.ok(
        useItemForCleanup(item, amount),
        `Failed to use ${amount} of ${item}`
      );
    },
    valueOnSuccess: true,
  });
}
