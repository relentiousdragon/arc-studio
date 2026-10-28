import studioPackage from '../../package.json';
import { NODE_SCHEMA_VERSION } from '../../../studio-server/src/engine/DynamicNodePins.js';
import { CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION, SUPPORTED_NODE_REGISTRY_FEATURES } from '../../../studio-server/src/engine/NodeRegistryContract.js';
//
function normalizePlatform(value) {
  const platform = String(value || '').toLowerCase();
  if (/mac|darwin/.test(platform)) return 'macOS';
  if (/win/.test(platform)) return 'Windows';
  if (/linux/.test(platform)) return 'Linux';
  return '';
}

function normalizeArchitecture(value) {
  const architecture = String(value || '').toLowerCase();
  if (['arm64', 'aarch64'].includes(architecture)) return 'arm64';
  if (['arm', 'arm32'].includes(architecture)) return 'arm';
  if (['x86_64', 'x86-64', 'x64'].includes(architecture)) return 'x64';
  if (['x86', 'i386', 'i486', 'i586', 'i686'].includes(architecture)) return 'x86';
  return '';
}

export async function getClientBuildInfo() {
  const fallback = {
    version: studioPackage.version,
    product: 'arc-studio',
    protocolVersion: CLIENT_PROTOCOL_VERSION,
    nodeSchemaVersion: NODE_SCHEMA_VERSION,
    nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
    nodeRegistryFeatures: SUPPORTED_NODE_REGISTRY_FEATURES,
    platform: normalizePlatform(navigator.userAgentData?.platform || navigator.platform),
    architecture: ''
  };
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke === 'function') {
    try {
      const desktopInfo = await invoke('get_client_build_info');
      if (desktopInfo && typeof desktopInfo === 'object') {
        return {
          version: String(desktopInfo.version || fallback.version),
          product: fallback.product,
          protocolVersion: fallback.protocolVersion,
          nodeSchemaVersion: fallback.nodeSchemaVersion,
          nodeRegistryProtocolVersion: fallback.nodeRegistryProtocolVersion,
          nodeRegistryFeatures: fallback.nodeRegistryFeatures,
          platform: normalizePlatform(desktopInfo.platform) || fallback.platform,
          architecture: normalizeArchitecture(desktopInfo.architecture)
        };
      }
    } catch {}
  }
  if (typeof navigator.userAgentData?.getHighEntropyValues === 'function') {
    try {
      const values = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']);
      fallback.architecture = normalizeArchitecture(values.architecture);
      if (fallback.architecture === 'x86' && values.bitness === '64') fallback.architecture = 'x64';
    } catch {}
  }
  return fallback;
}
