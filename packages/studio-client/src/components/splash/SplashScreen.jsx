import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, Globe2, KeyRound, Laptop2, LoaderCircle, LockKeyhole, Moon, Pencil, ShieldCheck, Sun } from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
import { apiUrl, normalizeWorkspaceUrl } from '../../core/api.js';
import { getClientBuildInfo } from '../../core/clientBuildInfo.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import studioPackage from '../../../package.json';

const desktopConfig = window.__ARC_STUDIO_CONFIG__ || {};
const SETUP_TAGLINE = 'Visualize your Discord bot.';
const getLocalUsername = () => {
  try { return localStorage.getItem('arc_local_username') || desktopConfig.localUsername || 'Admin'; }
  catch { return desktopConfig.localUsername || 'Admin'; }
};
const isUnsupportedNodeCompatibilityError = (message) => /node feature(?:s)? this desktop app does not support/i.test(String(message || ''));
const xmasSnow = (date = new Date()) => date.getMonth() === 11 && date.getDate() >= 20;
//
export function SplashScreen({
  studioVersion = studioPackage.version,
  releaseChannel = '',
  needsSetup = false,
  needsProjectOnboarding = false,
  theme = 'dark',
  onToggleTheme,
  onAuthComplete,
  workspaceMode = 'local',
  localAccountUsername = '',
  remoteWorkspaceUrl = '',
  workspaceName = '',
  workspaceCompatibilityNotice = '',
  networkOnline = true,
  workspaceError = '',
  onSelectWorkspace,
  localSessionAvailable = false,
  onBackToEditor,
  onConnectWorkspace,
  onRetryWorkspace,
  onCreateFirstProject,
  projectStarters = [],
  onLocalSetupRequired,
  canResetPrimaryAdminWithMasterKey = false
}) {
  const desktopMode = Boolean(desktopConfig.desktop);
  const buildInfo = (() => {
    const configuredChannel = releaseChannel === 'stable' || releaseChannel === 'nightly'
      ? releaseChannel
      : desktopConfig.releaseChannel === 'stable' || desktopConfig.releaseChannel === 'nightly'
        ? desktopConfig.releaseChannel
        : null;
    const channel = configuredChannel || (/-[0-9A-Za-z]/i.test(studioVersion) ? 'nightly' : 'stable');
    if (!desktopMode) return `${channel}-server`;
    const target = String(desktopConfig.target || '');
    const platform = target.includes('apple-darwin') || desktopConfig.platform === 'macos'
      ? 'macOS'
      : target.includes('windows-msvc') || desktopConfig.platform === 'windows'
        ? 'Windows'
        : target.includes('unknown-linux') || desktopConfig.platform === 'linux'
          ? 'Debian'
          : 'Desktop';
    const architecture = target.includes('universal')
      ? 'Universal'
      : /aarch64|arm64/.test(target)
        ? (platform === 'macOS' ? 'Apple silicon (ARM64)' : 'ARM64')
        : /x86_64|x64/.test(target)
          ? (platform === 'macOS' ? 'Intel (x86_64)' : 'x86_64')
          : 'Unknown architecture';
    return `${channel}-desktop · ${platform} · ${architecture}`;
  })();
  const [username, setUsername] = useState(() => desktopMode ? getLocalUsername() : '');
  const [localUsernameEditable, setLocalUsernameEditable] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverWorkspaceName, setServerWorkspaceName] = useState('');
  const [firstProjectName, setFirstProjectName] = useState('');
  const [firstProjectNameManuallyEdited, setFirstProjectNameManuallyEdited] = useState(false);
  const [firstProjectTemplate, setFirstProjectTemplate] = useState('blank');
  const [masterKey, setMasterKey] = useState('');
  const [setupStep, setSetupStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(true);
  const [keepLocalSignedIn, setKeepLocalSignedIn] = useState(() => {
    try { return !desktopConfig.desktop || localStorage.getItem('arc_local_keep_signed_in') !== 'false'; }
    catch { return true; }
  });
  const [loading, setLoading] = useState(false);
  const [sessionReplacementPending, setSessionReplacementPending] = useState(false);
  const [creatingFirstProject, setCreatingFirstProject] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [trustPrompt, setTrustPrompt] = useState(null);
  const [trustConfirmed, setTrustConfirmed] = useState(false);
  const [rememberTrustedWorkspace, setRememberTrustedWorkspace] = useState(true);
  const [trustedWorkspaces, setTrustedWorkspaces] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arc_trusted_workspaces') || '[]');
      return Array.isArray(stored) ? stored.filter((origin) => typeof origin === 'string') : [];
    } catch { return []; }
  });
  const [error, setError] = useState('');
  const [firstProjectError, setFirstProjectError] = useState('');
  const [connectError, setConnectError] = useState('');
  const [compatibilityNotice, setCompatibilityNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [recoveryMode, setRecoveryMode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [ownerResetPromptForUsername, setOwnerResetPromptForUsername] = useState('');
  const [passwordChangeSession, setPasswordChangeSession] = useState(null);
  const [workspaceChoice, setWorkspaceChoice] = useState(workspaceMode);
  const [showWorkspaceUrl, setShowWorkspaceUrl] = useState(workspaceMode !== 'remote');
  const [remoteUrl, setRemoteUrl] = useState(remoteWorkspaceUrl);
  const [lowPower, setLowPower] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const [xmas] = useState(() => xmasSnow());
  const [typedIntro, setTypedIntro] = useState(() => needsSetup ? '' : SETUP_TAGLINE);
  const fieldRefs = useRef({});
  const snowCanvasRef = useRef(null);

  const credentialOrigin = (() => { try { return normalizeWorkspaceUrl(remoteUrl); } catch { return ''; } })();
  const usernameStorageKey = credentialOrigin ? `arc_remote_username:${credentialOrigin}` : '';
  const rememberStorageKey = credentialOrigin ? `arc_remember_password:${credentialOrigin}` : '';

  useEffect(() => {
    setWorkspaceChoice(workspaceMode);
    if (desktopMode) {
      if (workspaceMode === 'local') {
        setUsername(getLocalUsername());
        setLocalUsernameEditable(false);
        try { setKeepLocalSignedIn(localStorage.getItem('arc_local_keep_signed_in') !== 'false'); } catch { setKeepLocalSignedIn(true); }
      }
      else {
        setLocalUsernameEditable(true);
      }
    }
  }, [workspaceMode, desktopMode]);
  useEffect(() => {
    if (desktopMode && workspaceMode === 'local' && localAccountUsername) {
      setUsername(localAccountUsername);
      setLocalUsernameEditable(false);
    }
  }, [desktopMode, workspaceMode, localAccountUsername]);
  useEffect(() => {
    if (!desktopMode || workspaceChoice !== 'remote' || !usernameStorageKey) return;
    try { setUsername(localStorage.getItem(usernameStorageKey) || ''); } catch { setUsername(''); }
  }, [desktopMode, workspaceChoice, usernameStorageKey]);
  useEffect(() => setRemoteUrl(remoteWorkspaceUrl), [remoteWorkspaceUrl]);
  useEffect(() => {
    if (!desktopMode || workspaceMode !== 'remote' || !credentialOrigin || needsSetup) return;
    let cancelled = false;
    setPassword('');
    let remember = true;
    try { remember = localStorage.getItem(rememberStorageKey) !== 'false'; } catch {}
    setRememberPassword(remember);
    if (!remember) return undefined;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return undefined;
    invoke('get_workspace_password', { origin: credentialOrigin })
      .then((savedPassword) => { if (!cancelled && typeof savedPassword === 'string') setPassword(savedPassword); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [desktopMode, workspaceMode, needsSetup, credentialOrigin, rememberStorageKey]);
  useEffect(() => {
    let mounted = true;
    let battery;
    let update;
    if (typeof navigator.getBattery !== 'function') return undefined;
    navigator.getBattery().then((result) => {
      if (!mounted) return;
      battery = result;
      update = () => mounted && setLowPower(!battery.charging && battery.level <= 0.15);
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      mounted = false;
      if (battery && update) {
        battery.removeEventListener('levelchange', update);
        battery.removeEventListener('chargingchange', update);
      }
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!xmas || reducedMotion) return undefined;
    const canvas = snowCanvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let stopSnow = () => {};
    import('./snow.js')
      .then(({ startSnow }) => { if (!cancelled) stopSnow = startSnow(canvas) || stopSnow; })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopSnow();
    };
  }, [xmas, reducedMotion]);
  useEffect(() => {
    const message = SETUP_TAGLINE;
    if (!needsSetup || lowPower || reducedMotion) {
      setTypedIntro(message);
      return undefined;
    }
    setTypedIntro('');
    let index = 0;
    let interval;
    const startTimer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        index += 1;
        setTypedIntro(message.slice(0, index));
        if (index >= message.length) window.clearInterval(interval);
      }, 24);
    }, 360);
    return () => {
      window.clearTimeout(startTimer);
      if (interval) window.clearInterval(interval);
    };
  }, [needsSetup, lowPower, reducedMotion]);

  const shakeFields = (fields) => {
    fields.forEach((field) => {
      const element = fieldRefs.current[field];
      if (!element) return;
      element.classList.remove('auth-field-shake');
      void element.offsetWidth;
      element.classList.add('auth-field-shake');
      window.setTimeout(() => element.classList.remove('auth-field-shake'), 360);
    });
  };

  const updateField = (field, setter) => (event) => {
    setter(event.target.value);
    setError('');
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleContinue = (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    if (!masterKey.trim()) {
      setFieldErrors({ masterKey: 'A setup key is required.' });
      shakeFields(['masterKey']);
      return;
    }
    setSetupStep(2);
  };

  const handleConnectWorkspace = async (event) => {
    event.preventDefault();
    setConnectError('');
    try {
      const url = normalizeWorkspaceUrl(remoteUrl);
      if (trustedWorkspaces.includes(url)) {
        setConnecting(true);
        try {
          const result = await onConnectWorkspace?.(url);
          setCompatibilityNotice(result?.notice || '');
          setWorkspaceChoice('remote');
          setShowWorkspaceUrl(false);
          setError('');
        } catch (connectionError) {
          const message = connectionError.message || 'Could not connect to this workspace.';
          setConnectError(message);
          if (!isUnsupportedNodeCompatibilityError(message)) shakeFields(['remoteUrl']);
        } finally { setConnecting(false); }
        return;
      }
      setTrustConfirmed(false);
      setRememberTrustedWorkspace(true);
      setTrustPrompt(url);
    } catch (connectionError) {
      const message = connectionError.message || 'Could not connect to this workspace.';
      setConnectError(message);
      if (!isUnsupportedNodeCompatibilityError(message)) shakeFields(['remoteUrl']);
    }
  };

  const confirmWorkspaceTrust = async () => {
    if (!trustPrompt || !trustConfirmed || connecting) return;
    setConnectError('');
    if (rememberTrustedWorkspace && !trustedWorkspaces.includes(trustPrompt)) {
      const nextTrusted = [...trustedWorkspaces, trustPrompt];
      setTrustedWorkspaces(nextTrusted);
      try { localStorage.setItem('arc_trusted_workspaces', JSON.stringify(nextTrusted)); } catch {}
    }
    setConnecting(true);
    try {
      const result = await onConnectWorkspace?.(trustPrompt);
      setCompatibilityNotice(result?.notice || '');
      setWorkspaceChoice('remote');
      setShowWorkspaceUrl(false);
      setError('');
      setTrustPrompt(null);
    } catch (connectionError) {
      const message = connectionError.message || 'Could not connect to this workspace.';
      setConnectError(message);
      if (!isUnsupportedNodeCompatibilityError(message)) shakeFields(['remoteUrl']);
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectLocal = () => {
    setCompatibilityNotice('');
    setWorkspaceChoice('local');
    setConnectError('');
    onSelectWorkspace?.('local');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const localDesktopSetup = desktopMode && workspaceMode === 'local' && needsSetup;
    const nextErrors = {};
    if (needsSetup && !desktopMode && !serverWorkspaceName.trim()) nextErrors.workspaceName = 'Enter a workspace name.';
    else if (needsSetup && !desktopMode && serverWorkspaceName.trim().length < 2) nextErrors.workspaceName = 'Use at least 2 characters.';
    else if (needsSetup && !desktopMode && !/^[A-Za-z0-9][A-Za-z0-9 _-]{1,34}$/.test(serverWorkspaceName.trim())) nextErrors.workspaceName = 'Use letters, numbers, spaces, hyphens, or underscores.';
    if (!username.trim()) nextErrors.username = 'Enter your username.';
    else if (username.trim().length < 2) nextErrors.username = 'Use at least 2 characters.';
    if (!password) nextErrors.password = 'Enter your password.';
    else if (password.length < 6) nextErrors.password = 'Use at least 6 characters.';
    if (needsSetup && !confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
    else if (needsSetup && password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      shakeFields(Object.keys(nextErrors));
      return;
    }
    setFieldErrors({});
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const endpoint = needsSetup ? (localDesktopSetup ? '/api/auth/desktop-setup' : '/api/auth/setup') : '/api/auth/login';
      const persistChoice = desktopMode && (workspaceMode === 'remote' ? rememberPassword : keepLocalSignedIn);
      const body = needsSetup
        ? localDesktopSetup
          ? { username: username.trim(), password, rememberMe: persistChoice }
          : { masterKey: masterKey.trim(), username: username.trim(), password, rememberMe: persistChoice, ...(!desktopMode ? { workspaceName: serverWorkspaceName.trim() } : {}) }
        : { username: username.trim(), password, rememberMe: persistChoice, clientBuild: await getClientBuildInfo() };
      let response;
      let data = {};
      let replacementRequestId = '';
      do {
        response = await fetch(apiUrl(endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, ...(replacementRequestId ? { replacementRequestId } : {}) }),
          signal: controller.signal
        });
        data = await response.json().catch(() => ({}));
        if (!data.replacementPending) break;
        replacementRequestId = data.requestId || replacementRequestId;
        setSessionReplacementPending(true);
        arcEvents.emit('toast:notify', { id: 'arc-login-session-wait', title: 'Please wait', message: 'Signing out the other session.', type: 'info', loading: true, persistent: true });
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(250, Number(data.retryAt) - Date.now() + 150)));
      } while (!controller.signal.aborted);
      arcEvents.emit('toast:notify', { id: 'arc-login-session-wait', title: '', message: '', type: 'info', duration: 1, persistent: false });
      if (!response.ok) {
        setOwnerResetPromptForUsername(!desktopMode && data.ownerPasswordIncorrect === true ? username.trim().toLowerCase() : '');
        throw new Error(data.error || (needsSetup ? 'Setup could not be completed.' : 'Invalid username or password.'));
      }
      setOwnerResetPromptForUsername('');
      if (typeof data.token !== 'string' || !data.user) throw new Error('The workspace returned an invalid sign-in response.');
      if (data.user.mustChangePassword) {
        setPasswordChangeSession({ token: data.token, user: data.user, persistSession: !(desktopMode && (workspaceMode === 'remote' ? !rememberPassword : !keepLocalSignedIn)) });
        setRecoveryPassword('');
        setRecoveryConfirmPassword('');
        setError('');
        return;
      }
      let persistSession = !(desktopMode && (workspaceMode === 'remote' ? !rememberPassword : !keepLocalSignedIn));
      if (desktopMode && workspaceMode === 'remote' && credentialOrigin) {
        try {
          if (rememberPassword) {
            const invoke = window.__TAURI_INTERNALS__?.invoke;
            if (typeof invoke !== 'function') throw new Error('System credential storage is unavailable.');
            await invoke('save_workspace_password', { origin: credentialOrigin, password });
          } else {
            await window.__TAURI_INTERNALS__?.invoke?.('delete_workspace_password', { origin: credentialOrigin });
          }
          if (usernameStorageKey) localStorage.setItem(usernameStorageKey, username.trim());
        } catch (credentialError) {
          persistSession = false;
          arcEvents.emit('toast:notify', { title: 'Password not saved', message: credentialError.message || 'The system credential store is unavailable.', type: 'warning' });
        }
      }
      if (desktopMode && workspaceMode === 'local') {
        try { localStorage.setItem('arc_local_username', username.trim()); } catch {}
      }
      await onAuthComplete(data.token, data.user, persistSession);
      arcEvents.emit('toast:notify', {
        title: needsSetup ? 'Workspace ready' : 'Welcome back',
        message: data.user?.username || '',
        type: 'success'
      });
    } catch (submitError) {
      if (desktopMode && workspaceMode === 'local' && !needsSetup) {
        try {
          const statusResponse = await fetch(apiUrl('/api/system/status'));
          const status = await statusResponse.json().catch(() => ({}));
          if (statusResponse.ok && (status.isSetupCompleted === false || (desktopMode && workspaceMode === 'local' && status.hasLocalAccount === false))) {
            setPassword('');
            setError('');
            onLocalSetupRequired?.();
            return;
          }
        } catch {}
      }
      setError(submitError.name === 'AbortError'
        ? 'The server took too long to respond. Try again.'
        : submitError instanceof TypeError
          ? 'Could not reach the workspace. Check the connection and try again.'
          : submitError.message || 'Could not reach the workspace. Check the connection and try again.');
      shakeFields(['username', 'password']);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
      setSessionReplacementPending(false);
      arcEvents.emit('toast:notify', { id: 'arc-login-session-wait', title: '', message: '', type: 'info', duration: 1, persistent: false });
    }
  };

  const handlePasswordRecovery = async (event) => {
    event.preventDefault();
    setError('');
    setRecoveryMessage('');
    if (recoveryPassword.length < 6) return setError('Use at least 6 characters.');
    if (recoveryPassword !== recoveryConfirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const localReset = desktopMode && workspaceMode === 'local';
      const endpoint = localReset ? '/api/auth/desktop-reset-password' : '/api/auth/reset-primary-admin-password';
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), ...(localReset ? {} : { masterKey: masterKey.trim() }), password: recoveryPassword, confirmPassword: recoveryConfirmPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (localReset && data.error === 'The local account could not be found.') {
          const statusResponse = await fetch(apiUrl('/api/system/status'));
          const status = await statusResponse.json().catch(() => ({}));
          if (statusResponse.ok && (status.isSetupCompleted === false || status.hasLocalAccount === false)) {
            setRecoveryMode('');
            setRecoveryPassword('');
            setRecoveryConfirmPassword('');
            setError('');
            onLocalSetupRequired?.();
            return;
          }
          throw new Error(`No local account named “${username.trim()}” was found. Check the username and try again.`);
        }
        throw new Error(data.error || 'Could not reset this password.');
      }
      setPassword(''); setRecoveryPassword(''); setRecoveryConfirmPassword(''); setMasterKey('');
      setRecoveryMode('');
      setRecoveryMessage(localReset ? 'Password reset. Sign in with your new password.' : 'Password reset. Sign in with the temporary password; you’ll choose a new one first.');
    } catch (resetError) { setError(resetError.message || 'Could not reset this password.'); }
    finally { setLoading(false); }
  };

  const handleRequiredPasswordChange = async (event) => {
    event.preventDefault();
    setError('');
    if (recoveryPassword.length < 6) return setError('Use at least 6 characters.');
    if (recoveryPassword !== recoveryConfirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': passwordChangeSession.token },
        body: JSON.stringify({ password: recoveryPassword, confirmPassword: recoveryConfirmPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not change your password.');
      const updatedUser = data.user || { ...passwordChangeSession.user, mustChangePassword: false };
      const nextToken = data.token || passwordChangeSession.token;
      if (desktopMode && workspaceMode === 'remote' && credentialOrigin) {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (rememberPassword && typeof invoke === 'function') await invoke('save_workspace_password', { origin: credentialOrigin, password: recoveryPassword }).catch(() => {});
      }
      await onAuthComplete(nextToken, updatedUser, passwordChangeSession.persistSession);
      setPasswordChangeSession(null);
    } catch (changeError) { setError(changeError.message || 'Could not change your password.'); }
    finally { setLoading(false); }
  };

  const handleCreateFirstProject = async (event) => {
    event.preventDefault();
    const name = firstProjectName.trim();
    if (!name) return setFirstProjectError('Enter a project name.');
    setCreatingFirstProject(true);
    setFirstProjectError('');
    try {
      await onCreateFirstProject?.(name, firstProjectTemplate);
    } catch (createError) {
      setFirstProjectError(createError.message || 'Could not create the project.');
    } finally {
      setCreatingFirstProject(false);
    }
  };

  const setupCredential = needsSetup && !(desktopMode && workspaceMode === 'local') && setupStep === 1;
  const resetPassParams = new URLSearchParams(window.location.search);
  const resetPassRequested = !desktopMode && (resetPassParams.get('reset_pass') === 'true' || resetPassParams.get('resetPass') === 'true');
  const showMasterPasswordReset = !desktopMode && !needsSetup && canResetPrimaryAdminWithMasterKey
    && (resetPassRequested || Boolean(ownerResetPromptForUsername && ownerResetPromptForUsername === username.trim().toLowerCase()));
  const remotePending = desktopMode && workspaceChoice === 'remote' && (showWorkspaceUrl || workspaceMode !== 'remote' || remoteUrl.trim().replace(/\/$/, '') !== remoteWorkspaceUrl.trim().replace(/\/$/, ''));
  const startupError = desktopMode && workspaceMode === 'local' ? desktopConfig.startupError : null;
  const desktopServerError = desktopMode && /\b500\b/.test(`${workspaceError} ${startupError || ''}`);
  const unsupportedNodeCompatibilityError = desktopMode && isUnsupportedNodeCompatibilityError(connectError || workspaceError);
  const activeWorkspaceName = desktopMode && workspaceMode === 'local' ? 'Local Workspace' : 'Private Workspace';

  return (
    <main className={`auth-screen ${desktopMode ? 'is-desktop' : ''}`} data-initial-setup={needsSetup ? 'true' : undefined} data-low-power={lowPower ? 'true' : undefined}>
      {xmas && !reducedMotion && <canvas ref={snowCanvasRef} className="splash-snow" aria-hidden="true" />}
      {desktopMode && <div className="auth-window-drag-region" data-tauri-drag-region="true" aria-hidden="true" />}
      <div className="auth-backdrop" aria-hidden="true"><span /><span /><span /></div>
      {needsSetup && !desktopServerError && <svg className="setup-network" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <path className="setup-network-wire setup-network-wire-a" pathLength="1" d="M -80 112 C 132 48 220 170 410 126 S 708 54 900 106 S 1244 174 1520 88" />
        <path className="setup-network-wire setup-network-wire-b" pathLength="1" d="M -80 188 C 148 116 266 252 458 204 S 762 126 966 174 S 1284 238 1520 158" />
        <path className="setup-network-wire setup-network-wire-c" pathLength="1" d="M -80 268 C 156 202 280 324 480 278 S 796 202 1000 248 S 1304 308 1520 232" />
        <path className="setup-network-wire setup-network-wire-d" pathLength="1" d="M -80 788 C 156 854 280 732 480 778 S 796 854 1000 808 S 1304 748 1520 824" />
        <path className="setup-network-wire setup-network-wire-e" pathLength="1" d="M -80 712 C 148 784 266 648 458 696 S 762 774 966 726 S 1284 662 1520 742" />
        <path className="setup-network-wire setup-network-wire-f" pathLength="1" d="M -80 632 C 132 696 220 574 410 618 S 708 690 900 638 S 1244 570 1520 656" />
      </svg>}
      {needsSetup && !desktopServerError && <div className="setup-vignette" aria-hidden="true" />}
      <button className="auth-theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      {desktopServerError ? <section className="desktop-server-error" role="alert" aria-labelledby="desktop-server-error-title">
        <div className="desktop-server-error-icon" aria-hidden="true">💩</div>
        <span className="auth-kicker">ARC STUDIO</span>
        <h1 id="desktop-server-error-title">Uh oh, we ran into a problem.</h1>
        <p>The workspace hit an internal server error.</p>
        <details><summary>Details</summary><code>{workspaceError || startupError}</code></details>
        <button className="auth-submit" type="button" onClick={onRetryWorkspace}>Try again <ArrowRight size={16} /></button>
      </section> : <div className="auth-layout">
        <section className="auth-intro" aria-label="ARC Studio">
          <div className="auth-intro-brand"><img src="/arc.png" alt="" /><span>ARC <b>STUDIO</b></span></div>
          <div className="auth-intro-copy"><h1 aria-label={SETUP_TAGLINE}><span className={`setup-typewriter ${needsSetup && !lowPower && !reducedMotion && typedIntro.length < SETUP_TAGLINE.length ? 'is-typing' : ''}`} aria-hidden="true">{typedIntro}</span></h1></div>
        </section>
        <section className="auth-card" aria-labelledby={remotePending ? undefined : 'auth-title'} aria-label={remotePending ? 'Connect to an external workspace' : undefined}>
          {!needsProjectOnboarding && desktopMode && <div className="workspace-switcher" role="tablist" aria-label="Workspace type">
            {localSessionAvailable && <button type="button" className="workspace-back-editor" onClick={onBackToEditor}><ArrowLeft size={14} /> Back to editor</button>}
            {!localSessionAvailable && <button type="button" role="tab" aria-selected={workspaceChoice === 'local'} className={workspaceChoice === 'local' ? 'is-active' : ''} onClick={handleSelectLocal}><Laptop2 size={14} /> Local</button>}
            <button type="button" role="tab" aria-selected={workspaceChoice === 'remote'} className={workspaceChoice === 'remote' ? 'is-active' : ''} disabled={!networkOnline} title={!networkOnline ? 'External workspaces are unavailable offline' : undefined} onClick={() => { setWorkspaceChoice('remote'); setShowWorkspaceUrl(true); setConnectError(''); }}><Globe2 size={14} /> Connect to workspace</button>
          </div>}
          {desktopMode && !networkOnline && <p className="workspace-offline-note" role="status">Offline. You can continue with the Local Workspace.</p>}
          {desktopMode && (compatibilityNotice || workspaceCompatibilityNotice) && <p className="workspace-compatibility-note" role="status">{compatibilityNotice || workspaceCompatibilityNotice}</p>}
          {!needsProjectOnboarding && desktopMode && workspaceChoice === 'remote' && showWorkspaceUrl && <form className="workspace-connect" noValidate onSubmit={handleConnectWorkspace}>
            <label className="field-label" htmlFor="workspace-url">Workspace URL</label>
            <div ref={(element) => { fieldRefs.current.remoteUrl = element; }} className={`auth-input-wrap ${(connectError || workspaceError) && !unsupportedNodeCompatibilityError ? 'has-error' : ''}`}><Globe2 size={15} /><input id="workspace-url" type="url" autoComplete="url" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={remoteUrl} onChange={(event) => { setRemoteUrl(event.target.value); setConnectError(''); setCompatibilityNotice(''); }} placeholder="https://studio.example.com" aria-invalid={Boolean((connectError || workspaceError) && !unsupportedNodeCompatibilityError)} /></div>
            {trustedWorkspaces.length > 0 && <div className="saved-workspaces" aria-label="Saved workspaces"><span>Saved workspaces</span>{trustedWorkspaces.map((workspace) => <button key={workspace} type="button" onClick={() => { setRemoteUrl(workspace); setConnectError(''); }}>{workspace}</button>)}</div>}
            {(connectError || workspaceError) && (unsupportedNodeCompatibilityError
              ? <div className="workspace-connect-warning" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{connectError || workspaceError}</span></div>
              : <p className="form-error" role="alert">{connectError || workspaceError}</p>)}
            <button className="workspace-connect-button" type="submit" disabled={!networkOnline || connecting || !remoteUrl.trim()}>{connecting ? <><LoaderCircle size={14} className="is-spinning" /> Connecting</> : <>Continue <ArrowRight size={14} /></>}</button>
            {workspaceMode === 'remote' && <button className="auth-back" type="button" onClick={() => { setShowWorkspaceUrl(false); setConnectError(''); setError(''); }}><ArrowLeft size={14} /> Back to sign in</button>}
          </form>}

          {!needsProjectOnboarding && desktopMode && workspaceMode === 'remote' && !showWorkspaceUrl && <button className="auth-back workspace-change-server" type="button" onClick={() => { setShowWorkspaceUrl(true); setConnectError(''); setError(''); }}>Change workspace URL</button>}

          {!remotePending && <div className="auth-heading">
            {(needsProjectOnboarding || needsSetup) && <span className="auth-kicker">{needsProjectOnboarding ? 'PROJECT SETUP' : 'INITIAL SETUP'}</span>}
            <h1 id="auth-title">{passwordChangeSession ? 'Choose a new password' : needsProjectOnboarding ? 'Create your first project' : needsSetup ? setupCredential ? 'Set up your studio' : 'Create administrator' : 'Sign in'}</h1>
            <p>{passwordChangeSession ? 'Set a new password before continuing.' : needsProjectOnboarding ? 'Give your bot project a name to get started.' : needsSetup ? setupCredential ? 'Enter your setup key to begin.' : desktopMode && workspaceMode === 'local' ? 'Create the owner account for this device.' : 'Choose the primary account credentials.' : 'Continue to your workspace.'}</p>
          </div>}

          {!needsProjectOnboarding && !remotePending && needsSetup && !setupCredential && !(desktopMode && workspaceMode === 'local') && <div className="setup-progress" aria-label={`Step ${setupStep} of 2`}><span className={setupStep >= 1 ? 'is-current' : ''} /><span className={setupStep >= 2 ? 'is-current' : ''} /></div>}

          {!needsProjectOnboarding && !remotePending && startupError && <div className="auth-startup-error" role="alert"><strong>Local workspace unavailable</strong><span>{startupError}</span></div>}
          {passwordChangeSession ? (
            <form className="auth-form" noValidate onSubmit={handleRequiredPasswordChange}>
              <label className="field-label" htmlFor="required-new-password">New password</label>
              <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="required-new-password" type="password" autoFocus autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} placeholder="At least 6 characters" /></div>
              <label className="field-label" htmlFor="required-confirm-password">Confirm password</label>
              <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="required-confirm-password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={recoveryConfirmPassword} onChange={(event) => setRecoveryConfirmPassword(event.target.value)} placeholder="Confirm password" /></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Saving password' : 'Save password'} <ArrowRight size={16} /></button>
            </form>
          ) : needsProjectOnboarding ? (
            <form className="auth-form" noValidate onSubmit={handleCreateFirstProject}>
              <label className="field-label" htmlFor="first-project-name">Project name</label>
              <div className={`auth-input-wrap ${firstProjectError ? 'has-error' : ''}`}><input id="first-project-name" autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" maxLength={64} value={firstProjectName} onChange={(event) => { setFirstProjectName(event.target.value); setFirstProjectNameManuallyEdited(true); setFirstProjectError(''); }} placeholder="e.g. Community bot" aria-invalid={Boolean(firstProjectError)} /></div>
              <span className="field-label">Choose a starting point</span>
              <div className="splash-project-templates">
                {projectStarters.map(({ id, name, description, Icon }) => <button key={id} type="button" className={`splash-project-template ${firstProjectTemplate === id ? 'is-selected' : ''}`} aria-pressed={firstProjectTemplate === id} onClick={() => { setFirstProjectTemplate(id); if (!firstProjectNameManuallyEdited) setFirstProjectName(name); }}><Icon size={16} /><span><strong>{name}</strong><small>{description}</small></span></button>)}
              </div>
              {firstProjectError && <p className="form-error" role="alert">{firstProjectError}</p>}
              <button className="auth-submit" type="submit" disabled={creatingFirstProject || !firstProjectName.trim()}>{creatingFirstProject ? <><LoaderCircle size={16} className="is-spinning" /> Creating project</> : <>{firstProjectTemplate === 'blank' ? 'Start Blank' : 'Create project'} <ArrowRight size={16} /></>}</button>
            </form>
          ) : remotePending ? null : setupCredential ? (
            <form className="auth-form" noValidate onInvalidCapture={(event) => event.preventDefault()} onSubmit={handleContinue}>
              <label className="field-label" htmlFor="setup-key">Setup key</label>
              <div ref={(element) => { fieldRefs.current.masterKey = element; }} className={`auth-input-wrap ${fieldErrors.masterKey ? 'has-error' : ''}`}><KeyRound size={16} /><input id="setup-key" autoFocus type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={masterKey} onChange={updateField('masterKey', setMasterKey)} placeholder="Enter setup key" aria-invalid={Boolean(fieldErrors.masterKey)} /></div>
              {fieldErrors.masterKey && <p className="auth-field-error" role="alert">{fieldErrors.masterKey}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit">Continue <ArrowRight size={16} /></button>
            </form>
          ) : recoveryMode ? (
            <form className="auth-form" noValidate onSubmit={handlePasswordRecovery}>
              {recoveryMode === 'master' && <><label className="field-label" htmlFor="recovery-master-key">Master key</label><div className="auth-input-wrap"><KeyRound size={16} /><input id="recovery-master-key" type="password" autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={masterKey} onChange={(event) => setMasterKey(event.target.value)} placeholder="Master key" /></div></>}
              <label className="field-label" htmlFor="recovery-new-password">New password</label>
              <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="recovery-new-password" type="password" autoFocus={recoveryMode === 'local'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} placeholder="At least 6 characters" /></div>
              <label className="field-label" htmlFor="recovery-confirm-password">Confirm password</label>
              <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="recovery-confirm-password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={recoveryConfirmPassword} onChange={(event) => setRecoveryConfirmPassword(event.target.value)} placeholder="Confirm password" /></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Resetting password' : 'Reset password'} <ArrowRight size={16} /></button>
              <button className="auth-back" type="button" onClick={() => { setRecoveryMode(''); setError(''); setRecoveryMessage(''); }}>Back to sign in</button>
            </form>
          ) : !startupError && (
            <form className="auth-form" noValidate onInvalidCapture={(event) => event.preventDefault()} onSubmit={handleSubmit}>
              {needsSetup && !desktopMode && <><label className="field-label" htmlFor="workspace-name">Workspace name</label><div ref={(element) => { fieldRefs.current.workspaceName = element; }} className={`auth-input-wrap ${fieldErrors.workspaceName ? 'has-error' : ''}`}><input id="workspace-name" autoComplete="organization" autoCapitalize="none" autoCorrect="off" spellCheck="false" maxLength={35} value={serverWorkspaceName} onChange={updateField('workspaceName', setServerWorkspaceName)} placeholder="My Workspace" aria-invalid={Boolean(fieldErrors.workspaceName)} /></div><p className={`auth-field-hint ${fieldErrors.workspaceName ? 'has-error' : ''}`} role={fieldErrors.workspaceName ? 'alert' : undefined}>{fieldErrors.workspaceName || '2–35 characters · letters, numbers, spaces, - and _'} <span>{serverWorkspaceName.length}/35</span></p></>}
              <label className="field-label" htmlFor="username">{desktopMode && workspaceMode === 'local' && needsSetup ? 'Owner username' : 'Username'}</label>
              <div ref={(element) => { fieldRefs.current.username = element; }} className={`auth-input-wrap ${fieldErrors.username ? 'has-error' : ''} ${desktopMode && workspaceMode === 'local' && !localUsernameEditable ? 'is-readonly' : ''}`}>
                <input id="username" autoFocus={!needsSetup} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={username} disabled={desktopMode && workspaceMode === 'local' && !localUsernameEditable} onChange={(event) => { updateField('username', setUsername)(event); setOwnerResetPromptForUsername(''); if (desktopMode && workspaceMode === 'remote' && usernameStorageKey) { try { localStorage.setItem(usernameStorageKey, event.target.value); } catch {} } }} placeholder="Username" aria-invalid={Boolean(fieldErrors.username)} />
                {desktopMode && workspaceMode === 'local' && <button className="auth-edit-username" type="button" onClick={() => setLocalUsernameEditable((editable) => !editable)} aria-label={localUsernameEditable ? 'Lock username field' : 'Edit username'} title={localUsernameEditable ? 'Done editing username' : 'Edit username'}>{localUsernameEditable ? 'Done' : <><Pencil size={13} /> Edit</>}</button>}
              </div>
              {fieldErrors.username && <p className="auth-field-error" role="alert">{fieldErrors.username}</p>}
              <label className="field-label" htmlFor="password">Password</label>
              <div ref={(element) => { fieldRefs.current.password = element; }} className={`auth-input-wrap ${fieldErrors.password ? 'has-error' : ''}`}><LockKeyhole size={16} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete={needsSetup ? 'new-password' : 'current-password'} autoCapitalize="none" autoCorrect="off" spellCheck="false" value={password} onChange={(event) => { updateField('password', setPassword)(event); setOwnerResetPromptForUsername(''); }} placeholder="Password" aria-invalid={Boolean(fieldErrors.password)} /><button className="auth-reveal" type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
              {fieldErrors.password && <p className="auth-field-error" role="alert">{fieldErrors.password}</p>}
              {desktopMode && workspaceMode === 'remote' && <label className="remember-password"><input type="checkbox" checked={rememberPassword} onChange={(event) => { const checked = event.target.checked; setRememberPassword(checked); try { if (rememberStorageKey) localStorage.setItem(rememberStorageKey, String(checked)); } catch {} if (!checked && credentialOrigin) window.__TAURI_INTERNALS__?.invoke?.('delete_workspace_password', { origin: credentialOrigin }).catch(() => {}); }} /><span>Remember password on this device</span></label>}
              {desktopMode && workspaceMode === 'local' && !needsSetup && <label className="remember-password"><input type="checkbox" checked={keepLocalSignedIn} onChange={(event) => { const checked = event.target.checked; setKeepLocalSignedIn(checked); try { localStorage.setItem('arc_local_keep_signed_in', String(checked)); if (!checked) localStorage.removeItem('arc_local_session_token'); } catch {} if (!checked) window.__TAURI_INTERNALS__?.invoke?.('delete_local_session_token').catch(() => {}); }} /><span>Keep me signed in</span></label>}
              {recoveryMessage && <p className="auth-field-hint" role="status">{recoveryMessage}</p>}
              {!needsSetup && desktopMode && workspaceMode === 'local' && <button className="auth-back" type="button" onClick={() => { setRecoveryMode('local'); setError(''); setRecoveryMessage(''); }}>Forgot password?</button>}
              {showMasterPasswordReset && <button className="auth-back" type="button" onClick={() => { setRecoveryMode('master'); setError(''); setRecoveryMessage(''); }}>Reset owner password with master key</button>}
              {needsSetup && <><label className="field-label" htmlFor="confirm-password">Confirm password</label><div ref={(element) => { fieldRefs.current.confirmPassword = element; }} className={`auth-input-wrap ${fieldErrors.confirmPassword ? 'has-error' : ''}`}><LockKeyhole size={16} /><input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={confirmPassword} onChange={updateField('confirmPassword', setConfirmPassword)} placeholder="Confirm password" aria-invalid={Boolean(fieldErrors.confirmPassword)} /><button className="auth-reveal" type="button" onClick={() => setShowConfirmPassword((show) => !show)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>{showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>{fieldErrors.confirmPassword && <p className="auth-field-error" role="alert">{fieldErrors.confirmPassword}</p>}</>}
              {needsSetup && desktopMode && workspaceMode === 'local' && <label className="remember-password"><input type="checkbox" checked={keepLocalSignedIn} onChange={(event) => { const checked = event.target.checked; setKeepLocalSignedIn(checked); try { localStorage.setItem('arc_local_keep_signed_in', String(checked)); if (!checked) localStorage.removeItem('arc_local_session_token'); } catch {} if (!checked) window.__TAURI_INTERNALS__?.invoke?.('delete_local_session_token').catch(() => {}); }} /><span>Keep me signed in</span></label>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {workspaceError && <p className="form-error" role="alert">{workspaceError}</p>}
              {workspaceError && !startupError && <button className="auth-retry" type="button" onClick={onRetryWorkspace}>Retry connection</button>}
              <button className="auth-submit" type="submit" disabled={loading || remotePending || Boolean(workspaceError)}>
                {loading ? <><LoaderCircle size={16} className="is-spinning" /> {sessionReplacementPending ? 'Please wait…' : needsSetup ? 'Creating account' : 'Signing in'}</> : <>{needsSetup ? 'Create account' : 'Continue'} <ArrowRight size={16} /></>}
              </button>
              {needsSetup && !setupCredential && !(desktopMode && workspaceMode === 'local') && <button className="auth-back" type="button" onClick={() => { setSetupStep(1); setError(''); }}><ArrowLeft size={14} /> Back</button>}
            </form>
          )}
          {!remotePending && <div className="auth-footer">{desktopMode ? activeWorkspaceName : activeWorkspaceName || 'Private workspace'}</div>}
        </section>
      </div>}
      <Modal
        isOpen={Boolean(trustPrompt)}
        onClose={() => { if (!connecting) { setTrustPrompt(null); setTrustConfirmed(false); } }}
        title="Trust this workspace?"
        subtitle={trustPrompt || ''}
        icon={ShieldCheck}
        footer={<><Button variant="secondary" disabled={connecting} onClick={() => { setTrustPrompt(null); setTrustConfirmed(false); }}>Cancel</Button><Button loading={connecting} disabled={!trustConfirmed || connecting} onClick={confirmWorkspaceTrust}>{connecting ? 'Connecting' : 'Trust and connect'}</Button></>}
      >
        <div className="workspace-trust-content">
          <p>This server is operated by someone else. It can access the credentials and project data you send to it. Continue only if you trust its operator.</p>
          <label className="workspace-trust-option"><input type="checkbox" checked={trustConfirmed} onChange={(event) => setTrustConfirmed(event.target.checked)} /><span><strong>I trust this workspace operator</strong><small>Required to connect. If unchecked, ARC Studio will not connect.</small></span></label>
          <label className="workspace-trust-option"><input type="checkbox" checked={rememberTrustedWorkspace} onChange={(event) => setRememberTrustedWorkspace(event.target.checked)} /><span><strong>{trustedWorkspaces.includes(trustPrompt) ? 'Keep in trusted workspaces' : 'Add to trusted workspaces'}</strong><small>Remember this server on this device. You will still be asked before connecting next time.</small></span></label>
          {connectError && <p className="form-error" role="alert">{connectError}</p>}
        </div>
      </Modal>
      <div className="splash-build-info" aria-label={`ARC Studio version ${studioVersion}, ${buildInfo}`}>
        v{studioVersion} · {buildInfo}
      </div>
    </main>
  );
}
