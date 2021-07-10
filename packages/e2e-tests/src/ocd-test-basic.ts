/**
 * @file Basic E2E test script for OCD Cleanup.
 *
 * This script supports UNIX-style command line options. For more information,
 * run `ocd-test-basic --help` in KoLmafia's gCLI.
 *
 * Warning: This script spends ~3000 meat on purchasing items for testing.
 */

import {toItemMap} from '@philter/common/kol';
import {
  bufferToFile,
  cliExecute,
  getInventory,
  print,
  printHtml,
  toInt,
} from 'kolmafia';
import minimist from 'minimist';
import {parseArgsStringToArgv} from 'string-argv';
import {getvar} from 'zlib.ash';
import {
  AutosellTest,
  BrickoBreakTest,
  CleanupActionTest,
  ClosetTest,
  DiscardTest,
  DisplayTest,
  GiftTest,
  KeepTest,
  MakeTest,
  MallTest,
  PulverizeTest,
  StashTest,
  TodoTest,
  UntinkerTest,
  UseTest,
} from './lib/action-tests';
import {assert, captureInventoryState, error, InventoryState} from './lib/util';

const TEST_CONFIG_FILE_NAME = 'e2e-test-config';

/**
 * Set up the E2E test.
 * @param testCases Test cases to setup
 */
function setup(testCases: Iterable<CleanupActionTest>): void {
  const configRows: string[] = [];
  /**
   * Test cases that were set up successfully. Used to roll back if setup fails.
   */
  const setupTestCases: CleanupActionTest[] = [];

  // KEEP
  for (const testCase of testCases) {
    try {
      testCase.setup();

      for (const entry of testCase.generateConfigRows()) {
        const {item, action, keepAmount = 0, info = '', message = ''} = entry;
        configRows.push(
          `[${toInt(item)}]${
            item.name
          }\t${action}\t${keepAmount}\t${info}\t${message}`
        );
      }

      setupTestCases.push(testCase);
    } catch (e) {
      error(`Setup failed: Test case ${testCase.name} for ${testCase.item}`);
      // Roll back successfully setup test cases
      teardown(setupTestCases);
      throw e;
    }
  }

  assert(
    bufferToFile(configRows.join('\n'), `OCDdata_${TEST_CONFIG_FILE_NAME}.txt`),
    'Failed to save config file'
  );
}

/**
 * Temporarily override some ZLib configs while executing `cb()`, and restore
 * them after `cb()` returns or throws.
 * @param cb Calback to execute
 * @return Value returned by the callback
 */
function withTemporaryConfig<T>(cb: () => T): T {
  const temporaryVars = new Map([
    ['BaleOCD_DataFile', TEST_CONFIG_FILE_NAME],
    // Disable mall multis and test the shop directly
    // Note: Currently, we don't have a way of setting a ZLib variable to an
    //       empty string.
    // ['BaleOCD_MallMulti', ''],
    ['BaleOCD_UseMallMulti', 'false'],
    ['BaleOCD_Sim', 'false'],
  ]);

  const savedVars = new Map<string, string>();
  for (const [varName, tempValue] of temporaryVars) {
    // Save current variables
    savedVars.set(varName, getvar(varName));

    // Temporarily change variables
    // We must call ZLib via the gCLI because it does not provide a way to
    // directly alter the contents of vars_<playername>.txt.
    cliExecute(`zlib ${varName} = ${tempValue}`);
  }

  try {
    return cb();
  } finally {
    for (const varName of temporaryVars.keys()) {
      cliExecute(`zlib ${varName} = ${savedVars.get(varName) ?? ''}`);
    }
  }
}

/**
 * Verify changes after running Philter, and report all thrown exceptions for
 * each test case.
 * @param testCases
 * @param oldState
 */
function verify(
  testCases: Iterable<CleanupActionTest>,
  oldState: InventoryState
): void {
  const currentState = captureInventoryState();

  for (const testCase of testCases) {
    try {
      testCase.verify(oldState, currentState);
    } catch (e) {
      error(
        `Verification failed: Test case ${testCase.name} for ${testCase.item}`
      );
      error(String(e));
    }
  }
}

/**
 * Tear down all test cases. This will not abort even if a test case fails to
 * tear down.
 * @param testCases
 */
function teardown(testCases: Iterable<CleanupActionTest>): void {
  for (const testCase of testCases) {
    try {
      testCase.teardown?.();
    } catch (e) {
      error(`Teardown failed: Test case ${testCase.name} for ${testCase.item}`);
      error(e);
    }
  }
}

interface CmdOptions {
  varName: string;
  default?: string;
  description: string;
  required?: boolean;
}

function objectEntries<T>(obj: T): [keyof T, T[keyof T]][] {
  const result: [keyof T, T[keyof T]][] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result.push([key as keyof T, obj[key as keyof T]]);
    }
  }
  return result;
}

const CMD_OPTIONS = {
  'test-cmd': {
    varName: 'command',
    default: 'ocd-cleanup',
    description: 'Command to use for invoking Philter',
  } as CmdOptions,
  'gift-target': {
    varName: 'player',
    required: true,
    description: 'Name or ID of the player to send gifts to for testing',
  } as CmdOptions,
};

function printHelp() {
  printHtml(
    'Usage: <tt><b>ocd-test-basic</b> [options]</tt>' +
      (Object.keys(CMD_OPTIONS).length
        ? '\n\nAvailable options:\n<dl>' +
          objectEntries(CMD_OPTIONS)
            .map(
              ([name, optionInfo]) =>
                `<dt><tt>--${name}${
                  optionInfo.varName ? ` &lt;${optionInfo.varName}&gt;` : ''
                }</tt></dt>` +
                `<dd>${optionInfo.required ? '<b>(Required)</b> ' : ''}${
                  optionInfo.description
                }${
                  optionInfo.default !== undefined
                    ? ` (default: <tt>${optionInfo.default}</tt>)`
                    : ''
                }</dd>`
            )
            .join('') +
          '</dl>'
        : '')
  );
}

function getOptionValue<T extends string>(
  parsedOptions: minimist.ParsedArgs,
  options: Record<T, CmdOptions>,
  optionName: T
): string {
  const value = parsedOptions[optionName] || options[optionName].default;
  if (value === undefined) {
    if (options[optionName].required) {
      throw new Error(`Missing required option: --${optionName}`);
    } else {
      return '';
    }
  }
  return value;
}

/**
 * Entrypoint for the test script.
 * @param commands Command line argument string
 */
export function main(commands: string): void {
  // If `commands` is an empty string, string-argv returns an array containing
  // a single empty string ([""]) rather than an empty array ([]).
  // This confuses minimist, causing it to believe that an "undefined" option
  // has been passed to it. Since this is undesireable, we must manually use an
  // empty array if `commands` is empty.
  const argv = commands ? parseArgsStringToArgv(commands) : [];
  const opts = minimist(argv, {
    alias: {help: 'h'},
    boolean: ['help'],
    string: Object.keys(CMD_OPTIONS),
    unknown(unknownOpt) {
      throw new Error(`Unknown command line option: ${unknownOpt}`);
    },
  });

  if (opts.help) {
    printHelp();
    return;
  }

  const giftTarget = getOptionValue(opts, CMD_OPTIONS, 'gift-target');
  const testCmd = getOptionValue(opts, CMD_OPTIONS, 'test-cmd');

  print('Collecting test cases...');

  // Add test cases
  const testCases = new Map<Item, CleanupActionTest>(
    [
      new AutosellTest(Item.get('ben-gal balm'), 0),
      new AutosellTest(Item.get('hair spray'), 1),
      new BrickoBreakTest(Item.get('BRICKO hat'), 2),
      new ClosetTest(Item.get('glittery mascara'), 1),
      new DiscardTest(Item.get('useless powder'), 1),
      new DisplayTest(Item.get('fortune cookie'), 1),
      new GiftTest(giftTarget, Item.get('chewing gum on a string'), 2),
      new MakeTest(Item.get('poppy'), 3, Item.get('opium grenade')),
      new MallTest(Item.get('spices'), 1),
      new PulverizeTest(
        Item.get('acid-squirting flower'),
        [Item.get('twinkly powder')],
        1
      ),
      new StashTest(Item.get('cool whip'), 1),
      new TodoTest(Item.get('pail')),
      new UntinkerTest(Item.get('sprocket assembly'), 1),
      new UseTest(Item.get('old coin purse'), 1),
    ]
      .filter(testCase => testCase.isRunnable())
      .map(testCase => [testCase.item, testCase])
  );

  // KEEP all other items in inventory
  for (const item of toItemMap(getInventory()).keys()) {
    if (testCases.has(item)) continue;

    const tc = new KeepTest(item);
    if (tc.isRunnable()) {
      testCases.set(item, new KeepTest(item));
    } else {
      print(`Skipping KEEP test for ${item}`);
    }
  }

  print(`Initializing ${testCases.size} test case(s)...`);
  setup(testCases.values());
  const oldState = captureInventoryState();

  print('Executing E2E test for Philter...');
  // For now, we test the ASH version of the script
  withTemporaryConfig(() => cliExecute(testCmd));

  print('Verifying test case(s)...');
  verify(testCases.values(), oldState);

  print('Tearing down test case(s)...');
  teardown(testCases.values());

  print('E2E test script completed');
}
