import {todayToString, isDisplayable} from 'kolmafia';

/**
 * Checks if an item can be cleaned up by Philter.
 *
 * Generally, this rejects most items that cannot be put in the display case
 * (e.g. quest items). However, several items that Philter knows how to handle
 * are exempt from this rule.
 * @param item Item to check
 * @return Whether the item can be cleaned up by Philter
 */
export function isCleanable(it: Item): boolean {
  // For some reason Item.get("none") is displayable
  if (it === Item.get('none')) return false;

  if (
    Item.get([
      "Boris's key",
      "Jarlsberg's key",
      "Richard's star key",
      "Sneaky Pete's key",
      'digital key',
      "the Slug Lord's map",
      "Dr. Hobo's map",
      "Dolphin King's map",
      'Degrassi Knoll shopping list',
      '31337 scroll',
      'dead mimic',
      "fisherman's sack",
      'fish-oil smoke bomb',
      'vial of squid ink',
      'potion of fishy speed',
      'blessed large box',
    ]).includes(it)
  ) {
    return true;
  }

  // Let these hide in your inventory until it is time for them to strike!
  // TODO: Revisit how this is handled.
  // Since a player can have multiple DNOTC boxes from different years, and we
  // don't know the associated year of a DNOTC box, our best bet is to try
  // opening them all.
  if (it === Item.get('DNOTC Box')) {
    const today = todayToString();
    if (today.slice(4, 6) === '12' && Number(today.slice(6, 8)) < 25) {
      return false;
    }
  }

  return isDisplayable(it);
}
