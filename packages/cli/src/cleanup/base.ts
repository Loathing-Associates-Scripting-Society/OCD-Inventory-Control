import {PhilterConfig} from '@philter/common';
import {logger} from '@philter/common/kol';
import {batchClose, batchOpen, itemAmount} from 'kolmafia';
import {grouper, splitItemsSorted} from '../util';

/**
 * Splits `items` into large chunks and processes each item with `process()`.
 * This calls `batchOpen()` and `batchClose()` to batch process each chunk.
 * @param item Items to split
 * @param process Callback to run for each item and value
 * @param onBatchError Callback to run if `batchClose()` fails, must throw an
 *    exception
 * @return Return value of `callback()`
 */
export function safeBatchItems<T>(
  items: ReadonlyMap<Item, T>,
  process: (item: Item, value: T) => void,
  onBatchError: (chunk: Map<Item, T>) => never
): void {
  // If there are too many items batched, KoLmafia may run out of memory.
  // On poor systems, this usually happens around 20 transfers.
  // We choose a safe number of 15.
  // TODO: Investigate if this still happens
  for (const chunk of splitItemsSorted(items, 15 * 11)) {
    batchOpen();
    for (const [item, quantity] of chunk) {
      process(item, quantity);
    }
    if (!batchClose()) {
      onBatchError(chunk);
      // @ts-expect-error Fallback in case onBatchError() does not throw
      assert.fail(
        'batchClose() failed, but onBatchError() did not throw an exception'
      );
    }
  }
}

/**
 * Executes a simple cleanup operation on `items`.
 * @return `returnValueOnSuccess`, or `false` if `items` is empty.
 */
export function cleanupSimpleExecute({
  items,
  config,
  commandPrefix,
  process,
  valueOnSuccess,
}: {
  /** Items to mallsell */
  items: ReadonlyMap<Item, number>;
  /** Configuration object */
  config: Readonly<PhilterConfig>;
  /**
   * Prefix to use when printing the command for each line
   * (no need to insert a space character at the end)
   */
  commandPrefix: string;
  /** Callback used to process each item */
  process: (item: Item, amount: number) => void;
  /**
   * Value of `shouldReplan` to use.
   *
   * Note: If `items` is empty, this value is ignored and the function always
   * uses `false`.
   */
  valueOnSuccess: boolean;
}): boolean {
  if (items.size === 0) return false;

  const sortedItems = new Map(
    Array.from(items).sort(([itemA], [itemB]) =>
      itemA.name.localeCompare(itemB.name)
    )
  );

  // TODO: Move this check to planning stage
  // (this should be checked only for the 'USE' action)
  if (itemAmount(Item.get("bitchin' meatcar")) === 0) {
    sortedItems.delete(Item.get('Degrassi Knoll shopping list'));
  }

  for (const chunk of grouper(sortedItems, 11)) {
    const messages: string[] = [];
    for (const [it, quant] of chunk) {
      messages.push(`${quant} ${it}`);
    }
    logger.info(`${commandPrefix} ${messages.join(', ')}`);
    logger.info(' ');
  }

  // TODO: Not sure why we force replanning when we're simulating only;
  // perhaps we could change this?
  if (config.simulateOnly) return false;

  for (const [it, quant] of sortedItems) {
    process(it, quant);
  }

  return valueOnSuccess;
}

/**
 * Executes a batch cleanup operation on `items`.
 * @return Expected profit
 */
export function cleanupBatchExecute({
  items,
  config,
  commandPrefix,
  process,
  onBatchError,
}: {
  /** Items to mallsell */
  items: ReadonlyMap<Item, number>;
  /** Configuration object */
  config: Readonly<PhilterConfig>;
  /**
   * Prefix to use when printing the command for each line
   * (no need to insert a space character at the end)
   */
  commandPrefix: string;
  /** Callback used to process each item */
  process: (item: Item, amount: number) => void;
  /** Called when `batchClose()` fails, must throw an exception */
  onBatchError: (chunk: Map<Item, number>) => never;
}) {
  if (items.size === 0) return;

  for (const chunk of splitItemsSorted(items, 11)) {
    const messages: string[] = [];

    for (const [it, quant] of chunk) {
      messages.push(`${quant} ${it}`);
    }

    logger.info(`${commandPrefix} ${messages.join(', ')}`);
    logger.info(' ');
  }

  if (config.simulateOnly) return;

  safeBatchItems(items, process, onBatchError);
}
