const TEXT_FIELD_KEYS = new Set([
  'alt', 'author', 'body', 'choices', 'content', 'customid', 'custom_id', 'defaultvalue', 'description',
  'endpoint', 'expression', 'filename', 'footer', 'headers', 'initialvalue', 'label', 'message',
  'name', 'payload', 'placeholder', 'prefix', 'query', 'regex', 'replace', 'secretvalue', 'status', 'suffix',
  'separator', 'template', 'text', 'title', 'topic', 'url', 'user_agent', 'value'
]);
//
function containsTextField(value, key = '', inheritedTextField = false) {
  const normalizedKey = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const isTextField = inheritedTextField
    || TEXT_FIELD_KEYS.has(normalizedKey)
    || /(?:^|_)(?:text|name|url|value|content|description|label|body|template|message|status)$/.test(normalizedKey)
    || /^(?:case|arg|argument|option)_?\d+$/.test(normalizedKey);
  if (typeof value === 'string') {
    const text = value.trim();
    if (!isTextField || !text) return false;
    if (normalizedKey === 'headers') {
      try { return containsTextField(JSON.parse(text), key, true); } catch {}
    }
    return true;
  }
  if (Array.isArray(value)) return value.some((entry) => containsTextField(entry, key, isTextField));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([childKey, childValue]) => containsTextField(childValue, childKey, isTextField));
}

function graphContainsTextFields(graph) {
  if (!graph || typeof graph !== 'object') return false;
  if ((Array.isArray(graph.nodes) ? graph.nodes : []).some((node) => containsTextField(node?.data))) return true;
  if ((Array.isArray(graph.variables) ? graph.variables : []).some((variable) => containsTextField(variable?.initialValue, 'initialValue') || containsTextField(variable?.secretValue, 'secretValue'))) return true;
  return (Array.isArray(graph.notes) ? graph.notes : []).some((note) => containsTextField(note?.text, 'text'));
}

function findGraphTextFields(value) {
  if (Array.isArray(value)) return value.some(findGraphTextFields);
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.nodes) && Array.isArray(value.connections)) return graphContainsTextFields(value);
  return Object.values(value).some(findGraphTextFields);
}

export function hasImportableTextContent(value) {
  if (!value || typeof value !== 'object') return false;
  if (findGraphTextFields(value.graph || value)) return true;

  const files = value.files && typeof value.files === 'object' ? value.files : {};
  if (findGraphTextFields(files['graphs.json']) || findGraphTextFields(files['graph-library.json'])) return true;
  const embeds = Array.isArray(files['embeds.json']) ? files['embeds.json'] : [];
  if (embeds.some((embed) => containsTextField(embed?.blocks) || containsTextField(embed?.components) || containsTextField(embed?.componentsV2Layout))) return true;
  const variables = Array.isArray(files['project-variables.json']) ? files['project-variables.json'] : [];
  if (variables.some((variable) => containsTextField(variable?.initialValue, 'initialValue') || containsTextField(variable?.secretValue, 'secretValue'))) return true;
  return false;
}
