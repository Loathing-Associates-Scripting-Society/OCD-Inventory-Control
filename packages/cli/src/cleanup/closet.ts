import {PhilterConfig} from '@philter/common';
import {putCloset} from 'kolmafia';
import * as assert from 'kolmafia-util/assert';
import {cleanupBatchExecute} from './base';

/**
 * Moves items into the closet.
 * @param items Items to move
 * @param config Configuration object
 * @return Expected profit, which is always zero
 */
export function cleanupMoveToCloset(
  items: ReadonlyMap<Item, number>,
  config: Readonly<PhilterConfig>
) {
  return cleanupBatchExecute({
    items,
    config,
    commandPrefix: 'closet',
    process: (it, quant) => {
      assert.ok(
        putCloset(quant, it),
        `Failed to batch: putCloset(${quant}, Item.get(\`${it}\`))`
      );
    },
    onBatchError: chunk =>
      assert.fail(`Failed to put ${chunk.size} item(s) in closet`),
  });
}
