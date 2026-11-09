import { isArcArchive, readArcArchive } from '../../../studio-server/src/storage/ArcArchive.js';
import { hasImportableTextContent } from '../../../studio-server/src/storage/ImportContentReview.js';
//
self.addEventListener('message', async (event) => {
  try {
    const bytes = new Uint8Array(event.data?.buffer);
    if (!isArcArchive(bytes)) throw new TypeError('Upload a supported ARC project file.');
    const project = await readArcArchive(bytes, 'arc-project');
    self.postMessage({
      success: true,
      encrypted: project?.format === 'arc-project-encrypted',
      hasImportableTextContent: project?.format === 'arc-project-encrypted' ? false : hasImportableTextContent(project)
    });
  } catch (error) {
    self.postMessage({ success: false, error: error?.message || 'Could not verify this project file.' });
  }
});
