import { evaluateTemplateExpression, getTemplateReferences, splitTemplatePipeline } from '../../../studio-server/src/engine/TemplateExpressions.js';
//
export function replaceNullTemplateValues(template, resolveSlot, hasSlot = () => false) {
  return String(template ?? '').replace(/(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g, (match, escaped, _token, source) => {
    if (escaped) return match;
    const parts = splitTemplatePipeline(source);
    if (parts.some((part) => /^default\s*\(/i.test(part))) return match;
    const base = parts[0] || '';
    let resolved;
    try {
      resolved = evaluateTemplateExpression(base, resolveSlot);
    } catch {
      return match;
    }
    if (resolved?.found) return resolved.value == null ? 'UNDEFINED' : match;
    return getTemplateReferences(base).some((name) => hasSlot(name)) ? 'UNDEFINED' : match;
  });
}
