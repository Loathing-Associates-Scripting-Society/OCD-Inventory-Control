/**
 * @file Provides methods for logging colored text.
 */

import {isDarkMode} from 'kolmafia';
import {vprint} from 'zlib.ash';

export function error(message: string) {
  vprint(message, isDarkMode() ? '#ff0033' : '#cc0033', 1);
}

export function warn(message: string) {
  vprint(message, isDarkMode() ? '#cc9900' : '#cc6600', 2);
}

export function info(message: string) {
  vprint(message, isDarkMode() ? '#0099ff' : '3333ff', 3);
}

export function success(message: string) {
  vprint(message, isDarkMode() ? '#00cc00' : '#008000', 2);
}

export function debug(message: string) {
  vprint(message, '#808080', 6);
}
