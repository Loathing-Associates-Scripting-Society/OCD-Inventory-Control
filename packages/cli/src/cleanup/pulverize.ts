import {
  logger,
  ReadonlyCleanupRules,
  ReadonlyStockingRules,
} from '@philter/common/kol';
import {
  canInteract,
  cliExecute,
  getRelated,
  haveSkill,
  isOnline,
  isTradeable,
  myPrimestat,
  toInt,
} from 'kolmafia';
import {kmail} from 'kolmafia-util';
import {ocd_amount} from '../planner';
import {splitItemsSorted} from '../util';

/**
 * Pulverizes/smashes items.
 * @param items Items to pulverize/malus
 * @param isDryRun Whether to print messages without actually smashing items
 */
function pulverize(items: ReadonlyMap<Item, number>, isDryRun: boolean) {
  for (const chunk of splitItemsSorted(items, 11)) {
    const tokens: string[] = [];
    const tokensShown: string[] = [];

    for (const [item, amount] of chunk) {
      tokens.push(`${amount} \u00B6${toInt(item)}`);
      tokensShown.push(`${amount} ${item.name}`);
    }

    logger.info(`pulverize ${tokensShown.join(', ')}`);
    logger.info(' ');
    if (!isDryRun) {
      cliExecute(`pulverize ${tokens.join(', ')}`);
    }
  }
}

function isWadable(it: Item): boolean {
  // twinkly powder to sleaze nuggets
  if (1438 <= toInt(it) && toInt(it) <= 1449) return true;
  return Item.get([
    'sewer nuggets',
    'floaty sand',
    'floaty pebbles',
    'floaty gravel',
  ]).includes(it);
}

/**
 * Returns the "Malus order" of items.
 * Items with the same order are processed together, and items with a smaller
 * order are processed first.
 * @param it Item to check
 * @return Integer beteween 1 and 3 for malusable items.
 *      0 if the item cannot be malused.
 */
function getMalusOrder(it: Item): number {
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
      return isWadable(it) ? 1 : 0;
  }
}

/**
 * Process all malusable items with the `PULV` action.
 * This assumes that the player can use the Malus.
 * @param cleanupRules Cleanup ruleset to use
 * @param stockingRules Stocking ruleset to use
 * @param simulateOnly Whether to run a simulation or actually process the items
 * @return Whether any item was actually processed
 *      (i.e. whether any cleanup plans must be evaluated again)
 */
function malus(
  cleanupRules: ReadonlyCleanupRules,
  stockingRules: ReadonlyStockingRules,
  simulateOnly: boolean
): boolean {
  let hasProcessedAny = false;

  // Process each malus order sequentially.
  // This allows us to process malus products that can be malused again,
  // e.g. powders -> nuggets -> wads.
  for (let malusOrder = 1; malusOrder <= 3; ++malusOrder) {
    // Gather items to be malused
    const itemsToMalus = new Map<Item, number>();
    for (const [it, rule] of cleanupRules) {
      if (rule.action !== 'PULV') continue;
      // This also filters out non-malusable items
      if (getMalusOrder(it) !== malusOrder) continue;

      let amount = ocd_amount(it, rule, stockingRules.get(it));
      // The Malus always converts items in multiples of 5
      amount -= amount % 5;
      if (amount < 1) continue;
      itemsToMalus.set(it, amount);
    }

    // Malus the gathered items
    pulverize(itemsToMalus, simulateOnly);
    if (itemsToMalus.size > 0) hasProcessedAny = true;
  }

  return hasProcessedAny;
}

/**
 * Sends all items with the `PULV` action to a pulverizing bot.
 *
 * Note: Multi-level malusing (i.e. converting powders directly to wads) is
 * not guaranteed to work. Because only 11 items can be sent per each kmail,
 * some malus products may not be processed.
 * @param cleanupRules Cleanup rules to use
 * @param stockingRules Stocking rules to use
 * @return Whether any item was actually sent
 */
function sendToPulverizingBot(
  cleanupRules: ReadonlyCleanupRules,
  stockingRules: ReadonlyStockingRules
): boolean {
  // TODO: Fix bug that sends items to smashbot during a simulation (dry run)
  const itemsToSend = new Map<Item, number>();
  for (const [it, rule] of cleanupRules) {
    if (rule.action !== 'PULV') continue;
    if (!isTradeable(it)) {
      logger.debug(`Will not send ${it} to smashbot since it is untradeable`);
      continue;
    }

    const amount = ocd_amount(it, rule, stockingRules.get(it));
    // Note: Always send malusable items even if the quantity is not a
    // multiple of 5.
    // For example, we should be able to send 5 powders and 4 nuggets,
    // so that the bot can combine them into 1 wad.
    if (amount < 1) continue;
    itemsToSend.set(it, amount);
  }

  if (itemsToSend.size === 0) {
    logger.info('Nothing to pulverize after all.');
    return false;
  }

  if (!canInteract()) {
    // Because Smashbot cannot return items to characters in Ronin/Hardcore, any
    // items sent would be permanently lost
    logger.info('You cannot send items to Smashbot while in Ronin/Hardcore.');
    return false;
  } else if (!isOnline('smashbot')) {
    logger.warn(
      'Smashbot is offline! Pulverizables will not be sent at this time, just in case.'
    );
    return false;
  } else {
    // Smashbot supports fine-grained malus control through the "goose_level"
    // command.
    const ITEM_GOOSE_LEVELS = new Map<Item, number>([
      [Item.get('twinkly powder'), 1],
      [Item.get('hot powder'), 2],
      [Item.get('cold powder'), 4],
      [Item.get('spooky powder'), 8],
      [Item.get('stench powder'), 16],
      [Item.get('sleaze powder'), 32],
      [Item.get('twinkly nuggets'), 64],
      [Item.get('hot nuggets'), 128],
      [Item.get('cold nuggets'), 256],
      [Item.get('spooky nuggets'), 512],
      [Item.get('stench nuggets'), 1024],
      [Item.get('sleaze nuggets'), 2048],
    ]);
    let totalGooseLevel = 0;
    for (const [it, gooseLevel] of ITEM_GOOSE_LEVELS) {
      if (itemsToSend.has(it)) {
        totalGooseLevel |= gooseLevel;
      }
    }
    let message = `goose_level ${totalGooseLevel}`;

    // Smashbot supports a single command ("rock" to malus all the way up to
    // floaty rock) for multi-malusing floaty items.
    // Since this is not sophisticated enough for all our needs, we should
    // identify and warn about cases where neither "rock" nor the default
    // behavior (no "rock") would satisfy our requirements.
    let canUseRock = false;
    let shouldWarnRerun = false;
    if (
      itemsToSend.has(Item.get('floaty sand')) &&
      cleanupRules.get(Item.get('floaty pebbles'))?.action === 'PULV'
    ) {
      // Default behavior:
      //  sand -> pebbles (stop)
      // With "rock":
      //  sand -> pebbles -> gravel -> rock
      if (cleanupRules.get(Item.get('floaty gravel'))?.action === 'PULV') {
        canUseRock = true;
      } else {
        shouldWarnRerun = true;
      }
    } else if (
      itemsToSend.has(Item.get('floaty pebbles')) &&
      cleanupRules.get(Item.get('floaty gravel'))?.action === 'PULV'
    ) {
      // Default behavior:
      //  pebbles -> gravel (stop)
      // With "rock":
      //  pebbles -> gravel -> rock
      canUseRock = true;
    }

    if (shouldWarnRerun) {
      logger.warn(
        'Note: Smashbot cannot malus floaty sand to gravel in a single kmail. Philter will convert the pebbles to gravel when you run it again.'
      );
    }
    if (canUseRock) {
      message += '\nrock';
    }

    logger.info('Sending pulverizables to: Smashbot');
    kmail({recipent: 'smashbot', message, items: itemsToSend});
    return true;
  }
}

/**
 * Checks if an item can be pulverized.
 */
function isPulverizable(it: Item): boolean {
  switch (it) {
    // Workaround for some items incorrectly marked as Pulverizable
    case Item.get('Eight Days a Week Pill Keeper'):
    case Item.get('Powerful Glove'):
    case Item.get('Guzzlr tablet'):
    case Item.get('Iunion Crown'):
    case Item.get('Cargo Cultist Shorts'):
    case Item.get('unwrapped knock-off retro superhero cape'):
      return true;
  }

  return Object.keys(getRelated(it, 'pulverize')).length > 0;
}

/**
 * Ppulverize and malus all items with the `PULV` action.
 * @param cleanupRules Cleanup rules to use
 * @param stockingRules Stocking rules to use
 * @param simulateOnly Whether to run a simulation or actually process the items
 * @return Whether the operation produced new items.
 *      Since pulverize & malus always produces new items, this is synonymous
 *      with "whether any items were pulverized/malused".
 */
export function cleanupPulverize(
  cleanupRules: ReadonlyCleanupRules,
  stockingRules: ReadonlyStockingRules,
  simulateOnly: boolean
): boolean {
  // TODO: When running a simulation, the results are often incorrect because
  // Philter does not predict the powders/nuggets/wads produced by each step.
  // We should print a warning about this.

  if (!haveSkill(Skill.get('Pulverize'))) {
    return sendToPulverizingBot(cleanupRules, stockingRules);
  }

  // Process all pulverizable items first, so that we can malus the
  // powders/nuggets/wads gained from pulverizing.

  const itemsToSmash = new Map<Item, number>();
  for (const [it, rule] of cleanupRules) {
    if (rule.action !== 'PULV') continue;
    if (!isPulverizable(it)) continue;

    const amount = ocd_amount(it, rule, stockingRules.get(it));
    if (amount < 1) continue;
    itemsToSmash.set(it, amount);
  }

  pulverize(itemsToSmash, simulateOnly);
  let hasProcessedAny = itemsToSmash.size > 0;

  // Malus all items, including those gained from pulverizing.
  if (
    haveSkill(Skill.get('Pulverize')) &&
    myPrimestat() === Stat.get('muscle')
  ) {
    if (malus(cleanupRules, stockingRules, simulateOnly)) {
      hasProcessedAny = true;
    }
  } else {
    if (sendToPulverizingBot(cleanupRules, stockingRules)) {
      hasProcessedAny = true;
    }
  }

  return hasProcessedAny;
}
