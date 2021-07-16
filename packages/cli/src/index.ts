import {
  checkProjectUpdates,
  loadCleanupConfig,
  logger,
  setDefaultConfig,
} from '@philter/common/kol';
import {canInteract, userConfirm} from 'kolmafia';
import {getvar, rnum} from 'zlib.ash';
import {philter} from './philter';

/**
 * Check if your character is in Ronin/Hardcore. If so, ask for confirmation to
 * proceed.
 * @return Whether Philter should be executed now
 */
function canInteractCheck(): boolean {
  if (canInteract()) return true;

  const action = getvar('BaleOCD_RunIfRoninOrHC');
  if (action === 'never') return false;
  if (action === 'always') return true;
  return userConfirm(
    'You are in Ronin/Hardcore. Do you want to run OCD Cleanup anyway?'
  );
}

// TODO: Parse CLI arguments, merge them with ZLib configs, and make the rest of
// the app use the merged config instead of accessing settings directly.
export function main(): void {
  setDefaultConfig();
  checkProjectUpdates();

  if (canInteractCheck()) {
    const todaysFarming = philter(Object.freeze(loadCleanupConfig()));
    if (todaysFarming < 0) {
      logger.error(
        'OCD Control was unable to obssessively control your entire inventory.'
      );
    } else if (todaysFarming === 0)
      logger.warn(
        'Nothing to do. I foresee no additional meat in your future.'
      );
    else {
      logger.success(
        `Anticipated monetary gain from inventory cleansing: ${rnum(
          todaysFarming
        )} meat.`
      );
    }
  } else {
    logger.error("Whoa! Don't run this until you break the prism!");
  }
}
