import { DataObject, DataValue, HypersyncCriteria } from './models';

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
 * @param {*} value Tokenized string.
 * @param {*} context Dictionary of values to use in place of tokens.
 */
export const resolveTokens = (value: string, context: TokenContext) => {
  let output = value;
  const regEx = /\{\{.*?\}\}/g;
  let tokens = output.match(regEx);
  while (tokens) {
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
        | TokenContext;

      if (parts.length === 2 && parts[0] === 'env') {
        value = process.env[parts[1]];
        if (!value) {
          throw new Error(`Unable to resolve token: ${token}`);
        }
      } else {
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
            throw new Error(`Invalid token: ${token}`);
          }
          value = value[part!];
          if (!value && parts.length) {
            throw new Error(`Unable to resolve token: ${token}`);
          }
        }
      }
      if (typeof value === 'object') {
        throw new Error(`Invalid token: ${token}`);
      }
      output = output.replace(token, (value ?? '').toString());
    }

    // Resolving tokens may have introduced more tokens.
    tokens = output.match(regEx);
  }

  return output;
};
