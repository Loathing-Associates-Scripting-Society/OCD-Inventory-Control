/**
 * @file Utility functions for writing E2E tests.
 */

import {toItemMap} from '@philter/common/kol';
import {
  displayAmount,
  getCloset,
  getInventory,
  getShop,
  getStash,
  print,
  visitUrl,
  xpath,
} from 'kolmafia';

/**
 * Prints an error message to the gCLI.
 * @param message Message to print
 */
export function error(message: string) {
  print(message, 'red');
}

/**
 * If `condition` is falsy, throws `AssertionError`, optionally using the given
 * error message.
 * @param condition Condition to check
 * @param error Error message
 * @throws {AssertionError} If `condition` is falsy
 */
export function assert(condition: unknown, message?: string): asserts condition;

/**
 * If `condition` is falsy, throws `error`.
 * @param condition Condition to check
 * @param error Error object to throw
 * @throws {E} If `condition` is falsy
 */
export function assert<E extends Error>(
  condition: unknown,
  error: E
): asserts condition;

export function assert(
  condition: unknown,
  error: string | Error = 'Assertion failure'
) {
  if (!condition) {
    throw error instanceof Error ? error : new AssertionError(error);
  }
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AssertionError.prototype);
  }
}
AssertionError.prototype.name = 'AssertionError';

/**
 * Snapshot of the player's inventory at a specific point in time.
 */
export interface InventoryState {
  inventory: ReadonlyMap<Item, number>;
  closet: ReadonlyMap<Item, number>;
  display: ReadonlyMap<Item, number>;
  /**
   * Items in your shop.
   *
   * Note: This may be inaccurate, since another player may have purchased items
   * in your store after the inventory state was retrieved.
   */
  shop: ReadonlyMap<Item, number>;
  /**
   * Items in the clan stash.
   *
   * Note: This may be inaccurate, since other clan members may put or take
   * items at any time.
   */
  stash: ReadonlyMap<Item, number>;
}

/**
 * Capture the current inventory state for comparing later.
 */
export function captureInventoryState(): InventoryState {
  const inventory = toItemMap(getInventory());
  const closet = toItemMap(getCloset());
  const stash = toItemMap(getStash());
  const shop = toItemMap(getShop());

  // We don't have a getDisplay() function, so manually build the map
  const display = new Map(
    Item.all()
      .filter(item => displayAmount(item) > 0)
      .map(item => [item, displayAmount(item)])
  );

  return {inventory, closet, display, shop, stash};
}

/**
 * Interface for kmail entries parsed from `messages.php`
 */
export interface KolKmail {
  /** Integer ID of the recipent player. */
  recipentId: number;
  /** Username of the recipent player. */
  recipentName: string;
  /**
   * Time of the message. Uses the format `MM/DD/YY HH:MM:SS`.
   *
   * Note: This uses the timezone configured for your KoL account, which may be
   * different to your local timezone (i.e. `Date.now()`)
   * @example "02/08/21 23:10:18"
   */
  localTime: string;
  /**
   * Unix timestamp of the message in local time, measured in milliseconds.
   * Note that this is based on `localTime` and is accurate to the second.
   *
   * Note: This uses the timezone configured for your KoL account, which may be
   * different to your local timezone (i.e. `Date.now()`)
   */
  localTimestamp: number;
  /** HTML content of the message */
  message: string;
}

/**
 * Parses kmail from the HTML of the page (`messages.php`).
 * @param page HTML content of `messages.php`
 * @return Array of parsed kmail entries
 */
function parseKmailPage(page: string): KolKmail[] {
  const cells = xpath(page, '//table//table//table//td[//blockquote]');

  return cells.map(cell => {
    const recipentMatch =
      /<a href="showplayer\.php\?who=(\d+)">(.+?)<\/a>/.exec(cell);
    assert(recipentMatch, `Failed to match recipent pattern in kmail: ${cell}`);
    const recipentId = Number(recipentMatch[1]);
    const recipentName = recipentMatch[2];

    const localTimeMatch =
      /<!--((\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+))-->/.exec(cell);
    assert(localTimeMatch, `Failed to match time pattern in kmail: ${cell}`);
    const [, localTime, mm, dd, yy, hourStr, minuteStr, secondStr] =
      localTimeMatch;
    const localTimestamp = new Date(
      2000 + Number(yy),
      Number(mm) - 1,
      Number(dd),
      Number(hourStr),
      Number(minuteStr),
      Number(secondStr)
    ).getTime();

    const messageMatch = /<blockquote>(.*)<\/blockquote>/.exec(cell);
    assert(messageMatch, `Failed to match message body in kmail: ${cell}`);
    const message = messageMatch[1];

    return {
      recipentId,
      recipentName,
      localTime,
      localTimestamp,
      message,
    };
  });
}

/**
 * Loads all of your kmail messages from your _outbox_.
 */
export function loadOutboxKmail(): KolKmail[] {
  // Curiously, KoL uses "10" to mean "100 per page", "5" to "50 per page", etc.
  const page = visitUrl('messages.php?box=Outbox&per_page=10');
  const kmails = parseKmailPage(page);

  // Parse additional pages
  for (const anchor of xpath(page, '//table//table//table//td[1]//a')) {
    const urlMatch = /href="(messages\.php\?.*)"/.exec(anchor);
    if (urlMatch) {
      const url = urlMatch[1];
      if (url.includes('begin=')) {
        kmails.push(...parseKmailPage(visitUrl(url)));
      }
    }
  }

  return kmails;
}
