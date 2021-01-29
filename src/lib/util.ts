import {
  isDarkMode,
  isGiftable,
  isTradeable,
  myMeat,
  toInt,
  visitUrl,
} from 'kolmafia';
import {vprint} from 'zlib.ash';

/**
 * @return Appropriate color code for error messages.
 */
export function color_error() {
  return isDarkMode() ? '#ff0033' : '#cc0033';
}

/**
 * @return Appropriate color code for warning messages.
 */
export function color_warning() {
  return isDarkMode() ? '#cc9900' : '#cc6600';
}

/**
 * @return Appropriate color code for informational messages.
 */
export function color_info() {
  return isDarkMode() ? '#0099ff' : '3333ff';
}

/**
 * @return Appropriate color code for success messages.
 */
export function color_success() {
  return isDarkMode() ? '#00cc00' : '#008000';
}

/**
 * @return Appropriate color code for (unimportant) debug messages.
 */
export function color_debug() {
  return '#808080';
}

/**
 * Sends a gift to `recipent`.
 *
 * Note: This is a port of `send_gift()` from ZLib. It was needed because there
 * is no way to pass a mapping of `Item => number` from JavaScript to ASH.
 * @param recipent
 * @param message
 * @param meat
 * @param goodies
 * @param insideNote
 */
function sendGift(
  recipent: string,
  message: string,
  meat: number,
  goodies: ReadonlyMap<Item, number>,
  insideNote = ''
): boolean {
  // parse items into query string
  let itemstring = '';
  let j = 0;
  const extra = new Map<Item, number>();
  goodies.forEach((amount, i) => {
    if (!isTradeable(i) && !isGiftable(i)) return;
    j += 1;
    if (j < 3) itemstring += `&howmany${j}=${amount}&whichitem${j}=${toInt(i)}`;
    else extra.set(i, amount);
  });
  const pnum = Math.max(Math.min(goodies.size, 2), 1);
  const shipping = 50 * pnum;
  if (myMeat() < meat + shipping)
    return vprint('Not enough meat to send the package.', -2);
  // send gift
  const response = visitUrl(
    `town_sendgift.php?pwd=&towho=${recipent}&note=${message}&insidenote=${insideNote}&whichpackage=${pnum}&fromwhere=0&sendmeat=${meat}&action=Yep.${itemstring}`
  );
  if (!response.includes('Package sent.'))
    return vprint("The message didn't send for some reason.", -2);
  if (extra.size > 0) return sendGift(recipent, message, 0, extra, insideNote);
  return true;
}

/**
 * Sends an in-game message to `recipent`.
 *
 * Note: This is a port of `kmail()` from ZLib. It was needed because there is
 * no way to pass a mapping of `Item => number` from JavaScript to ASH.
 * @param recipent
 * @param message
 * @param meat
 * @param items
 * @param insideNote
 */
export function kmail(
  recipent: string,
  message: string,
  meat: number,
  items: ReadonlyMap<Item, number>,
  insideNote = ''
): boolean {
  if (meat > myMeat()) return vprint(`You don't have ${meat} meat.`, -2);
  // parse items into query strings
  let itemstring = '';
  let j = 0;
  const itemstrings: string[] = [];
  items.forEach((amount, i) => {
    if (!isTradeable(i) && !isGiftable(i)) return;
    j += 1;
    itemstring += `&howmany${j}=${amount}&whichitem${j}=${toInt(i)}`;
    if (j > 10) {
      itemstrings.push(itemstring);
      itemstring = '';
      j = 0;
    }
  });
  if (itemstring !== '') itemstrings.push(itemstring);
  if (itemstrings.length === 0) itemstrings[0] = '';
  else
    vprint(
      `${items.size} item type(s) split into ${itemstrings.length} separate kmail(s)`,
      5
    );
  // send message(s)
  for (const [q, itemStr] of itemstrings.entries()) {
    const response = visitUrl(
      `sendmessage.php?pwd=&action=send&towho=${recipent}&message=${message}&savecopy=on&sendmeat=${
        q === 0 ? meat : 0
      }${itemStr}`
    );
    if (response.includes('That player cannot receive Meat or items'))
      return (
        vprint(
          'That player cannot receive stuff, sending gift instead...',
          4
        ) && sendGift(recipent, message, meat, items, insideNote)
      );
    if (!response.includes('Message sent.'))
      return vprint("The message didn't send for some reason.", -2);
  }
  return true;
}
