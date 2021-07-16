import {PhilterConfig} from '@philter/common/';
import {logger} from '@philter/common/kol';
import {autosell, autosellPrice} from 'kolmafia';
import * as assert from 'kolmafia-util/assert';
import {rnum} from 'zlib.ash';
import {splitItemsSorted} from '../util';
import {safeBatchItems} from './base';

function printAutosell(items: ReadonlyMap<Item, number>): number {
  const com = 'autosell ';

  let expectedProfitTotal = 0;

  for (const chunk of splitItemsSorted(items, 11)) {
    const messages: string[] = [];
    let lineValue = 0;

    for (const [it, quant] of chunk) {
      lineValue += quant * autosellPrice(it);
      messages.push(`${quant} ${it}`);
    }

    logger.info(com + messages.join(', '));
    logger.info(' ');
    expectedProfitTotal += lineValue;
  }

  logger.info(`Total autosale = ${rnum(expectedProfitTotal)}`);
  return expectedProfitTotal;
}

/**
 * Autosells `items` and return the amount of meat gained.
 * @param items Items to autosell
 * @param cleanupRules Cleanup rules
 * @return Expected profit
 */
export function cleanupAutosell(
  items: ReadonlyMap<Item, number>,
  config: Readonly<PhilterConfig>
): number {
  if (items.size === 0) return 0;

  const finalSale = printAutosell(items);
  if (config.simulateOnly) return finalSale;

  safeBatchItems(
    items,
    (it, quant) => {
      assert.ok(
        autosell(quant, it),
        `Failed to batch: autosell(${quant}, Item.get(\`${it}\`))`
      );
    },
    chunk => assert.fail(`Failed to autosell ${chunk.size} item(s)`)
  );

  return finalSale;
}
