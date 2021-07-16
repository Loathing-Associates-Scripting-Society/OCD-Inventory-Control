import {create, myClass} from 'kolmafia';

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
 * Returns the number of `item` that is crafted by your character per craft.
 * This returns 3 for Sauceror potions (only if you are a Sauceror).
 * Otherwise, this returns 1.
 * @param item Item to check
 * @return Amount that will be created by your character
 */
function numCrafted(item: Item): number {
  if (myClass() === Class.get('Sauceror') && SAUCE_MULT_POTIONS.has(item)) {
    return 3;
  }
  return 1;
}

export function makeItemForCleanup(
  item: Item,
  target: Item,
  amount: number,
  makeAmount: number
): boolean {
  if (makeAmount === 0) return false;
  amount = (amount / makeAmount) * numCrafted(item);
  if (amount > 0) return create(amount, target);
  return false;
}
