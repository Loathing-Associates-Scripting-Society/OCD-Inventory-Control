import {CleanupRule} from '@philter/common';
import {
  toBoolean,
  cliExecute,
  getRelated,
  haveSkill,
  myPrimestat,
  toInt,
  canInteract,
  isOnline,
  isTradeable,
} from 'kolmafia';
import {vprint, getvar, kmail} from 'zlib.ash';
import {get_malus_order, split_items_sorted} from '../util';

/**
 * Process all malusable items with the `PULV` action.
 * This assumes that the player can use the Malus.
 * @param cleanupRules Cleanup ruleset to use
 * @return Whether any item was actually processed
 *      (i.e. whether any cleanup plans must be evaluated again)
 */
function malus(cleanupRules: Map<Item, CleanupRule>): boolean {
  let hasProcessedAny = false;

  // Process each malus order sequentially.
  // This allows us to process malus products that can be malused again,
  // e.g. powders -> nuggets -> wads.
  for (let malus_order = 1; malus_order <= 3; ++malus_order) {
    // Gather items to be malused
    const items_to_malus = new Map<Item, number>();
    for (const [it, rule] of cleanupRules) {
      if (rule.action !== 'PULV') continue;
      // This also filters out non-malusable items
      if (get_malus_order(it) !== malus_order) continue;

      let amount = ocd_amount(it, 'PULV', rule.keepAmount || 0);
      // The Malus always converts items in multiples of 5
      amount -= amount % 5;
      if (amount < 1) continue;
      items_to_malus.set(it, amount);
    }

    // Malus the gathered items
    for (const chunk of split_items_sorted(items_to_malus, 11)) {
      const tokens: string[] = [];
      const tokens_shown: string[] = [];
      for (const [it, amount] of chunk) {
        tokens.push(`${amount} \u00B6{it.to_int()}`);
        tokens_shown.push(`${amount} ${it.name}`);
      }

      vprint(`pulverize ${tokens_shown.join(', ')}`, _ocd_color_info(), 3);
      vprint(' ', 3);
      if (!toBoolean(getvar('BaleOCD_Sim'))) {
        cliExecute(`pulverize ${tokens.join(', ')}`);
      }
      hasProcessedAny = true;
    }
  }

  return hasProcessedAny;
}

/**
 * Sends all items with the `PULV` action to a pulverizing bot.
 *
 * Note: Multi-level malusing (i.e. converting powders directly to wads) is
 * not guaranteed to work. Because only 11 items can be sent per each kmail,
 * some malus products may not be processed.
 * @param ocd_rules OCD ruleset to use
 * @return Whether any item was actually sent
 */
function send_to_pulverizing_bot(
  ocd_rules: ReadonlyMap<Item, CleanupRule>
): boolean {
  const items_to_send = new Map<Item, number>();
  for (const [it, rule] of ocd_rules) {
    if (rule.action !== 'PULV') continue;
    if (!isTradeable(it)) {
      vprint(
        'send_to_pulverizing_bot(): Skipping {it} since it cannot be traded',
        _ocd_color_debug(),
        10
      );
      continue;
    }

    const amount = ocd_amount(it, 'PULV', rule.keepAmount || 0);
    // Note: Always send malusable items even if the quantity is not a
    // multiple of 5.
    // For example, we should be able to send 5 powders and 4 nuggets,
    // so that the bot can combine them into 1 wad.
    if (amount < 1) continue;
    items_to_send.set(it, amount);
  }

  if (items_to_send.size === 0) {
    vprint('Nothing to pulverize after all.', _ocd_color_info(), 3);
    return false;
  }

  if (!canInteract()) {
    // Because Smashbot cannot return items to characters in
    // Ronin/Hardcore, any items
    vprint(
      'You cannot send items to Smashbot while in Ronin/Hardcore.',
      _ocd_color_info(),
      -3
    );
    return false;
  } else if (!isOnline('smashbot')) {
    vprint(
      'Smashbot is offline! Pulverizables will not be sent at this time, just in case.',
      _ocd_color_warning(),
      -3
    );
    return false;
  } else {
    // Smashbot supports fine-grained malus control through the
    // "goose_level" command.
    // TODO: Find out if Smashbot supports floaty sand/pebbles/gravel
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
    let goose_level = 0;
    for (const [it, it_goose_level] of ITEM_GOOSE_LEVELS) {
      if (items_to_send.has(it)) {
        goose_level |= it_goose_level;
      }
    }
    let message = `goose_level ${goose_level}`;

    // Smashbot supports a single command ("rock" to malus all the way
    // up to floaty rock) for multi-malusing floaty items.
    // Since this is not sophisticated enough for all our needs,
    // we should identify and warn about cases where neither "rock" nor
    // the default behavior (no "rock") would satisfy our requirements.
    let can_use_rock = false;
    let should_warn_rerun = false;
    if (
      items_to_send.has(Item.get('floaty sand')) &&
      ocd_rules.get(Item.get('floaty pebbles'))?.action === 'PULV'
    ) {
      // Default behavior:
      //  sand -> pebbles (stop)
      // With "rock":
      //  sand -> pebbles -> gravel -> rock
      if (ocd_rules.get(Item.get('floaty gravel'))?.action === 'PULV') {
        can_use_rock = true;
      } else {
        should_warn_rerun = true;
      }
    } else if (
      items_to_send.has(Item.get('floaty pebbles')) &&
      ocd_rules.get(Item.get('floaty gravel'))?.action === 'PULV'
    ) {
      // Default behavior:
      //  pebbles -> gravel (stop)
      // With "rock":
      //  pebbles -> gravel -> rock
      can_use_rock = true;
    }

    if (should_warn_rerun) {
      vprint(
        'Note: Smashbot cannot malus floaty sand to gravel in a single kmail. Philter will convert the pebbles to gravel when you run it again.',
        _ocd_color_warning(),
        3
      );
    }
    if (can_use_rock) {
      message += '\nrock';
    }

    vprint('Sending pulverizables to: Smashbot', _ocd_color_info(), 3);
    kmail('smashbot', message, 0, items_to_send);
    return true;
  }
}

/**
 * Checks if an item can be pulverized.
 */
function is_pulverizable(it: Item): boolean {
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
 * Checks if the current player can use the Malus.
 */
function can_use_malus(): boolean {
  return (
    haveSkill(Skill.get('Pulverize')) && myPrimestat() === Stat.get('muscle')
  );
}

/**
 * Ppulverize and malus all items with the `PULV` action.
 * @param ocd_rules OCD ruleset to use
 * @return Whether any item was actually processed
 *      (i.e. whether any OCD plans must be evaluated again)
 */
export function act_pulverize(ocd_rules: Map<Item, CleanupRule>): boolean {
  if (!haveSkill(Skill.get('Pulverize'))) {
    return send_to_pulverizing_bot(ocd_rules);
  }

  let has_processed_any = false;

  // Process all pulverizable items first, so that we can malus the
  // powders/nuggets/wads gained from pulverizing.

  const items_to_smash = new Map<Item, number>();
  for (const [it, rule] of ocd_rules) {
    if (rule.action !== 'PULV') continue;
    if (!is_pulverizable(it)) continue;

    const amount = ocd_amount(it, 'PULV', rule.q);
    if (amount < 1) continue;
    items_to_smash.set(it, amount);
  }

  for (const chunk of split_items_sorted(items_to_smash, 11)) {
    const tokens: string[] = [];
    const tokens_shown: string[] = [];

    for (const [item, amount] of chunk) {
      tokens.push(`${amount} \u00B6${toInt(item)}`);
      tokens_shown.push(`${amount} ${item.name}`);
    }

    vprint(`pulverize ${tokens_shown.join(', ')}`, _ocd_color_info(), 3);
    vprint(' ', 3);
    if (!toBoolean(getvar('BaleOCD_Sim'))) {
      cliExecute(`pulverize ${tokens.join(', ')}`);
    }

    has_processed_any = true;
  }

  // Malus all items, including those gained from pulverizing.
  if (can_use_malus()) {
    if (malus(ocd_rules)) has_processed_any = true;
  } else {
    if (send_to_pulverizing_bot(ocd_rules)) has_processed_any = true;
  }

  return has_processed_any;
}
