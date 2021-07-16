import {
  ErrorResponseBase,
  RELAY_HTML_PATH,
  unwrapDeserializedRequest,
} from '@philter/common';
import {
  checkProjectUpdates,
  logger,
  setDefaultConfig,
} from '@philter/common/kol';
import {formFields, gametimeToInt, myName, write} from 'kolmafia';
import {routes} from './routes';
import {createRouter} from './typed-router';
import {formatDateClf} from './util';

/**
 * Sends a response to the client. If the value is not a string, it is
 * serialized using `JSON.stringify()`.
 *
 * This is a thin wrapper around `write()`.
 * The generic type argument can be used to type-check the value being passed.
 */
function send<T>(value: T): void {
  // JSON.stringify() can return undefined if the input is undefined.
  // TypeScript currently doesn't check this, so we must do so manually.
  if (value === undefined) {
    throw new TypeError('Cannot send undefined');
  }
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  write(str);
}

/**
 * Parses the URL and form submission parameters in the current request.
 *
 * - The `relay=true` parameter is stripped.
 * - All other parameters are parsed as JSON, except for `path` and `method`.
 * @return Object that contains the deserialized parameters.
 *    If there are no parameters (i.e. the request is from a direct link),
 *    returns `null` instead.
 */
function parseRequestParameters() {
  const {relay, ...rest} = formFields();

  if (relay !== 'true') {
    throw new Error(
      "Missing expected 'relay' parameter. Has KoLmafia's relay script protocol changed?"
    );
  }

  if (Object.keys(rest).length === 0) return null;
  return unwrapDeserializedRequest(rest);
}

/**
 * Generate a HTML page that immediately redirects the client to the URL.
 * This is needed because we can't respond with HTTP redirect codes.
 */
function generateRedirectPage(url: string) {
  return (
    '<!DOCTYPE html>' +
    '<html>' +
    `<head><meta http-equiv="refresh" content="0;url=${url}"></head>` +
    `<body>If your browser does not redirect you immediately, <a href="${url}">click here</a></body>` +
    '</html>'
  );
}

export function main() {
  // TODO: Add require() to kolmafia-types if possible
  // @ts-expect-error No require()
  const __filename: string = require.main.id;
  const safeScriptPath = __filename.replace(/(.*?)(?=\/relay\/)/i, '');

  logger.debug(`Started ${safeScriptPath}...`);
  const startTime = gametimeToInt();

  setDefaultConfig();
  checkProjectUpdates();

  let requestParameters;

  try {
    const router = createRouter(routes);

    requestParameters = parseRequestParameters();
    if (requestParameters === null) {
      // If there are no URL parameters, this is probably a request made by a
      // user navigating to our app.
      // We send the HTML skeleton of the Philter Manager.
      send(generateRedirectPage(RELAY_HTML_PATH));
    } else {
      send(
        router.resolve({
          pathname: requestParameters.path,
          content: requestParameters,
        })
      );
    }
  } catch (e) {
    send<ErrorResponseBase>({error: {code: 500, message: String(e)}});
    // Interestingly, KoLmafia will still return a response if the script aborts
    // or throws after calling send(). Unfortunately, the stack trace is all but
    // lost at this point, so there's little point in re-throwing the exception.
    logger.error(
      `[${safeScriptPath}] ${e instanceof Error ? e : '[ERROR] ' + e}`
    );
  }

  const endTime = gametimeToInt();

  const clfDate = formatDateClf(new Date());
  const name = myName() || '-';
  let extraComment;
  if (requestParameters) {
    const {method, path} = requestParameters || {};
    extraComment = `simulated method: ${method}, path: ${path}`;
  } else {
    extraComment = 'home page requested';
  }
  logger.debug(
    `${name} [${clfDate}] "${safeScriptPath} HTTP" (${extraComment})`
  );

  logger.debug(`Took ${endTime - startTime}ms to generate response`);
}
