// OCD Inventory by Bale
script "ocd-cleanup.ash";
import "zlib.ash";
import "relay/philter-manager-classic/philter.util.ash";

// The following variables should be set from the relay script.
setvar("BaleOCD_MallMulti", "");           // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar("BaleOCD_UseMallMulti", TRUE);      // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar("BaleOCD_MultiMessage", "Mall multi dump");
setvar("BaleOCD_DataFile", my_name());     // The name of the file that holds OCD data for this character.
setvar("BaleOCD_StockFile", my_name());    // The name of the file that holds OCD stocking data for this character.
setvar("BaleOCD_Stock", 0);                // Should items be acquired for stock
setvar("BaleOCD_Pricing", "auto");         // How to handle mall pricing. "auto" will use mall_price(). "max" will price at maximum.
setvar("BaleOCD_Sim", FALSE);              // If you set this to true, it won't actually do anything. It'll only inform you.
setvar("BaleOCD_EmptyCloset", 0);          // Should the closet be emptied and its contents disposed of?
setvar("BaleOCD_EmptyHangks", 0);          // Should Hangk's Storange be emptied?
setvar("BaleOCD_MallDangerously", FALSE);  // If this set to TRUE, any uncategorized items will be malled instead of kept! OH NOES!
	// This last one can only be set by editing the vars file. It's too dangerous to make it easily accessible. Exists for backwards compatibility.
setvar("BaleOCD_RunIfRoninOrHC", "ask");   // Controls whether to run OCD-Cleanup if the player is in Ronin/Hardcore.
                                           // If set to "ask", the script will prompt the user.
                                           // If set to "never", the script will never run if in Ronin/Hardcore.
                                           // If set to "always", the script will always run even if in Ronin/Hardcore.

// Check version! This will check both scripts and data files.
// This code is at base level so that the relay script's importation will automatically cause it to be run.
string __OCD_PROJECT_NAME__ = "Loathing-Associates-Scripting-Society-philter-trunk-release";
if(svn_exists(__OCD_PROJECT_NAME__) && get_property("_svnUpdated") == "false" && get_property("_ocdUpdated") != "true") {
	if(!svn_at_head(__OCD_PROJECT_NAME__)) {
		print("Philter has become outdated. Automatically updating from SVN...", _ocd_color_error());
		cli_execute("svn update " + __OCD_PROJECT_NAME__);
		print("On the script's next invocation it will be up to date.", _ocd_color_success());
	}
	set_property("_ocdUpdated", "true");
}

record OCDinfo {
	string action;	// What to do
	int q;			// How many of them to keep
	string info;	// Extra information (whom to send the gift)
	string message; // Message to send with a gift
};

boolean is_OCDable(item it) {
	switch(it) {
	case $item[none]: // For some reason $item[none] is_displayable()
		return false;
	case $item[Boris's key]:
	case $item[Jarlsberg's key]:
	case $item[Richard's star key]:
	case $item[Sneaky Pete's key]:
	case $item[digital key]:
	case $item[the Slug Lord's map]:
	case $item[Dr. Hobo's map]:
	case $item[Dolphin King's map]:
	case $item[Degrassi Knoll shopping list]:
	case $item[31337 scroll]:
	case $item[dead mimic]:
	case $item[fisherman's sack]:
	case $item[fish-oil smoke bomb]:
	case $item[vial of squid ink]:
	case $item[potion of fishy speed]:
	case $item[blessed large box]:
		return true;
	case $item[DNOTC Box]: // Let these hide in your inventory until it is time for them to strike!
		if(substring(today_to_string(), 4, 6) == "12" && substring(today_to_string(), 6, 8).to_int() < 25) return false;
		break;
	}
	if(is_displayable(it)) return true;
	return false;
}

boolean is_wadable(item it) {
	if(it.to_int() >= 1438 && it.to_int() <=1449) // twinkly powder to sleaze nuggets
		return true;
	switch(it) {
	case $item[sewer nuggets]:
	case $item[floaty sand]:
	case $item[floaty pebbles]:
	case $item[floaty gravel]:
		return true;
	}
	return false;
}

// This is the amount equipped on unequipped familiars in the terrarium
int terrarium_amount(item it) {
	return available_amount(it) - equipped_amount(it) - item_amount(it)
		- (get_property("autoSatisfyWithCloset") == "true"? closet_amount(it): 0)	// Don't include Closet
		- (get_property("autoSatisfyWithStorage") == "true"? storage_amount(it): 0)	// Don't include Hangk's Storage
		- (get_property("autoSatisfyWithStash") == "true"? stash_amount(it): 0);	// Don't include Clan Stash
}

int camp_amount(item it) {
	switch(it) {
	case $item[Little Geneticist DNA-Splicing Lab]:
	case $item[snow machine]:
	case $item[spinning wheel]:
	case $item[Warbear auto-anvil]:
	case $item[Warbear chemistry lab]:
	case $item[Warbear high-efficiency still]:
	case $item[Warbear induction oven]:
	case $item[Warbear jackhammer drill press]:
	case $item[Warbear LP-ROM burner]:
		if(get_campground() contains it) return 1;
	}
	return 0;
}

// available_amount varies depending on whether the character can satisfy requests with the closet etc. This doesn't
int full_amount(item it) {
	return available_amount(it)
		+ camp_amount(it) // Some items lurk in the campground
		+ (get_property("autoSatisfyWithCloset") == "false"? closet_amount(it): 0)	// Include Closet
		+ ((get_property("autoSatisfyWithStorage") == "false" || !can_interact())? storage_amount(it): 0)	// Include Hangk's Storage
		- (get_property("autoSatisfyWithStash") == "true"? stash_amount(it): 0);	// Don't include Clan Stash
}

// Sale price cache for the MALL action.
// This cache ensures that the sale price displayed by print_cat() matches the
// actual sale price used by act_cat().
record __OcdPriceCache {
	int [item] price;
};

/**
 * Computes an appropriate selling price for an item at the mall, based on its
 * current (or historical) mall price.
 * If the cache already contains a price, returns that instead.
 * @param cache Cache to use
 * @param it Item to check
 * @param min_price_str If this contains a valid integer, it is used as the
 *      minimum price.
 * @return Appropriate selling price for the item, or zero if the item is
 *		not available in the mall.
 *		The returned price is guaranteed to be at least 0.
 */
int sale_price(__OcdPriceCache cache, item it, string min_price_str) {
	if (cache.price contains it) return cache.price[it];

	int price;
	if (historical_age(it) < 1 && historical_price(it) > 0) {
		price = historical_price(it);
	} else {
		price = mall_price(it);
	}
	return cache.price[it] = max(
		0, price, is_integer(min_price_str) ? to_int(min_price_str) : 0
	);
}

// Wrapping the entire script in ocd_control() to reduce variable conflicts if the script is imported to another.
// StopForMissingItems is a parameter in case someone wants to include this script.
// StopForMissingItems = FALSE to prevent a pop-up confirmation.
// DataFile can be used to supplement getvar("BaleOCD_DataFile"). This is completely optional. (See far below)
int ocd_control(boolean StopForMissingItems, string extraData) {
	int FinalSale;

	record {
		string type;
		int q;
	} [item] stock;

	string [string] command;
	command ["BREAK"] = "break apart ";
	command ["MAKE"] = "transform ";
	command ["UNTN"] = "untinker ";
	command ["USE"]  = "use ";
	command ["PULV"] = "pulverize "; // Not used, "pulverize" is hardcoded now
	command ["MALL"] = "mallsell ";
	command ["AUTO"] = "autosell ";
	command ["DISC"] = "discard ";
	command ["DISP"] = "display ";
	command ["CLST"] = "closet ";
	command ["CLAN"]  = "stash put ";
	command ["GIFT"] = "send gift to ";

	// Save these so they can be screwed with safely
	boolean autoSatisfyWithCloset = get_property("autoSatisfyWithCloset").to_boolean();
	boolean autoSatisfyWithStorage = get_property("autoSatisfyWithStorage").to_boolean();
	boolean autoSatisfyWithStash = get_property("autoSatisfyWithStash").to_boolean();

	boolean use_multi = getvar("BaleOCD_MallMulti") != "" && to_boolean(getvar("BaleOCD_UseMallMulti"));
	if(use_multi)
		command ["MALL"] = "send to mallmulti "+ getvar("BaleOCD_MallMulti") + ": ";

	/**
	 * Loads OCD rules from the player's OCD ruleset file into a map.
	 * This will look for a ruleset file whose name is stored in the
	 * `BaleOCD_DataFile` property. If this fails, it uses the current player's
	 * name as a fallback.
	 *
	 * @param [OUT] ocd_rules   This map will be filled with the loaded OCDinfo
	 *      records, destroying all its previous contents.
	 *      If this function returns `false`, this map will be untouched.
	 * @param [IN]  extraData   If this is not an empty string, this specifies
	 *      the name of the text file (without the ".txt") to load extra OCD
	 *      rules from. These OCD rules will be merged with the user's ruleset,
	 *      with the user's rules taking priority.
	 * @return `false` if the function fails to load the user's ruleset file, or
	 *      if the final ruleset is empty.
	 *      This function returns `true` even if it fails to load the extra
	 *      ruleset file.
	 */
	boolean load_OCD(OCDinfo [item] ocd_rules, string extraData) {
		// Use a temporary map to avoid touching ocd_rules until we need to
		OCDinfo [item] ocd_rules_temp;
		if (
			!file_to_map(`OCDdata_{getvar("BaleOCD_DataFile")}.txt`, ocd_rules_temp) &&
			!file_to_map(`OCD_{my_name()}_Data.txt`, ocd_rules_temp)
		) {
			return vprint("Something went wrong trying to load OCDdata!", _ocd_color_error(), -1);
		}

		OCDinfo [item] extraOCD;
		if (extraData != "" && file_to_map(`{extraData}.txt`, extraOCD)) {
			foreach it in extraOCD {
				if (!(ocd_rules_temp contains it))
					ocd_rules_temp[it] = extraOCD[it];
			}
		}
		if (count(ocd_rules_temp) == 0) {
			return vprint(
				"All item information is corrupted or missing. Whoooah! I hope you didn't lose any data...",
				_ocd_color_error(),
				-1
			);
		}

		// Now we can touch ocd_rules
		clear(ocd_rules);
		foreach it, rule in ocd_rules_temp {
			ocd_rules[it] = rule;
		}
		return true;
	}

	/**
	 * Counts how many of `source` item is needed to craft a `target` item.
	 * If `target` requires multiple crafting steps, this checks all parent
	 * for uses of `source`.
	 * If `source` and `target` are the same item, this returns 0
	 * @param source Ingredient item
	 * @param target Item to be crafted
	 */
	int count_ingredient(item source, item target) {
		boolean [item] under_consideration;

		int _count_ingredient(item source, item target) {
			// If the source and target are the same item, return 0.
			// This prevents OCD-Cleanup from crafting an item into itself, even
			// if a valid recipe chain exists.
			// (e.g. flat dough -> wad of dough -> flat dough)
			if (source == target) return 0;

			int total = 0;
			foreach ingredient, qty in get_ingredients(target) {
				if (ingredient == source) {
					total += qty;
				} else if (under_consideration contains ingredient) {
					// Prevent infinite recursion
					// This usually happens when `target` has a circular recipe
					// (e.g. flat dough <-> wad of dough) and `source` is an
					// unrelated item (e.g. pail).
					return 0;
				} else {
					// Recursively count how many `source` is needed to make
					// each `ingredient`
					under_consideration[ingredient] = true;
					total += qty * _count_ingredient(source, ingredient);
					remove under_consideration[ingredient];
				}
			}
			return total;
		}

		return _count_ingredient(source, target);
	}

	// Amount to OCD. Consider equipment in terrarium (but not equipped) as OCDable.
	int ocd_amount(item it, string action, int keep_amount) {
		if(action == "KEEP") return 0;
		int full = full_amount(it);
		// Unequip item from terrarium or equipment if necessary to OCD it.
		if(full > keep_amount && available_amount(it) > item_amount(it))
			retrieve_item(min(full - keep_amount, available_amount(it)), it);
		// Don't OCD items that are part of stock. Stock can always be satisfied by closet.
		int keep = getvar("BaleOCD_Stock") == "0" ? keep_amount:
			max(keep_amount, stock[it].q - (get_property("autoSatisfyWithCloset") == "false"? 0: closet_amount(it)));
		// OCD is limited by item_amount(it) since we don't want to purchase anything and closeted items
		// may be off-limit, but if there's something in the closet, it counts against the amount you own.
		return min(full - keep, item_amount(it));
	}

	/**
	 * OCD execution plan generated by examining OCD data and the player's
	 * inventory, closet, storage, etc.
	 */
	record OcdPlan {
		/** Items to break apart. Maps item => quantity. */
		int [item] brak;
		/** Items to transform into other items. Maps item => quantity. */
		int [item] make;
		/** Items to untinker. Maps item => quantity. */
		int [item] untink;
		/** Items to use. Maps item => quantity. */
		int [item] usex;
		/** Items to pulverize. Maps item => quantity. */
		int [item] mall;
		/** Items to autosell. Maps item => quantity. */
		int [item] auto;
		/** Items to discard. Maps item => quantity. */
		int [item] disc;
		/** Items to put in the display case. Maps item => quantity. */
		int [item] disp;
		/** Items to put in the closet. Maps item => quantity. */
		int [item] clst;
		/** Items to put in the clan stash. Maps item => quantity. */
		int [item] clan;
		/** Items to display reminder message(s). Maps item => quantity. */
		int [item] todo;
		/**
		 * Items to send to another player.
		 * Maps [target player name, item] => quantity.
		 */
		int [string][item] gift;

		/**
		 * Intermediate cache that stores how many of an item is consumed by a
		 * transformation recipe ("MAKE" action).
		 * For example, if the OCD action for the 'bar skin' is "MAKE" and the
		 * target item is a 'barskin tent', then this map will contain
		 * 'bar skin' => 1. If the OCD configuration for the 'spider web' is
		 * "MAKE" and the target item is a 'really really sticky spider web',
		 * then this map will contain 'spider web' => 4.
		 */
		int [item] make_q;
	};

	/**
	 * Result of calling make_plan().
	 */
	record MakePlanResult {
		/** Whether an OCD execution plan was generated successfully. */
		boolean success;
		/**
		 * Generated OCD execution plan. If `success` is false, this plan is
		 * invalid and should not be executed.
		 */
		OcdPlan plan;
	};

	boolean AskUser = true;  // Once this has been set false, it will be false for all successive calls to the function
	/**
	 * Examines the inventory and generates an appropriate execution plan.
	 * If it finds uncategorized items in inventory, it asks the user whether it
	 * should abort. If the user answers "No", it will not ask the user again
	 * within the current `ocd_control()` call.
	 * @param StopForMissingItems If `false`, this function will never ask for
	 *      confirmation to proceed, even if there are uncategorized items.
	 * @param ocd_rules Map containing OCD rules
	 * @return `true` if the user chose to continue, or was not asked at all
	 *      (i.e. there were no uncategorized items).
	 *      `false` if the user chose to abort.
	 */
	MakePlanResult make_plan(
		boolean StopForMissingItems, OCDinfo [item] ocd_rules
	) {
		AskUser = AskUser && StopForMissingItems;
		// Don't stop if "don't ask user" or it is a quest item, or it is being stocked.
		boolean stop_for_relay(item doodad) {
			if(!AskUser || !is_OCDable(doodad) || (stock contains doodad && full_amount(doodad) <= stock[doodad].q))
				return false;
			if(user_confirm("Uncategorized item(s) have been found in inventory.\nAbort to categorize those items with the relay script?")) {
				return vprint(
					"Please use the relay script to categorize missing items in inventory.",
					_ocd_color_error(),
					1
				);
			}
			AskUser = false;
			return false;
		}

		OcdPlan plan;
		int excess;
		foreach doodad in get_inventory() {
			excess = ocd_amount(doodad, ocd_rules[doodad].action, ocd_rules[doodad].q);
			if(ocd_rules contains doodad) {
				if(excess > 0)
					switch(ocd_rules[doodad].action) {
					case "BREAK":
						plan.brak[doodad] = excess;
						break;
					case "MAKE": {
						item target = to_item(ocd_rules[doodad].info);
						int used_per_craft = plan.make_q[doodad] = count_ingredient(
							doodad, target
						);
						if (used_per_craft == 0) {
							vprint(
								"You cannot transform a "+doodad+" into a "+ocd_rules[doodad].info+". There's a problem with your data file or your crafting ability.",
								_ocd_color_error(),
								-3
							);
							break;
						}
						int use_qty = excess;
						if (used_per_craft > 1) {
							use_qty = use_qty - (use_qty % used_per_craft);
						}
						if (to_boolean(ocd_rules[doodad].message)) {
							use_qty = min(
								use_qty,
								creatable_amount(target) * used_per_craft
							);
						}
						if (use_qty != 0) plan.make[doodad] = use_qty;
						break;
					}
					case "UNTN":
						plan.untink[doodad] = excess;
						break;
					case "USE":
						if(my_path() == "Bees Hate You" && to_string(doodad).contains_text("b"))
							break;
						plan.usex[doodad] = excess;
						break;
					case "PULV":
						// No-op since act_pulverize() does its own logging
						break;
					case "MALL":
						plan.mall[doodad] = excess;
						break;
					case "AUTO":
						plan.auto[doodad] = excess;
						break;
					case "DISC":
						plan.disc[doodad] = excess;
						break;
					case "DISP":
						if(have_display())
							plan.disp[doodad] = excess;
						// else KEEP
						break;
					case "CLST":
						plan.clst[doodad] = excess;
						break;
					case "CLAN":
						plan.clan[doodad] = excess;
						break;
					case "GIFT":
						plan.gift[ocd_rules[doodad].info][doodad] = excess;
						break;
					case "TODO":
						plan.todo[doodad] = excess;
						break;
					case "KEEP":
						break;
					case "KBAY":
						// Treat KBAY as uncategorized items
						vprint(`KBAY is deprecated. {doodad} is treated as uncategorized.`, -1);
						// fall through
					default:
						if(stop_for_relay(doodad))
							return new MakePlanResult(false, plan);
					}
			} else {
				if(stop_for_relay(doodad))
					return new MakePlanResult(false, plan);
				// Potentially disasterous, but this will cause the script to sell off unlisted items, just like it used to.
				if(getvar("BaleOCD_MallDangerously").to_boolean())
					plan.mall[doodad] = excess;   // Backwards compatibility FTW!
			}
		}
		return new MakePlanResult(true, plan);
	}

	void print_cat(
		int [item] cat,
		string act,
		string to,
		OCDinfo [item] ocd_rules,
		__OcdPriceCache price_cache
	) {
		if(count(cat) < 1) return;

		item [int] catOrder;
		foreach it in cat
			catOrder[ count(catOrder) ] = it;
		sort catOrder by to_lower_case(to_string(value));

		int len, total, linevalue;
		buffer queue;
		string com = command[act];
		if(act == "GIFT") com = com + to + ": ";
		boolean print_line() {
			vprint(com + queue, _ocd_color_info(), 3);
			if (act == "MALL")
				vprint("Sale price for this line: "+rnum(linevalue), _ocd_color_info(), 3);
			vprint(" ", 3);
			len = 0;
			total += linevalue;
			linevalue = 0;
			set_length(queue, 0);
			return true;
		}

		foreach x, it in catOrder {
			int quant = cat[it];
			if(it == $item[Degrassi Knoll shopping list] && item_amount($item[bitchin' meatcar]) == 0)
				continue;
			if(len != 0)
				queue.append(", ");
			queue.append(quant + " "+ it);
			if(act == "MALL") {
				if(!use_multi) {
					int price = price_cache.sale_price(it, ocd_rules[it].info);
					if(getvar("BaleOCD_Pricing") == "auto")
						queue.append(" @ "+ rnum(price));
					linevalue += quant * price;
				}
			} else if(act == "MAKE") {
				queue.append(" into "+ ocd_rules[it].info);
			} else if(act == "AUTO") {
				linevalue += quant * autosell_price(it);
			}
			len = len + 1;
			if(len == 11)
				print_line();
		}
		if(len > 0)
			print_line();

		if(act == "MALL") {
			if(!use_multi)
				vprint("Total mall sale = "+rnum(total),_ocd_color_info(), 3);
			#else vprint("Current mall price = "+rnum(total), _ocd_color_info(), 3);
		} else if(act == "AUTO")
			vprint("Total autosale = "+rnum(total), _ocd_color_info(), 3);
		FinalSale += total;
	}

	item other_clover(item it) {
		if(it == $item[ten-leaf clover]) return $item[disassembled clover];
		return $item[ten-leaf clover];
	}

	// This is only called if the player has both kinds of clovers, so no need to check if stock contains both
	int clovers_needed() {
		return stock[$item[ten-leaf clover]].q + stock[$item[disassembled clover]].q
		  - full_amount($item[ten-leaf clover]) - full_amount($item[disassembled clover]);
	}

	/**
	 * Stocks up on items based on the stock rules.
	 * @param ocd_rules OCD ruleset to use
	 * @return Whether all items were stocked successfully
	 */
	boolean stock(OCDinfo [item] ocd_rules) {
		boolean success = true;
		boolean first = true;
		boolean stockit(int q, item it) {
			q = q - closet_amount(it) - storage_amount(it) - equipped_amount(it);
			if(q < 1) return true;
			if(first) first = !vprint("Stocking up on required items!", _ocd_color_info(), 3);
			return retrieve_item(q, it);
		}

		batch_open();
		foreach it in stock {
			// Someone might want both assembled and disassembled clovers. Esure there are enough of combined tot
			if($items[ten-leaf clover,disassembled clover] contains it && stock contains other_clover(it)
			   && clovers_needed() > 0)
				cli_execute("cheapest ten-leaf clover, disassembled clover; acquire "
				  + to_string(clovers_needed() - available_amount(it)) +" it");
			if(full_amount(it) < stock[it].q && !stockit(stock[it].q, it)) {
				success = false;
				print("Failed to stock "+(stock[it].q > 1? stock[it].q + " "+ it.plural: "a "+it), _ocd_color_error());
			}
			// Closet everything (except for gear) that is stocked so it won't get accidentally used.
			if(it.to_slot() == $slot[none] && stock[it].q - ocd_rules[it].q > closet_amount(it) && item_amount(it) > ocd_rules[it].q)
				put_closet(min(item_amount(it) - ocd_rules[it].q, stock[it].q - ocd_rules[it].q - closet_amount(it)), it);
			// If you got clovers, closet them before they get protected into disassembled clovers.
			//if(it == $item[ten-leaf clover] && to_boolean(get_property("cloverProtectActive")))
			//	put_closet(item_amount(it), it);
		}
		batch_close();
		return success;
	}

	/**
	 * Splits a collection of items into equal-sized chunks, sorted
	 * alphabetically by item name.
	 * @param items Collection of items. Only the keys (item) are used, and
	 *      values (quantities) are ignored.
	 * @param chunk_size Number of items per chunk (must be positive)
	 * @return 0-indexed list of lists of items.
	 *      If the input item collection is empty, returns an empty list.
	 */
	item [int, int] split_items_sorted(int [item] items, int chunk_size) {
		if (chunk_size <= 0) {
			abort(`chunk_size must be greater than 0 (got {chunk_size})`);
		}

		item [int] sorted;
		foreach it in items {
			sorted[sorted.count()] = it;
		}
		sort sorted by value.name.to_lower_case();

		item [int, int] item_chunks;
		int index = 0;
		foreach _, it in sorted {
			item_chunks[index][item_chunks[index].count()] = it;
			if (item_chunks[index].count() >= chunk_size) ++index;
		}
		return item_chunks;
	}

	/**
	 * Process all malusable items with the `PULV` action.
	 * This assumes that the player can use the Malus.
	 * @param ocd_rules OCD ruleset to use
	 * @return Whether any item was actually processed
	 *      (i.e. whether any OCD plans must be evaluated again)
	 */
	boolean malus(OCDinfo [item] ocd_rules) {
		/**
		 * Returns the "Malus order" of items.
		 * Items with the same order are processed together, and items with a
		 * smaller order are processed first.
		 * @param it Item to check
		 * @return Integer beteween 1 and 3 for malusable items.
		 *      0 if the item cannot be malused.
		 */
		int get_malus_order(item it) {
			switch (it) {
			// Process nuggets after powders
			case $item[ twinkly nuggets ]:
			case $item[ hot nuggets ]:
			case $item[ cold nuggets ]:
			case $item[ spooky nuggets ]:
			case $item[ stench nuggets ]:
			case $item[ sleaze nuggets ]:
				return 2;
			// Process floaty sand -> floaty pebbles -> floaty gravel
			case $item[ floaty pebbles ]:
				return 2;
			case $item[ floaty gravel ]:
				return 3;
			// Non-malusable items (includes equipment that can be Pulverized)
			default:
				// 1 for other malusable items
				// 0 for non-malusable items (including pulverizable equipment)
				return is_wadable(it) ? 1 : 0;
			}
		}

		boolean has_processed_any = false;

		// Process each malus order sequentially.
		// This allows us to process malus products that can be malused again,
		// e.g. powders -> nuggets -> wads.
		for malus_order from 1 upto 3 {
			// Gather items to be malused
			int [item] items_to_malus;
			foreach it, rule in ocd_rules {
				if (rule.action != "PULV") continue;
				// This also filters out non-malusable items
				if (get_malus_order(it) != malus_order) continue;

				int amount = ocd_amount(it, "PULV", rule.q);
				// The Malus always converts items in multiples of 5
				amount -= amount % 5;
				if (amount < 1) continue;
				items_to_malus[it] = amount;
			}

			// Malus the gathered items
			item [int, int] chunks = split_items_sorted(items_to_malus, 11);
			foreach chunk_index in chunks {
				string [int] tokens, tokens_shown;
				foreach _, it in chunks[chunk_index] {
					int amount = items_to_malus[it];
					tokens[tokens.count()] = `{amount} \u00B6{it.to_int()}`;
					tokens_shown[tokens_shown.count()] = `{amount} {it.name}`;
				}

				vprint(
					`pulverize {tokens_shown.join(", ")}`, _ocd_color_info(), 3
				);
				vprint(" ", 3);
				if (!getvar("BaleOCD_Sim").to_boolean()) {
					cli_execute(`pulverize {tokens.join(", ")}`);
				}
				has_processed_any = true;
			}
		}

		return has_processed_any;
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
	boolean send_to_pulverizing_bot(OCDinfo [item] ocd_rules) {
		int [item] items_to_send;
		foreach it, rule in ocd_rules {
			if (rule.action != "PULV") continue;
			if (!is_tradeable(it)) {
				vprint(
					`send_to_pulverizing_bot(): Skipping {it} since it cannot be traded`,
					_ocd_color_debug(),
					10
				);
				continue;
			}

			int amount = ocd_amount(it, "PULV", rule.q);
			// Note: Always send malusable items even if the quantity is not a
			// multiple of 5.
			// For example, we should be able to send 5 powders and 4 nuggets,
			// so that the bot can combine them into 1 wad.
			if (amount < 1) continue;
			items_to_send[it] = amount;
		}

		if (items_to_send.count() < 1) {
			vprint("Nothing to pulverize after all.", _ocd_color_info(), 3);
			return false;
		}

		if (!can_interact()) {
			// Because Smashbot cannot return items to characters in
			// Ronin/Hardcore, any items
			vprint(
				"You cannot send items to Smashbot while in Ronin/Hardcore.",
				_ocd_color_info(),
				-3
			);
			return false;
		} else if (!is_online("smashbot")) {
			vprint(
				"Smashbot is offline! Pulverizables will not be sent at this time, just in case.",
				_ocd_color_warning(),
				-3
			);
			return false;
		} else {
			// Smashbot supports fine-grained malus control through the
			// "goose_level" command.
			// TODO: Find out if Smashbot supports floaty sand/pebbles/gravel
			int [item] ITEM_GOOSE_LEVELS = {
				$item[ twinkly powder ]: 1,
				$item[ hot powder ]: 2,
				$item[ cold powder ]: 4,
				$item[ spooky powder ]: 8,
				$item[ stench powder ]: 16,
				$item[ sleaze powder ]: 32,
				$item[ twinkly nuggets ]: 64,
				$item[ hot nuggets ]: 128,
				$item[ cold nuggets ]: 256,
				$item[ spooky nuggets ]: 512,
				$item[ stench nuggets ]: 1024,
				$item[ sleaze nuggets ]: 2048,
			};
			int goose_level;
			foreach it, it_goose_level in ITEM_GOOSE_LEVELS {
				if (items_to_send contains it) {
					goose_level |= it_goose_level;
				}
			}
			string message = `goose_level {goose_level}`;

			// Smashbot supports a single command ("rock" to malus all the way
			// up to floaty rock) for multi-malusing floaty items.
			// Since this is not sophisticated enough for all our needs,
			// we should identify and warn about cases where neither "rock" nor
			// the default behavior (no "rock") would satisfy our requirements.
			boolean can_use_rock = false;
			boolean should_warn_rerun = false;
			if (
				items_to_send contains $item[ floaty sand ] &&
				ocd_rules[$item[ floaty pebbles ]].action == "PULV"
			) {
				// Default behavior:
				//  sand -> pebbles (stop)
				// With "rock":
				//  sand -> pebbles -> gravel -> rock
				if (ocd_rules[$item[ floaty gravel ]].action == "PULV") {
					can_use_rock = true;
				} else {
					should_warn_rerun = true;
				}
			} else if (
				items_to_send contains $item[ floaty pebbles ] &&
				ocd_rules[$item[ floaty gravel ]].action == "PULV"
			) {
				// Default behavior:
				//  pebbles -> gravel (stop)
				// With "rock":
				//  pebbles -> gravel -> rock
				can_use_rock = true;
			}

			if (should_warn_rerun) {
				vprint(
					"Note: Smashbot cannot malus floaty sand to gravel in a single kmail." +
					" OCD-Cleanup will convert the pebbles to gravel when you run it again.",
					_ocd_color_warning(),
					3
				);
			}
			if (can_use_rock) {
				message += '\nrock';
			}

			vprint("Sending pulverizables to: Smashbot", _ocd_color_info(), 3);
			kmail("smashbot", message, 0, items_to_send);
			return true;
		}
	}

	/**
	 * Ppulverize and malus all items with the `PULV` action.
	 * @param ocd_rules OCD ruleset to use
	 * @return Whether any item was actually processed
	 *      (i.e. whether any OCD plans must be evaluated again)
	 */
	boolean act_pulverize(OCDinfo [item] ocd_rules) {
		/**
		 * Checks if an item can be pulverized.
		 */
		boolean is_pulverizable(item it) {
			switch (it) {
			// Workaround for some items incorrectly marked as Pulverizable
			case $item[ Eight Days a Week Pill Keeper ]:
			case $item[ Powerful Glove ]:
			case $item[ Guzzlr tablet ]:
			case $item[ Iunion Crown ]:
			case $item[ Cargo Cultist Shorts ]:
			case $item[ unwrapped knock-off retro superhero cape ]:
				return true;
			}

			return get_related(it, "pulverize").count() > 0;
		}

		/**
		 * Checks if the current player can use the Malus.
		 */
		boolean can_use_malus() {
			return have_skill($skill[ Pulverize ]) &&
				my_primestat() == $stat[ muscle ];
		}

		if (!have_skill($skill[ Pulverize ])) {
			return send_to_pulverizing_bot(ocd_rules);
		}

		boolean has_processed_any;

		// Process all pulverizable items first, so that we can malus the
		// powders/nuggets/wads gained from pulverizing.

		int [item] items_to_smash;
		foreach it, rule in ocd_rules {
			if (rule.action != "PULV") continue;
			if (!is_pulverizable(it)) continue;

			int amount = ocd_amount(it, "PULV", rule.q);
			if (amount < 1) continue;
			items_to_smash[it] = amount;
		}

		item [int, int] chunks = split_items_sorted(items_to_smash, 11);
		foreach chunk_index in chunks {
			string [int] tokens, tokens_shown;
			foreach _, it in chunks[chunk_index] {
				int amount = items_to_smash[it];
				tokens[tokens.count()] = `{amount} \u00B6{it.to_int()}`;
				tokens_shown[tokens_shown.count()] = `{amount} {it.name}`;
			}

			vprint(`pulverize {tokens_shown.join(", ")}`, _ocd_color_info(), 3);
			vprint(" ", 3);
			if (!getvar("BaleOCD_Sim").to_boolean()) {
				cli_execute(`pulverize {tokens.join(", ")}`);
			}
			has_processed_any = true;
		}

		// Malus all items, including those gained from pulverizing.
		if (can_use_malus()) {
			if (malus(ocd_rules)) has_processed_any = true;
		} else {
			if (send_to_pulverizing_bot(ocd_rules)) {
				has_processed_any = true;
			}
		}

		return has_processed_any;
	}

	int sauce_mult(item itm) {
		if(my_class() == $class[sauceror])
			switch(itm) {
			case $item[philter of phorce]:
			case $item[Frogade]:
			case $item[potion of potency]:
			case $item[oil of stability]:
			case $item[ointment of the occult]:
			case $item[salamander slurry]:
			case $item[cordial of concentration]:
			case $item[oil of expertise]:
			case $item[serum of sarcasm]:
			case $item[eyedrops of newt]:
			case $item[eyedrops of the ermine]:
			case $item[oil of slipperiness]:
			case $item[tomato juice of powerful power]:
			case $item[banana smoothie]:
			case $item[perfume of prejudice]:
			case $item[libation of liveliness]:
			case $item[milk of magnesium]:
			case $item[papotion of papower]:
			case $item[oil of oiliness]:
			case $item[cranberry cordial]:
			case $item[concoction of clumsiness]:
			case $item[phial of hotness]:
			case $item[phial of coldness]:
			case $item[phial of stench]:
			case $item[phial of spookiness]:
			case $item[phial of sleaziness]:
			case $item[Ferrigno's Elixir of Power]:
			case $item[potent potion of potency]:
			case $item[plum lozenge]:
			case $item[Hawking's Elixir of Brilliance]:
			case $item[concentrated cordial of concentration]:
			case $item[pear lozenge]:
			case $item[Connery's Elixir of Audacity]:
			case $item[eyedrops of the ocelot]:
			case $item[peach lozenge]:
			case $item[cologne of contempt]:
			case $item[potion of temporary gr8ness]:
			case $item[blackberry polite]:
				return 3;
			}
		return 1;
	}

	boolean create_it(item it, item obj, int quant, int make_quant) {
		if (make_quant == 0) return false;
		quant = quant / make_quant * sauce_mult(it);
		if(quant > 0) return create(quant, obj);
		return false;
	}

	boolean use_it(int quant, item it) {
		boolean use_map(item required) {
			cli_execute("checkpoint");
			if(required == $item[none])
				cli_execute("maximize stench resistance, 1 min");
			else {
				retrieve_item(1, required);
				equip(required);
			}
			boolean success = use(1, it);
			cli_execute("outfit checkpoint");
			return success;
		}
		switch(it) {
		case $item[the Slug Lord's map]:
			return use_map($item[none]);
		case $item[Dr. Hobo's map]:
			item whip = $item[cool whip];
			foreach it in $items[Bar whip, Bat whip, Clown whip, Demon whip, Dishrag, Dreadlock whip, Gnauga hide whip,
			  Hippo whip, Palm-frond whip, Penguin whip, Rattail whip, Scorpion whip, Tail o' nine cats, White whip,
			  Wumpus-hair whip, Yak whip]
				if(item_amount(it) > 0 && can_equip(it)) {
					whip = it;
					break;
				}
			retrieve_item(1, $item[asparagus knife]);
			return use_map(whip);
		case $item[Dolphin King's map]:
			item breather = $item[snorkel];
			foreach it in $items[aerated diving helmet, makeshift SCUBA gear]
				if(item_amount(it) > 0 && can_equip(it)) {
					breather = it;
					break;
				}
			return use_map(breather);
		case $item[Degrassi Knoll shopping list]:
			if(item_amount($item[bitchin' meatcar]) == 0)
				return false;
			break;
		}
		return use(quant, it);
	}

	string message(int [item] cat, OCDinfo [item] ocd_rules) {
		foreach key in cat
			return ocd_rules[key].message;
		return "";
	}

	/**
	 * Process a collection of items using a given action.
	 * @param cat Collection of items and their amounts to be processed
	 * @param act Item action ID
	 * @param Receiving player ID. Used for actions that involve another player
	 * 	  (e.g. "GIFT")
	 * @param plan OCD execution plan being used
	 * @param ocd_rules Map containing OCD rules
	 * @return Boolean that indicates whether the execution plan must be
	 *    regenerated before processing another action.
	 */
	boolean act_cat(
		int [item] cat,
		string act,
		string to,
		OcdPlan plan,
		OCDinfo [item] ocd_rules
	) {
		__OcdPriceCache price_cache;

		item [int] catOrder;
		foreach it in cat
			catOrder[ count(catOrder) ] = it;
		sort catOrder by to_lower_case(to_string(value));

		// If there are no items to process, we don't need to regenerate the
		// execution plan.
		if(count(cat) == 0) return false;
		int i = 0;
		if (act == "TODO" && count(cat) > 0)
			print("");
		else if (act == "PULV")
			abort("PULV action must be handled by act_pulverize()");
		else
			print_cat(cat, act, to, ocd_rules, price_cache);
		if(getvar("BaleOCD_Sim").to_boolean()) return true;
		switch(act) {
		case "MALL":
			if (use_multi) {
				string multi_id = getvar("BaleOCD_MallMulti");
				string multi_message = getvar("BaleOCD_MultiMessage");

				// Some users have reported OCD-Cleanup occasionally sending
				// items to an account named "False". While the exact cause is
				// unknown, this should serve as a stopgap measure.
				if (multi_id == "" || multi_id.to_lower_case() == "false") {
					print(
						`Invalid mall multi account ID ("{multi_id}"). Please report the issue at https://kolmafia.us/`,
						_ocd_color_error()
					);
					int timeout = 30;
					string warning_message =
						`OCD-Cleanup has detected that it is about to send items to a mall multi account named "{multi_id}". ` +
						`Since this is likely an error, OCD-Cleanup will NOT send the items.\n\n` +
						`Do you want to abort OCD-Cleanup immediately?\n` +
						`(If you choose "No" or wait {timeout} seconds, OCD-Cleanup will skip the MALL action and continue.)`;
					// If the user disables user_confirm() -- possibly because
					// they are calling OCD-Cleanup from an auto-adventuring
					// script -- it will always return false.
					// In this case, we will continue processing instead of
					// aborting (which would otherwise be disruptive).
					if (user_confirm(warning_message, timeout * 1000, false)) {
						abort(`You decided to abort OCD-Cleanup.`);
					}
					print(`OCD-Cleanup has skipped the MALL action.`);
					return false;
				} else {
					return kmail(multi_id, multi_message, 0, cat);
				}
			}
		case "AUTO":
		case "DISP":
		case "CLST":
		case "CLAN":
			batch_open();
			break;
		case "GIFT":
			string message = message(cat, ocd_rules);
			return kmail(to, message, 0, cat, message);
		case "KBAY":
			// This should be unreachable
			abort("KBAY action is no longer available");
		}
		foreach x, it in catOrder {
			int quant = cat[it];
			switch(act) {
			case "BREAK":
				for i from 1 to quant
					visit_url("inventory.php?action=breakbricko&pwd&ajax=1&whichitem="+to_int(it));
				break;
			case "MALL":
				put_shop(
					getvar("BaleOCD_Pricing") == "auto"
						? price_cache.sale_price(it, ocd_rules[it].info)
						: 0, // Use current price (or max if none is present)
					0,
					quant,
					it
				);
				break;
			case "AUTO":
				autosell(quant, it);
				break;
			case "DISC":
				for i from 1 to quant {
					if(i % 10 == 0)
						print("Discarding "+i+" of "+quant+"...");
					visit_url("inventory.php?action=discard&pwd&ajax=1&whichitem="+to_int(it));
				}
				break;
			case "USE":
				use_it(quant, it);
				break;
			case "MAKE":
				create_it(
					it, to_item(ocd_rules[it].info), quant, plan.make_q[it]
				);
				break;
			case "UNTN":
				cli_execute("untinker "+quant+" \u00B6"+ it.to_int());
				break;
			case "DISP":
				put_display(quant, it);
				break;
			case "CLST":
				put_closet(quant, it);
				break;
			case "CLAN":
				put_stash(quant, it);
				break;
			case "TODO":
				print_html("<b>"+it+" ("+quant+"): "+ocd_rules[it].info+"</b>");
				break;
			}
			i += 1;
			// If there are too many items batched mafia may run out of memory. On poor systems it usually happens around 20 transfers so stop at 15.
			if(i >= 165 && (act == "MALL" || act == "AUTO" || act == "DISP" || act == "CLST" || act == "CLAN")) {
				batch_close();
				i = 0;
				batch_open();
			}
		}
		if(act == "MALL" || act == "AUTO" || act == "DISP"|| act == "CLST" || act == "CLAN") batch_close();

		// It's okay to return true here, because ocd_inventory() only checks
		// this value for actions that can create or remove additional items.
		return true;
	}

	void unequip_familiars() {
		matcher unequip = create_matcher("<a href='(familiar.php\\?pwd=.+?&action=unequip&famid=(.+?))'>\\[unequip\\]"
			, visit_url("familiar.php"));
		while(unequip.find())
			switch(unequip.group(2)) {
			case "124": case "136": break;
			default:
				visit_url(unequip.group(1));
			}
	}

	boolean ocd_inventory(boolean StopForMissingItems) {
		OCDinfo [item] ocd_rules;
		if (!load_OCD(ocd_rules, extraData)) return false;
		if((!file_to_map("OCDstock_"+getvar("BaleOCD_StockFile")+".txt", stock) || count(stock) == 0)
		  && getvar("BaleOCD_Stock") == "1") {
			print("You are missing item stocking information.", _ocd_color_error());
			return false;
		}

		MakePlanResult mpr = make_plan(StopForMissingItems, ocd_rules);
		if (!mpr.success) return false;

		// Actions that may create additional items, or remove items not
		// included in the execution plan. If act_cat() returns true after
		// executing such actions, the entire execution plan must be regenerated
		// to handle such items correctly.
		if (act_cat(mpr.plan.brak, "BREAK", "", mpr.plan, ocd_rules)) {
			mpr = make_plan(StopForMissingItems, ocd_rules);
			if (!mpr.success) return false;
		}
		if (act_cat(mpr.plan.make, "MAKE", "", mpr.plan, ocd_rules)) {
			mpr = make_plan(StopForMissingItems, ocd_rules);
			if (!mpr.success) return false;
		}
		if (act_cat(mpr.plan.untink, "UNTN", "", mpr.plan, ocd_rules)) {
			mpr = make_plan(StopForMissingItems, ocd_rules);
			if (!mpr.success) return false;
		}
		if (act_cat(mpr.plan.usex, "USE", "", mpr.plan, ocd_rules)) {
			mpr = make_plan(StopForMissingItems, ocd_rules);
			if (!mpr.success) return false;
		}
		// Note: Since the next action (act_pulverize()) does its own planning,
		// the previous if-block does not need to call make_plan().
		// I'm only keeping it to make refactoring/reordering easier.
		if (act_pulverize(ocd_rules)) {
			mpr = make_plan(StopForMissingItems, ocd_rules);
			if (!mpr.success) return false;
		}

		// Actions that never create or remove additional items.
		// Currently, we do not bother to check the return value of act_cat()
		// for them.
		act_cat(mpr.plan.mall, "MALL", "", mpr.plan, ocd_rules);
		act_cat(mpr.plan.auto, "AUTO", "", mpr.plan, ocd_rules);
		act_cat(mpr.plan.disc, "DISC", "", mpr.plan, ocd_rules);
		act_cat(mpr.plan.disp, "DISP", "", mpr.plan, ocd_rules);
		act_cat(mpr.plan.clst, "CLST", "", mpr.plan, ocd_rules);
		act_cat(mpr.plan.clan, "CLAN", "", mpr.plan, ocd_rules);
		foreach person in mpr.plan.gift {
			act_cat(mpr.plan.gift[person], "GIFT", person, mpr.plan, ocd_rules);
		}

		if(getvar("BaleOCD_Stock") == "1" && !getvar("BaleOCD_Sim").to_boolean())
			stock(ocd_rules);

		act_cat(mpr.plan.todo, "TODO", "", mpr.plan, ocd_rules);

		if(getvar("BaleOCD_Sim").to_boolean())
			vprint(
				"This was only a test. Had this been an actual OCD incident your inventory would be clean right now.",
				_ocd_color_success(),
				3
			);
		return true;
	}

// *******  Finally, here is the main for ocd_control()
// int ocd_control(boolean StopForMissingItems) {

	cli_execute("inventory refresh");

	// Empty closet before emptying out Hangks, otherwise it may interfere with which Hangk's items go to closet
	if(to_int(getvar("BaleOCD_EmptyCloset")) >= 0 && get_property("lastEmptiedStorage").to_int() != my_ascensions()
	  && getvar("BaleOCD_Sim") == "false")
		empty_closet();

	// Empty out Hangks, so it can be accounted for by what follows.
	if(autoSatisfyWithStorage && get_property("lastEmptiedStorage").to_int() != my_ascensions())
		 visit_url("storage.php?action=pullall&pwd");

	boolean success;
	try {
		if(autoSatisfyWithCloset)
			set_property("autoSatisfyWithCloset", "false");
		if(autoSatisfyWithStash)
			set_property("autoSatisfyWithStash", "false");
		if(autoSatisfyWithStorage && get_property("lastEmptiedStorage").to_int() != my_ascensions())
			set_property("autoSatisfyWithStorage", "false");
		// Yay! Get rid of the excess inventory!
		success = ocd_inventory(StopForMissingItems && !getvar("BaleOCD_MallDangerously").to_boolean());
	} finally { // Ensure properties are restored, even if the user aborted execution
		if(autoSatisfyWithCloset)  set_property("autoSatisfyWithCloset", "true");
		if(autoSatisfyWithStorage) set_property("autoSatisfyWithStorage", "true");
		if(autoSatisfyWithStash) set_property("autoSatisfyWithStash", "true");
	}
	print("");
	return success? FinalSale: -1;
}

int ocd_control(boolean StopForMissingItems) {
	return ocd_control(StopForMissingItems, "");
}

void main() {
	boolean can_interact_check() {
		if (can_interact()) return true;

		string action = getvar("BaleOCD_RunIfRoninOrHC");
		if (action == "never") return false;
		if (action == "always") return true;
		return user_confirm("You are in Ronin/Hardcore. Do you want to run OCD Cleanup anyway?");
	}

	if(can_interact_check()) {
		int todaysFarming = ocd_control(true);
		if(todaysFarming < 0)
			vprint("OCD Control was unable to obssessively control your entire inventory.", _ocd_color_error(), -1);
		else if(todaysFarming == 0)
			vprint("Nothing to do. I foresee no additional meat in your future.", _ocd_color_warning(), 3);
		else {
			vprint(
				"Anticipated monetary gain from inventory cleansing: "+rnum(todaysFarming)+" meat.",
				_ocd_color_success(),
				3
			);
		}
	} else vprint("Whoa! Don't run this until you break the prism!", _ocd_color_error(), -3);
}