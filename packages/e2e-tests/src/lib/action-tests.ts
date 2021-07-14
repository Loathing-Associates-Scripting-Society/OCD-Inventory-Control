/**
 * @file Provides test case classes for each action type of OCD Cleanup.
 */

import {toItemMap} from '@philter/common/kol';
import {
  autosellPrice,
  canInteract,
  cliExecute,
  extractItems,
  getClanName,
  getIngredients,
  getProperty,
  haveDisplay,
  haveShop,
  haveSkill,
  isGiftable,
  itemAmount,
  knollAvailable,
  print,
  retrieveItem,
} from 'kolmafia';
import * as assert from 'kolmafia-util/assert';
import {getvar} from 'zlib.ash';
import {error, InventoryState, loadOutboxKmail} from './util';

/**
 * Interface for E2E test cases that verify a single action.
 * Each test is associated with a single Item.
 *
 * The lifecycle methods are called in this order:
 *
 * 1. `isRunnable()`
 * 2. `setup()`
 * 3. `generateConfigRows()`
 * 4. `verify()`
 * 5. `teardown()`
 */
export interface CleanupActionTest {
  /** Item to test this action with. */
  readonly item: Item;

  /**
   * Descriptive short name for this test case, for use in debugging.
   */
  readonly name: string;

  /**
   * If this method returns `false`, the test will be skipped.
   */
  isRunnable(): boolean;

  /**
   * Setup method for the test.
   */
  setup(): void;

  /**
   * Teardown method for the test.
   *
   * NOTE: This is called *after* `verify()`.
   */
  teardown?(): void;

  /**
   * Generates one or more entries for the OCD config file.
   */
  generateConfigRows(): Iterable<
    Readonly<{
      item: Item;
      action: string;
      keepAmount?: number;
      info?: string;
      message?: string;
    }>
  >;

  /**
   * Compares the inventory state before and after running the test.
   * If the `before` and `after` states do not satisfy the necessary conditions,
   * this method should throw an exception.
   *
   * NOTE: This is called *before* `teardown()`.
   */
  verify(before: InventoryState, after: InventoryState): void;
}

/**
 * Interface of tests for actions that support the "keep X of item" feature.
 */
export interface OcdActionTestWithKeep extends CleanupActionTest {
  readonly keepAmount: number;
}

/**
 * Verifies that the `before` and `after` states satisify the "keep X of item"
 * constraint specified by the given test case.
 */
function verifyKeepAmount(
  testCase: OcdActionTestWithKeep,
  before: InventoryState,
  after: InventoryState
) {
  const {item, keepAmount, name} = testCase;
  const beforeAmount = before.inventory.get(item) || 0;
  const beforeClosetAmount = before.closet.get(item) || 0;
  const afterAmount = after.inventory.get(item) || 0;

  // Philter considers any items in the closet to count toward against the
  // keepAmount limit
  const actualKeepAmount = Math.max(keepAmount - beforeClosetAmount, 0);
  const expectedAfterAmount = Math.min(beforeAmount, actualKeepAmount);

  assert.equal(
    afterAmount,
    expectedAfterAmount,
    `${name} action failed; expected ${expectedAfterAmount} of ${item} to remain, but have ${afterAmount}`
  );
}

/**
 * Test case that verifies the AUTO (autosell) action.
 */
export class AutosellTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'AUTO';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [{item: this.item, action: 'AUTO', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);
  }
}

/**
 * Test case that verifies the BREAK (break apart BRICKO item) action.
 */
export class BrickoBreakTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'BREAK';
  readonly keepAmount: number;

  /**
   * @param item Item to break apart for testing. This must be a BRICKO item
   *    that can be broken apart.
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  *generateConfigRows() {
    yield {item: this.item, action: 'BREAK', keepAmount: this.keepAmount};
    for (const itemName of Object.keys(getIngredients(this.item))) {
      // KEEP untinkered ingredients
      yield {item: Item.get(itemName), action: 'KEEP'};
    }
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    for (const itemName of Object.keys(getIngredients(this.item))) {
      const item = Item.get(itemName);
      const beforeAmount = before.inventory.get(item) || 0;
      const afterAmount = after.inventory.get(item) || 0;
      assert.isBelow(
        beforeAmount,
        afterAmount,
        `${this.name} action failed; amount of ingredient ${item} has not increased (${beforeAmount} >= ${afterAmount})`
      );
    }
  }
}

/**
 * Test case that verifies the CLST (closet) action.
 */
export class ClosetTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'CLST';
  readonly keepAmount: number;
  static readonly VARNAME_EMPTY_CLOSET = 'BaleOCD_EmptyCloset';
  private oldVar = '';

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
    this.oldVar = getvar(ClosetTest.VARNAME_EMPTY_CLOSET);
    cliExecute(`zlib ${ClosetTest.VARNAME_EMPTY_CLOSET} = -1`);
  }

  teardown() {
    cliExecute(`zlib ${ClosetTest.VARNAME_EMPTY_CLOSET} = ${this.oldVar}`);
  }

  generateConfigRows() {
    return [{item: this.item, action: 'CLST', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    const {item} = this;
    const closetBeforeAmount = before.closet.get(item) || 0;
    const closetAfterAmount = after.closet.get(item) || 0;
    assert.isAbove(
      closetAfterAmount,
      closetBeforeAmount,
      `Number of ${item} in closet has not increased (${closetBeforeAmount} -> ${closetAfterAmount})`
    );
  }
}

/**
 * Test case that verifies the DISP (display case) action.
 */
export class DisplayTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'DISP';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    if (!haveDisplay()) {
      error(`${this.name} test skipped because you don't have a Display Case`);
      return false;
    }
    if (!canInteract()) {
      error(
        `${this.name} test skipped because you are in Ronin/Hardcore and may not be able to take the item out of the Display Case after this test`
      );
      return false;
    }
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [
      {item: this.item, action: 'DISP', keepAmount: this.keepAmount},
    ] as const;
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    const {item} = this;
    const displayBeforeAmount = before.display.get(item) || 0;
    const displayAfterAmount = after.display.get(item) || 0;
    assert.isAbove(
      displayAfterAmount,
      displayBeforeAmount,
      `Number of ${item} in display case has not increased (${displayBeforeAmount} -> ${displayAfterAmount})`
    );
  }
}

/**
 * Test case that verifies the DISC (discard) action.
 */
export class DiscardTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'DISC';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    assert.equal(
      autosellPrice(item),
      0,
      `${item} has nonzero autosell price of ${autosellPrice(item)}`
    );
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [{item: this.item, action: 'DISC', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);
  }
}

/**
 * Test case that verifies the GIFT (send to player) action.
 */
export class GiftTest implements CleanupActionTest {
  readonly player: string;
  readonly item: Item;
  readonly name = 'GIFT';
  readonly keepAmount: number;
  private setupTimestamp = 0;

  /**
   * @param player Name of the player to send the gift to (NOT the ID)
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(player: string, item: Item, keepAmount = 0) {
    assert.ok(player, 'GiftTest requires a valid player');
    assert.ok(isGiftable(item), `${item} cannot be sent as a gift`);
    this.player = player;
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
    this.setupTimestamp = Date.now();
  }

  generateConfigRows() {
    return [
      {
        item: this.item,
        action: 'GIFT',
        keepAmount: this.keepAmount,
        info: this.player,
      },
    ];
  }

  verify(before: InventoryState, after: InventoryState) {
    const {setupTimestamp} = this;
    assert.notEqual(setupTimestamp, 0, 'setupTimestamp is not set!');

    verifyKeepAmount(this, before, after);

    const currentTimestamp = Date.now();
    const kmails = loadOutboxKmail();
    assert.ok(
      kmails.some(
        kmail =>
          setupTimestamp <= kmail.localTimestamp &&
          kmail.localTimestamp <= currentTimestamp &&
          (String(kmail.recipentId) === this.player ||
            kmail.recipentName.toLowerCase() === this.player.toLowerCase()) &&
          toItemMap(extractItems(kmail.message)).has(this.item)
      ),
      `No kmails recently sent to ${this.player} include ${this.item}. ` +
        'This may be caused by a bug in OCD-Cleaner itself. ' +
        "Alternatively, your KoL account's timezone may be different from your local timezone."
    );
  }
}

/**
 * Test case that verifies the MAKE (transform to another item) action.
 */
export class MakeTest implements CleanupActionTest {
  readonly item: Item;
  readonly targetItem: Item;
  readonly name = 'MAKE';
  readonly retrieveAmount: number;
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param retrieveAmount Amount of `item` to retrieve for testing.
   *    This should be large enough to make at least one of `targetItem`
   * @param targetItem Item to create with `item`
   * @param keepAmount Amount of `item` to keep in inventory
   */
  constructor(
    item: Item,
    retrieveAmount: number,
    targetItem: Item,
    keepAmount = 0
  ) {
    this.item = item;
    this.targetItem = targetItem;
    this.retrieveAmount = retrieveAmount;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.retrieveAmount) &&
        itemAmount(this.item) >= this.retrieveAmount,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [
      {
        item: this.item,
        action: 'MAKE',
        keepAmount: this.keepAmount,
        info: String(this.targetItem),
      },
      {item: this.targetItem, action: 'KEEP'},
    ] as const;
  }

  verify(before: InventoryState, after: InventoryState) {
    const {item, targetItem} = this;

    // Crafting takes multiple items at a time; as a result, some items may be
    // left over, exceeding the keepAmount quantity. Thus, we cannot use
    // verifyKeepAmount() to verify the remaining item quantity.
    const beforeAmount = before.inventory.get(item) || 0;
    const afterAmount = after.inventory.get(item) || 0;
    assert.isAbove(
      beforeAmount,
      afterAmount,
      `${this.name} action failed; amount of ${item} has not decreased (${beforeAmount} <= ${afterAmount})`
    );

    const targetBeforeAmount = before.inventory.get(targetItem) || 0;
    const targetAfterAmount = after.inventory.get(targetItem) || 0;
    assert.isBelow(
      targetBeforeAmount,
      targetAfterAmount,
      `${this.name} action failed; amount of ingredient ${targetItem} has not increased (${targetBeforeAmount} >= ${targetAfterAmount})`
    );
  }
}

/**
 * Test case that verifies the MALL (put in mall store/shop) action.
 */
export class MallTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'MALL';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    if (!haveShop()) {
      error(`${this.name} test skipped because you don't have a mall store`);
      return false;
    }
    if (!canInteract()) {
      error(
        `${this.name} test skipped because you are in Ronin/Hardcore and may not be able to take the item out of your mall store after this test`
      );
      return false;
    }
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [{item: this.item, action: 'MALL', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    const {item} = this;
    const shopBeforeAmount = before.shop.get(item) || 0;
    const shopAfterAmount = after.shop.get(item) || 0;
    assert.isAbove(
      shopAfterAmount,
      shopBeforeAmount,
      `Number of ${item} in shop has not increased (${shopBeforeAmount} -> ${shopAfterAmount})`
    );
  }
}

/**
 * Test case that verifies the PULV (pulverize) action.
 */
export class PulverizeTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'PULV';
  readonly keepAmount: number;
  readonly expectedResults: ReadonlySet<Item>;

  /**
   * @param item Item to use for testing
   * @param expectedResults Array of items that can be gained by smashing `item`
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, expectedResults: Iterable<Item>, keepAmount = 0) {
    this.item = item;
    this.expectedResults = new Set(expectedResults);
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    // For now, don't use Smashbot/wadbot
    if (!haveSkill(Skill.get('Pulverize'))) {
      print(`Skipping ${this.name} test because you don't have Pulverize`);
      return false;
    }

    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  *generateConfigRows() {
    yield {item: this.item, action: 'PULV', keepAmount: this.keepAmount};
    for (const expectedItem of this.expectedResults) {
      yield {item: expectedItem, action: 'KEEP'};
    }
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    for (const expectedItem of this.expectedResults) {
      const beforeAmount = before.inventory.get(expectedItem) || 0;
      const afterAmount = after.inventory.get(expectedItem) || 0;
      assert.isBelow(
        beforeAmount,
        afterAmount,
        `${this.name} action failed; amount of ingredient ${expectedItem} has not increased (${beforeAmount} >= ${afterAmount})`
      );
    }
  }
}

/**
 * Test case that verifies the CLAN (clan stash) action.
 */
export class StashTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'CLAN';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    if (getClanName() === '') {
      error(`${this.name} test skipped because you are not in a clan`);
      return false;
    }
    if (!canInteract()) {
      error(
        `${this.name} test skipped because you are in Ronin/Hardcore and may not be able to recover the item from the stash after this test`
      );
      return false;
    }
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [{item: this.item, action: 'CLAN', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    const {item} = this;
    const stashBeforeAmount = before.stash.get(item) || 0;
    const stashAfterAmount = after.stash.get(item) || 0;
    assert.isAbove(
      stashAfterAmount,
      stashBeforeAmount,
      `Number of ${item} in stash has not increased (${stashBeforeAmount} -> ${stashAfterAmount}).` +
        " It's possible that someone has taken items from your clan stash while the test script was running."
    );
  }
}

/**
 * Test case that verifies the TODO action.
 * Since we can't parse the CLI output yet, this technically does nothing.
 */
export class TodoTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'TODO';

  /**
   * @param item Item to use for testing
   */
  constructor(item: Item) {
    this.item = item;
  }

  isRunnable() {
    return true;
  }

  setup() {
    assert.ok(
      retrieveItem(this.item) && itemAmount(this.item) > 0,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    // The quantity is probably meaningless
    return [{item: this.item, action: 'TODO'}];
  }

  verify(before: InventoryState, after: InventoryState) {
    const {item} = this;
    const beforeAmount = before.inventory.get(item) || 0;
    const afterAmount = after.inventory.get(item) || 0;
    if (!before)
      assert.isAbove(
        beforeAmount,
        0,
        `Cannot verify ${this.name} action because we didn't have ${item} before`
      );

    assert.equal(
      beforeAmount,
      afterAmount,
      `${this.name} action failed, quantity of ${item} has changed: ${beforeAmount} -> ${afterAmount}`
    );

    print(
      `TODO action must be verified manually. Please check if a reminder message has been printed for ${item}`
    );
  }
}

/**
 * Test case that verifies the KEEP action.
 */
export class KeepTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'KEEP';

  /**
   * @param item Item to use for testing
   */
  constructor(item: Item) {
    this.item = item;
  }

  isRunnable() {
    return true;
  }

  setup() {
    assert.ok(
      retrieveItem(this.item) && itemAmount(this.item) > 0,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    // The quantity is probably meaningless
    return [{item: this.item, action: 'KEEP'}];
  }

  verify(before: InventoryState, after: InventoryState) {
    const {item} = this;
    const beforeAmount = before.inventory.get(item) || 0;
    const afterAmount = after.inventory.get(item) || 0;
    if (!before)
      assert.isAbove(
        beforeAmount,
        0,
        `Cannot verify ${this.name} action because we didn't have ${item} before`
      );

    assert.isAtMost(
      beforeAmount,
      afterAmount,
      `${this.name} action failed, quantity of ${item} has decreased: ${beforeAmount} -> ${afterAmount}`
    );
  }
}

/**
 * Test case that verifies the UNTN (untinker) action.
 */
export class UntinkerTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'UNTN';
  readonly keepAmount: number;

  /**
   * @param item Item to untinker for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return knollAvailable() || getProperty('questM01Untinker') === 'finished';
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  *generateConfigRows() {
    yield {item: this.item, action: 'UNTN', keepAmount: this.keepAmount};
    for (const itemName of Object.keys(getIngredients(this.item))) {
      // KEEP untinkered ingredients
      yield {item: Item.get(itemName), action: 'KEEP'};
    }
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);

    for (const itemName of Object.keys(getIngredients(this.item))) {
      const item = Item.get(itemName);
      const beforeAmount = before.inventory.get(item) || 0;
      const afterAmount = after.inventory.get(item) || 0;
      assert.isBelow(
        beforeAmount,
        afterAmount,
        `${this.name} action failed; amount of ingredient ${item} has not increased (${beforeAmount} >= ${afterAmount})`
      );
    }
  }
}

/**
 * Test case that verifies the USE action.
 */
export class UseTest implements CleanupActionTest {
  readonly item: Item;
  readonly name = 'USE';
  readonly keepAmount: number;

  /**
   * @param item Item to use for testing
   * @param keepAmount Amount to keep in inventory
   */
  constructor(item: Item, keepAmount = 0) {
    this.item = item;
    this.keepAmount = keepAmount;
  }

  isRunnable() {
    return true;
  }

  setup() {
    // Ensure that we have 1 more than keepAmount, so that at least 1 item is
    // always processed
    assert.ok(
      retrieveItem(this.item, this.keepAmount + 1) &&
        itemAmount(this.item) >= this.keepAmount + 1,
      `Failed to obtain ${this.item}`
    );
  }

  generateConfigRows() {
    return [{item: this.item, action: 'USE', keepAmount: this.keepAmount}];
  }

  verify(before: InventoryState, after: InventoryState) {
    verifyKeepAmount(this, before, after);
  }
}
