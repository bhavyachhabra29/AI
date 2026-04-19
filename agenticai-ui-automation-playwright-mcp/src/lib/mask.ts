/**
 * Masks sensitive values (passwords, secrets, tokens, keys) in text
 * before it is sent to the client or written to result files.
 */

const SENSITIVE_KEYWORDS =
  /password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|ssn|credit.?card/i;

const SENSITIVE_SELECTORS =
  /type\s*=\s*["']?password["']?|#password|\.password|name\s*=\s*["']?passw/i;

const QUOTED_VALUE = /("[^"]*"|'[^']*')/g;

/**
 * Replaces quoted values that follow a sensitive keyword with "****".
 * e.g. `Filled "password" with "hunter2"` → `Filled "password" with "****"`
 */
export function maskSensitive(text: string): string {
  if (!text) return text;

  // Pattern: (sensitive keyword) ... "value"  →  mask the last quoted value
  // Match lines like: Filled "password" with "actualSecret"
  const fillPattern =
    /\b(fill(?:ed)?|type(?:d)?|enter(?:ed)?|input|set)\b.*?\b(password|passwd|pwd|secret|token|api[_-]?key|credential)\b.*?("[^"]*"|'[^']*')\s*$/gi;

  let result = text.replace(fillPattern, (match, _verb, _field, _quoted) => {
    // Mask the last quoted value in the match
    const lastQuoteIdx = match.lastIndexOf('"');
    const secondLastQuoteIdx = match.lastIndexOf('"', lastQuoteIdx - 1);
    if (secondLastQuoteIdx >= 0) {
      return match.substring(0, secondLastQuoteIdx) + '"****"';
    }
    return match;
  });

  // Pattern: Filled "selector-with-password-hint" with "value"
  // Catches selectors like input[type=password], #password, .pwd-field, etc.
  result = result.replace(
    /\b(fill(?:ed)?|type(?:d)?|enter(?:ed)?|input|set)\b\s+["']([^"']*?)["']\s+with\s+["']([^"']*?)["']/gi,
    (match, verb, selector, value) => {
      if (SENSITIVE_KEYWORDS.test(selector) || SENSITIVE_SELECTORS.test(selector)) {
        return `${verb} "${selector}" with "****"`;
      }
      return match;
    }
  );

  // Generic pattern: "password" with "value" or password: "value"
  result = result.replace(
    /(password|passwd|pwd|secret|token|api[_-]?key|credential)\s*[:=]?\s*["']([^"']+)["']/gi,
    (_match, keyword, _value) => `${keyword}: "****"`
  );

  // Mask values passed alongside sensitive keywords in other formats
  // e.g., value="secret123" when preceded by password context
  result = result.replace(
    /with\s+["']([^"']+)["']/gi,
    (match, value, offset) => {
      // Only mask if the broader context mentions a sensitive keyword or selector
      const preceding = result.substring(0, offset);
      if (SENSITIVE_KEYWORDS.test(preceding) || SENSITIVE_SELECTORS.test(preceding)) {
        return 'with "****"';
      }
      return match;
    }
  );

  return result;
}
