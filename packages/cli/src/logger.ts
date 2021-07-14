/**
 * @file Provides methods for printing colored text.
 */

import {isDarkMode, print} from 'kolmafia';

export function error(message: string) {
  print(message, isDarkMode() ? '#ff0033' : '#cc0033');
}

export function warn(message: string) {
  print(message, isDarkMode() ? '#cc9900' : '#cc6600');
}

export function info(message: string) {
  print(message, isDarkMode() ? '#0099ff' : '3333ff');
}

export function success(message: string) {
  print(message, isDarkMode() ? '#00cc00' : '#008000');
}

export function debug(message: string) {
  print(message, '#808080');
}
