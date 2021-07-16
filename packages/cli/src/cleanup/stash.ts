import {PhilterConfig} from '@philter/common';
import {putStash} from 'kolmafia';
import * as assert from 'kolmafia-util/assert';
import {cleanupBatchExecute} from './base';

/**
 * Moves items into the clan stash.
 * @param items Items to move
 * @param config Configuration object
 * @return Expected profit, which is always zero
 */
export function cleanupMoveToClanStash(
  items: ReadonlyMap<Item, number>,
  config: Readonly<PhilterConfig>
) {
  return cleanupBatchExecute({
    items,
    config,
    commandPrefix: 'stash put',
    process: (it, quant) => {
      assert.ok(
        putStash(quant, it),
        `Failed to batch: putStash(${quant}, Item.get(\`${it}\`))`
      );
    },
    onBatchError: chunk =>
      assert.fail(`Failed to put ${chunk.size} item(s) in clan stash`),
  });
}
