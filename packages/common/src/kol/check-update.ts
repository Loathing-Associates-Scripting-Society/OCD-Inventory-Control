import {
  cliExecute,
  getProperty,
  setProperty,
  svnAtHead,
  svnExists,
} from 'kolmafia';
import * as logger from './logger.js';

export function checkProjectUpdates(): void {
  // Check version! This will check both scripts and data files.
  // This code is at base level so that the relay script's importation will automatically cause it to be run.
  const PROJECT_NAME =
    'Loathing-Associates-Scripting-Society-philter-trunk-release';
  if (
    svnExists(PROJECT_NAME) &&
    getProperty('_svnUpdated') === 'false' &&
    getProperty('_ocdUpdated') !== 'true'
  ) {
    if (!svnAtHead(PROJECT_NAME)) {
      logger.warn(
        'Philter has become outdated. Automatically updating from SVN...'
      );
      cliExecute(`svn update ${PROJECT_NAME}`);
      logger.success("On the script's next invocation it will be up to date.");
    }
    setProperty('_ocdUpdated', 'true');
  }
}
