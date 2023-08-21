import { decode } from 'html-entities';
import xss, { FilterXSS } from 'xss';

const filterRegex = (value: string, regex: RegExp) => {
  let result = '';
  let match = regex.exec(value);
  while (match) {
    // append text up to the matched text
    result += value.substr(0, match.index);
    // update the text we are processing
    value = value.substr(match.index + match[0].length);
    // check for further matches
    match = regex.exec(value);
  }
  // append remaining text
  result += value;
  return result;
};

/**
 * strictFilter is the default xss filter that
 *
 * - escapes suspicious HTML characters
 * - strips out suspicious tags
 *
 * It is applied if inputFilter detects a potential issue or when displaying
 * content that bypasses React's rendering (e.g.: through the use of
 * `dangerouslySetInnerHTML`)
 */
const strictFilter = new FilterXSS();

/**
 * inputFilter is similar to strict filter but does not escape HTML.
 *
 * It is used to detect potential issues with data coming in through our API and
 * to filter some markdown content rendered by the client
 * (See: MarkdownRegion.tsx).
 *
 * If inputFilter detects (modifies) the content that is coming in through the
 * API, we then apply the strict filter.
 *
 * The reason for this is strictFilters' escaping of HTML characters interferes
 * with React's rendering of user supplied strings so we only apply strictFilter
 * if something appears suspect.
 */
const inputFilter = new FilterXSS({
  whiteList: {},
  escapeHtml: html => html,
  stripIgnoreTag: true
});

/**
 * Strips any markdown formatted links from a string.
 *
 * This addresses an issue where a markdown link could be used to inject XSS
 * as the markdown link is not caught by the XSS filter and only becomes a
 * problem when it is rendered by the markdown processor in our web client.
 *
 * Only intended for use by Sanitize.input() to filter API request payloads.
 */
const filterMarkdown = (input: string) => {
  if (input.length === 0) {
    return input;
  }

  const result = filterRegex(input, Sanitize.markdownLinkRegEx);

  // if result is an empty string, return a non-breaking space (this prevents
  // the backend from throwing an error due to empty content)
  return result.length === 0 ? '\xa0' : result;
};

/**
 * This is a utitlity class that provides methods to sanitize input, preventing
 * XSS attacks.
 *
 * It uses `xss` (https://github.com/leizongmin/js-xss) to filter strings.
 * (See also: https://github.com/leizongmin/js-xss/issues/60)
 *
 * Other libraries considered were:
 *
 * - sanitize-html: Worked well but introduced escaped characters that render
 *   poorly in React. No workaround for this short of modifying their code.
 *   See: https://github.com/apostrophecms/sanitize-html/issues/246
 * - xss-filters: A Yahoo project. Looked promising but the repo has been
 *   archived and the last commit was in 2016
 */
export class Sanitize {
  static disallowedTagsRegEx = /<(iframe|img|script|a)\b/i;
  static markdownLinkRegEx = /(\[[^[]+\])(\(.*?\))/m;

  /**
   * Tests whether or not input string is suspect and in need of further
   * filtering
   */
  static isSuspect(input: string) {
    const filtered = inputFilter.process(input);

    return filtered !== input || Sanitize.disallowedTagsRegEx.test(input);
  }

  /**
   * Performs a shallow sanitization of the input item.
   *
   * - if item is an array it will iterate over the array to sanitize it
   * - if item is a string it returns a sanitized string
   * - if item is an object it inspects the object's properties and sanitizes
   *   string values
   *
   * Note that it does not sanitize any nested objects
   */
  static input(
    item: any[] | { [key: string]: any } | string | null
  ): any[] | { [key: string]: any } | string | null {
    if (!item) {
      return item;
    }

    if (typeof item === 'object') {
      if (Array.isArray(item)) {
        return item.map(i => Sanitize.input(i));
      }

      const obj = item as { [key: string]: any };
      Object.entries(obj).forEach(([key, value]) => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (typeof value === 'string') {
            obj[key] = Sanitize.input(value);
          }
        }
      });
    } else if (typeof item === 'string') {
      // we always filter markdown links
      item = decode(item);
      item = filterMarkdown(
        Sanitize.isSuspect(item)
          ? strictFilter.process(item) // input looks suspect... apply more draconian measures
          : item
      );
    }

    return item;
  }

  /**
   * Sanitizes an output string for display in React where
   * `dangerouslySetInnerHTML` may be used
   */
  static dangerousOutput(output: string) {
    return strictFilter.process(output);
  }

  /**
   * Sanitizes markdown output. As markdown uses characters such as '>' for
   * formatting, we use our inputFilter which does not escape characters.
   */
  static markdown(markdown: string) {
    return inputFilter.process(markdown);
  }

  static stripHtml(html: string) {
    return xss(html, {
      whiteList: {}, // empty, means filter out all tags
      stripIgnoreTag: true, // filter out all HTML not in the whitelist
      stripIgnoreTagBody: ['script'] // the script tag is a special case, we need
      // to filter out its content
    });
  }
}
