import {PhilterConfig} from '@philter/common';
import {putDisplay} from 'kolmafia';
import * as assert from 'kolmafia-util/assert';
import {cleanupBatchExecute} from './base';

/**
 * Moves items into the display case.
 * @param items Items to move
 * @param config Configuration object
 * @return Expected profit, which is always zero
 */
export function cleanupMoveToDisplayCase(
  items: ReadonlyMap<Item, number>,
  config: Readonly<PhilterConfig>
) {
  return cleanupBatchExecute({
    items,
    config,
    commandPrefix: 'display',
    process: (it, quant) => {
      assert.ok(
        putDisplay(quant, it),
        `Failed to batch: putDisplay(${quant}, Item.get(\`${it}\`))`
      );
    },
    onBatchError: chunk =>
      assert.fail(`Failed to put ${chunk.size} item(s) in display case`),
  });
}
