import {availableAmount, batchClose, batchOpen, cliExecute, closetAmount, equippedAmount, getCampground, getProperty, isDisplayable, itemAmount, myName, setProperty, stashAmount, storageAmount, svnAtHead, svnExists, todayToString, toInt, userConfirm} from 'kolmafia';
import {getvar, setvar} from 'zlib.ash';
import {toItemMap} from '@philter/common/kol'

// The following variables should be set from the relay script.
setvar("BaleOCD_MallMulti", "");           // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar("BaleOCD_UseMallMulti", true);      // If mall_multi is not empty, then all MALL items will be sent to this multi.
setvar("BaleOCD_MultiMessage", "Mall multi dump");
setvar("BaleOCD_DataFile", myName());     // The name of the file that holds OCD data for this character.
setvar("BaleOCD_StockFile", myName());    // The name of the file that holds OCD stocking data for this character.
setvar("BaleOCD_Stock", 0);                // Should items be acquired for stock
setvar("BaleOCD_Pricing", "auto");         // How to handle mall pricing. "auto" will use mall_price(). "max" will price at maximum.
setvar("BaleOCD_Sim", false);              // If you set this to true, it won't actually do anything. It'll only inform you.
setvar("BaleOCD_EmptyCloset", 0);          // Should the closet be emptied and its contents disposed of?
setvar("BaleOCD_EmptyHangks", 0);          // Should Hangk's Storange be emptied?
setvar("BaleOCD_MallDangerously", false);  // If this set to TRUE, any uncategorized items will be malled instead of kept! OH NOES!
	// This last one can only be set by editing the vars file. It's too dangerous to make it easily accessible. Exists for backwards compatibility.
setvar("BaleOCD_RunIfRoninOrHC", "ask");   // Controls whether to run OCD-Cleanup if the player is in Ronin/Hardcore.
                                           // If set to "ask", the script will prompt the user.
                                           // If set to "never", the script will never run if in Ronin/Hardcore.
                                           // If set to "always", the script will always run even if in Ronin/Hardcore.

// Check version! This will check both scripts and data files.
// This code is at base level so that the relay script's importation will automatically cause it to be run.
const __OCD_PROJECT_NAME__ = "Loathing-Associates-Scripting-Society-philter-trunk-release";
if(svnExists(__OCD_PROJECT_NAME__) && getProperty("_svnUpdated") === "false" && getProperty("_ocdUpdated") !== "true") {
	if(!svnAtHead(__OCD_PROJECT_NAME__)) {
		print("Philter has become outdated. Automatically updating from SVN...", _ocd_color_error());
		cliExecute("svn update " + __OCD_PROJECT_NAME__);
		print("On the script's next invocation it will be up to date.", _ocd_color_success());
	}
	setProperty("_ocdUpdated", "true");
}

record OCDinfo {
	string action;	// What to do
	int q;			// How many of them to keep
	string info;	// Extra information (whom to send the gift)
	string message; // Message to send with a gift
};

void main() {

	if(can_interact_check()) {
		int todaysFarming = ocd_control(true);
		if(todaysFarming < 0)
			vprint("OCD Control was unable to obssessively control your entire inventory.", _ocd_color_error(), -1);
		else if(todaysFarming === 0)
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

function can_interact_check(): boolean {
  if (can_interact()) return true;

  const action = getvar("BaleOCD_RunIfRoninOrHC");
  if (action === "never") return false;
  if (action === "always") return true;
  return userConfirm("You are in Ronin/Hardcore. Do you want to run OCD Cleanup anyway?");
}

export function main(args: string): void {

}
