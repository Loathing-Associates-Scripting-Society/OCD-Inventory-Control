/**
 * @file OCD-Cleanup by Loathing Associates Scripting Society
 * @version 0.0.0
 */

import {
  abort,
  autosell,
  autosellPrice,
  availableAmount,
  batchClose,
  batchOpen,
  canEquip,
  canInteract,
  cliExecute,
  closetAmount,
  creatableAmount,
  create,
  emptyCloset,
  equip,
  equippedAmount,
  getCampground,
  getIngredients,
  getInventory,
  getProperty,
  haveDisplay,
  haveSkill,
  historicalAge,
  historicalPrice,
  isDisplayable,
  isOnline,
  isTradeable,
  itemAmount,
  mallPrice,
  myAscensions,
  myClass,
  myName,
  myPath,
  myPrimestat,
  print,
  printHtml,
  putCloset,
  putDisplay,
  putShop,
  putStash,
  retrieveItem,
  setProperty,
  shopAmount,
  shopPrice,
  stashAmount,
  storageAmount,
  svnAtHead,
  svnExists,
  todayToString,
  toInt,
  toItem,
  toSlot,
  use,
  userConfirm,
  visitUrl,
} from 'kolmafia';
import {getvar, rnum, setvar, vprint} from 'zlib.ash';
import {
  loadOcdInfoFile,
  loadOcdStockFile,
  OcdAction,
  OcdInfo,
  OcdStock,
} from '../lib/ocd';

import {
  color_error,
  color_info,
  color_success,
  color_warning,
  kmail,
} from '../lib/util';

// The following variables should be set from the relay script.
setvar('BaleOCD_MallMulti', ''); // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar('BaleOCD_UseMallMulti', true); // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar('BaleOCD_MultiMessage', 'Mall multi dump');
setvar('BaleOCD_DataFile', myName()); // The name of the file that holds OCD data for this character.
setvar('BaleOCD_StockFile', myName()); // The name of the file that holds OCD stocking data for this character.
setvar('BaleOCD_Stock', 0); // Should items be acquired for stock
setvar('BaleOCD_Pricing', 'auto'); // How to handle mall pricing. "auto" will use mallPrice(). "max" will price at maximum.
setvar('BaleOCD_Sim', false); // If you set this to true, it won't actually do anything. It'll only inform you.
setvar('BaleOCD_EmptyCloset', 0); // Should the closet be emptied and its contents disposed of?
setvar('BaleOCD_EmptyHangks', 0); // Should Hangk's Storange be emptied?
setvar('BaleOCD_MallDangerously', false); // If this set to TRUE, any uncategorized items will be malled instead of kept! OH NOES!
// This last one can only be set by editing the vars file. It's too dangerous to make it easily accessible. Exists for backwards compatibility.
setvar('BaleOCD_RunIfRoninOrHC', 'ask'); // Controls whether to run OCD-Cleanup if the player is in Ronin/Hardcore.
// If set to "ask", the script will prompt the user.
// If set to "never", the script will never run if in Ronin/Hardcore.
// If set to "always", the script will always run even if in Ronin/Hardcore.

// Check version! This will check both scripts and data files.
// This code is at base level so that the relay script's importation will automatically cause it to be run.
const OCD_PROJECT_NAME =
  'Loathing-Associates-Scripting-Society-OCD-Inventory-Control-trunk-release';
if (
  svnExists(OCD_PROJECT_NAME) &&
  getProperty('_svnUpdated') === 'false' &&
  getProperty('_ocdUpdated') !== 'true'
) {
  if (!svnAtHead(OCD_PROJECT_NAME)) {
    print(
      'OCD-Cleanup has become outdated. Automatically updating from SVN...',
      color_error()
    );
    cliExecute(`svn update ${OCD_PROJECT_NAME}`);
    print(
      "On the script's next invocation it will be up to date.",
      color_success()
    );
  }
  setProperty('_ocdUpdated', 'true');
}

function is_OCDable(it: Item): boolean {
  switch (it) {
    // For some reason Item.get(`none`) passes isDisplayable()
    case Item.get('none'):
      return false;
    case Item.get("Boris's key"):
    case Item.get("Jarlsberg's key"):
    case Item.get("Richard's star key"):
    case Item.get("Sneaky Pete's key"):
    case Item.get('digital key'):
    case Item.get("the Slug Lord's map"):
    case Item.get("Dr. Hobo's map"):
    case Item.get("Dolphin King's map"):
    case Item.get('Degrassi Knoll shopping list'):
    case Item.get('31337 scroll'):
    case Item.get('dead mimic'):
    case Item.get("fisherman's sack"):
    case Item.get('fish-oil smoke bomb'):
    case Item.get('vial of squid ink'):
    case Item.get('potion of fishy speed'):
    case Item.get('blessed large box'):
      return true;
    case Item.get('DNOTC Box'): // Let these hide in your inventory until it is time for them to strike!
      if (
        todayToString().slice(4, 6) === '12' &&
        parseInt(todayToString().slice(6, 8)) < 25
      )
        return false;
      break;
  }
  if (isDisplayable(it)) return true;
  return false;
}

function is_wadable(it: Item): boolean {
  if (toInt(it) >= 1438 && toInt(it) <= 1449)
    // twinkly powder to sleaze nuggets
    return true;
  switch (it) {
    case Item.get('sewer nuggets'):
    case Item.get('floaty sand'):
    case Item.get('floaty pebbles'):
    case Item.get('floaty gravel'):
      return true;
  }
  return false;
}

function camp_amount(it: Item): number {
  switch (it) {
    case Item.get('Little Geneticist DNA-Splicing Lab'):
    case Item.get('snow machine'):
    case Item.get('spinning wheel'):
    case Item.get('Warbear auto-anvil'):
    case Item.get('Warbear chemistry lab'):
    case Item.get('Warbear high-efficiency still'):
    case Item.get('Warbear induction oven'):
    case Item.get('Warbear jackhammer drill press'):
    case Item.get('Warbear LP-ROM burner'):
      if (String(it) in getCampground()) return 1;
  }
  return 0;
}

// availableAmount varies depending on whether the character can satisfy requests with the closet etc. This doesn't
function full_amount(it: Item): number {
  return (
    availableAmount(it) +
    camp_amount(it) + // Some items lurk in the campground
    (getProperty('autoSatisfyWithCloset') === 'false' ? closetAmount(it) : 0) + // Include Closet
    (getProperty('autoSatisfyWithStorage') === 'false' || !canInteract()
      ? storageAmount(it)
      : 0) - // Include Hangk's Storage
    (getProperty('autoSatisfyWithStash') === 'true' ? stashAmount(it) : 0)
  ); // Don't include Clan Stash
}

// Wrapping the entire script in ocd_control() to reduce variable conflicts if the script is imported to another.
// StopForMissingItems is a parameter in case someone wants to include this script.
// StopForMissingItems = FALSE to prevent a pop-up confirmation.
// DataFile can be used to supplement getvar("BaleOCD_DataFile"). This is completely optional. (See far below)
export function ocd_control(
  StopForMissingItems: boolean,
  extraData = ''
): number {
  let FinalSale = 0;

  let OCD = new Map<Item, OcdInfo>();

  let stock = new Map<Item, OcdStock>();

  const brak = new Map<Item, number>();
  const make = new Map<Item, number>();
  const untink = new Map<Item, number>();
  const usex = new Map<Item, number>();
  const pulv = new Map<Item, number>();
  const mall = new Map<Item, number>();
  const auto = new Map<Item, number>();
  const disc = new Map<Item, number>();
  const disp = new Map<Item, number>();
  const clst = new Map<Item, number>();
  const clan = new Map<Item, number>();
  const todo = new Map<Item, number>();
  const gift = new Map<string, Map<Item, number>>();

  const make_q = new Map<Item, number>();

  const command: Record<OcdAction, string> = {
    BREAK: 'break apart ',
    MAKE: 'transform ',
    UNTN: 'untinker ',
    USE: 'use ',
    PULV: 'pulverize ',
    MALL: 'mallsell ',
    AUTO: 'autosell ',
    DISC: 'discard ',
    DISP: 'display ',
    CLST: 'closet ',
    CLAN: 'stash put ',
    GIFT: 'send gift to ',
    KEEP: '',
    TODO: '',
  };

  // Save these so they can be screwed with safely
  const autoSatisfyWithCloset = getProperty('autoSatisfyWithCloset') === 'true';
  const autoSatisfyWithStorage =
    getProperty('autoSatisfyWithStorage') === 'true';
  const autoSatisfyWithStash = getProperty('autoSatisfyWithStash') === 'true';

  const use_multi =
    getvar('BaleOCD_MallMulti') && getvar('BaleOCD_UseMallMulti') === 'true';
  if (use_multi)
    command['MALL'] = 'send to mallmulti ' + getvar('BaleOCD_MallMulti') + ': ';

  const price = new Map<Item, number>();

  function load_OCD(): boolean {
    OCD.clear();
    const newOcd =
      loadOcdInfoFile(`OCDdata_${getvar('BaleOCD_DataFile')}.txt`) ||
      loadOcdInfoFile(`OCD_${myName()}_Data.txt`);
    if (!newOcd) {
      return vprint(
        'Something went wrong trying to load OCDdata!',
        color_error(),
        -1
      );
    }
    OCD = newOcd;

    let extraOCD: Map<Item, OcdInfo> | undefined;
    if (
      extraData !== '' &&
      (extraOCD = loadOcdInfoFile(`${extraData}.txt`)) &&
      extraOCD.size > 0
    ) {
      extraOCD.forEach((extraOcdInfo, it) => {
        if (!OCD.has(it)) {
          OCD.set(it, {...extraOcdInfo});
        }
      });
    }
    if (OCD.size === 0) {
      return vprint(
        "All item information is corrupted or missing. Whoooah! I hope you didn't lose any data...",
        color_error(),
        -1
      );
    }
    return true;
  }

  const under_consideration = new Map<Item, boolean>(); // prevent infinite recursion
  function count_ingredient(source: Item, into: Item): number {
    let total = 0;
    const ingredients = getIngredients(into);
    for (const keyItemName of Object.keys(ingredients)) {
      const key = toItem(keyItemName);
      const qty = ingredients[keyItemName];
      if (key === source) total += qty;
      else {
        if (under_consideration.has(key)) return 0;
        under_consideration.set(key, true);
        total += count_ingredient(source, key);
        under_consideration.delete(key);
      }
    }
    return total;
  }

  // Amount to OCD. Consider equipment in terrarium (but not equipped) as OCDable.
  function ocd_amount(it: Item): number {
    const ocdInfo = OCD.get(it);
    if (ocdInfo?.action === 'KEEP') return 0;
    const full = full_amount(it);
    // Unequip item from terrarium or equipment if necessary to OCD it.
    if (full > (ocdInfo?.q || 0) && availableAmount(it) > itemAmount(it))
      retrieveItem(Math.min(full - (ocdInfo?.q || 0), availableAmount(it)), it);
    // Don't OCD items that are part of stock. Stock can always be satisfied by closet.
    const keep =
      getvar('BaleOCD_Stock') === '0'
        ? ocdInfo?.q || 0
        : Math.max(
            ocdInfo?.q || 0,
            (stock.get(it)?.q || 0) -
              (getProperty('autoSatisfyWithCloset') === 'false'
                ? 0
                : closetAmount(it))
          );
    // OCD is limited by itemAmount(it) since we don't want to purchase anything and closeted items
    // may be off-limit, but if there's something in the closet, it counts against the amount you own.
    return Math.min(full - keep, itemAmount(it));
  }

  let AskUser = true; // Once this has been set false, it will be false for all successive calls to the function
  function check_inventory(StopForMissingItems: boolean): boolean {
    AskUser = AskUser && StopForMissingItems;
    // Don't stop if "don't ask user" or it is a quest item, or it is being stocked.
    function stop_for_relay(doodad: Item): boolean {
      if (
        !AskUser ||
        !is_OCDable(doodad) ||
        (stock.has(doodad) && full_amount(doodad) <= stock.get(doodad)!.q)
      )
        return false;
      if (
        userConfirm(
          'Uncategorized item(s) have been found in inventory.\nAbort to categorize those items with the relay script?'
        )
      ) {
        return vprint(
          'Please use the relay script to categorize missing items in inventory.',
          color_error(),
          1
        );
      }
      AskUser = false;
      return false;
    }

    let excess = 0;
    const inventory = getInventory();
    for (const itemName of Object.keys(inventory)) {
      const doodad = Item.get(itemName);
      excess = ocd_amount(doodad);
      const ocdInfo = OCD.get(doodad);
      if (ocdInfo) {
        if (excess > 0)
          switch (ocdInfo.action) {
            case 'BREAK':
              brak.set(doodad, excess);
              break;
            case 'MAKE': {
              make_q.set(
                doodad,
                count_ingredient(doodad, toItem(ocdInfo.info))
              );
              if (make_q.get(doodad) === 0) {
                vprint(
                  'You cannot transform a ' +
                    doodad +
                    ' into a ' +
                    ocdInfo.info +
                    ". There's a problem with your data file or your crafting ability.",
                  color_error(),
                  -3
                );
                break;
              }
              make.set(doodad, excess);
              const make_q_amount = make_q.get(doodad) || 0;
              if (make_q_amount > 1)
                make.set(
                  doodad,
                  (make.get(doodad) || 0) -
                    ((make.get(doodad) || 0) % make_q_amount)
                );
              if (ocdInfo.message === 'true')
                make.set(
                  doodad,
                  Math.min(
                    make.get(doodad) || 0,
                    creatableAmount(toItem(ocdInfo.info)) * make_q_amount
                  )
                );
              if ((make.get(doodad) || 0) === 0) make.delete(doodad);
              break;
            }
            case 'UNTN':
              untink.set(doodad, excess);
              break;
            case 'USE':
              if (myPath() === 'Bees Hate You' && doodad.name.includes('b'))
                break;
              usex.set(doodad, excess);
              break;
            case 'PULV':
              // Some pulverizable items aren't tradeable. If so, wadbot cannot be used
              if (haveSkill(Skill.get('Pulverize')) || isTradeable(doodad))
                pulv.set(doodad, excess);
              break;
            case 'MALL':
              mall.set(doodad, excess);
              break;
            case 'AUTO':
              auto.set(doodad, excess);
              break;
            case 'DISC':
              disc.set(doodad, excess);
              break;
            case 'DISP':
              if (haveDisplay()) disp.set(doodad, excess);
              // else KEEP
              break;
            case 'CLST':
              clst.set(doodad, excess);
              break;
            case 'CLAN':
              clan.set(doodad, excess);
              break;
            case 'GIFT': {
              const giftList =
                gift.get(ocdInfo.info) || new Map<Item, number>();
              gift.set(ocdInfo.info, giftList);
              giftList.set(doodad, excess);
              break;
            }
            case 'TODO':
              todo.set(doodad, excess);
              break;
            case 'KEEP':
              break;
            // @ts-expect-error KBAY is deprecated and should not be used
            case 'KBAY':
              // Treat KBAY as uncategorized items
              vprint(
                `KBAY is deprecated. ${doodad} is treated as uncategorized.`,
                -1
              );
            // fall through
            default:
              if (stop_for_relay(doodad)) return false;
          }
      } else {
        if (stop_for_relay(doodad)) return false;
        // Potentially disasterous, but this will cause the script to sell off unlisted items, just like it used to.
        if (getvar('BaleOCD_MallDangerously') === 'true')
          mall.set(doodad, excess); // Backwards compatibility FTW!
      }
    }
    return true;
  }

  function sale_price(it: Item): number {
    let price = 0;
    if (historicalAge(it) < 1 && historicalPrice(it) > 0)
      price = historicalPrice(it);
    else price = mallPrice(it);
    if (price < 1) price = 0;
    const preferredPrice = Number(OCD.get(it)?.info);
    if (Number.isInteger(preferredPrice))
      return Math.max(preferredPrice, price);
    return price;
  }

  function print_cat(cat: Map<Item, number>, act: OcdAction, to: string): void {
    if (cat.size < 1) return;

    const catOrder = Array.from(cat.keys()).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    let len = 0,
      total = 0,
      linevalue = 0;
    let queue = '';
    let com = command[act] || '';
    if (act === 'GIFT') com += to + ': ';
    function print_line(): boolean {
      vprint(com + queue, color_info(), 3);
      if (act === 'MALL')
        vprint('Sale price for this line: ' + rnum(linevalue), color_info(), 3);
      vprint(' ', 3);
      len = 0;
      total += linevalue;
      linevalue = 0;
      queue = '';
      return true;
    }

    catOrder.forEach(it => {
      const quant = cat.get(it) || 0;
      if (
        it === Item.get('Degrassi Knoll shopping list') &&
        itemAmount(Item.get("bitchin' meatcar")) === 0
      )
        return;
      if (len !== 0) queue += ', ';
      queue += quant + ' ' + it;
      if (act === 'MALL') {
        if (!use_multi) {
          price.set(it, sale_price(it));
          if (getvar('BaleOCD_Pricing') === 'auto')
            queue += ' @ ' + rnum(price.get(it) || 0);
        }
        linevalue += quant * (price.get(it) || 0);
      } else if (act === 'MAKE') {
        queue += ` into ${OCD.get(it)?.info}`;
      } else if (act === 'AUTO') {
        linevalue += quant * autosellPrice(it);
      }
      len = len + 1;
      if (len === 11) print_line();
    });
    if (len > 0) print_line();

    if (act === 'MALL') {
      if (!use_multi)
        vprint('Total mall sale = ' + rnum(total), color_info(), 3);
    } else if (act === 'AUTO')
      vprint('Total autosale = ' + rnum(total), color_info(), 3);
    FinalSale += total;
  }

  function other_clover(it: Item): Item {
    if (it === Item.get('ten-leaf clover'))
      return Item.get('disassembled clover');
    return Item.get('ten-leaf clover');
  }

  // This is only called if the player has both kinds of clovers, so no need to check if stock contains both
  function clovers_needed(): number {
    return (
      (stock.get(Item.get('ten-leaf clover'))?.q || 0) +
      (stock.get(Item.get('disassembled clover'))?.q || 0) -
      full_amount(Item.get('ten-leaf clover')) -
      full_amount(Item.get('disassembled clover'))
    );
  }

  function doStock(): boolean {
    let success = true;
    let first = true;
    function stockit(q: number, it: Item): boolean {
      q = q - closetAmount(it) - storageAmount(it) - equippedAmount(it);
      if (q < 1) return true;
      if (first)
        first = !vprint('Stocking up on required items!', color_info(), 3);
      return retrieveItem(q, it);
    }

    load_OCD();
    batchOpen();
    stock.forEach((ocdStock, it) => {
      // Someone might want both assembled and disassembled clovers. Esure there are enough of combined tot
      if (
        Item.get(['ten-leaf clover', 'disassembled clover']).includes(it) &&
        stock.has(other_clover(it)) &&
        clovers_needed() > 0
      )
        cliExecute(
          `cheapest ten-leaf clover, disassembled clover; acquire ${
            clovers_needed() - availableAmount(it)
          } it`
        );
      if (full_amount(it) < ocdStock.q && !stockit(ocdStock.q, it)) {
        success = false;
        print(
          'Failed to stock ' +
            (ocdStock.q > 1 ? ocdStock.q + ' ' + it.plural : 'a ' + it),
          color_error()
        );
      }
      // Closet everything (except for gear) that is stocked so it won't get accidentally used.
      if (
        toSlot(it) === Slot.get('none') &&
        ocdStock.q - (OCD.get(it)?.q || 0) > closetAmount(it) &&
        itemAmount(it) > (OCD.get(it)?.q || 0)
      )
        putCloset(
          Math.min(
            itemAmount(it) - (OCD.get(it)?.q || 0),
            ocdStock.q - (OCD.get(it)?.q || 0) - closetAmount(it)
          ),
          it
        );
    });
    batchClose();
    return success;
  }

  function wadbot(pulverize: Map<Item, number>): boolean {
    function wadmessage(): string {
      for (let x = 1444; x <= 1449; ++x)
        if (OCD.get(toItem(x))?.action === 'PULV') return 'wads';
      for (let x = 1438; x <= 1443; ++x)
        if (OCD.get(toItem(x))?.action === 'PULV') return 'nuggets';
      return '';
    }

    pulverize.forEach((quant, thing) => {
      if (is_wadable(thing)) {
        quant -= quant % 5;
        if (quant < 1) pulv.delete(thing);
      }
    });
    if (pulv.size < 1) {
      vprint('Nothing to pulverize after all.', color_info(), 3);
      return false;
    }
    if (canInteract() && isOnline('smashbot')) {
      vprint('Sending pulverizables to: Smashbot', color_info(), 3);
      kmail('smashbot', wadmessage(), 0, pulv);
    } else if (isOnline('wadbot')) {
      vprint('Sending pulverizables to: Wadbot', color_info(), 3);
      kmail('wadbot', '', 0, pulv);
    } else {
      return vprint(
        'Neither Wadbot nor Smashbot are currently online! Pulverizables will not be sent at this time, just in case.',
        color_warning(),
        -3
      );
    }
    return true;
  }

  function pulverize(): boolean {
    if (pulv.size < 1) return false;
    if (!haveSkill(Skill.get('Pulverize'))) return wadbot(pulv);
    let len = 0;
    let queue = '';
    const malus = new Map<Item, number>();
    pulv.forEach((quant, it) => {
      if (myPrimestat() !== Stat.get('muscle') && is_wadable(it)) {
        malus.set(it, quant);
      } else {
        if (len !== 0) queue += ', ';
        queue += `${quant} \u00B6${toInt(it)}`;
        len = len + 1;
        if (len === 11) {
          cliExecute(command['PULV'] + queue);
          len = 0;
          queue = '';
        }
      }
    });
    if (len > 0) cliExecute(command['PULV'] + queue);
    if (malus.size > 0) wadbot(malus);
    return true;
  }

  function sauce_mult(itm: Item): number {
    if (myClass() === Class.get('sauceror'))
      switch (itm) {
        case Item.get('philter of phorce'):
        case Item.get('Frogade'):
        case Item.get('potion of potency'):
        case Item.get('oil of stability'):
        case Item.get('ointment of the occult'):
        case Item.get('salamander slurry'):
        case Item.get('cordial of concentration'):
        case Item.get('oil of expertise'):
        case Item.get('serum of sarcasm'):
        case Item.get('eyedrops of newt'):
        case Item.get('eyedrops of the ermine'):
        case Item.get('oil of slipperiness'):
        case Item.get('tomato juice of powerful power'):
        case Item.get('banana smoothie'):
        case Item.get('perfume of prejudice'):
        case Item.get('libation of liveliness'):
        case Item.get('milk of magnesium'):
        case Item.get('papotion of papower'):
        case Item.get('oil of oiliness'):
        case Item.get('cranberry cordial'):
        case Item.get('concoction of clumsiness'):
        case Item.get('phial of hotness'):
        case Item.get('phial of coldness'):
        case Item.get('phial of stench'):
        case Item.get('phial of spookiness'):
        case Item.get('phial of sleaziness'):
        case Item.get("Ferrigno's Elixir of Power"):
        case Item.get('potent potion of potency'):
        case Item.get('plum lozenge'):
        case Item.get("Hawking's Elixir of Brilliance"):
        case Item.get('concentrated cordial of concentration'):
        case Item.get('pear lozenge'):
        case Item.get("Connery's Elixir of Audacity"):
        case Item.get('eyedrops of the ocelot'):
        case Item.get('peach lozenge'):
        case Item.get('cologne of contempt'):
        case Item.get('potion of temporary gr8ness'):
        case Item.get('blackberry polite'):
          return 3;
      }
    return 1;
  }

  function create_it(it: Item, quant: number): boolean {
    const obj = toItem(OCD.get(it)?.info || '');
    if ((make_q.get(it) || 0) === 0) return false;
    quant = (quant / (make_q.get(it) || 0)) * sauce_mult(it);
    if (quant > 0) return create(quant, obj);
    return false;
  }

  function use_it(quant: number, it: Item): boolean {
    function use_map(required: Item): boolean {
      cliExecute('checkpoint');
      if (required === Item.get('none'))
        cliExecute('maximize stench resistance, 1 min');
      else {
        retrieveItem(1, required);
        equip(required);
      }
      const success = use(1, it);
      cliExecute('outfit checkpoint');
      return success;
    }
    switch (it) {
      case Item.get("the Slug Lord's map"):
        return use_map(Item.get('none'));
      case Item.get("Dr. Hobo's map"): {
        const whip =
          Item.get([
            'Bar whip',
            'Bat whip',
            'Clown whip',
            'Demon whip',
            'Dishrag',
            'Dreadlock whip',
            'Gnauga hide whip',
            'Hippo whip',
            'Palm-frond whip',
            'Penguin whip',
            'Rattail whip',
            'Scorpion whip',
            "Tail o' nine cats",
            'White whip',
            'Wumpus-hair whip',
            'Yak whip',
          ]).find(it => itemAmount(it) > 0 && canEquip(it)) ||
          Item.get('cool whip');
        retrieveItem(1, Item.get('asparagus knife'));
        return use_map(whip);
      }
      case Item.get("Dolphin King's map"): {
        const breather =
          Item.get(['aerated diving helmet', 'makeshift SCUBA gear']).find(
            it => itemAmount(it) > 0 && canEquip(it)
          ) || Item.get('snorkel');
        return use_map(breather);
      }
      case Item.get('Degrassi Knoll shopping list'):
        if (itemAmount(Item.get("bitchin' meatcar")) === 0) return false;
        break;
    }
    return use(quant, it);
  }

  function makeMessage(cat: Map<Item, number>): string {
    for (const key of cat.keys()) {
      return OCD.get(key)?.message || '';
    }
    return '';
  }

  /**
   * Process a collection of items using a given action.
   * @param cat Collection of items and their amounts to be processed
   * @param act Item action ID
   * @param Receiving player ID. Used for actions that involve another player
   * 	  (e.g. "GIFT")
   * @return Whether all items were processed successfully
   */
  function act_cat(
    cat: Map<Item, number>,
    act: OcdAction,
    to: string
  ): boolean {
    const catOrder: Item[] = Array.from(cat.keys()).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    if (cat.size === 0) return false;
    let i = 0;
    if (act === 'TODO' && todo.size > 0) print('');
    else print_cat(cat, act, to);
    if (getvar('BaleOCD_Sim') === 'true') return true;
    switch (act) {
      case 'PULV':
        return pulverize();
      // @ts-expect-error Fall through in ASH code; not sure if this is intentional
      case 'MALL':
        if (use_multi)
          return kmail(
            getvar('BaleOCD_MallMulti'),
            getvar('BaleOCD_MultiMessage'),
            0,
            cat
          );
      // fall through
      case 'AUTO':
      case 'DISP':
      case 'CLST':
      case 'CLAN':
        batchOpen();
        break;
      case 'GIFT': {
        const message = makeMessage(cat);
        return kmail(to, message, 0, cat, message);
      }
      // @ts-expect-error KBAY is deprecated and should not be used
      case 'KBAY':
        // This should be unreachable
        abort('KBAY action is no longer available');
    }
    catOrder.forEach(it => {
      const quant = cat.get(it) || 0;
      switch (act) {
        case 'BREAK':
          for (let i = 0; i < quant; ++i) {
            visitUrl(
              `inventory.php?action=breakbricko&pwd&ajax=1&whichitem=${toInt(
                it
              )}`
            );
          }
          break;
        case 'MALL':
          if (getvar('BaleOCD_Pricing') === 'auto') {
            const itemPrice = price.get(it) || 0;
            if (itemPrice > 0)
              // If price is -1, then there was an error.
              putShop(itemPrice, 0, quant, it); // itemPrice was found during print_cat()
          } else putShop(shopAmount(it) > 0 ? shopPrice(it) : 0, 0, quant, it); // Set to max price of 999,999,999 meat
          break;
        case 'AUTO':
          autosell(quant, it);
          break;
        case 'DISC':
          for (let i = 1; i <= quant; ++i) {
            if (i % 10 === 0) print(`Discarding ${i} of ${quant}...`);
            visitUrl(
              `inventory.php?action=discard&pwd&ajax=1&whichitem=${toInt(it)}`
            );
          }
          break;
        case 'USE':
          use_it(quant, it);
          break;
        case 'MAKE':
          create_it(it, quant);
          break;
        case 'UNTN':
          cliExecute(`untinker ${quant} \u00B6${toInt(it)}`);
          break;
        case 'DISP':
          putDisplay(quant, it);
          break;
        case 'CLST':
          putCloset(quant, it);
          break;
        case 'CLAN':
          putStash(quant, it);
          break;
        case 'TODO':
          printHtml(`<b>${it} (${quant}): ${OCD.get(it)?.info}</b>`);
          break;
      }
      i += 1;
      // If there are too many items batched mafia may run out of memory.
      // On poor systems, it usually happens around 20 transfers, so stop at 15.
      if (
        i >= 165 &&
        (act === 'MALL' ||
          act === 'AUTO' ||
          act === 'DISP' ||
          act === 'CLST' ||
          act === 'CLAN')
      ) {
        batchClose();
        i = 0;
        batchOpen();
      }
    });
    if (
      act === 'MALL' ||
      act === 'AUTO' ||
      act === 'DISP' ||
      act === 'CLST' ||
      act === 'CLAN'
    )
      batchClose();
    return true;
  }

  function ocd_inventory(StopForMissingItems: boolean): boolean {
    if (!load_OCD()) return false;
    const newStock = loadOcdStockFile(
      `OCDstock_${getvar('BaleOCD_StockFile')}.txt`
    );
    if ((!newStock || newStock.size === 0) && getvar('BaleOCD_Stock') === '1') {
      print('You are missing item stocking information.', color_error());
      return false;
    }
    stock = newStock || new Map();

    if (!check_inventory(StopForMissingItems)) return false;
    if (act_cat(brak, 'BREAK', '') && !check_inventory(StopForMissingItems))
      return false;
    if (act_cat(make, 'MAKE', '') && !check_inventory(StopForMissingItems))
      return false;
    if (act_cat(untink, 'BREAK', '') && !check_inventory(StopForMissingItems))
      return false;
    if (act_cat(untink, 'UNTN', '') && !check_inventory(StopForMissingItems))
      return false;
    if (act_cat(usex, 'USE', '') && !check_inventory(StopForMissingItems))
      return false;
    if (act_cat(pulv, 'PULV', '') && !check_inventory(StopForMissingItems))
      return false;

    act_cat(mall, 'MALL', '');
    act_cat(auto, 'AUTO', '');
    act_cat(disc, 'DISC', '');
    act_cat(disp, 'DISP', '');
    act_cat(clst, 'CLST', '');
    act_cat(clan, 'CLAN', '');
    if (gift.size > 0) {
      gift.forEach((giftList, person) => {
        act_cat(giftList, 'GIFT', person);
      });
    }

    if (getvar('BaleOCD_Stock') === '1' && getvar('BaleOCD_Sim') !== 'true')
      doStock();

    act_cat(todo, 'TODO', '');

    if (getvar('BaleOCD_Sim') === 'true')
      vprint(
        'This was only a test. Had this been an actual OCD incident your inventory would be clean right now.',
        color_success(),
        3
      );
    return true;
  }

  // *******  Finally, here is the main for ocd_control()
  // int ocd_control(boolean StopForMissingItems) {

  cliExecute('inventory refresh');

  // Empty closet before emptying out Hangks, otherwise it may interfere with which Hangk's items go to closet
  if (
    Number(getvar('BaleOCD_EmptyCloset')) >= 0 &&
    Number(getProperty('lastEmptiedStorage')) !== myAscensions() &&
    getvar('BaleOCD_Sim') === 'false'
  )
    emptyCloset();

  // Empty out Hangks, so it can be accounted for by what follows.
  if (
    autoSatisfyWithStorage &&
    Number(getProperty('lastEmptiedStorage')) !== myAscensions()
  )
    visitUrl('storage.php?action=pullall&pwd');

  let success = false;
  try {
    if (autoSatisfyWithCloset) setProperty('autoSatisfyWithCloset', 'false');
    if (autoSatisfyWithStash) setProperty('autoSatisfyWithStash', 'false');
    if (
      autoSatisfyWithStorage &&
      Number(getProperty('lastEmptiedStorage')) !== myAscensions()
    )
      setProperty('autoSatisfyWithStorage', 'false');
    // Yay! Get rid of the excess inventory!
    success = ocd_inventory(
      StopForMissingItems && getvar('BaleOCD_MallDangerously') !== 'true'
    );
  } finally {
    // Ensure properties are restored, even if the user aborted execution
    if (autoSatisfyWithCloset) setProperty('autoSatisfyWithCloset', 'true');
    if (autoSatisfyWithStorage) setProperty('autoSatisfyWithStorage', 'true');
    if (autoSatisfyWithStash) setProperty('autoSatisfyWithStash', 'true');
  }
  print('');
  return success ? FinalSale : -1;
}

export function main(): void {
  function canInteractCheck(): boolean {
    if (canInteract()) return true;

    const action = getvar('BaleOCD_RunIfRoninOrHC');
    if (action === 'never') return false;
    if (action === 'always') return true;
    return userConfirm(
      'You are in Ronin/Hardcore. Do you want to run OCD Cleanup anyway?'
    );
  }

  if (canInteractCheck()) {
    const todaysFarming = ocd_control(true);
    if (todaysFarming < 0)
      vprint(
        'OCD Control was unable to obssessively control your entire inventory.',
        color_error(),
        -1
      );
    else if (todaysFarming === 0)
      vprint(
        'Nothing to do. I foresee no additional meat in your future.',
        color_warning(),
        3
      );
    else {
      vprint(
        `Anticipated monetary gain from inventory cleansing: ${rnum(
          todaysFarming
        )} meat.`,
        color_success(),
        3
      );
    }
  } else
    vprint(
      "Whoa! Don't run this until you break the prism!",
      color_error(),
      -3
    );
}
