export function inspectWebServerResponsePaths(graph, definitions = graph?.definitions) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const execEdges = connections.filter((wire) => wire.targetPinId === 'exec' && nodeById.has(wire.sourceNodeId) && nodeById.has(wire.targetNodeId));
  const execTargets = new Map();
  for (const wire of execEdges) {
    const outgoing = execTargets.get(wire.sourceNodeId) || [];
    outgoing.push({ nodeId: wire.targetNodeId, pinId: wire.sourcePinId });
    execTargets.set(wire.sourceNodeId, outgoing);
  }
  const walk = (startIds, stopAtJoin = false) => {
    const visited = new Set();
    const pending = [...startIds];
    while (pending.length && visited.size < 10000) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      if (stopAtJoin && nodeById.get(id)?.type === 'parallel_join') continue;
      for (const edge of execTargets.get(id) || []) pending.push(edge.nodeId);
    }
    return visited;
  };
  const requestNodes = nodes.filter((node) => node.type === 'event_web_server_request');
  const responseNodes = nodes.filter((node) => node.type === 'action_web_server_response');
  const findings = [];

  for (const requestNode of requestNodes) {
    const reachable = walk([requestNode.id]);
    const relevantResponses = responseNodes.filter((response) => reachable.has(response.id)
      && connections.some((wire) => wire.targetNodeId === response.id && wire.targetPinId === 'request_id'
        && wire.sourceNodeId === requestNode.id && wire.sourcePinId === 'request_id'));
    const routeLabel = `${String(requestNode.data?.method || 'GET').toUpperCase()} ${requestNode.data?.path || '/'}`;
    if (!relevantResponses.length) {
      findings.push({ kind: 'missing', nodeId: requestNode.id, message: `On Web Request ${routeLabel}: no reachable Respond to Web Request node uses this request ID.` });
      continue;
    }

    const responseIds = new Set(relevantResponses.map((node) => node.id));
    for (const branch of nodes.filter((node) => reachable.has(node.id) && ['branch_if', 'branch_switch'].includes(node.type))) {
      const branchPins = (execTargets.get(branch.id) || []).map((edge) => edge.pinId);
      const definedPins = (definitions?.get?.(branch.type)?.outputs || []).filter((pin) => pin.type === 'exec').map((pin) => pin.id);
      const pinIds = [...new Set([...definedPins, ...branchPins])];
      for (const pinId of pinIds) {
        const targets = (execTargets.get(branch.id) || []).filter((edge) => edge.pinId === pinId).map((edge) => edge.nodeId);
        const branchReachable = targets.length ? walk(targets) : new Set();
        if (![...responseIds].some((id) => branchReachable.has(id))) {
          const label = branch.type === 'branch_if' ? pinId === 'true_exec' ? 'True' : 'False' : pinId.replace(/_exec$/, '').replaceAll('_', ' ');
          findings.push({ kind: 'missing-branch', nodeId: branch.id, message: `On Web Request ${routeLabel}: ${label} branch may finish without responding.` });
        }
      }
    }

    for (const response of relevantResponses) {
      const downstream = walk((execTargets.get(response.id) || []).map((edge) => edge.nodeId));
      const duplicate = relevantResponses.find((candidate) => candidate.id !== response.id && downstream.has(candidate.id));
      if (duplicate) {
        findings.push({ kind: 'multiple', nodeId: duplicate.id, message: `On Web Request ${routeLabel}: more than one Respond to Web Request node can run on one execution path.` });
      }
    }

    for (const parallel of nodes.filter((node) => reachable.has(node.id) && node.type === 'parallel')) {
      const branches = new Set((execTargets.get(parallel.id) || []).map((edge) => edge.pinId));
      const branchResponseSets = [...branches].map((pinId) => {
        const starts = (execTargets.get(parallel.id) || []).filter((edge) => edge.pinId === pinId).map((edge) => edge.nodeId);
        const branchReachable = walk(starts, true);
        return new Set([...responseIds].filter((id) => branchReachable.has(id)));
      }).filter((set) => set.size);
      if (branchResponseSets.length > 1) {
        findings.push({ kind: 'parallel-multiple', nodeId: parallel.id, message: `On Web Request ${routeLabel}: multiple parallel branches can each send a response.` });
      }
    }
  }

  return findings;
}