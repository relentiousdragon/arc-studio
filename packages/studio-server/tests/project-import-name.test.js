import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStore } from '../src/storage/ProjectStore.js';
//
function storeWithProjects(names) {
  const store = Object.create(ProjectStore.prototype);
  store.projects = names.map((name, index) => ({ id: `project-${index}`, name }));
  return store;
}

test('project import reports a free suggested name when the imported name already exists', () => {
  const store = storeWithProjects(['Waterfall', 'Waterfall (2)']);

  assert.throws(
    () => store.resolveImportProjectName({ project: { name: 'Waterfall' } }),
    (error) => error.code === 'PROJECT_NAME_CONFLICT'
      && error.projectName === 'Waterfall'
      && error.suggestedName === 'Waterfall (3)'
  );
});

test('project import accepts a chosen unique name and compares names case insensitively', () => {
  const store = storeWithProjects(['Waterfall']);

  assert.equal(store.resolveImportProjectName({ project: { name: 'Waterfall' } }, 'Archive copy'), 'Archive copy');
  assert.throws(
    () => store.resolveImportProjectName({ project: { name: 'Waterfall' } }, '  waterfall  '),
    (error) => error.code === 'PROJECT_NAME_CONFLICT' && error.suggestedName === 'waterfall (2)'
  );
});

test('project import suggestions fit the project name limit', () => {
  const longName = 'x'.repeat(64);
  const store = storeWithProjects([longName]);
  const suggestedName = store.suggestAvailableProjectName(longName);

  assert.equal(suggestedName.length, 64);
  assert.notEqual(suggestedName, longName);
});

test('renaming a project changes only its name and persists the registry', () => {
  const project = { id: 'project-one', name: 'Original', createdAt: '2026-01-01T00:00:00.000Z' };
  const store = storeWithProjects([project.name]);
  store.projects[0] = project;
  let persistCount = 0;
  store.persist = () => { persistCount += 1; };

  const renamed = store.renameProject(project.id, '  New name  ');

  assert.deepEqual(renamed, { ...project, name: 'New name' });
  assert.deepEqual(project, { ...renamed });
  assert.equal(persistCount, 1);
});

test('renaming rejects duplicate names without mutating either project', () => {
  const store = storeWithProjects(['First', 'Second']);

  assert.throws(
    () => store.renameProject('project-0', ' second '),
    (error) => error.code === 'PROJECT_NAME_CONFLICT'
  );
  assert.deepEqual(store.projects.map((project) => project.name), ['First', 'Second']);
});

test('renaming rolls back the in memory name when registry persistence fails', () => {
  const store = storeWithProjects(['Original']);
  store.persist = () => { throw new Error('disk failure'); };

  assert.throws(() => store.renameProject('project-0', 'Changed'), /disk failure/);
  assert.equal(store.projects[0].name, 'Original');
});
