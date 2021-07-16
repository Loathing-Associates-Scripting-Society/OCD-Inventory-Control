/**
 * @file Tools for loading and manipulating Philter configuration.
 */

import {myName, toBoolean} from 'kolmafia';
import {_updateZlibVars} from 'philter.util.ash';
import {getvar, setvar} from 'zlib.ash';
import {PhilterConfig} from '../data/philter-config.js';

/**
 * Namespace object that maps each config key to their ZLib variable name.
 */
export const CONFIG_NAMES: Readonly<Record<keyof PhilterConfig, string>> =
  Object.freeze({
    emptyClosetMode: 'BaleOCD_EmptyCloset',
    simulateOnly: 'BaleOCD_Sim',
    mallPricingMode: 'BaleOCD_Pricing',
    mallMultiName: 'BaleOCD_MallMulti',
    mallMultiKmailMessage: 'BaleOCD_MultiMessage',
    canUseMallMulti: 'BaleOCD_UseMallMulti',
    dataFileName: 'BaleOCD_DataFile',
    stockFileName: 'BaleOCD_StockFile',
  });

/**
 * Sets up default values for config variables (powered by ZLib).
 */
export function setDefaultConfig() {
  setvar(CONFIG_NAMES.mallMultiName, '');
  setvar(CONFIG_NAMES.canUseMallMulti, true);
  setvar(CONFIG_NAMES.mallMultiKmailMessage, 'Mall multi dump');
  setvar(CONFIG_NAMES.dataFileName, myName());
  setvar(CONFIG_NAMES.stockFileName, myName());
  setvar(CONFIG_NAMES.mallPricingMode, 'auto');
  setvar(CONFIG_NAMES.simulateOnly, false);
  setvar(CONFIG_NAMES.emptyClosetMode, 0);

  // ZLib variables that are not exposed yet
  // TODO: Load and save these variables, too

  // Should items be acquired for stock (0: no, 1: yes)
  setvar('BaleOCD_Stock', 0);
  // Should Hangk's Storange be emptied? (0: no, 1: yes)
  setvar('BaleOCD_EmptyHangks', 0);
  // Whether to mallsell any uncategorized items (DANGEROUS)
  setvar('BaleOCD_MallDangerously', false);
  // Controls whether to run OCD-Cleanup if the player is in Ronin/Hardcore.
  // -"ask": Ask the user
  // -"never": Never run if in Ronin/Hardcore
  // -"always": Always run, even if in Ronin/Hardcore
  setvar('BaleOCD_RunIfRoninOrHC', 'ask');
}

export function loadCleanupConfig(): PhilterConfig {
  const emptyClosetMode = parseInt(getvar(CONFIG_NAMES.emptyClosetMode));
  const mallPricingMode = getvar(CONFIG_NAMES.mallPricingMode);
  return {
    emptyClosetMode:
      emptyClosetMode === 0 || emptyClosetMode === -1 ? emptyClosetMode : 0,
    simulateOnly: toBoolean(CONFIG_NAMES.simulateOnly),
    mallPricingMode:
      mallPricingMode === 'auto' || mallPricingMode === 'max'
        ? mallPricingMode
        : 'auto',
    mallMultiName: getvar(CONFIG_NAMES.mallMultiName),
    mallMultiKmailMessage: getvar(CONFIG_NAMES.mallMultiKmailMessage),
    canUseMallMulti: toBoolean(getvar(CONFIG_NAMES.canUseMallMulti)),
    dataFileName: getvar(CONFIG_NAMES.dataFileName),
    stockFileName: getvar(CONFIG_NAMES.stockFileName),
  };
}

export function saveCleanupConfig(config: PhilterConfig) {
  const serializedConfig: Record<string, string> = {};
  for (const key of Object.keys(config)) {
    const varName: string | undefined =
      CONFIG_NAMES[key as keyof typeof CONFIG_NAMES];
    if (varName === undefined) {
      throw new Error(`Cannot find ZLib config name for config key '${key}'`);
    }
    serializedConfig[varName] = String(config[key as keyof typeof config]);
  }
  _updateZlibVars(serializedConfig);
}
