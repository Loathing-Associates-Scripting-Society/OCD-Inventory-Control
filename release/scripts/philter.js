'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var kolmafia = require('kolmafia');
var zlib_ash = require('zlib.ash');

/**
 * @file Provides methods for logging colored text.
 */
function error(message) {
    zlib_ash.vprint(message, kolmafia.isDarkMode() ? '#ff0033' : '#cc0033', 1);
}
function warn(message) {
    zlib_ash.vprint(message, kolmafia.isDarkMode() ? '#cc9900' : '#cc6600', 2);
}
function info(message) {
    zlib_ash.vprint(message, kolmafia.isDarkMode() ? '#0099ff' : '3333ff', 3);
}
function success(message) {
    zlib_ash.vprint(message, kolmafia.isDarkMode() ? '#00cc00' : '#008000', 2);
}
function debug(message) {
    zlib_ash.vprint(message, '#808080', 6);
}

function checkProjectUpdates() {
    // Check version! This will check both scripts and data files.
    // This code is at base level so that the relay script's importation will automatically cause it to be run.
    var PROJECT_NAME = 'Loathing-Associates-Scripting-Society-philter-trunk-release';
    if (kolmafia.svnExists(PROJECT_NAME) &&
        kolmafia.getProperty('_svnUpdated') === 'false' &&
        kolmafia.getProperty('_ocdUpdated') !== 'true') {
        if (!kolmafia.svnAtHead(PROJECT_NAME)) {
            warn('Philter has become outdated. Automatically updating from SVN...');
            kolmafia.cliExecute("svn update " + PROJECT_NAME);
            success("On the script's next invocation it will be up to date.");
        }
        kolmafia.setProperty('_ocdUpdated', 'true');
    }
}

/**
 * Object whose keys are string values that make up the `CleanupAction` type.
 * Also used to check at runtime if a string belongs to `CleanupAction`.
 * The values are unused; they can be anything.
 */
var _cleanupActions = Object.freeze({
    AUTO: 0,
    BREAK: 0,
    CLAN: 0,
    CLST: 0,
    DISC: 0,
    DISP: 0,
    GIFT: 0,
    KEEP: 0,
    MAKE: 0,
    MALL: 0,
    PULV: 0,
    TODO: 0,
    UNTN: 0,
    USE: 0,
});
/**
 * Checks if the given value is a valid `CleanupAction` type.
 */
var isCleanupAction = function (value) {
    return typeof value === 'string' &&
        Object.prototype.hasOwnProperty.call(_cleanupActions, value);
};

/**
 * Factory function for functions that parse a text file into a Map using
 * KoLmafia's file I/O API.
 * Any comments and empty lines in the text file are ignored.
 * @param parse Callback used to parse each row.
 *    The callback may accept the following arguments:
 *
 *    - `row`: Array of strings representing each cell
 *    - `rowNum`: Row number, _starts at 1_
 *    - `filename`: Path to the text file being parsed
 *
 *    The callback must return a tuple of `[key, value]`.
 *    If the row is malformed, the callback may throw an exception.
 * @return Function that accepts a file name as a parameter, and returns a Map.
 *    If the file cannot be found or is empty, this function will return an
 *    empty map.
 */
function createMapLoader(parse) {
    return function (filename) {
        var entries = new Map();
        var rawData = kolmafia.fileToArray(filename);
        for (var _i = 0, _a = Object.keys(rawData); _i < _a.length; _i++) {
            var indexStr = _a[_i];
            var row = rawData[indexStr].split('\t');
            var _b = parse(row, Number(indexStr), filename), key = _b[0], value = _b[1];
            entries.set(key, value);
        }
        return entries.size ? entries : null;
    };
}
/**
 * Converts an object to a Map, converting each key to an `Item` object.
 * @param items Object whose keys are item names
 * @return Mapping of Item to amount
 */
function toItemMap(items) {
    return new Map(Object.keys(items).map(function (itemStr) { return [Item.get(itemStr), items[itemStr]]; }));
}

/**
 * @file Tools for manipulating cleanup ruleset files.
 */
/**
 * Loads a cleanup ruleset from a text file into a Map.
 * @param filename Path to the data file
 * @return Map of each item to its cleanup rule. If the user's cleanup ruleset
 *    file is empty or missing, returns `null`.
 * @throws {TypeError} If the file contains invalid data
 */
var loadCleanupRulesetFile = createMapLoader(function (_a, _, filename) {
    var itemName = _a[0], action = _a[1], keepAmountStr = _a[2], info = _a[3], message = _a[4];
    if (!isCleanupAction(action)) {
        throw new TypeError(action + " is not a valid cleanup action (file: " + filename + ", entry: " + itemName + ")");
    }
    var rule;
    if (action === 'GIFT') {
        rule = { action: action, recipent: info, message: message };
    }
    else if (action === 'MAKE') {
        rule = {
            action: action,
            targetItem: info,
            shouldUseCreatableOnly: kolmafia.toBoolean(message),
        };
    }
    else if (action === 'MALL') {
        var minPrice = Number(info);
        if (!Number.isInteger(minPrice)) {
            throw new TypeError("Invalid minimum price " + minPrice + " for MALL rule (file: " + filename + ", entry: " + itemName + ")");
        }
        rule = { action: action, minPrice: minPrice };
    }
    else if (action === 'TODO') {
        // Curiously, Philter stores the message in the 'info' field
        rule = { action: action, message: info };
    }
    else {
        rule = { action: action };
    }
    var keepAmount = Number(keepAmountStr);
    if (!Number.isInteger(keepAmount)) {
        throw new TypeError("Invalid keep amount " + keepAmountStr + " (file: " + filename + ", entry: " + itemName + ")");
    }
    if (keepAmount > 0) {
        rule.keepAmount = keepAmount;
    }
    return [kolmafia.toItem(itemName), rule];
});

/**
 * Checks if an item can be cleaned up by Philter.
 *
 * Generally, this rejects most items that cannot be put in the display case
 * (e.g. quest items). However, several items that Philter knows how to handle
 * are exempt from this rule.
 * @param item Item to check
 * @return Whether the item can be cleaned up by Philter
 */
function isCleanable(it) {
    // For some reason Item.get("none") is displayable
    if (it === Item.get('none'))
        { return false; }
    if (Item.get([
        "Boris's key",
        "Jarlsberg's key",
        "Richard's star key",
        "Sneaky Pete's key",
        'digital key',
        "the Slug Lord's map",
        "Dr. Hobo's map",
        "Dolphin King's map",
        'Degrassi Knoll shopping list',
        '31337 scroll',
        'dead mimic',
        "fisherman's sack",
        'fish-oil smoke bomb',
        'vial of squid ink',
        'potion of fishy speed',
        'blessed large box' ]).includes(it)) {
        return true;
    }
    // Let these hide in your inventory until it is time for them to strike!
    // TODO: Revisit how this is handled.
    // Since a player can have multiple DNOTC boxes from different years, and we
    // don't know the associated year of a DNOTC box, our best bet is to try
    // opening them all.
    if (it === Item.get('DNOTC Box')) {
        var today = kolmafia.todayToString();
        if (today.slice(4, 6) === '12' && Number(today.slice(6, 8)) < 25) {
            return false;
        }
    }
    return kolmafia.isDisplayable(it);
}

/**
 * @file Tools for loading and manipulating Philter configuration.
 */
/**
 * Namespace object that maps each config key to their ZLib variable name.
 */
var CONFIG_NAMES = Object.freeze({
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
function setDefaultConfig() {
    zlib_ash.setvar(CONFIG_NAMES.mallMultiName, '');
    zlib_ash.setvar(CONFIG_NAMES.canUseMallMulti, true);
    zlib_ash.setvar(CONFIG_NAMES.mallMultiKmailMessage, 'Mall multi dump');
    zlib_ash.setvar(CONFIG_NAMES.dataFileName, kolmafia.myName());
    zlib_ash.setvar(CONFIG_NAMES.stockFileName, kolmafia.myName());
    zlib_ash.setvar(CONFIG_NAMES.mallPricingMode, 'auto');
    zlib_ash.setvar(CONFIG_NAMES.simulateOnly, false);
    zlib_ash.setvar(CONFIG_NAMES.emptyClosetMode, 0);
    // ZLib variables that are not exposed yet
    // TODO: Load and save these variables, too
    // Should items be acquired for stock (0: no, 1: yes)
    zlib_ash.setvar('BaleOCD_Stock', 0);
    // Should Hangk's Storange be emptied? (0: no, 1: yes)
    zlib_ash.setvar('BaleOCD_EmptyHangks', 0);
    // Whether to mallsell any uncategorized items (DANGEROUS)
    zlib_ash.setvar('BaleOCD_MallDangerously', false);
    // Controls whether to run OCD-Cleanup if the player is in Ronin/Hardcore.
    // -"ask": Ask the user
    // -"never": Never run if in Ronin/Hardcore
    // -"always": Always run, even if in Ronin/Hardcore
    zlib_ash.setvar('BaleOCD_RunIfRoninOrHC', 'ask');
}
function loadCleanupConfig() {
    var emptyClosetMode = parseInt(zlib_ash.getvar(CONFIG_NAMES.emptyClosetMode));
    var mallPricingMode = zlib_ash.getvar(CONFIG_NAMES.mallPricingMode);
    return {
        emptyClosetMode: emptyClosetMode === 0 || emptyClosetMode === -1 ? emptyClosetMode : 0,
        simulateOnly: kolmafia.toBoolean(CONFIG_NAMES.simulateOnly),
        mallPricingMode: mallPricingMode === 'auto' || mallPricingMode === 'max'
            ? mallPricingMode
            : 'auto',
        mallMultiName: zlib_ash.getvar(CONFIG_NAMES.mallMultiName),
        mallMultiKmailMessage: zlib_ash.getvar(CONFIG_NAMES.mallMultiKmailMessage),
        canUseMallMulti: kolmafia.toBoolean(zlib_ash.getvar(CONFIG_NAMES.canUseMallMulti)),
        dataFileName: zlib_ash.getvar(CONFIG_NAMES.dataFileName),
        stockFileName: zlib_ash.getvar(CONFIG_NAMES.stockFileName),
    };
}

/**
 * @file Tools for manipulating stocking ruleset files.
 */
/**
 * Loads a stocking ruleset from a text file into a map.
 * @param fileName Path to the data file
 * @return Map of each item to its stocking rule. If the user's stocking ruleset
 *    file is empty or missing, returns `null`.
 * @throws {TypeError} If the file contains invalid data
 */
var loadStockingRulesetFile = createMapLoader(function (_a, _, fileName) {
    var itemName = _a[0], type = _a[1], amountStr = _a[2], _b = _a[3], category = _b === void 0 ? '' : _b;
    var amount = Number(amountStr);
    if (!Number.isInteger(amount)) {
        throw new TypeError("Invalid stock-up amount (" + amount + ") for item '" + itemName + "' in file '" + fileName + "'");
    }
    return [kolmafia.toItem(itemName), { type: type, amount: amount, category: category }];
});

/**
 * @file Functions for sending Kmails and gifts to other players.
 */
/** Error class used when sending a kmail to another player fails. */
var KmailError = /*@__PURE__*/(function (Error) {
    function KmailError(recipent, message) {
        if (message === undefined) {
            message = "Failed to send gift to '" + recipent + "'";
        }
        Error.call(this, message);
        this.message = message;
        this.recipent = recipent;
    }

    if ( Error ) { KmailError.__proto__ = Error; }
    KmailError.prototype = Object.create( Error && Error.prototype );
    KmailError.prototype.constructor = KmailError;

    return KmailError;
}(Error));
KmailError.prototype.name = 'KmailError';
/**
 * Error class used when a kmail cannot be sent to another player because the
 * recipent is under ascension restrictions and cannot receive meat or items.
 */
var RecipentRestrictedError = /*@__PURE__*/(function (KmailError) {
    function RecipentRestrictedError(recipent) {
        KmailError.call(this, recipent, ("The player '" + recipent + "' cannot receive meat or items due to ascension restrictions"));
    }

    if ( KmailError ) { RecipentRestrictedError.__proto__ = KmailError; }
    RecipentRestrictedError.prototype = Object.create( KmailError && KmailError.prototype );
    RecipentRestrictedError.prototype.constructor = RecipentRestrictedError;

    return RecipentRestrictedError;
}(KmailError));
RecipentRestrictedError.prototype.name = 'RecipentRestrictedError';
var MESSAGE_CHAR_LIMIT = 2000;
var MAX_ITEMS_PER_KMAIL = 11;
/**
 * Sends one or more kmails to another player.
 * If necessary, this will send items using multiple kmails.
 *
 * This will always send at least one kmail.
 * @throws {KmailError} If the kmail cannot be sent for some reason.
 * @throws {RecipentRestrictedError} If the kmail cannot be sent because the
 *    recipent is under ascension restrictions and cannot receive meat or items.
 */
function kmail(ref) {
    var recipent = ref.recipent;
    var message = ref.message; if ( message === void 0 ) { message = ''; }
    var meat = ref.meat; if ( meat === void 0 ) { meat = 0; }
    var items = ref.items; if ( items === void 0 ) { items = new Map(); }

    if (!Number.isInteger(meat)) {
        throw new KmailError(("Meat amount must be integer (got " + meat + ")"));
    }
    else if (meat < 0) {
        throw new KmailError(("Invalid meat amount: " + meat));
    }
    else if (meat > kolmafia.myMeat()) {
        throw new KmailError(("You don't have " + meat + " meat"));
    }
    for (var [item, amount] of items) {
        if (item === Item.get('none')) {
            throw new KmailError(recipent, ("Invalid item: " + item));
        }
        else if (!kolmafia.isTradeable(item)) {
            throw new KmailError(recipent, ("Item cannot be sent by Kmail: " + item));
        }
        if (!(Number.isInteger(amount) && amount > 0)) {
            throw new KmailError(recipent, ("Invalid item amount: Cannot send " + amount + " of " + item));
        }
        else if (kolmafia.itemAmount(item) < amount) {
            throw new KmailError(recipent, ("Insufficient item in inventory: Cannot send " + amount + " of " + item));
        }
    }
    if (message.length > MESSAGE_CHAR_LIMIT) {
        throw new KmailError(("Message is too long, must be truncated to " + MESSAGE_CHAR_LIMIT));
    }
    var itemsToSend = Array.from(items);
    var isFirstKmail = true;
    // Always send the first message
    for (var i = 0; i < itemsToSend.length || isFirstKmail; i += MAX_ITEMS_PER_KMAIL) {
        var itemUrlStr = itemsToSend
            .slice(i, i + MAX_ITEMS_PER_KMAIL)
            .map((ref, index) => {
                var item = ref[0];
                var amount = ref[1];

                return ("howmany" + (index + 1) + "=" + amount + "&whichitem" + (index + 1) + "=" + (kolmafia.toInt(item)));
        })
            .join('&');
        var meatToSend = isFirstKmail ? meat : 0;
        var response = kolmafia.visitUrl(("sendmessage.php?pwd=&action=send&towho=" + recipent + "&message=" + message + "&sendmeat=" + meatToSend + "&" + itemUrlStr));
        if (response.includes('That player cannot receive Meat or items')) {
            throw new RecipentRestrictedError(recipent);
        }
        if (!response.includes('Message sent.')) {
            throw new KmailError(("Failed to send message to " + recipent + " for some reason"));
        }
        isFirstKmail = false;
    }
}
/** Error class used when sending a gift to another player fails. */
var GiftError = /*@__PURE__*/(function (Error) {
    function GiftError(recipent, message) {
        if (message === undefined) {
            message = "Failed to send gift to '" + recipent + "'";
        }
        Error.call(this, recipent);
        this.message = message;
        this.recipent = recipent;
    }

    if ( Error ) { GiftError.__proto__ = Error; }
    GiftError.prototype = Object.create( Error && Error.prototype );
    GiftError.prototype.constructor = GiftError;

    return GiftError;
}(Error));
GiftError.prototype.name = 'GiftError';
/**
 * Sends meat or items to another player using one or more gift boxes.
 * This will send multiple gift boxes to send all given items.
 * @throws {GiftError} If the gift(s) cannot be sent for some reason.
 */
function sendGift(ref) {
    var recipent = ref.recipent;
    var message = ref.message; if ( message === void 0 ) { message = ''; }
    var meat = ref.meat; if ( meat === void 0 ) { meat = 0; }
    var items = ref.items; if ( items === void 0 ) { items = new Map(); }
    var insideNote = ref.insideNote; if ( insideNote === void 0 ) { insideNote = ''; }
    var useStorage = ref.useStorage;

    if (!Number.isInteger(meat)) {
        throw new GiftError(("Meat amount must be integer (got " + meat + ")"));
    }
    else if (meat < 0) {
        throw new GiftError(("Invalid meat amount: " + meat));
    }
    for (var [item, amount] of items) {
        if (item === Item.get('none')) {
            throw new GiftError(recipent, ("Invalid item: " + item));
        }
        else if (!kolmafia.isGiftable(item)) {
            throw new GiftError(recipent, ("Item is not giftable: " + item));
        }
        if (!(Number.isInteger(amount) && amount > 0)) {
            throw new GiftError(recipent, ("Invalid item amount: Cannot send " + amount + " of " + item));
        }
        else if ((useStorage ? kolmafia.storageAmount(item) : kolmafia.itemAmount(item)) < amount) {
            throw new GiftError(recipent, ("Insufficient item in " + (useStorage ? 'storage' : 'inventory') + ": Cannot send " + amount + " of " + item));
        }
    }
    if (meat === 0 && items.size === 0) {
        // KoL message: "Getting an empty package would be just about the most
        // disappointing thing ever."
        throw new GiftError(recipent, 'Cannot send 0 meat and no items in a gift package');
    }
    // Always use plain brown wrapper or less-than-three-shaped box, since they
    // are the cheapest options per item
    var packagingCost = items.size * 50;
    if ((useStorage ? kolmafia.myStorageMeat() : kolmafia.myMeat()) < meat + packagingCost) {
        throw new GiftError(recipent, ("Insufficient meat in " + (useStorage ? 'storage' : 'inventory') + ": Cannot send " + meat + " meat and " + (items.size) + " item" + (items.size > 1 ? 's' : '')));
    }
    var itemsToSend = Array.from(items);
    var meatToSend = meat;
    var MAX_ITEMS_PER_PACKAGE = 2;
    var prefix = useStorage ? 'hagnks_' : '';
    for (var i = 0; i < itemsToSend.length || meatToSend > 0; i += MAX_ITEMS_PER_PACKAGE) {
        var itemsForCurrentPackage = itemsToSend.slice(i, i + MAX_ITEMS_PER_PACKAGE);
        // 1 for plain brown wrapper, 2 for less-than-three-shaped box
        var packageType = itemsForCurrentPackage.length > 1 ? 2 : 1;
        var itemSource = useStorage ? 1 : 0;
        var itemUrlStr = itemsForCurrentPackage
            .map((ref, index) => {
                var item = ref[0];
                var amount = ref[1];

                return (prefix + "howmany" + (index + 1) + "=" + amount + "&" + prefix + "whichitem" + (index + 1) + "=" + (kolmafia.toInt(item)));
        })
            .join('&');
        var response = kolmafia.visitUrl(("town_sendgift.php?pwd=&towho=" + recipent + "&note=" + message + "&insidenote=" + insideNote + "&whichpackage=" + packageType + "&fromwhere=" + itemSource + "&sendmeat=" + meatToSend + "&action=Yep.&" + itemUrlStr));
        if (response.includes('gift box spamming problem')) {
            throw new GiftError(recipent, ("Cannot send gift to " + recipent + ": Daily gift box limit reached"));
        }
        if (!response.includes('Package sent.')) {
            throw new GiftError(recipent, ("Failed to send a gift to " + recipent + " for some reason"));
        }
        meatToSend = 0;
    }
}
/**
 * Sends kmails and/or gift messages to another player.
 *
 * This will always send meat and items from the inventory.
 * To send meat and items in the storage, use {@link sendGift `sendGift()`}
 * instead.
 * @throws {KmailError | GiftError}
 */
function sendToPlayer(ref) {
    var recipent = ref.recipent;
    var message = ref.message;
    var meat = ref.meat;
    var items = ref.items; if ( items === void 0 ) { items = new Map(); }
    var insideNote = ref.insideNote;

    var messageItems = new Map();
    var giftItems = new Map();
    for (var [item, amount] of items) {
        if (kolmafia.isTradeable(item)) {
            messageItems.set(item, amount);
        }
        else if (kolmafia.isGiftable(item)) {
            giftItems.set(item, amount);
        }
        else {
            throw new GiftError((item + " cannot be sent to another player because it is neither tradable nor giftable"));
        }
    }
    var hasSentMeat = false;
    try {
        kmail({ recipent: recipent, message: message, meat: meat, items: new Map(messageItems) });
        hasSentMeat = true;
    }
    catch (error) {
        if (error instanceof RecipentRestrictedError) {
            giftItems = items;
        }
        else {
            throw error;
        }
    }
    // Send gift
    if (giftItems.size > 0 || !hasSentMeat) {
        sendGift({
            recipent: recipent,
            message: message,
            meat: meat,
            items: giftItems,
            insideNote: insideNote,
            useStorage: false,
        });
    }
}
/**
 * Saves your current outfit using the `checkpoint` gCLI command, executes a
 * callback, then restores the saved outfit.
 * @param callback Callback to run
 * @return Return value of callback
 */
function withOutfitCheckpoint(callback) {
    if (!kolmafia.cliExecute('checkpoint')) {
        throw new Error('withOutfitCheckpoint(): failed to create checkpoint');
    }
    try {
        return callback();
    }
    finally {
        if (!kolmafia.outfit('checkpoint')) {
            // eslint-disable-next-line no-unsafe-finally
            throw new Error('withOutfitCheckpoint(): Failed to restore previous outfit');
        }
    }
}
/**
 * Temporarily changes KoLmafia properties while executing a callback.
 * @param properties Object whose keys are property names and values are
 *    property values
 * @param callback Callback to run
 * @return Return value of callback
 */
function withProperties(properties, callback) {
    var oldProperties = Object.keys(properties).map(name => [name, kolmafia.getProperty(name)]);
    for (var name of Object.keys(properties)) {
        kolmafia.setProperty(name, properties[name]);
    }
    try {
        return callback();
    }
    finally {
        for (var [name$1, oldValue] of oldProperties) {
            kolmafia.setProperty(name$1, oldValue);
        }
    }
}

/**
 * @file Simple assertion tools.
 * Note: This module does not rely on KoLmafia's JavaScript API, and can be used
 * in any environment.
 */
/**
 * Thrown when an assertion fails.
 */
var AssertionError = /*@__PURE__*/(function (Error) {
    function AssertionError(message) {
        if ( message === void 0 ) { message = 'Assertion failure'; }

        Error.call(this, message);
        this.message = message;
    }

    if ( Error ) { AssertionError.__proto__ = Error; }
    AssertionError.prototype = Object.create( Error && Error.prototype );
    AssertionError.prototype.constructor = AssertionError;

    return AssertionError;
}(Error));
AssertionError.prototype.name = 'AssertionError';
/**
 * Assert that the condition is truthy.
 * @param cond Condition to check
 * @param message Assertion message
 */
function ok(cond, message) {
    if (!cond) {
        throw new AssertionError(message !== null && message !== void 0 ? message : ("Condition is " + cond));
    }
}
/**
 * Always throw an exception.
 * @param message Assertion message
 */
function fail(message) {
    if ( message === void 0 ) { message = 'Assertion failure'; }

    throw new AssertionError(message);
}
/**
 * Assert that the two values are strictly equal (`===`).
 * @param actual Value to check
 * @param expected Expected value
 * @param message Assertion message
 */
function equal(actual, expected, message) {
    if (actual !== expected) {
        throw new AssertionError(message !== null && message !== void 0 ? message : ("Expected " + actual + " === " + expected));
    }
}

var SAUCE_MULT_POTIONS = new Set(Item.get([
    'philter of phorce',
    'Frogade',
    'potion of potency',
    'oil of stability',
    'ointment of the occult',
    'salamander slurry',
    'cordial of concentration',
    'oil of expertise',
    'serum of sarcasm',
    'eyedrops of newt',
    'eyedrops of the ermine',
    'oil of slipperiness',
    'tomato juice of powerful power',
    'banana smoothie',
    'perfume of prejudice',
    'libation of liveliness',
    'milk of magnesium',
    'papotion of papower',
    'oil of oiliness',
    'cranberry cordial',
    'concoction of clumsiness',
    'phial of hotness',
    'phial of coldness',
    'phial of stench',
    'phial of spookiness',
    'phial of sleaziness',
    "Ferrigno's Elixir of Power",
    'potent potion of potency',
    'plum lozenge',
    "Hawking's Elixir of Brilliance",
    'concentrated cordial of concentration',
    'pear lozenge',
    "Connery's Elixir of Audacity",
    'eyedrops of the ocelot',
    'peach lozenge',
    'cologne of contempt',
    'potion of temporary gr8ness',
    'blackberry polite' ]));
/**
 * Returns the number of `item` that is crafted by your character per craft.
 * This returns 3 for Sauceror potions (only if you are a Sauceror).
 * Otherwise, this returns 1.
 * @param item Item to check
 * @return Amount that will be created by your character
 */
function numCrafted(item) {
    if (kolmafia.myClass() === Class.get('Sauceror') && SAUCE_MULT_POTIONS.has(item)) {
        return 3;
    }
    return 1;
}
function makeItemForCleanup(item, target, amount, makeAmount) {
    if (makeAmount === 0)
        { return false; }
    amount = (amount / makeAmount) * numCrafted(item);
    if (amount > 0)
        { return kolmafia.create(amount, target); }
    return false;
}

function countIngredientRecurse(source, target, underConsideration) {
    // If the source and target are the same item, return 0.
    // This prevents Philter from crafting an item into itself, even if a valid recipe chain exists.
    // (e.g. flat dough -> wad of dough -> flat dough)
    if (source === target)
        { return 0; }
    var total = 0;
    for (var [ingredient, qty] of toItemMap(kolmafia.getIngredients(target))) {
        if (ingredient === source) {
            total += qty;
        }
        else if (underConsideration.has(ingredient)) {
            // Prevent infinite recursion
            // This usually happens when `target` has a circular recipe
            // (e.g. flat dough <-> wad of dough) and `source` is an
            // unrelated item (e.g. pail).
            return 0;
        }
        else {
            // Recursively count how many `source` is needed to make
            // each `ingredient`
            underConsideration.add(ingredient);
            total +=
                qty * countIngredientRecurse(source, ingredient, underConsideration);
            underConsideration.delete(ingredient);
        }
    }
    return total;
}
/**
 * Counts how many of `source` item is needed to craft a `target` item.
 * If `target` requires multiple crafting steps, this checks all parent
 * for uses of `source`.
 *
 * @param source Ingredient item
 * @param target Item to be crafted
 * @return Number of `source` items required to craft `target`.
 *    If `source` and `target` are the same item, returns 0.
 */
function countIngredient(source, target) {
    return countIngredientRecurse(source, target, new Set());
}
function campAmount(it) {
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
            if (toItemMap(kolmafia.getCampground()).has(it))
                { return 1; }
    }
    return 0;
}
function fullAmount(it) {
    return (kolmafia.availableAmount(it) +
        // Some items lurk in the campground
        campAmount(it) +
        // Include Closet
        (!kolmafia.toBoolean(kolmafia.getProperty('autoSatisfyWithCloset')) ? kolmafia.closetAmount(it) : 0) +
        // Include Hangk's Storage
        (!kolmafia.toBoolean(kolmafia.getProperty('autoSatisfyWithStorage')) || !kolmafia.canInteract()
            ? kolmafia.storageAmount(it)
            : 0) -
        // Don't include Clan Stash
        (kolmafia.toBoolean(kolmafia.getProperty('autoSatisfyWithStash')) ? kolmafia.stashAmount(it) : 0));
}
/**
 * Splits an iterable into equal-sized chunks of `length`.
 * @param iter Iterable
 * @param size Max length of each chunk (must be at least 1)
 * @yields Arrays of equal length. The last array may have less than `size`
 *    items, but is never empty.
 *    If `iter` is empty, no array is yielded.
 */
function* grouper(iter, size) {
    if (size < 1) {
        throw new Error(("Chunk size must be at least 1 (got " + size + ")"));
    }
    var chunk = [];
    for (var value of iter) {
        chunk.push(value);
        if (chunk.length >= size) {
            yield chunk;
            chunk = [];
        }
    }
    if (chunk.length > 0)
        { yield chunk; }
}
/**
 * Splits a collection of items into equal-sized chunks, sorted
 * alphabetically by item name.
 * @param items Collection of items. Only the keys (item) are used, and
 *      values (quantities) are ignored.
 * @param size Number of items per chunk (must be at least 1)
 * @yields 0-indexed list of lists of items.
 *      If the input item collection is empty, returns an empty list.
 */
function* splitItemsSorted(items, size) {
    var sortedChunks = grouper(Array.from(items).sort((ref, ref$1) => {
        var itemA = ref[0];
        var itemB = ref$1[0];

        return itemA.name.localeCompare(itemB.name);
    }), size);
    for (var chunk of sortedChunks) {
        yield new Map(chunk);
    }
}

/**
 * Computes the actual amount of `item` to clean up based on its cleanup and
 * stocking rules.
 * This considers equipment in terrarium (but not equipped) for cleanup.
 * @param item Item to check
 * @param cleanupRule Cleanup rule for the item
 * @param stockingRule Stocking rule for the item, if any
 * @return Amount of the item to cleanup
 */
function ocd_amount(item, cleanupRule, stockingRule) {
    if (cleanupRule.action === 'KEEP')
        { return 0; }
    var full = fullAmount(item);
    // Unequip item from terrarium or equipment if necessary to OCD it.
    var keepAmount = cleanupRule.keepAmount || 0;
    if (full > keepAmount && kolmafia.availableAmount(item) > kolmafia.itemAmount(item)) {
        kolmafia.retrieveItem(Math.min(full - keepAmount, kolmafia.availableAmount(item)), item);
    }
    // Don't OCD items that are part of stock. Stock can always be satisfied by closet.
    var keep = zlib_ash.getvar('BaleOCD_Stock') === '0'
        ? keepAmount
        : Math.max(keepAmount, ((stockingRule === null || stockingRule === void 0 ? void 0 : stockingRule.amount) || 0) -
            (kolmafia.getProperty('autoSatisfyWithCloset') === 'false'
                ? 0
                : kolmafia.closetAmount(item)));
    // OCD is limited by itemAmount(it) since we don't want to purchase anything and closeted items
    // may be off-limit, but if there's something in the closet, it counts against the amount you own.
    return Math.min(full - keep, kolmafia.itemAmount(item));
}
var CleanupPlanner = function CleanupPlanner() {
    // When malling dangerously, don't ask the user about uncategorized items
    this.shouldAskAboutUncategorizedItems = !kolmafia.toBoolean(zlib_ash.getvar('BaleOCD_MallDangerously'));
};
// Don't stop if "don't ask user" or it is a quest item, or it is being stocked.
CleanupPlanner.prototype.checkStopForRelay = function checkStopForRelay (item, stockingRules) {
    if (!this.shouldAskAboutUncategorizedItems || !isCleanable(item)) {
        return false;
    }
    // If we need to stock up on the item, don't bother the user about it
    var stockingRule = stockingRules.get(item);
    if (stockingRule && fullAmount(item) <= stockingRule.amount) {
        return false;
    }
    if (kolmafia.userConfirm('Uncategorized item(s) have been found in inventory.\nAbort to categorize those items with the relay script?')) {
        throw new Error('Please use the relay script to categorize missing items in inventory.');
    }
    this.shouldAskAboutUncategorizedItems = false;
    return false;
};
/**
 * Examines the inventory and generates an appropriate execution plan.
 * If it finds uncategorized items in inventory, it asks the user whether it
 * should abort. If the user answers "No", it will not ask the user again
 * within the current `ocd_control()` call.
 * @param cleanupRules Map containing OCD rules
 * @param stockingRules Map containing stocking rules
 * @return `true` if the user chose to continue, or was not asked at all
 *  (i.e. there were no uncategorized items).
 *  `false` if the user chose to abort.
 */
CleanupPlanner.prototype.makePlan = function makePlan (cleanupRules, stockingRules) {
    var plan = {
        brak: new Map(),
        make: new Map(),
        untink: new Map(),
        usex: new Map(),
        mall: new Map(),
        auto: new Map(),
        disc: new Map(),
        disp: new Map(),
        clst: new Map(),
        clan: new Map(),
        todo: new Map(),
        gift: new Map(),
        make_q: new Map(),
    };
    var excess = 0;
    for (var doodad of toItemMap(kolmafia.getInventory()).keys()) {
        var rule = cleanupRules.get(doodad);
        if (rule) {
            excess = ocd_amount(doodad, rule, stockingRules.get(doodad));
            if (excess > 0)
                { switch (rule.action) {
                    case 'BREAK':
                        plan.brak.set(doodad, excess);
                        break;
                    case 'MAKE': {
                        var target = kolmafia.toItem(rule.targetItem);
                        var used_per_craft = countIngredient(doodad, target);
                        plan.make_q.set(doodad, used_per_craft);
                        if (used_per_craft === 0) {
                            error(("You cannot transform an " + doodad + " into a " + (rule.targetItem) + ". There's a problem with your data file or your crafting ability."));
                            break;
                        }
                        var use_qty = excess;
                        if (used_per_craft > 1) {
                            use_qty = use_qty - (use_qty % used_per_craft);
                        }
                        if (rule.shouldUseCreatableOnly) {
                            use_qty = Math.min(use_qty, kolmafia.creatableAmount(target) * used_per_craft);
                        }
                        if (use_qty !== 0)
                            { plan.make.set(doodad, use_qty); }
                        break;
                    }
                    case 'UNTN':
                        plan.untink.set(doodad, excess);
                        break;
                    case 'USE':
                        if (kolmafia.myPath() === 'Bees Hate You' && doodad.name.includes('b'))
                            { break; }
                        plan.usex.set(doodad, excess);
                        break;
                    case 'PULV':
                        // No-op since act_pulverize() does its own logging
                        break;
                    case 'MALL':
                        plan.mall.set(doodad, excess);
                        break;
                    case 'AUTO':
                        plan.auto.set(doodad, excess);
                        break;
                    case 'DISC':
                        plan.disc.set(doodad, excess);
                        break;
                    case 'DISP':
                        if (kolmafia.haveDisplay())
                            { plan.disp.set(doodad, excess); }
                        // else KEEP
                        break;
                    case 'CLST':
                        plan.clst.set(doodad, excess);
                        break;
                    case 'CLAN':
                        plan.clan.set(doodad, excess);
                        break;
                    case 'GIFT': {
                        var giftMap = plan.gift.get(rule.recipent);
                        if (!giftMap) {
                            plan.gift.set(rule.recipent, (giftMap = new Map()));
                        }
                        giftMap.set(doodad, excess);
                        break;
                    }
                    case 'TODO':
                        plan.todo.set(doodad, excess);
                        break;
                    case 'KEEP':
                        break;
                    default:
                        if (this.checkStopForRelay(doodad, stockingRules))
                            { return null; }
                } }
        }
        else {
            if (this.checkStopForRelay(doodad, stockingRules))
                { return null; }
            // Potentially disasterous, but this will cause the script to sell off unlisted items, just like it used to.
            if (kolmafia.toBoolean(zlib_ash.getvar('BaleOCD_MallDangerously')))
                { plan.mall.set(doodad, excess); } // Backwards compatibility FTW!
        }
    }
    return plan;
};

function isWadable(it) {
    // twinkly powder to sleaze nuggets
    if (1438 <= kolmafia.toInt(it) && kolmafia.toInt(it) <= 1449)
        { return true; }
    return Item.get([
        'sewer nuggets',
        'floaty sand',
        'floaty pebbles',
        'floaty gravel' ]).includes(it);
}
/**
 * Returns the "Malus order" of items.
 * Items with the same order are processed together, and items with a smaller
 * order are processed first.
 * @param it Item to check
 * @return Integer beteween 1 and 3 for malusable items.
 *      0 if the item cannot be malused.
 */
function getMalusOrder(it) {
    switch (it) {
        // Process nuggets after powders
        case Item.get('twinkly nuggets'):
        case Item.get('hot nuggets'):
        case Item.get('cold nuggets'):
        case Item.get('spooky nuggets'):
        case Item.get('stench nuggets'):
        case Item.get('sleaze nuggets'):
            return 2;
        // Process floaty sand -> floaty pebbles -> floaty gravel
        case Item.get('floaty pebbles'):
            return 2;
        case Item.get('floaty gravel'):
            return 3;
        // Non-malusable items (includes equipment that can be Pulverized)
        default:
            // 1 for other malusable items
            // 0 for non-malusable items (including pulverizable equipment)
            return isWadable(it) ? 1 : 0;
    }
}
/**
 * Process all malusable items with the `PULV` action.
 * This assumes that the player can use the Malus.
 * @param cleanupRules Cleanup ruleset to use
 * @param stockingRules Stocking ruleset to use
 * @param simulateOnly Whether to run a simulation or actually process the items
 * @return Whether any item was actually processed
 *      (i.e. whether any cleanup plans must be evaluated again)
 */
function malus(cleanupRules, stockingRules, simulateOnly) {
    var hasProcessedAny = false;
    // Process each malus order sequentially.
    // This allows us to process malus products that can be malused again,
    // e.g. powders -> nuggets -> wads.
    for (var malusOrder = 1; malusOrder <= 3; ++malusOrder) {
        // Gather items to be malused
        var itemsToMalus = new Map();
        for (var [it, rule] of cleanupRules) {
            if (rule.action !== 'PULV')
                { continue; }
            // This also filters out non-malusable items
            if (getMalusOrder(it) !== malusOrder)
                { continue; }
            var amount = ocd_amount(it, rule, stockingRules.get(it));
            // The Malus always converts items in multiples of 5
            amount -= amount % 5;
            if (amount < 1)
                { continue; }
            itemsToMalus.set(it, amount);
        }
        // Malus the gathered items
        for (var chunk of splitItemsSorted(itemsToMalus, 11)) {
            var tokens = [];
            var tokens_shown = [];
            for (var [it$1, amount$1] of chunk) {
                tokens.push((amount$1 + " ¶" + (kolmafia.toInt(it$1))));
                tokens_shown.push((amount$1 + " " + (it$1.name)));
            }
            info(("pulverize " + (tokens_shown.join(', '))));
            info(' ');
            if (!simulateOnly) {
                kolmafia.cliExecute(("pulverize " + (tokens.join(', '))));
            }
            hasProcessedAny = true;
        }
    }
    return hasProcessedAny;
}
/**
 * Sends all items with the `PULV` action to a pulverizing bot.
 *
 * Note: Multi-level malusing (i.e. converting powders directly to wads) is
 * not guaranteed to work. Because only 11 items can be sent per each kmail,
 * some malus products may not be processed.
 * @param ocd_rules OCD ruleset to use
 * @return Whether any item was actually sent
 */
function send_to_pulverizing_bot(ocd_rules, stockingRules) {
    var _a, _b, _c;
    var items_to_send = new Map();
    for (var [it, rule] of ocd_rules) {
        if (rule.action !== 'PULV')
            { continue; }
        if (!kolmafia.isTradeable(it)) {
            debug(("send_to_pulverizing_bot(): Skipping " + it + " since it cannot be traded"));
            continue;
        }
        var amount = ocd_amount(it, rule, stockingRules.get(it));
        // Note: Always send malusable items even if the quantity is not a
        // multiple of 5.
        // For example, we should be able to send 5 powders and 4 nuggets,
        // so that the bot can combine them into 1 wad.
        if (amount < 1)
            { continue; }
        items_to_send.set(it, amount);
    }
    if (items_to_send.size === 0) {
        info('Nothing to pulverize after all.');
        return false;
    }
    if (!kolmafia.canInteract()) {
        // Because Smashbot cannot return items to characters in
        // Ronin/Hardcore, any items
        info('You cannot send items to Smashbot while in Ronin/Hardcore.');
        return false;
    }
    else if (!kolmafia.isOnline('smashbot')) {
        warn('Smashbot is offline! Pulverizables will not be sent at this time, just in case.');
        return false;
    }
    else {
        // Smashbot supports fine-grained malus control through the
        // "goose_level" command.
        // TODO: Find out if Smashbot supports floaty sand/pebbles/gravel
        var ITEM_GOOSE_LEVELS = new Map([
            [Item.get('twinkly powder'), 1],
            [Item.get('hot powder'), 2],
            [Item.get('cold powder'), 4],
            [Item.get('spooky powder'), 8],
            [Item.get('stench powder'), 16],
            [Item.get('sleaze powder'), 32],
            [Item.get('twinkly nuggets'), 64],
            [Item.get('hot nuggets'), 128],
            [Item.get('cold nuggets'), 256],
            [Item.get('spooky nuggets'), 512],
            [Item.get('stench nuggets'), 1024],
            [Item.get('sleaze nuggets'), 2048] ]);
        var goose_level = 0;
        for (var [it$1, it_goose_level] of ITEM_GOOSE_LEVELS) {
            if (items_to_send.has(it$1)) {
                goose_level |= it_goose_level;
            }
        }
        var message = "goose_level " + goose_level;
        // Smashbot supports a single command ("rock" to malus all the way
        // up to floaty rock) for multi-malusing floaty items.
        // Since this is not sophisticated enough for all our needs,
        // we should identify and warn about cases where neither "rock" nor
        // the default behavior (no "rock") would satisfy our requirements.
        var can_use_rock = false;
        var should_warn_rerun = false;
        if (items_to_send.has(Item.get('floaty sand')) &&
            ((_a = ocd_rules.get(Item.get('floaty pebbles'))) === null || _a === void 0 ? void 0 : _a.action) === 'PULV') {
            // Default behavior:
            //  sand -> pebbles (stop)
            // With "rock":
            //  sand -> pebbles -> gravel -> rock
            if (((_b = ocd_rules.get(Item.get('floaty gravel'))) === null || _b === void 0 ? void 0 : _b.action) === 'PULV') {
                can_use_rock = true;
            }
            else {
                should_warn_rerun = true;
            }
        }
        else if (items_to_send.has(Item.get('floaty pebbles')) &&
            ((_c = ocd_rules.get(Item.get('floaty gravel'))) === null || _c === void 0 ? void 0 : _c.action) === 'PULV') {
            // Default behavior:
            //  pebbles -> gravel (stop)
            // With "rock":
            //  pebbles -> gravel -> rock
            can_use_rock = true;
        }
        if (should_warn_rerun) {
            warn('Note: Smashbot cannot malus floaty sand to gravel in a single kmail. Philter will convert the pebbles to gravel when you run it again.');
        }
        if (can_use_rock) {
            message += '\nrock';
        }
        info('Sending pulverizables to: Smashbot');
        kmail({ recipent: 'smashbot', message: message, items: items_to_send });
        return true;
    }
}
/**
 * Checks if an item can be pulverized.
 */
function isPulverizable(it) {
    switch (it) {
        // Workaround for some items incorrectly marked as Pulverizable
        case Item.get('Eight Days a Week Pill Keeper'):
        case Item.get('Powerful Glove'):
        case Item.get('Guzzlr tablet'):
        case Item.get('Iunion Crown'):
        case Item.get('Cargo Cultist Shorts'):
        case Item.get('unwrapped knock-off retro superhero cape'):
            return true;
    }
    return Object.keys(kolmafia.getRelated(it, 'pulverize')).length > 0;
}
/**
 * Ppulverize and malus all items with the `PULV` action.
 * @param cleanupRules Cleanup rules to use
 * @param stockingRules Stocking rules to use
 * @param simulateOnly Whether to run a simulation or actually process the items
 * @return Whether any item was actually processed
 *      (i.e. whether any execution plans must be evaluated again)
 */
function cleanupPulverize(cleanupRules, stockingRules, simulateOnly) {
    if (!kolmafia.haveSkill(Skill.get('Pulverize'))) {
        return send_to_pulverizing_bot(cleanupRules, stockingRules);
    }
    var hasProcessedAny = false;
    // Process all pulverizable items first, so that we can malus the
    // powders/nuggets/wads gained from pulverizing.
    var itemsToSmash = new Map();
    for (var [it, rule] of cleanupRules) {
        if (rule.action !== 'PULV')
            { continue; }
        if (!isPulverizable(it))
            { continue; }
        var amount = ocd_amount(it, rule, stockingRules.get(it));
        if (amount < 1)
            { continue; }
        itemsToSmash.set(it, amount);
    }
    for (var chunk of splitItemsSorted(itemsToSmash, 11)) {
        var tokens = [];
        var tokens_shown = [];
        for (var [item, amount$1] of chunk) {
            tokens.push((amount$1 + " ¶" + (kolmafia.toInt(item))));
            tokens_shown.push((amount$1 + " " + (item.name)));
        }
        info(("pulverize " + (tokens_shown.join(', '))));
        info(' ');
        if (!simulateOnly) {
            kolmafia.cliExecute(("pulverize " + (tokens.join(', '))));
        }
        hasProcessedAny = true;
    }
    // Malus all items, including those gained from pulverizing.
    if (kolmafia.haveSkill(Skill.get('Pulverize')) &&
        kolmafia.myPrimestat() === Stat.get('muscle')) {
        if (malus(cleanupRules, stockingRules, simulateOnly))
            { hasProcessedAny = true; }
    }
    else {
        if (send_to_pulverizing_bot(cleanupRules, stockingRules)) {
            hasProcessedAny = true;
        }
    }
    return hasProcessedAny;
}

/**
 * Apply temporary setup while using the `item`.
 * @param item Item to use
 * @param required Item to equip
 */
function useWithSetup(item, required) {
    return withOutfitCheckpoint(() => {
        ok(kolmafia.retrieveItem(1, required), ("Cannot retrieve " + required));
        ok(kolmafia.equip(required), ("Failed to equip " + required));
        return kolmafia.use(1, item);
    });
}
/**
 * Use `amount` of `item`, applying custom logic for some special items.
 * @param item Item to use
 * @param amount Amount of item to use
 * @return Whether the item was used successfully
 */
function useItemForCleanup(item, amount) {
    if (item === Item.get("the Slug Lord's map")) {
        return withOutfitCheckpoint(() => {
            ok(kolmafia.cliExecute('maximize stench resistance, 1 min'));
            return kolmafia.use(amount, item);
        });
    }
    if (item === Item.get("Dr. Hobo's map")) {
        equal(amount, 1, ("Cannot use " + amount + " of " + item + ", must use 1"));
        var whip = Item.get([
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
            'Yak whip' ]).find(it => kolmafia.itemAmount(it) && kolmafia.canEquip(it)) || Item.get('cool whip');
        ok(kolmafia.retrieveItem(1, Item.get('asparagus knife')));
        return useWithSetup(item, whip);
    }
    if (item === Item.get("Dolphin King's map")) {
        equal(amount, 1, ("Cannot use " + amount + " of " + item + ", must use 1"));
        var breather = Item.get(['aerated diving helmet', 'makeshift SCUBA gear']).find(it => kolmafia.itemAmount(it) && kolmafia.canEquip(it)) || Item.get('snorkel');
        return useWithSetup(item, breather);
    }
    if (item === Item.get('Degrassi Knoll shopping list')) {
        equal(amount, 1, ("Cannot use " + amount + " of " + item + ", must use 1"));
        if (kolmafia.itemAmount(Item.get("bitchin' meatcar")) === 0)
            { return false; }
        // continue
    }
    return kolmafia.use(amount, item);
}

var TEN_LEAF_CLOVER = Item.get('ten-leaf clover');
var DISASSEMBLED_CLOVER = Item.get('disassembled clover');
// This is only called if the player has both kinds of clovers, so no need to check if stock contains both
function cloversNeeded(stockingRules) {
    var _a, _b;
    return ((((_a = stockingRules.get(TEN_LEAF_CLOVER)) === null || _a === void 0 ? void 0 : _a.amount) || 0) +
        (((_b = stockingRules.get(DISASSEMBLED_CLOVER)) === null || _b === void 0 ? void 0 : _b.amount) || 0) -
        fullAmount(TEN_LEAF_CLOVER) -
        fullAmount(DISASSEMBLED_CLOVER));
}
/**
 * Returns the alternate form of a ten-leaf clover or disassembled clover.
 * @param it ten-leaf clover or disassembled clover
 * @return
 */
function otherClover(it) {
    return it === TEN_LEAF_CLOVER ? DISASSEMBLED_CLOVER : TEN_LEAF_CLOVER;
}
var Stocker = function Stocker() {
    this.isFirst = true;
};
Stocker.prototype.stockit = function stockit (q, it) {
    q = q - kolmafia.closetAmount(it) - kolmafia.storageAmount(it) - kolmafia.equippedAmount(it);
    if (q < 1)
        { return true; }
    if (this.isFirst) {
        info('Stocking up on required items!');
        this.isFirst = false;
    }
    return kolmafia.retrieveItem(q, it);
};
/**
 * Stocks up on items based on the stock rules.
 * @param ocd_rules OCD ruleset to use
 * @return Whether all items were stocked successfully
 */
function stock(stockingRules, cleanupRules) {
    var _a;
    var success = true;
    var stocker = new Stocker();
    kolmafia.batchOpen();
    for (var [it, stockingRule] of stockingRules) {
        // Someone might want both assembled and disassembled clovers. Esure there are enough of combined tot
        if ((TEN_LEAF_CLOVER === it || DISASSEMBLED_CLOVER === it) &&
            stockingRules.has(otherClover(it))) {
            var cloversNeededAmount = cloversNeeded(stockingRules);
            if (cloversNeededAmount > 0) {
                kolmafia.cliExecute(("cheapest ten-leaf clover, disassembled clover; acquire " + (cloversNeededAmount - kolmafia.availableAmount(it)) + " " + it));
            }
        }
        if (fullAmount(it) < stockingRule.amount &&
            !stocker.stockit(stockingRule.amount, it)) {
            success = false;
            error(("Failed to stock " + (stockingRule.amount > 1
                ? ((stockingRule.amount) + " " + (it.plural))
                : ("a " + it))));
        }
        // Closet everything (except for gear) that is stocked so it won't get accidentally used.
        var keepAmount = ((_a = cleanupRules.get(it)) === null || _a === void 0 ? void 0 : _a.keepAmount) || 0;
        if (kolmafia.toSlot(it) === Slot.get('none') &&
            stockingRule.amount - keepAmount > kolmafia.closetAmount(it) &&
            kolmafia.itemAmount(it) > keepAmount)
            { kolmafia.putCloset(Math.min(kolmafia.itemAmount(it) - keepAmount, stockingRule.amount - keepAmount - kolmafia.closetAmount(it)), it); }
    }
    kolmafia.batchClose();
    return success;
}

/**
 * Loads cleanup rules from the player's cleanup ruleset file into a map.
 * This will look for a ruleset file whose name is given by `dataFileName`.
 * If this fails, it uses the current player's name as a fallback.
 * @param dataFileName Full name of data file including file extension
 * @return The loaded and combined cleanup ruleset
 */
function loadCurrentCleanupRules(dataFileName) {
    var cleanupRules = loadCleanupRulesetFile(dataFileName) ||
        loadCleanupRulesetFile(("OCD_" + (kolmafia.myName()) + "_Data.txt"));
    if (!cleanupRules) {
        throw new Error('Something went wrong trying to load OCDdata!');
    }
    if (cleanupRules.size === 0) {
        throw new Error("All item information is corrupted or missing. Whoooah! I hope you didn't lose any data...");
    }
    return cleanupRules;
}
/**
 * Sale price cache for the MALL action.
 * This cache is populated by `printCat()` with values returned by
 * `sale_price()`. Later, it is accessed by `actCat()`. This ensures that the
 * sale price displayed to the user matches the actual sale price used.
 * Note that this cache is never used when sending items to a mall multi.
 */
var price = new Map();
/**
 * Computes an appropriate selling price for an item at the mall, based on its
 * current (or historical) mall price.
 * @param it Item to check
 * @param minPrice Minimum price
 * @return Appropriate selling price for the item, or zero if the item is not
 *		available in the mall.
 *		The returned price is guaranteed to be at least 0.
 */
function salePrice(it, minPrice) {
    var price = kolmafia.historicalAge(it) < 1 && kolmafia.historicalPrice(it) > 0
        ? kolmafia.historicalPrice(it)
        : kolmafia.mallPrice(it);
    return Math.max(minPrice, price, 0);
}
function getRepresentativeGiftRule(items, cleanupRules) {
    for (var key of items) {
        var rule = cleanupRules.get(key);
        ok(rule, (key + " does not have associated cleanup rule"));
        ok(rule.action === 'GIFT', (key + " is not associated with a GIFT action (got '" + (rule.action) + "')"));
        return rule;
    }
    // This should never happen in practice
    fail('No item with GIFT rule found');
}
function printCat(cat, cleanupRules, config) {
    if (cat.size === 0)
        { return 0; }
    // Ensure that `cat` is not empty
    var firstItem = cat.keys().next().value;
    ok(firstItem, "'cat' is empty, wtf");
    // This is a representative rule
    var rule = cleanupRules.get(firstItem);
    ok(rule, 'wtfwtfwtf');
    ok(rule.action !== 'KEEP' && rule.action !== 'TODO', ("printCat() cannot process \"" + (rule.action) + "\" rule"));
    var com = {
        BREAK: 'break apart ',
        MAKE: 'transform ',
        UNTN: 'untinker ',
        USE: 'use ',
        PULV: 'pulverize ',
        MALL: shouldUseMulti(config)
            ? ("send to mallmulti " + (config.mallMultiName) + ": ")
            : 'mallsell ',
        AUTO: 'autosell ',
        DISC: 'discard ',
        DISP: 'display ',
        CLST: 'closet ',
        CLAN: 'stash put ',
        GIFT: 'send gift to ',
    }[rule.action];
    if (rule.action === 'GIFT')
        { com += (rule.recipent) + ": "; }
    // TODO: Move this check to planning stage
    var items = new Map(Array.from(cat).filter((ref) => {
        var it = ref[0];

        return !(it === Item.get('Degrassi Knoll shopping list') &&
        kolmafia.itemAmount(Item.get("bitchin' meatcar")) === 0);
    }));
    var expectedProfitTotal = 0;
    for (var chunk of splitItemsSorted(items, 11)) {
        var messages = [];
        var lineValue = 0;
        for (var [it, quant] of chunk) {
            var msg = quant + " " + it;
            if (rule.action === 'MALL') {
                if (!shouldUseMulti(config)) {
                    // TODO: Mall sale price should be computed during the planning stage
                    // and stored in the cleanup plan
                    price.set(it, salePrice(it, rule.minPrice));
                    if (config.mallPricingMode === 'auto') {
                        msg += " @ " + (zlib_ash.rnum(price.get(it) || 0));
                    }
                }
                lineValue += quant * (price.get(it) || 0);
            }
            else if (rule.action === 'MAKE') {
                msg += " into " + (rule.targetItem);
            }
            else if (rule.action === 'AUTO') {
                lineValue += quant * kolmafia.autosellPrice(it);
            }
            messages.push(msg);
        }
        info(com + messages.join(', '));
        if (rule.action === 'MALL') {
            info(("Sale price for this line: " + (zlib_ash.rnum(lineValue))));
        }
        info(' ');
        expectedProfitTotal += lineValue;
    }
    if (rule.action === 'MALL') {
        if (!shouldUseMulti(config)) {
            info(("Total mall sale = " + (zlib_ash.rnum(expectedProfitTotal))));
        }
    }
    else if (rule.action === 'AUTO') {
        info(("Total autosale = " + (zlib_ash.rnum(expectedProfitTotal))));
    }
    return expectedProfitTotal;
}
/**
 * Process a collection of items using a given action.
 * @param cat Collection of items and their amounts to be processed
 * @param act Item action ID
 * @param plan OCD execution plan being used
 * @param ocd_rules Map containing OCD rules
 */
function actCat(cat, act, plan, cleanupRules, config) {
    var catOrder = new Map(Array.from(cat).sort((ref, ref$1) => {
        var itemA = ref[0];
        var itemB = ref$1[0];

        return itemA.name.localeCompare(itemB.name);
    }));
    // If there are no items to process, we don't need to regenerate the plan
    if (cat.size === 0)
        { return { shouldReplan: false, finalSale: 0 }; }
    var i = 0;
    var finalSale = 0;
    if (act === 'TODO' && cat.size > 0) {
        kolmafia.print('');
    }
    else {
        finalSale += printCat(cat, cleanupRules, config);
    }
    if (config.simulateOnly)
        { return { shouldReplan: true, finalSale: finalSale }; }
    switch (act) {
        // @ts-expect-error fallthrough
        case 'MALL':
            if (shouldUseMulti(config)) {
                var multi_id = config.mallMultiName;
                // Some users have reported OCD-Cleanup occasionally sending
                // items to an account named "False". While the exact cause is
                // unknown, this should serve as a stopgap measure.
                if (multi_id === '' || multi_id.toLowerCase() === 'false') {
                    error(("Invalid mall multi account ID (\"" + multi_id + "\"). Please report the issue at https://kolmafia.us/"));
                    var timeout = 30;
                    var warning_message = "OCD-Cleanup has detected that it is about to send items to a mall multi account named \"" + multi_id + "\". " +
                        'Since this is likely an error, OCD-Cleanup will NOT send the items.\n\n' +
                        'Do you want to abort OCD-Cleanup immediately?\n' +
                        "(If you choose \"No\" or wait " + timeout + " seconds, OCD-Cleanup will skip the MALL action and continue.)";
                    // If the user disables userConfirm() -- possibly because
                    // they are calling OCD-Cleanup from an auto-adventuring
                    // script -- it will always return false.
                    // In this case, we will continue processing instead of
                    // aborting (which would otherwise be disruptive).
                    if (kolmafia.userConfirm(warning_message, timeout * 1000, false)) {
                        kolmafia.abort('You decided to abort OCD-Cleanup.');
                    }
                    kolmafia.print('OCD-Cleanup has skipped the MALL action.');
                    return { shouldReplan: false, finalSale: finalSale };
                }
                else {
                    sendToPlayer({
                        recipent: multi_id,
                        message: config.mallMultiKmailMessage,
                        items: cat,
                    });
                    return { shouldReplan: true, finalSale: finalSale };
                }
            }
        // fall through
        case 'AUTO':
        case 'DISP':
        case 'CLST':
        case 'CLAN':
            kolmafia.batchOpen();
            break;
        case 'GIFT': {
            var giftRule = getRepresentativeGiftRule(cat.keys(), cleanupRules);
            sendToPlayer({
                recipent: giftRule.recipent,
                message: giftRule.message,
                items: cat,
                insideNote: giftRule.message,
            });
        }
    }
    for (var [it, quant] of catOrder) {
        var rule = cleanupRules.get(it);
        ok(rule);
        switch (rule.action) {
            case 'BREAK':
                for (var i$1 = 1; i$1 <= quant; ++i$1)
                    { kolmafia.visitUrl(("inventory.php?action=breakbricko&pwd&ajax=1&whichitem=" + (kolmafia.toInt(it)))); }
                break;
            case 'MALL':
                if (config.mallPricingMode === 'auto') {
                    var cachedPrice = price.get(it);
                    // If price is -1, then there was an error.
                    if (cachedPrice) {
                        kolmafia.putShop(cachedPrice, 0, quant, it); // price[it] was found during printCat()
                    }
                }
                else {
                    kolmafia.putShop(kolmafia.shopAmount(it) > 0 ? kolmafia.shopPrice(it) : 0, 0, quant, it); // Set to max price of 999,999,999 meat
                }
                break;
            case 'AUTO':
                kolmafia.autosell(quant, it);
                break;
            case 'DISC':
                for (var i$2 = 1; i$2 <= quant; ++i$2) {
                    if (i$2 % 10 === 0) {
                        kolmafia.print(("Discarding " + i$2 + " of " + quant + "..."));
                    }
                    kolmafia.visitUrl(("inventory.php?action=discard&pwd&ajax=1&whichitem=" + (kolmafia.toInt(it))));
                }
                break;
            case 'USE':
                useItemForCleanup(it, quant);
                break;
            case 'MAKE': {
                makeItemForCleanup(it, kolmafia.toItem(rule.targetItem), quant, plan.make_q.get(it));
                break;
            }
            case 'UNTN':
                kolmafia.cliExecute(("untinker " + quant + " ¶" + (kolmafia.toInt(it))));
                break;
            case 'DISP':
                kolmafia.putDisplay(quant, it);
                break;
            case 'CLST':
                kolmafia.putCloset(quant, it);
                break;
            case 'CLAN':
                kolmafia.putStash(quant, it);
                break;
            case 'TODO':
                kolmafia.printHtml(("<b>" + it + " (" + quant + "): " + (rule.message) + "</b>"));
                break;
        }
        i += 1;
        // If there are too many items batched mafia may run out of memory. On poor systems it usually happens around 20 transfers so stop at 15.
        if (i >= 165 &&
            (act === 'MALL' ||
                act === 'AUTO' ||
                act === 'DISP' ||
                act === 'CLST' ||
                act === 'CLAN')) {
            kolmafia.batchClose();
            i = 0;
            kolmafia.batchOpen();
        }
    }
    if (act === 'MALL' ||
        act === 'AUTO' ||
        act === 'DISP' ||
        act === 'CLST' ||
        act === 'CLAN')
        { kolmafia.batchClose(); }
    // It's okay to return true here, because ocd_inventory() only checks
    // this value for actions that can create or remove additional items.
    return { shouldReplan: true, finalSale: finalSale };
}
function shouldUseMulti(config) {
    return config.mallMultiName !== '' && config.canUseMallMulti;
}
function doPhilter(config) {
    var finalSale = 0;
    var cleanupRules = loadCurrentCleanupRules(("OCDdata_" + (config.dataFileName) + ".txt"));
    if (!cleanupRules)
        { return { success: false, finalSale: finalSale }; }
    var stockingRules = loadStockingRulesetFile(("OCDstock_" + (config.stockFileName) + ".txt"));
    if (!stockingRules) {
        if (zlib_ash.getvar('BaleOCD_Stock') === '1') {
            error('You are missing item stocking information.');
            return { success: false, finalSale: finalSale };
        }
        stockingRules = new Map();
    }
    var planner = new CleanupPlanner();
    var mpr = planner.makePlan(cleanupRules, stockingRules);
    if (!mpr)
        { return { success: false, finalSale: finalSale }; }
    var result;
    // Actions that may create additional items, or remove items not
    // included in the execution plan. If actCat() returns true after
    // executing such actions, the entire execution plan must be regenerated
    // to handle such items correctly.
    result = actCat(mpr.brak, 'BREAK', mpr, cleanupRules, config);
    finalSale += result.finalSale;
    if (result.shouldReplan) {
        mpr = planner.makePlan(cleanupRules, stockingRules);
        if (!mpr)
            { return { success: false, finalSale: finalSale }; }
    }
    result = actCat(mpr.make, 'MAKE', mpr, cleanupRules, config);
    finalSale += result.finalSale;
    if (result.shouldReplan) {
        mpr = planner.makePlan(cleanupRules, stockingRules);
        if (!mpr)
            { return { success: false, finalSale: finalSale }; }
    }
    result = actCat(mpr.untink, 'UNTN', mpr, cleanupRules, config);
    finalSale += result.finalSale;
    if (result.shouldReplan) {
        mpr = planner.makePlan(cleanupRules, stockingRules);
        if (!mpr)
            { return { success: false, finalSale: finalSale }; }
    }
    result = actCat(mpr.usex, 'USE', mpr, cleanupRules, config);
    finalSale += result.finalSale;
    if (result.shouldReplan) {
        mpr = planner.makePlan(cleanupRules, stockingRules);
        if (!mpr)
            { return { success: false, finalSale: finalSale }; }
    }
    // Note: Since the next action (act_pulverize()) does its own planning,
    // the previous if-block does not need to call planner.make_plan().
    // I'm only keeping it to make refactoring/reordering easier.
    if (cleanupPulverize(cleanupRules, stockingRules, config.simulateOnly)) {
        mpr = planner.makePlan(cleanupRules, stockingRules);
        if (!mpr)
            { return { success: false, finalSale: finalSale }; }
    }
    // Actions that never create or remove additional items.
    // Currently, we do not bother to check the return value of actCat()
    // for them.
    finalSale += actCat(mpr.mall, 'MALL', mpr, cleanupRules, config).finalSale;
    finalSale += actCat(mpr.auto, 'AUTO', mpr, cleanupRules, config).finalSale;
    finalSale += actCat(mpr.disc, 'DISC', mpr, cleanupRules, config).finalSale;
    finalSale += actCat(mpr.disp, 'DISP', mpr, cleanupRules, config).finalSale;
    finalSale += actCat(mpr.clst, 'CLST', mpr, cleanupRules, config).finalSale;
    finalSale += actCat(mpr.clan, 'CLAN', mpr, cleanupRules, config).finalSale;
    for (var items of mpr.gift.values()) {
        finalSale += actCat(items, 'GIFT', mpr, cleanupRules, config).finalSale;
    }
    if (zlib_ash.getvar('BaleOCD_Stock') === '1' && !config.simulateOnly) {
        stock(stockingRules, cleanupRules);
    }
    finalSale += actCat(mpr.todo, 'TODO', mpr, cleanupRules, config).finalSale;
    if (config.simulateOnly) {
        success('This was only a test. Had this been an actual OCD incident your inventory would be clean right now.');
    }
    return { success: true, finalSale: finalSale };
}
/**
 * Executes cleanup and stocking routines.
 * @param config Config object to use
 * @return Total (expected) meat gain from cleanup
 */
function philter(config) {
    kolmafia.cliExecute('inventory refresh');
    // Empty closet before emptying out Hangks, otherwise it may interfere with
    // which Hangk's items go to closet
    if (config.emptyClosetMode >= 0 &&
        Number(kolmafia.getProperty('lastEmptiedStorage')) !== kolmafia.myAscensions() &&
        !config.simulateOnly) {
        kolmafia.emptyCloset();
    }
    // Empty out Hangks, so it can be accounted for by what follows.
    if (kolmafia.toBoolean(kolmafia.getProperty('autoSatisfyWithStorage')) &&
        Number(kolmafia.getProperty('lastEmptiedStorage')) !== kolmafia.myAscensions()) {
        kolmafia.visitUrl('storage.php?action=pullall&pwd');
    }
    return withProperties({
        autoSatisfyWithCloset: 'false',
        autoSatisfyWithStash: 'false',
        autoSatisfyWithStorage: 'false',
    }, () => {
        var ref = doPhilter(config);
        var success = ref.success;
        var finalSale = ref.finalSale;
        return success ? finalSale : -1;
    });
}

/**
 * Check if your character is in Ronin/Hardcore. If so, ask for confirmation to
 * proceed.
 * @return Whether Philter should be executed now
 */
function canInteractCheck() {
    if (kolmafia.canInteract())
        { return true; }
    var action = zlib_ash.getvar('BaleOCD_RunIfRoninOrHC');
    if (action === 'never')
        { return false; }
    if (action === 'always')
        { return true; }
    return kolmafia.userConfirm('You are in Ronin/Hardcore. Do you want to run OCD Cleanup anyway?');
}
// TODO: Parse CLI arguments, merge them with ZLib configs, and make the rest of
// the app use the merged config instead of accessing settings directly.
function main() {
    setDefaultConfig();
    checkProjectUpdates();
    if (canInteractCheck()) {
        var todaysFarming = philter(Object.freeze(loadCleanupConfig()));
        if (todaysFarming < 0) {
            error('OCD Control was unable to obssessively control your entire inventory.');
        }
        else if (todaysFarming === 0)
            { warn('Nothing to do. I foresee no additional meat in your future.'); }
        else {
            success(("Anticipated monetary gain from inventory cleansing: " + (zlib_ash.rnum(todaysFarming)) + " meat."));
        }
    }
    else {
        error("Whoa! Don't run this until you break the prism!");
    }
}

exports.main = main;
