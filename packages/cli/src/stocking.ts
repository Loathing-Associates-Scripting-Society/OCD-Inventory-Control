import {
  logger,
  ReadonlyCleanupRules,
  ReadonlyStockingRules,
} from '@philter/common/kol';
import {
  availableAmount,
  batchClose,
  batchOpen,
  cliExecute,
  closetAmount,
  equippedAmount,
  itemAmount,
  putCloset,
  retrieveItem,
  storageAmount,
  toSlot,
} from 'kolmafia';
import {fullAmount} from './util';

const TEN_LEAF_CLOVER = Item.get('ten-leaf clover');
const DISASSEMBLED_CLOVER = Item.get('disassembled clover');

// This is only called if the player has both kinds of clovers, so no need to check if stock contains both
function cloversNeeded(stockingRules: ReadonlyStockingRules) {
  return (
    (stockingRules.get(TEN_LEAF_CLOVER)?.amount || 0) +
    (stockingRules.get(DISASSEMBLED_CLOVER)?.amount || 0) -
    fullAmount(TEN_LEAF_CLOVER) -
    fullAmount(DISASSEMBLED_CLOVER)
  );
}

/**
 * Returns the alternate form of a ten-leaf clover or disassembled clover.
 * @param it ten-leaf clover or disassembled clover
 * @return
 */
function otherClover(it: Item) {
  return it === TEN_LEAF_CLOVER ? DISASSEMBLED_CLOVER : TEN_LEAF_CLOVER;
}

class Stocker {
  isFirst = true;

  stockit(q: number, it: Item): boolean {
    q = q - closetAmount(it) - storageAmount(it) - equippedAmount(it);
    if (q < 1) return true;
    if (this.isFirst) {
      logger.info('Stocking up on required items!');
      this.isFirst = false;
    }
    return retrieveItem(q, it);
  }
}

/**
 * Stocks up on items based on the stock rules.
 * @param ocd_rules OCD ruleset to use
 * @return Whether all items were stocked successfully
 */
export function stock(
  stockingRules: ReadonlyStockingRules,
  cleanupRules: ReadonlyCleanupRules
): boolean {
  let success = true;
  const stocker = new Stocker();

  batchOpen();
  for (const [it, stockingRule] of stockingRules) {
    // Someone might want both assembled and disassembled clovers. Esure there are enough of combined tot
    if (
      (TEN_LEAF_CLOVER === it || DISASSEMBLED_CLOVER === it) &&
      stockingRules.has(otherClover(it))
    ) {
      const cloversNeededAmount = cloversNeeded(stockingRules);
      if (cloversNeededAmount > 0) {
        cliExecute(
          `cheapest ten-leaf clover, disassembled clover; acquire ${
            cloversNeededAmount - availableAmount(it)
          } ${it}`
        );
      }
    }
    if (
      fullAmount(it) < stockingRule.amount &&
      !stocker.stockit(stockingRule.amount, it)
    ) {
      success = false;
      logger.error(
        `Failed to stock ${
          stockingRule.amount > 1
            ? `${stockingRule.amount} ${it.plural}`
            : `a ${it}`
        }`
      );
    }
    // Closet everything (except for gear) that is stocked so it won't get accidentally used.
    const keepAmount = cleanupRules.get(it)?.keepAmount || 0;
    if (
      toSlot(it) === Slot.get('none') &&
      stockingRule.amount - keepAmount > closetAmount(it) &&
      itemAmount(it) > keepAmount
    )
      putCloset(
        Math.min(
          itemAmount(it) - keepAmount,
          stockingRule.amount - keepAmount - closetAmount(it)
        ),
        it
      );
  }
  batchClose();
  return success;
}
