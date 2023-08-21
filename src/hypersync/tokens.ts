import {
  DataObject,
  DataValue,
  HypersyncCriteria,
  HypersyncCriteriaValue
} from '@hyperproof/hypersync-models';

/**
 * Context object that is used when resolving placeholder tokens in a string.
 */
export type TokenContext = {
  [key: string]:
    | DataValue
    | DataObject
    | DataObject[]
    | HypersyncCriteria
    | TokenContext;
};

/**
 * Replaces tokens in a string value by looking up the token value
 * in a provided context object.  Tokens are of the form:
 *   {foo.bar.prop}
 *
 * @param value Tokenized string.
 * @param context Dictionary of values to use in place of tokens.
 * @param suppressErrors Whether or not to supress errors when they are detected.
 */
export const resolveTokens = (
  value: string,
  context: TokenContext,
  suppressErrors = false
) => {
  let output = value;
  const regEx = /\{\{.*?\}\}/g;
  let tokens = output.match(regEx);
  let foundError = false;
  while (tokens && !foundError) {
    for (const token of tokens) {
      const variable = token.substring(2, token.length - 2).trim();
      if (!variable || variable.length === 0) {
        throw new Error(`Invalid token: ${token}`);
      }

      const parts = variable.split('.');
      let value:
        | DataValue
        | DataObject
        | DataObject[]
        | HypersyncCriteria
        | HypersyncCriteriaValue
        | TokenContext;

      // Special handling for `env.` references.
      if (parts.length === 2 && parts[0] === 'env') {
        value = process.env[parts[1]];
        if (!value) {
          foundError = true;
        }
      } else {
        // For all other tokens, we have to iterate through the parts of
        // the token to find the value we are after.
        value = context;
        while (parts.length) {
          const part = parts.shift();
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            value instanceof Date ||
            value instanceof BigInt
          ) {
            foundError = true;
            break;
          }
          value = value[part!];
          if (!value && parts.length) {
            foundError = true;
            break;
          }
        }
      }

      // If the token resolved to an object reference, it is considered
      // invalid.  We cannot insert an object into the target.
      if (!foundError && typeof value === 'object') {
        foundError = true;
      }

      // If we ran into an error processing the token and suppressErrors
      // is true, just leave the token as-is and move on.  Otherwise throw.
      if (foundError) {
        if (suppressErrors) {
          continue;
        } else {
          throw new Error(`Invalid token: ${token}`);
        }
      }

      output = output.replace(token, (value ?? '').toString());
    }

    // Resolving tokens may have introduced more tokens.
    tokens = output.match(regEx);
  }

  return output;
};
