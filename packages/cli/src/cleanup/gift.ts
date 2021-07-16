import {PhilterConfig} from '@philter/common';

/**
 * Sends items to other players for cleanup.
 * @param giftItems Maps each recipent to items to send
 * @param config Configuration object
 * @return Whether to replan
 */
export function cleanupSendGifts(
  giftItems: ReadonlyMap<string, ReadonlyMap<Item, number>>,
  config: Readonly<PhilterConfig>
) {}
