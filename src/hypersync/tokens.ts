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
 * Replaces tokens found in strings at all levels in a JSON object according
 * to `executeResolveTokens`. Returns a new object, leaving the original
 * unmodified.
 *
 * In the case that `value` is a string, a new string is returned with all
 * tokens replaced
 *
 * @param value A valid JSON value, potentially containing strings at arbitrary depth with tokens.
 * @param context Dictionary of values to use in place of tokens.
 * @param suppressErrors Whether or not to suppress errors when they are detected. Default false
 * @param missingDefaultValue The value to use when a token resolves to a falsy value
 */
export const resolveTokens = <T extends object | string>(
  value: T,
  context: TokenContext,
  suppressErrors = false,
  undefinedOnMissingValue = false
): T => {
  return executeResolveTokensInJsonValue(
    value,
    context,
    suppressErrors,
    undefinedOnMissingValue
  ) as T;
};

const tokenRegEx = /\{\{.*?\}\}/g;

/**
 * Replaces tokens in a string value by looking up the token value
 * in a provided context object.  Tokens are of the form:
 *   {foo.bar.prop}
 *
 * @param value Tokenized string.
 * @param context Dictionary of values to use in place of tokens.
 * @param suppressErrors Whether or not to suppress errors when they are detected.
 * @param undefinedOnMissingValue If true, set the value to undefined if the token resolves to a falsy value. Otherwise, defaults to an empty string
 */
const executeResolveTokens = (
  value: string,
  context: TokenContext,
  suppressErrors = false,
  undefinedOnMissingValue = false
): string | undefined => {
  let output: string | undefined = value;
  let tokens = output.match(tokenRegEx);
  let foundError = false;

  while (tokens && !foundError) {
    for (const token of tokens) {
      const parts = splitToken(token);
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

      // For multiselect fields, we need to join the values together.
      // HYP-47577: We should use a more flexible method of resolving multiselect field values
      if (Array.isArray(value)) {
        value = value.join(',');
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

      if (value === undefined || value === null) {
        output = undefinedOnMissingValue ? undefined : '';
      } else {
        output = output!.replace(token, value.toString());
      }
    }

    // Resolving tokens may have introduced more tokens.
    tokens = output?.match(tokenRegEx) ?? null;
  }

  return output;
};

const splitToken = (token: string): string[] => {
  const variable = token.substring(2, token.length - 2).trim();
  if (!variable || variable.length === 0) {
    throw new Error(`Invalid token: ${token}`);
  }
  const parts = variable.split('.');
  return parts;
};

const executeResolveTokensInJsonValue = (
  value: object | string,
  context: TokenContext,
  suppressErrors = false,
  undefinedOnMissingValue = false
): object | string | undefined => {
  if (typeof value === 'string') {
    return executeResolveTokens(
      value,
      context,
      suppressErrors,
      undefinedOnMissingValue
    );
  } else {
    const out = JSON.parse(JSON.stringify(value)); // deep clone the original object
    innerResolveTokensInJsonValue(
      out,
      context,
      suppressErrors,
      undefinedOnMissingValue
    );
    return out;
  }
};

const innerResolveTokensInJsonValue = (
  value: { [key: string]: any },
  context: TokenContext,
  suppressErrors = false,
  undefinedOnMissingValue = false
) => {
  if (value === null) {
    return;
  }
  for (const key in value) {
    if (typeof value[key] === 'string') {
      value[key] = executeResolveTokens(
        value[key],
        context,
        suppressErrors,
        undefinedOnMissingValue
      );
    } else if (typeof value[key] === 'object') {
      innerResolveTokensInJsonValue(
        value[key],
        context,
        suppressErrors,
        undefinedOnMissingValue
      );
    }
  }
};
