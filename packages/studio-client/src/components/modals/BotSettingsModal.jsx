import React, { useEffect, useState } from 'react';
import { Activity, Bot, Check, Image as ImageIcon, KeyRound, List, ShieldCheck, UserRound, X } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { SidebarResizeHandle } from '../ui/SidebarResizeHandle.jsx';
import { Button } from '../ui/Button.jsx';
import { SecretKeyInput, SelectInput, Toggle } from '../ui/Inputs.jsx';
import { arcEvents } from '../../core/ArcEvents.js';
import { apiUrl } from '../../core/api.js';
//
function cdnImage(kind, id, hash, size) {
  if (!id || !hash) return '';
  const extension = hash.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/${kind}/${id}/${hash}.${extension}?size=${size}`;
}

function botAvatar(profile) {
  return cdnImage('avatars', profile?.id, profile?.avatar, 128)
    || cdnImage('app-icons', profile?.application?.id, profile?.application?.icon, 128);
}

function botBanner(profile) {
  return cdnImage('banners', profile?.id, profile?.banner, 1024)
    || cdnImage('banners', profile?.application?.id, profile?.application?.banner, 1024);
}

function openDeveloperPortal(event) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return;
  event.preventDefault();
  invoke('open_external_url', { url: event.currentTarget.href }).catch(() => {});
}

const BotTokenForm = React.memo(function BotTokenForm({ isOpen, authToken, onProfileChange }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setToken(''); setError(''); }
  }, [isOpen]);

  const verifyToken = async (event) => {
    event.preventDefault();
    if (!token.trim() || !authToken) return;
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname.replace(/^\[|\]$/g, ''));
    if (!window.isSecureContext && !localHost && !window.__ARC_STUDIO_CONFIG__?.desktop) {
      setError('Connect to ARC Studio over HTTPS before entering a bot token.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/bot/verify-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not verify this Discord token.');
      onProfileChange?.(data.profile);
      setToken('');
      arcEvents.emit('toast:notify', { title: 'App connected to studio', message: data.profile?.username || 'Token verified', type: 'success' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return <form className="bot-token-form" onSubmit={verifyToken}>
    <div className="bot-settings-heading"><span><KeyRound size={15} /></span><div><strong>Discord App Token</strong><small>Get your token from the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" onClick={openDeveloperPortal}>Discord Developer Portal</a>.</small></div></div>
    <SecretKeyInput label="Token" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" conceal />
    {error && <p className="form-error">{error}</p>}
    <Button type="submit" icon={ShieldCheck} loading={saving} disabled={!token.trim()}>Verify and save</Button>
  </form>;
});

export function BotSettingsModal({ isOpen, onClose, authToken, profile, onProfileChange, onViewCommands, presentation = 'modal', sidebarWidth = 340, onSidebarResize }) {
  const [statistics, setStatistics] = useState({ enabled: true, retentionDays: 30, commandUsage: true, uniqueUsers: true, returningUsers: true });
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsSaving, setStatisticsSaving] = useState(false);
  const [statisticsError, setStatisticsError] = useState('');
  const [statisticsSummary, setStatisticsSummary] = useState(null);

  useEffect(() => {
    if (!isOpen || !authToken) return undefined;
    let current = true;
    setStatisticsLoading(true);
    setStatisticsError('');
    fetch(apiUrl('/api/bot/statistics/settings'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load statistics settings.');
        if (current) setStatistics({ enabled: true, retentionDays: 30, commandUsage: true, uniqueUsers: true, returningUsers: true, ...data.settings });
      })
      .catch((requestError) => { if (current) setStatisticsError(requestError.message); })
      .finally(() => { if (current) setStatisticsLoading(false); });
    return () => { current = false; };
  }, [isOpen, authToken]);

  useEffect(() => {
    if (!isOpen || !authToken) return undefined;
    let current = true;
    const query = new URLSearchParams({ days: String(statistics.retentionDays) });
    fetch(apiUrl(`/api/bot/statistics?${query}`), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load command statistics.');
        if (current) setStatisticsSummary(data.statistics);
      })
      .catch(() => { if (current) setStatisticsSummary(null); });
    return () => { current = false; };
  }, [isOpen, authToken, statistics.retentionDays]);

  const updateStatistics = async (patch) => {
    if (!authToken || statisticsSaving) return;
    setStatisticsSaving(true);
    setStatisticsError('');
    try {
      const response = await fetch(apiUrl('/api/bot/statistics/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify(patch)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save statistics settings.');
      setStatistics(data.settings);
    } catch (requestError) {
      setStatisticsError(requestError.message);
    } finally {
      setStatisticsSaving(false);
    }
  };

  const avatar = botAvatar(profile);
  const banner = botBanner(profile);
  const username = profile?.username;
  const discriminator = profile?.discriminator && profile.discriminator !== '0' ? `#${profile.discriminator}` : '';
  const displayName = profile?.application?.name || profile?.global_name || username || 'Your app';
  const bio = profile?.application?.description;

  const content = <>
    <div className="bot-settings-layout">
      <BotTokenForm isOpen={isOpen} authToken={authToken} onProfileChange={onProfileChange} />

      <section className="bot-profile-card" aria-label="Discord app profile">
        <div className="bot-profile-banner" style={banner ? { backgroundImage: `url("${banner}")` } : undefined}>
          {!banner && <ImageIcon size={18} />}
        </div>
        <div className="bot-profile-identity">
          <div className="bot-profile-avatar">
            {avatar ? <img src={avatar} alt="" /> : <UserRound size={21} />}
          </div>
          <div className="bot-profile-name"><strong>{displayName}</strong><span>{username ? `@${username}${discriminator}` : 'No app connected'}</span></div>
          {profile?.bot && <span className="bot-account-badge">APP{profile?.verifiedBot === true && <Check className="verified-app-check" size={12} strokeWidth={3} aria-label="Discord-verified app" title="Discord-verified app" />}</span>}
        </div>
        <p className={`bot-profile-bio ${bio ? '' : 'is-empty'}`}>{bio || 'Application description will appear here.'}</p>
        {profile?.id && <div className="bot-profile-meta"><span>Application</span><strong>{profile.application?.name || displayName}</strong></div>}
      </section>
    </div>
    {presentation === 'sidebar' && <Button type="button" variant="secondary" icon={List} className="bot-view-commands" onClick={onViewCommands}>View commands</Button>}
    <section className="bot-statistics-settings">
      <div className="bot-settings-heading"><span><Activity size={15} /></span><div><strong>Command statistics</strong><small>{statisticsSaving ? 'Saving…' : 'User identifiers are stored as hashes.'}</small></div></div>
      <Toggle label="Collect command statistics" description="Turn all usage metrics on or off" checked={statistics.enabled} disabled={statisticsLoading || statisticsSaving} onChange={(enabled) => updateStatistics({ enabled })} />
      <div className={`bot-statistics-options ${statistics.enabled ? '' : 'is-disabled'}`}>
        <Toggle label="Command usage" description="Total uses and most popular commands" checked={statistics.commandUsage} disabled={!statistics.enabled || statisticsLoading || statisticsSaving} onChange={(commandUsage) => updateStatistics({ commandUsage })} />
        <Toggle label="Unique users" description="Count distinct users per command" checked={statistics.uniqueUsers} disabled={!statistics.enabled || statisticsLoading || statisticsSaving} onChange={(uniqueUsers) => updateStatistics({ uniqueUsers })} />
        <Toggle label="Returning users" description="Count users who use commands repeatedly" checked={statistics.returningUsers} disabled={!statistics.enabled || statisticsLoading || statisticsSaving} onChange={(returningUsers) => updateStatistics({ returningUsers })} />
      </div>
      <SelectInput label="Data retention" value={String(statistics.retentionDays)} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '180 days' }, { value: '365', label: '365 days' }, { value: 'forever', label: 'Forever' }]} onChange={(value) => updateStatistics({ retentionDays: value === 'forever' ? value : Number(value) })} />
      <div className="bot-statistics-summary"><div className="settings-section-heading"><span>Overview</span><small>{statisticsSummary?.rangeDays === 'forever' ? 'All time' : `Last ${statisticsSummary?.rangeDays || statistics.retentionDays} days`}</small></div><div className="bot-statistics-overview"><span><strong>{statistics.enabled && statistics.commandUsage ? Number(statisticsSummary?.totalUses || 0).toLocaleString() : 'Off'}</strong><small>Uses</small></span><span><strong>{statistics.enabled && statistics.uniqueUsers ? Number(statisticsSummary?.uniqueUsers || 0).toLocaleString() : 'Off'}</strong><small>Unique users</small></span><span><strong>{statistics.enabled && statistics.returningUsers ? Number(statisticsSummary?.returningUsers || 0).toLocaleString() : 'Off'}</strong><small>Returning</small></span></div><div className="bot-statistics-popular"><strong>Most used</strong>{statisticsSummary?.commands?.filter((command) => command.uses !== null).slice(0, 3).map((command, index) => <div key={command.name}><span>{index + 1}. /{command.name}</span><b>{Number(command.uses).toLocaleString()}</b></div>)}{statistics.enabled && statistics.commandUsage && !statisticsSummary?.commands?.length && <small>No command usage yet</small>}</div></div>
      {statisticsError && <p className="bot-statistics-error" role="alert">{statisticsError}</p>}
    </section>
  </>;

  if (presentation === 'sidebar') return isOpen ? <aside className="bot-settings-sidebar" aria-label="App settings and profile" style={{ '--arc-sidebar-width': `${sidebarWidth}px` }}>
    <SidebarResizeHandle width={sidebarWidth} defaultWidth={360} onResize={onSidebarResize} />
    <header className="graph-library-header">
      <span><Bot size={14} />App settings and profile</span>
      <button className="icon-button compact" type="button" aria-label="Close app settings" onClick={onClose}><X size={14} /></button>
    </header>
    <div className="bot-settings-sidebar-content">{content}</div>
  </aside> : null;

  return <Modal isOpen={isOpen} onClose={onClose} title="App settings" subtitle="Credentials and Discord profile" icon={Bot} maxWidth="max-w-2xl">{content}</Modal>;
}
