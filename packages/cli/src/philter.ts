import {CleanupAction, PhilterConfig} from '@philter/common';
import {
  loadCleanupRulesetFile,
  loadStockingRulesetFile,
  logger,
  ReadonlyCleanupRules,
} from '@philter/common/kol';
import {
  cliExecute,
  emptyCloset,
  getProperty,
  itemAmount,
  myAscensions,
  myName,
  print,
  printHtml,
  toBoolean,
  toInt,
  toItem,
  visitUrl,
} from 'kolmafia';
import {sendToPlayer, withProperties} from 'kolmafia-util';
import * as assert from 'kolmafia-util/assert';
import {getvar} from 'zlib.ash';
import {cleanupAutosell} from './cleanup/autosell';
import {cleanupMoveToCloset} from './cleanup/closet';
import {cleanupMoveToDisplayCase} from './cleanup/display';
import {makeItemForCleanup} from './cleanup/make';
import {cleanupMallsell} from './cleanup/mall';
import {cleanupPulverize} from './cleanup/pulverize';
import {cleanupMoveToClanStash} from './cleanup/stash';
import {cleanupUseItems} from './cleanup/use';
import {CleanupPlan, CleanupPlanner} from './planner';
import {stock} from './stocking';
import {splitItemsSorted} from './util';

/**
 * Loads cleanup rules from the player's cleanup ruleset file into a map.
 * This will look for a ruleset file whose name is given by `dataFileName`.
 * If this fails, it uses the current player's name as a fallback.
 * @param dataFileName Full name of data file including file extension
 * @return The loaded and combined cleanup ruleset
 */
function loadCurrentCleanupRules(dataFileName: string) {
  const cleanupRules =
    loadCleanupRulesetFile(dataFileName) ||
    loadCleanupRulesetFile(`OCD_${myName()}_Data.txt`);
  if (!cleanupRules) {
    throw new Error('Something went wrong trying to load OCDdata!');
  }

  if (cleanupRules.size === 0) {
    throw new Error(
      "All item information is corrupted or missing. Whoooah! I hope you didn't lose any data..."
    );
  }
  return cleanupRules;
}

function getRepresentativeGiftRule(
  items: Iterable<Item>,
  cleanupRules: ReadonlyCleanupRules
) {
  for (const key of items) {
    const rule = cleanupRules.get(key);
    assert.ok(rule, `${key} does not have associated cleanup rule`);
    assert.ok(
      rule.action === 'GIFT',
      `${key} is not associated with a GIFT action (got '${rule.action}')`
    );
    return rule;
  }
  // This should never happen in practice
  assert.fail('No item with GIFT rule found');
}

function printCat(
  cat: ReadonlyMap<Item, number>,
  cleanupRules: ReadonlyCleanupRules
) {
  // Ensure that `cat` is not empty
  assert.isAbove(cat.size, 0, "'cat' is empty, wtf");

  const firstItem = cat.keys().next().value;
  assert.ok(firstItem, "'cat' is empty, wtf");

  // This is a representative rule
  const rule = cleanupRules.get(firstItem);
  assert.ok(rule, 'wtfwtfwtf');

  assert.ok(
    rule.action !== 'AUTO' &&
      rule.action !== 'CLAN' &&
      rule.action !== 'CLST' &&
      rule.action !== 'DISP' &&
      rule.action !== 'KEEP' &&
      rule.action !== 'MALL' &&
      rule.action !== 'PULV' &&
      rule.action !== 'TODO' &&
      rule.action !== 'USE',
    `printCat() cannot process action "${rule.action}"`
  );

  let com = {
    BREAK: 'break apart ',
    MAKE: 'transform ',
    UNTN: 'untinker ',
    DISC: 'discard ',
    GIFT: 'send gift to ',
  }[rule.action];
  if (rule.action === 'GIFT') com += `${rule.recipent}: `;

  // TODO: Move this check to planning stage
  const items = new Map(
    Array.from(cat).filter(
      ([it]) =>
        !(
          it === Item.get('Degrassi Knoll shopping list') &&
          itemAmount(Item.get("bitchin' meatcar")) === 0
        )
    )
  );

  for (const chunk of splitItemsSorted(items, 11)) {
    const messages: string[] = [];

    for (const [it, quant] of chunk) {
      let msg = `${quant} ${it}`;
      const rule = cleanupRules.get(it);
      assert.ok(rule, `Missing cleanup rule for ${it}`);
      assert.ok(
        rule.action !== 'AUTO' &&
          rule.action !== 'CLAN' &&
          rule.action !== 'CLST' &&
          rule.action !== 'DISP' &&
          rule.action !== 'KEEP' &&
          rule.action !== 'MALL' &&
          rule.action !== 'PULV' &&
          rule.action !== 'TODO' &&
          rule.action !== 'USE',
        `printCat() cannot process action "${rule.action}" for item ${it}`
      );

      if (rule.action === 'MAKE') {
        msg += ` into ${rule.targetItem}`;
      }

      messages.push(msg);
    }

    logger.info(com + messages.join(', '));
    logger.info(' ');
  }
}

/**
 * Process a collection of items using a given action.
 * @param cat Collection of items and their amounts to be processed
 * @param act Item action ID
 * @param plan OCD execution plan being used
 * @param ocd_rules Map containing OCD rules
 * @return Whether to replan
 */
function actCat(
  cat: ReadonlyMap<Item, number>,
  act: Exclude<
    CleanupAction,
    'AUTO' | 'CLAN' | 'CLST' | 'DISP' | 'MALL' | 'PULV' | 'USE'
  >,
  plan: CleanupPlan,
  cleanupRules: ReadonlyCleanupRules,
  config: Readonly<PhilterConfig>
): boolean {
  const catOrder = new Map(
    Array.from(cat).sort(([itemA], [itemB]) =>
      itemA.name.localeCompare(itemB.name)
    )
  );

  if (cat.size === 0) return false;

  if (act === 'TODO' && cat.size > 0) {
    print('');
  } else {
    printCat(cat, cleanupRules);
  }
  if (config.simulateOnly) return true;

  switch (act) {
    case 'GIFT': {
      const giftRule = getRepresentativeGiftRule(cat.keys(), cleanupRules);
      sendToPlayer({
        recipent: giftRule.recipent,
        message: giftRule.message,
        items: cat,
        insideNote: giftRule.message,
      });
    }
  }

  for (const [it, quant] of catOrder) {
    const rule = cleanupRules.get(it);
    assert.ok(rule);

    switch (rule.action) {
      case 'BREAK':
        for (let i = 1; i <= quant; ++i)
          visitUrl(
            `inventory.php?action=breakbricko&pwd&ajax=1&whichitem=${toInt(it)}`
          );
        break;
      case 'DISC':
        for (let i = 1; i <= quant; ++i) {
          if (i % 10 === 0) {
            print(`Discarding ${i} of ${quant}...`);
          }
          visitUrl(
            `inventory.php?action=discard&pwd&ajax=1&whichitem=${toInt(it)}`
          );
        }
        break;
      case 'MAKE': {
        makeItemForCleanup(
          it,
          toItem(rule.targetItem),
          quant,
          plan.make_q.get(it)!
        );
        break;
      }
      case 'UNTN':
        cliExecute(`untinker ${quant} \u00B6${toInt(it)}`);
        break;
      case 'TODO':
        printHtml(`<b>${it} (${quant}): ${rule.message}</b>`);
        break;
      case 'AUTO':
      case 'CLAN':
      case 'CLST':
      case 'DISP':
      case 'MALL':
      case 'PULV':
      case 'USE':
        assert.fail(
          `actCat() should never be handling action ${rule.action} for item ${it}`
        );
    }
  }

  return true;
}

function doPhilter(config: Readonly<PhilterConfig>): {
  success: boolean;
  finalSale: number;
} {
  let finalSale = 0;

  const cleanupRules = loadCurrentCleanupRules(
    `OCDdata_${config.dataFileName}.txt`
  );
  if (!cleanupRules) return {success: false, finalSale};

  let stockingRules = loadStockingRulesetFile(
    `OCDstock_${config.stockFileName}.txt`
  );
  if (!stockingRules) {
    if (getvar('BaleOCD_Stock') === '1') {
      logger.error('You are missing item stocking information.');
      return {success: false, finalSale};
    }
    stockingRules = new Map();
  }

  const planner = new CleanupPlanner();

  let plan = planner.makePlan(cleanupRules, stockingRules);
  if (!plan) return {success: false, finalSale};

  // Actions that may create additional items, or remove items not
  // included in the execution plan. If actCat() returns true after
  // executing such actions, the entire execution plan must be regenerated
  // to handle such items correctly.
  if (actCat(plan.brak, 'BREAK', plan, cleanupRules, config)) {
    plan = planner.makePlan(cleanupRules, stockingRules);
    if (!plan) return {success: false, finalSale};
  }
  if (actCat(plan.make, 'MAKE', plan, cleanupRules, config)) {
    plan = planner.makePlan(cleanupRules, stockingRules);
    if (!plan) return {success: false, finalSale};
  }
  if (actCat(plan.untink, 'UNTN', plan, cleanupRules, config)) {
    plan = planner.makePlan(cleanupRules, stockingRules);
    if (!plan) return {success: false, finalSale};
  }
  if (cleanupUseItems(plan.usex, config)) {
    plan = planner.makePlan(cleanupRules, stockingRules);
    if (!plan) return {success: false, finalSale};
  }
  // Note: Since the next action (act_pulverize()) does its own planning,
  // the previous if-block does not need to call planner.make_plan().
  // I'm only keeping it to make refactoring/reordering easier.
  if (cleanupPulverize(cleanupRules, stockingRules, config.simulateOnly)) {
    plan = planner.makePlan(cleanupRules, stockingRules);
    if (!plan) return {success: false, finalSale};
  }

  // Actions that never create or remove additional items.
  // Currently, we do not bother to check the return value of actCat()
  // for them.
  finalSale += cleanupMallsell(plan.mall, cleanupRules, config);
  finalSale += cleanupAutosell(plan.auto, config);
  actCat(plan.disc, 'DISC', plan, cleanupRules, config);
  cleanupMoveToDisplayCase(plan.disp, config);
  cleanupMoveToCloset(plan.clst, config);
  cleanupMoveToClanStash(plan.clan, config);
  for (const items of plan.gift.values()) {
    actCat(items, 'GIFT', plan, cleanupRules, config);
  }

  if (getvar('BaleOCD_Stock') === '1' && !config.simulateOnly) {
    stock(stockingRules, cleanupRules);
  }

  actCat(plan.todo, 'TODO', plan, cleanupRules, config);

  if (config.simulateOnly) {
    logger.success(
      'This was only a test. Had this been an actual OCD incident your inventory would be clean right now.'
    );
  }

  return {success: true, finalSale};
}

/**
 * Executes cleanup and stocking routines.
 * @param config Config object to use
 * @return Total (expected) meat gain from cleanup
 */
export function philter(config: Readonly<PhilterConfig>): number {
  cliExecute('inventory refresh');

  // Empty closet before emptying out Hangks, otherwise it may interfere with
  // which Hangk's items go to closet
  if (
    config.emptyClosetMode >= 0 &&
    Number(getProperty('lastEmptiedStorage')) !== myAscensions() &&
    !config.simulateOnly
  ) {
    emptyCloset();
  }

  // Empty out Hangks, so it can be accounted for by what follows.
  if (
    toBoolean(getProperty('autoSatisfyWithStorage')) &&
    Number(getProperty('lastEmptiedStorage')) !== myAscensions()
  ) {
    visitUrl('storage.php?action=pullall&pwd');
  }

  return withProperties(
    {
      autoSatisfyWithCloset: 'false',
      autoSatisfyWithStash: 'false',
      autoSatisfyWithStorage: 'false',
    },
    () => {
      const {success, finalSale} = doPhilter(config);
      return success ? finalSale : -1;
    }
  );
}
