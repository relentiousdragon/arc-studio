import React from 'react';
import { AlertCircle, CheckCircle2, CircleAlert } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
//
function GraphCheckIndicator() {
  return <span className="graph-check-indicator" aria-hidden="true" />;
}

export function GraphValidationModal({ isOpen, onClose, graphName, result, onTraceIssue }) {
  if (!result) return null;
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const status = errors.length ? 'error' : warnings.length ? 'warning' : 'success';
  const issueLabel = errors.length
    ? `${errors.length} blocking issue${errors.length === 1 ? '' : 's'}${warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}`
    : warnings.length
      ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
      : 'No issues';
  const reportedItems = Array.isArray(result.issueItems) ? result.issueItems : [];
  const items = [
    ...reportedItems,
    ...errors.map((message) => ({ message, kind: 'error', nodeId: result.errorNodeIds?.[message] })),
    ...warnings.map((message) => ({ message, kind: 'warning', nodeId: result.warningNodeIds?.[message] }))
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.kind === item.kind && candidate.message === item.message) === index);
  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Graph checks"
    subtitle={graphName || 'Untitled graph'}
    icon={GraphCheckIndicator}
    iconClassName={`graph-check-indicator-wrap is-${status}`}
    headerMeta={<span className={`graph-check-count is-${status}`} role="status">{issueLabel}</span>}
    maxWidth="lg"
    footer={<button className="studio-button" onClick={onClose}>Done</button>}
  >
    <div className="validation-list">
      {items.map((item, index) => {
        const content = <>{item.kind === 'error' ? <AlertCircle size={14} /> : <CircleAlert size={14} />}<span>{item.message}</span></>;
        const graphId = item.graphId || result.graphId;
        return item.nodeId && graphId
          ? <button key={`${item.kind}-${index}`} type="button" className={`validation-item is-${item.kind} is-clickable`} title="Open graph and highlight node" onClick={() => { onClose?.(); onTraceIssue?.(graphId, item.nodeId); }}>{content}</button>
          : <div key={`${item.kind}-${index}`} className={`validation-item is-${item.kind}`}>{content}</div>;
      })}
      {!errors.length && !warnings.length && <div className="validation-empty"><CheckCircle2 size={16} /> Ready to run</div>}
    </div>
  </Modal>;
}
