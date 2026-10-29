const UUID_PATTERN = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
//
export function normalizeProjectRouteId(value) {
  const id = String(value || '');
  if (id.startsWith('project_')) return id;
  return UUID_PATTERN.test(id) ? `project_${id.toLowerCase()}` : id;
}

export function normalizeGraphRouteId(value) {
  const id = String(value || '');
  if (id.startsWith('graph_')) return id;
  if (UUID_PATTERN.test(id)) return `graph_${id.toLowerCase()}`;
  const imported = id.match(/^import_([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i);
  return imported ? `graph_import_${imported[1].toLowerCase()}` : id;
}
