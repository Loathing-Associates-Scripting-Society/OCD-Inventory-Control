// OCD Inventory by Bale
script "ocd-cleanup.ash";
import "zlib.ash";
import "relay/ocd-cleanup-manager/ocd-cleanup.util.ash";

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
string __OCD_PROJECT_NAME__ = "Loathing-Associates-Scripting-Society-OCD-Inventory-Control-trunk-release";
if(svn_exists(__OCD_PROJECT_NAME__) && get_property("_svnUpdated") == "false" && get_property("_ocdUpdated") != "true") {
	if(!svn_at_head(__OCD_PROJECT_NAME__)) {
		print("OCD-Cleanup has become outdated. Automatically updating from SVN...", _ocd_color_error());
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
	command ["PULV"] = "pulverize ";
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
	 * Result of loading OCD data from the disk.
	 */
	record LoadOcdResult {
		/** Whether the OCD data was loaded successfully. */
		boolean success;
		/**
		 * Data loaded. If an error occurred or the file was empty, this map is
		 * empty.
		 */
		OCDinfo [item] ocd_data;
	};

	LoadOcdResult load_OCD() {
		LoadOcdResult result = new LoadOcdResult(true);
		if (
			!file_to_map(`OCDdata_{getvar("BaleOCD_DataFile")}.txt`, result.ocd_data) &&
			!file_to_map(`OCD_{my_name()}_Data.txt`, result.ocd_data)
		) {
			vprint("Something went wrong trying to load OCDdata!", _ocd_color_error(), -1);
			result.success = false;
			return result;
		}
		OCDinfo [item] extraOCD;
		if(extraData != "" && file_to_map(extraData+".txt", extraOCD) && count(extraOCD) > 0)
			foreach it in extraOCD
				if(!(result.ocd_data contains it)) {
					result.ocd_data[it].action = extraOCD[it].action;
					result.ocd_data[it].q = extraOCD[it].q;
					result.ocd_data[it].info = extraOCD[it].info;
					result.ocd_data[it].message = extraOCD[it].message;
				}
		if (count(result.ocd_data) == 0) {
			vprint(
				"All item information is corrupted or missing. Whoooah! I hope you didn't lose any data...",
				_ocd_color_error(),
				-1
			);
			result.success = false;
		}
		return result;
	}

	boolean[item] under_consideration; // prevent infinite recursion
	int count_ingredient(item source, item into) {
		int total = 0;
		foreach key, qty in get_ingredients(into)
			if(key == source) total += qty;
			else {
				#if(key == $item[flat dough]) return 0;
				if(under_consideration contains key) return 0;
				under_consideration[key] = true;
				total += count_ingredient(source, key);
				remove under_consideration[key];
			}
		return total;
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
		int [item] pulv;
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

		/**
		 * User-defined minimum price for items to put in the shop.
		 * Used by items with the MALL action.
		 */
		int [item] mall_min_price;
	};

	/**
	 * Result of calling check_inventory().
	 */
	record CheckInventoryResult {
		/** Whether an OCD execution plan was generated successfully. */
		boolean success;
		/**
		 * Generated OCD execution plan. If `success` is false, this plan is
		 * invalid and should not be executed.
		 */
		OcdPlan plan;
	};

	boolean AskUser = true;  // Once this has been set false, it will be false for all successive calls to the function
	CheckInventoryResult check_inventory(boolean StopForMissingItems, OCDinfo [item] ocd_data) {
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
			excess = ocd_amount(doodad, ocd_data[doodad].action, ocd_data[doodad].q);
			if(ocd_data contains doodad) {
				if(excess > 0)
					switch(ocd_data[doodad].action) {
					case "BREAK":
						plan.brak[doodad] = excess;
						break;
					case "MAKE":
						plan.make_q[doodad] = count_ingredient(doodad, to_item(ocd_data[doodad].info));
						if(plan.make_q[doodad] == 0) {
							vprint(
								"You cannot transform a "+doodad+" into a "+ocd_data[doodad].info+". There's a problem with your data file or your crafting ability.",
								_ocd_color_error(),
								-3
							);
							break;
						}
						plan.make[doodad] = excess;
						if(plan.make_q[doodad] > 1)
							plan.make[doodad] = plan.make[doodad] - (plan.make[doodad] % plan.make_q[doodad]);
						if(to_boolean(ocd_data[doodad].message))
							plan.make[doodad] = min(plan.make[doodad], creatable_amount(to_item(ocd_data[doodad].info)) * plan.make_q[doodad]);
						if(plan.make[doodad] == 0) remove plan.make[doodad];
						break;
					case "UNTN":
						plan.untink[doodad] = excess;
						break;
					case "USE":
						if(my_path() == "Bees Hate You" && to_string(doodad).contains_text("b"))
							break;
						plan.usex[doodad] = excess;
						break;
					case "PULV":
						// Some pulverizable items aren't tradeable. If so, wadbot cannot be used
						if(have_skill($skill[Pulverize]) || is_tradeable(doodad))
							plan.pulv[doodad] = excess;
						break;
					case "MALL":
						plan.mall[doodad] = excess;
						if (is_integer(ocd_data[doodad].info))
							plan.mall_min_price[doodad] = to_int(ocd_data[doodad].info);
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
						plan.gift[ocd_data[doodad].info][doodad] = excess;
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
							return new CheckInventoryResult(false, plan);
					}
			} else {
				if(stop_for_relay(doodad))
					return new CheckInventoryResult(false, plan);
				// Potentially disasterous, but this will cause the script to sell off unlisted items, just like it used to.
				if(getvar("BaleOCD_MallDangerously").to_boolean())
					plan.mall[doodad] = excess;   // Backwards compatibility FTW!
			}
		}
		return new CheckInventoryResult(true, plan);
	}

	/**
	 * Computes an appropriate selling price for an item at the mall, based on
	 * its current (or historical) mall price.
	 * This caches the computed price, so that calling the function with the
	 * same item and `min_price_str` will return the same value during the
	 * current execution context.
	 * @param it Item to check
	 * @param min_price Minimum mall price
	 * @return Appropriate selling price for the item, or zero if the item is
	 *		not available in the mall.
	 *		The returned price is guaranteed to be at least 0.
	 */
	int sale_price(item it, int min_price) {
		static int [item, int] price_cache;
		if (price_cache[it] contains min_price) {
			return price_cache[it, min_price];
		}

		int price;
		if (historical_age(it) < 1 && historical_price(it) > 0) {
			price = historical_price(it);
		} else {
			price = mall_price(it);
		}
		return price_cache[it, min_price] = max(price, 0, min_price);
	}

	void print_cat(int [item] cat, string act, string to, OcdPlan plan, OCDinfo [item] ocd_data) {
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
				int price;
				if(!use_multi) {
					price = sale_price(it, plan.mall_min_price[it]);
					if(getvar("BaleOCD_Pricing") == "auto")
						queue.append(" @ "+ rnum(price));
				}
				linevalue += quant * price;
			} else if(act == "MAKE") {
				queue.append(" into "+ ocd_data[it].info);
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

	boolean stock(OCDinfo [item] ocd_data) {
		boolean success = true;
		boolean first = true;
		boolean stockit(int q, item it) {
			q = q - closet_amount(it) - storage_amount(it) - equipped_amount(it);
			if(q < 1) return true;
			if(first) first = !vprint("Stocking up on required items!", _ocd_color_info(), 3);
			return retrieve_item(q, it);
		}

		// Load OCD data again and *overwrite* the previous OCD data.
		// This sounds insane, but it's how OCD Inventory Control used to work
		// and I'm not about to change that.
		OCDinfo [item] new_ocd_data = load_OCD().ocd_data;
		clear(ocd_data);
		foreach it, ocd_data_entry in new_ocd_data {
			ocd_data[it] = ocd_data_entry;
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
			if(it.to_slot() == $slot[none] && stock[it].q - ocd_data[it].q > closet_amount(it) && item_amount(it) > ocd_data[it].q)
				put_closet(min(item_amount(it) - ocd_data[it].q, stock[it].q - ocd_data[it].q - closet_amount(it)), it);
			// If you got clovers, closet them before they get protected into disassembled clovers.
			//if(it == $item[ten-leaf clover] && to_boolean(get_property("cloverProtectActive")))
			//	put_closet(item_amount(it), it);
		}
		batch_close();
		return success;
	}

	boolean wadbot(int [item] pulv, OCDinfo [item] ocd_data) {
		string wadmessage(OCDinfo [item] ocd_data) {
			for x from 1444 to 1449 if(ocd_data[to_item(x)].action == "PULV") return "wads";
			for x from 1438 to 1443 if(ocd_data[to_item(x)].action == "PULV") return "nuggets";
			return "";
		}

		boolean malusOnly = true;
		foreach thing, quant in pulv
			if(thing.is_wadable()) {
				quant -= quant %5;
				if(quant < 1) remove pulv[thing];
			} else malusOnly = false;
		if(count(pulv) < 1) {
			vprint("Nothing to pulverize after all.", _ocd_color_info(), 3);
			return false;
		}
		if(can_interact() && is_online("smashbot")) {
			vprint("Sending pulverizables to: Smashbot", _ocd_color_info(), 3);
			kmail("smashbot", wadmessage(ocd_data), 0, pulv);
		} else if(is_online("wadbot")) {
			vprint("Sending pulverizables to: Wadbot", _ocd_color_info(), 3);
			kmail("wadbot", "", 0, pulv);
		} else {
			return vprint(
				"Neither Wadbot nor Smashbot are currently online! Pulverizables will not be sent at this time, just in case.",
				_ocd_color_warning(),
				-3
			);
		}
		# if(malusOnly)
			# return vprint("Asked wadbot to malus some wads.", _ocd_color_info(), 3);
		# return vprint("Sent your pulverizables to wadbot.", _ocd_color_info(), 3);
		return true;
	}

	boolean pulverize(int [item] pulv, OCDinfo [item] ocd_data) {
		if(count(pulv) < 1) return false;
		if(!have_skill($skill[Pulverize]))
			return wadbot(pulv, ocd_data);
		int len;
		buffer queue;
		int [item] malus;
		foreach it, quant in pulv {
			if(my_primestat() != $stat[muscle] && it.is_wadable()) {
				malus[it] = quant;
			} else {
				if(len != 0)
					queue.append(", ");
				queue.append(quant + " \u00B6"+ it.to_int().to_string());
				len = len + 1;
				if(len == 11) {
					cli_execute(command["PULV"] + queue);
					len = 0;
					set_length(queue, 0);
				}
			}
		}
		if(len > 0)
			cli_execute(command["PULV"] + queue);
		if(count(malus) > 0)
			wadbot(malus, ocd_data);
		return true;
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

	string message(int [item] cat, OCDinfo [item] ocd_data) {
		foreach key in cat
			return ocd_data[key].message;
		return "";
	}

	/**
	 * Process a collection of items using a given action.
	 * @param cat Collection of items and their amounts to be processed
	 * @param act Item action ID
	 * @param Receiving player ID. Used for actions that involve another player
	 * 	  (e.g. "GIFT")
	 * @param plan OCD execution plan being used
	 * @param ocd_data OCD data for each item
	 * @return Whether all items were processed successfully
	 */
	boolean act_cat(int [item] cat, string act, string to, OcdPlan plan, OCDinfo [item] ocd_data) {

		item [int] catOrder;
		foreach it in cat
			catOrder[ count(catOrder) ] = it;
		sort catOrder by to_lower_case(to_string(value));

		if(count(cat) == 0) return false;
		int i = 0;
		if (act == "TODO" && count(cat) > 0)
			print("");
		else
			print_cat(cat, act, to, plan, ocd_data);
		if(getvar("BaleOCD_Sim").to_boolean()) return true;
		switch(act) {
		case "PULV":
			return pulverize(cat, ocd_data);
		case "MALL":
			if(use_multi)
				return kmail(getvar("BaleOCD_MallMulti"), getvar("BaleOCD_MultiMessage"), 0, cat);
		case "AUTO":
		case "DISP":
		case "CLST":
		case "CLAN":
			batch_open();
			break;
		case "GIFT":
			string message = message(cat, ocd_data);
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
				if(getvar("BaleOCD_Pricing") == "auto") {
					put_shop(sale_price(it, plan.mall_min_price[it]), 0, quant, it);
				} else
					put_shop((shop_amount(it)>0? shop_price(it): 0), 0, quant, it);   // Set to max price of 999,999,999 meat
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
				create_it(it, to_item(ocd_data[it].info), quant, plan.make_q[it]);
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
				print_html("<b>"+it+" ("+quant+"): "+ocd_data[it].info+"</b>");
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
		LoadOcdResult result = load_OCD();
		OCDinfo [item] ocd_data = result.ocd_data;
		if(!result.success) return false;
		if((!file_to_map("OCDstock_"+getvar("BaleOCD_StockFile")+".txt", stock) || count(stock) == 0)
		  && getvar("BaleOCD_Stock") == "1") {
			print("You are missing item stocking information.", _ocd_color_error());
			return false;
		}

		CheckInventoryResult plan_result = check_inventory(StopForMissingItems, ocd_data);
		if (!plan_result.success) return false;
		// Actions that may create additional items. After executing each
		// action, the entire execution plan must be re-evaluated to account for
		// the new items.
		if (act_cat(plan_result.plan.brak, "BREAK", "", plan_result.plan, ocd_data)) {
			plan_result = check_inventory(StopForMissingItems, ocd_data);
			if (!plan_result.success) return false;
		}
		if (act_cat(plan_result.plan.make, "MAKE", "", plan_result.plan, ocd_data)) {
			plan_result = check_inventory(StopForMissingItems, ocd_data);
			if (!plan_result.success) return false;
		}
		if (act_cat(plan_result.plan.untink, "UNTN", "", plan_result.plan, ocd_data)) {
			plan_result = check_inventory(StopForMissingItems, ocd_data);
			if (!plan_result.success) return false;
		}
		if (act_cat(plan_result.plan.usex, "USE", "", plan_result.plan, ocd_data)) {
			plan_result = check_inventory(StopForMissingItems, ocd_data);
			if (!plan_result.success) return false;
		}
		if (act_cat(plan_result.plan.pulv, "PULV", "", plan_result.plan, ocd_data)) {
			plan_result = check_inventory(StopForMissingItems, ocd_data);
			if (!plan_result.success) return false;
		}

		// Actions that do not create additional items
		act_cat(plan_result.plan.mall, "MALL", "", plan_result.plan, ocd_data);
		act_cat(plan_result.plan.auto, "AUTO", "", plan_result.plan, ocd_data);
		act_cat(plan_result.plan.disc, "DISC", "", plan_result.plan, ocd_data);
		act_cat(plan_result.plan.disp, "DISP", "", plan_result.plan, ocd_data);
		act_cat(plan_result.plan.clst, "CLST", "", plan_result.plan, ocd_data);
		act_cat(plan_result.plan.clan, "CLAN", "", plan_result.plan, ocd_data);
		if (count(plan_result.plan.gift) > 0) {
			foreach person in plan_result.plan.gift {
				act_cat(plan_result.plan.gift[person], "GIFT", person, plan_result.plan, ocd_data);
			}
		}

		if(getvar("BaleOCD_Stock") == "1" && !getvar("BaleOCD_Sim").to_boolean())
			stock(ocd_data);

		act_cat(plan_result.plan.todo, "TODO", "", plan_result.plan, ocd_data);

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