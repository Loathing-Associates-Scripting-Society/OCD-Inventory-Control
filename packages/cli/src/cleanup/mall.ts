import {PhilterConfig} from '@philter/common';
import {logger, ReadonlyCleanupRules} from '@philter/common/kol';
import {
  historicalAge,
  historicalPrice,
  mallPrice,
  print,
  putShop,
  userConfirm,
} from 'kolmafia';
import {sendToPlayer} from 'kolmafia-util';
import * as assert from 'kolmafia-util/assert';
import {rnum} from 'zlib.ash';
import {splitItemsSorted} from '../util';
import {safeBatchItems} from './base';

function shouldUseMulti(config: Readonly<PhilterConfig>) {
  return config.mallMultiName !== '' && config.canUseMallMulti;
}

/**
 * Computes an appropriate selling price for an item at the mall, based on its
 * current (or historical) mall price.
 * @param it Item to check
 * @param minPrice Minimum price
 * @return Appropriate selling price for the item, or zero if the item is not
 *		available in the mall.
 *		The returned price is guaranteed to be at least 0.
 */
function salePrice(it: Item, minPrice: number): number {
  const price =
    historicalAge(it) < 1 && historicalPrice(it) > 0
      ? historicalPrice(it)
      : mallPrice(it);
  return Math.max(minPrice, price, 0);
}

function printMallAndMakePriceCache(
  items: ReadonlyMap<Item, number>,
  cleanupRules: ReadonlyCleanupRules,
  config: Readonly<PhilterConfig>
) {
  const com = shouldUseMulti(config)
    ? `send to mallmulti '${config.mallMultiName}': `
    : 'mallsell ';

  let finalSale = 0;
  const priceCache = new Map<Item, number>();

  for (const chunk of splitItemsSorted(items, 11)) {
    const messages: string[] = [];
    let lineValue = 0;

    for (const [it, quant] of chunk) {
      let msg = `${quant} ${it}`;

      // If BaleOCD_MallDangerously is set, we may be mallselling items that do
      // not have a rule. If so, we must choose sensible defaults.
      const rule = cleanupRules.get(it);
      if (rule) {
        assert.ok(
          rule.action === 'MALL',
          `Unexpected cleanup action for ${it}: Expected 'MALL' but got '${rule.action}'`
        );
      }

      if (!shouldUseMulti(config)) {
        // If mall pricing mode is 'max', make putShop() use existing price or
        // mall max price (999,999,999 meat)
        let price = 0;
        if (config.mallPricingMode === 'auto') {
          price = salePrice(it, rule ? rule.minPrice : 0);
          msg += ` @ ${rnum(price)}`;
        }
        priceCache.set(it, price);
        lineValue += quant * price;
      }

      messages.push(msg);
    }

    logger.info(com + messages.join(', '));
    // TODO: Don't print line value when sending to mall multi
    logger.info(`Sale price for this line: ${rnum(lineValue)}`);
    logger.info(' ');
    finalSale += lineValue;
  }

  if (!shouldUseMulti(config)) {
    logger.info(`Total mall sale = ${rnum(finalSale)}`);
  }

  return [finalSale, priceCache] as const;
}

function sendToMallMulti(
  items: ReadonlyMap<Item, number>,
  mallMultiName: string,
  message: string
) {
  // Some users have reported Philter occasionally sending items to an account
  // named "False". While the exact cause is unknown, this should serve as a
  // stopgap measure.
  if (mallMultiName === '' || mallMultiName.toLowerCase() === 'false') {
    logger.error(
      `Invalid mall multi account ID ("${mallMultiName}"). Please report the issue at https://kolmafia.us/`
    );
    const timeout = 30;
    const warningMessage =
      `Philter has detected that it is about to send items to a mall multi account named "${mallMultiName}". ` +
      'Since this is likely an error, Philter will NOT send the items.\n\n' +
      'Do you want to abort Philter immediately?\n' +
      `(If you choose "No" or wait ${timeout} seconds, Philter will skip the MALL action and continue.)`;
    // If the user disables userConfirm() -- possibly because they are calling
    // Philter from an auto-adventuring script -- it will always return false.
    // In this case, we will continue processing instead of aborting (which
    // would otherwise be disruptive).
    if (userConfirm(warningMessage, timeout * 1000, false)) {
      throw new Error('You decided to abort Philter.');
    }
    print('Philter has skipped the MALL action.');
  } else {
    sendToPlayer({
      recipent: mallMultiName,
      message,
      items,
    });
  }
}

/**
 * Mallsells `items` or sends them to a mall multi.
 * @param items Items to mallsell
 * @param cleanupRules Cleanup rules
 * @return Expected profit from mallselling.
 *    If all items are sent to a mall multi, returns 0 instead.
 */
export function cleanupMallsell(
  items: ReadonlyMap<Item, number>,
  cleanupRules: ReadonlyCleanupRules,
  config: Readonly<PhilterConfig>
): number {
  if (items.size === 0) return 0;

  const [finalSale, priceCache] = printMallAndMakePriceCache(
    items,
    cleanupRules,
    config
  );
  if (config.simulateOnly) return finalSale;

  if (shouldUseMulti(config)) {
    sendToMallMulti(items, config.mallMultiName, config.mallMultiKmailMessage);
    return finalSale;
  }

  safeBatchItems(
    items,
    (it, quant) => {
      const cachedPrice = priceCache.get(it);
      assert.ok(cachedPrice !== undefined, `Price for ${it} is not cached`);
      assert.ok(
        putShop(cachedPrice, 0, quant, it),
        `Failed to batch: putShop(${cachedPrice}, 0, ${quant}, Item.get(\`${it}\`))`
      );
    },
    chunk => assert.fail(`Failed to put ${chunk.size} item(s) in shop`)
  );

  return finalSale;
}
