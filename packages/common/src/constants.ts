/**
 * @file Provides constants necessary for piecing the application together.
 */

/**
 * Relative path to the directory that contains assets (HTML, CSS, JS) for
 * Philter Manager.
 */
export const RELAY_DIR = '/philter-manager' as const;

/**
 * Name of the entrypoint HTML file.
 * The relay API script will serve this page to the user.
 */
export const RELAY_HTML_FILE = 'philter-manager.index.html';

/**
 * Relative path to the HTML skeleton page for Philter Manager.
 * The relay API script will serve this page to the user.
 */
export const RELAY_HTML_PATH = `${RELAY_DIR}/${RELAY_HTML_FILE}` as const;

/**
 * Name of the relay API script file for Philter.
 * Philter Manager uses this to construct the request URL.
 * This is also used by build/release scripts.
 */
export const RELAY_SCRIPT_FILE = 'relay_Philter_Manager.js' as const;
