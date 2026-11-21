export function regexRiskWarning(pattern) {
  const source = String(pattern ?? '');
  if (/\([^)]*(?:[*+]|\{\d+,?\d*\})[^)]*\)(?:[*+]|\{\d+,?\d*\})/.test(source)) {
    return 'This pattern nests repetitions, which can cause heavy backtracking on some inputs. Matching stops after 1,000 ms.';
  }
  const broadWildcards = source.match(/\.\*|\.\+|\[\\s\\S\][*+]|\[\^\][*+]/g) || [];
  if (broadWildcards.length > 1) {
    return 'This pattern has multiple wildcard repetitions, which can cause heavy backtracking on long inputs. Matching stops after 1,000 ms.';
  }
  return '';
}

export function validateRegexConfiguration(pattern, rawFlags = '') {
  const source = String(pattern ?? '');
  const raw = String(rawFlags ?? '');
  const flags = raw.replace(/[\s,]/g, '');
  if (source.length > 4096) return 'Regex pattern is limited to 4,096 characters.';
  if (raw.length > 48 || flags.length > 8 || !/^[dgimsuvy]*$/.test(flags)) return 'Use supported JavaScript regex flags: d, g, i, m, s, u, v, y.';
  if (new Set(flags).size !== flags.length) return 'Each regex flag can only be used once.';
  if (flags.includes('u') && flags.includes('v')) return 'The u and v regex flags cannot be used together.';
  try { new RegExp(source, flags); }
  catch (error) { return error?.message || 'Invalid regular expression.'; }
  return '';
}
