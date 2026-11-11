import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { PasswordInput, SelectInput, TextInput, Toggle } from '../ui/Inputs.jsx';
import { Activity, CheckCircle2, Clock3, KeyRound, Pencil, Shield, SlidersHorizontal, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
import { apiUrl } from '../../core/api.js';
//
async function readApiResponse(response) {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch {
    const detail = response.ok
      ? 'The server returned a page instead of an API response.'
      : `The request failed (${response.status}) and the server returned a page instead of an API response.`;
    throw new Error(detail);
  }
}

const ROLE_OPTIONS = [
  { value: 'editor', label: 'Editor · Graphs and simulation' },
  { value: 'operator', label: 'Operator · Gateway and emojis' },
  { value: 'viewer', label: 'Viewer · Read only' },
  { value: 'admin', label: 'Admin · Full access' }
];

const PERMISSION_OPTIONS = [
  { value: 'graphs:read', label: 'View graphs', detail: 'Open and inspect workspace graphs.' },
  { value: 'graphs:write', label: 'Edit graphs', detail: 'Create, change, and save graphs and variables.' },
  { value: 'simulation:run', label: 'Run simulations', detail: 'Use the offline simulator and debugger.' },
  { value: 'logs:read', label: 'View logs', detail: 'Read workspace and bot logs.' },
  { value: 'bot:control', label: 'Control bot', detail: 'Connect or disconnect the Discord gateway.' },
  { value: 'emojis:upload', label: 'Manage emojis', detail: 'Upload and manage application emojis.' }
];

function DiscordDeliveryStatus({ status }) {
  const delivery = {
    success: { Icon: CheckCircle2, label: 'Sent' },
    failed: { Icon: XCircle, label: 'Failed' },
    in_progress: { Icon: Clock3, label: 'In progress' }
  }[status];
  if (!delivery) return null;
  const { Icon, label } = delivery;
  return <span className={`team-activity-delivery team-activity-delivery-${status}`} title={`Discord log: ${label.toLowerCase()}`} aria-label={`Discord log ${label.toLowerCase()}`}><Icon size={12} /></span>;
}

export function UserManagementModal({ isOpen, onClose, authToken, currentUsername = '', currentUserId = '', onCurrentUserChange }) {
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [permissionDraft, setPermissionDraft] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionLogoutTarget, setPermissionLogoutTarget] = useState(null);
  const [permissionLogoutError, setPermissionLogoutError] = useState('');
  const [loggingOutUser, setLoggingOutUser] = useState(false);
  const [usernameTarget, setUsernameTarget] = useState(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameAvailableAt, setUsernameAvailableAt] = useState(0);
  const [usernameClock, setUsernameClock] = useState(Date.now());
  const createFormRef = useRef(null);

  useEffect(() => {
    if (!usernameTarget) return undefined;
    const timer = window.setInterval(() => setUsernameClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [usernameTarget]);

  const shakeInvalidFields = () => {
    const form = createFormRef.current;
    if (!form) return;
    form.querySelectorAll('.field-group').forEach((field) => {
      if (!field.querySelector('[aria-invalid="true"]')) return;
      field.classList.remove('field-shake');
      void field.offsetWidth;
      field.classList.add('field-shake');
      window.setTimeout(() => field.classList.remove('field-shake'), 360);
    });
  };

  const fetchUsers = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/users'), { headers: { 'x-arc-token': authToken } });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load accounts.');
      setUsers(data.users || []);
      if ((data.users || []).length > 1) {
        setActivity([]);
        const activityResponse = await fetch(apiUrl('/api/activity?limit=50'), { headers: { 'x-arc-token': authToken } });
        const activityData = await activityResponse.json();
        if (activityResponse.ok) setActivity(activityData.activity || []);
      } else setActivity([]);
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Team access', message: error.message, type: 'error' });
    } finally { setLoading(false); }
  }, [authToken]);

  useEffect(() => { if (isOpen) fetchUsers(); }, [isOpen, fetchUsers]);

  useEffect(() => {
    if (!isOpen || !authToken || users.length <= 1) return undefined;
    let active = true;
    const refreshActivity = async () => {
      try {
        const response = await fetch(apiUrl('/api/activity?limit=50'), { headers: { 'x-arc-token': authToken } });
        const data = await response.json();
        if (active && response.ok) {
          const nextActivity = data.activity || [];
          setActivity((current) => JSON.stringify(current) === JSON.stringify(nextActivity) ? current : nextActivity);
        }
      } catch {}
    };
    const timer = window.setInterval(refreshActivity, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isOpen, authToken, users.length]);

  const createUser = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!newUsername.trim()) nextErrors.username = 'Enter a username.';
    else if (newUsername.trim().length < 2) nextErrors.username = 'Use at least 2 characters.';
    if (!newPassword) nextErrors.password = 'Enter a password.';
    else if (newPassword.length < 6) nextErrors.password = 'Use at least 6 characters.';
    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors);
      requestAnimationFrame(shakeInvalidFields);
      return;
    }
    if (!newUsername.trim() || !newPassword || !authToken) return;
    setCreating(true);
    try {
      const response = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole, mustChangePassword: requirePasswordChange })
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not create this account.');
      setNewUsername(''); setNewPassword(''); setNewRole('editor'); setRequirePasswordChange(false); setFormErrors({});
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Account created', message: data.user.username, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Account not created', message: error.message, type: 'error' });
    } finally { setCreating(false); }
  };

  const deleteUser = async (user) => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(user.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not remove this account.');
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Access removed', message: user.username, type: 'info' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Account not removed', message: error.message, type: 'error' });
    }
  };

  const resetUserPassword = async (event) => {
    event.preventDefault();
    if (!resetTarget || !authToken) return;
    if (resetPassword.length < 6) return setResetError('Use at least 6 characters.');
    if (resetPassword !== resetConfirmPassword) return setResetError('Passwords do not match.');
    setResetting(true); setResetError('');
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(resetTarget.id)}/reset-password`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ password: resetPassword, confirmPassword: resetConfirmPassword })
      });
        const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not reset this password.');
      setResetTarget(null); setResetPassword(''); setResetConfirmPassword('');
      arcEvents.emit('toast:notify', { title: 'Password reset', message: `${resetTarget.username} will choose a new password at next sign-in.`, type: 'success' });
    } catch (error) { setResetError(error.message || 'Could not reset this password.'); }
    finally { setResetting(false); }
  };

  const startPermissionEdit = (user) => {
    setResetTarget(null);
    const current = Array.isArray(user.permissions) ? user.permissions : [];
    setPermissionDraft(current.includes('*') ? PERMISSION_OPTIONS.map((item) => item.value) : current);
    setEditingUserId(user.id);
  };

  const saveUserPermissions = async (user) => {
    if (!authToken || savingPermissions) return;
    setSavingPermissions(true);
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(user.id)}/permissions`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ permissions: permissionDraft })
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not update permissions.');
      setEditingUserId('');
      await fetchUsers();
      if (data.sessionOnline) {
        setPermissionLogoutError('');
        setPermissionLogoutTarget({ id: user.id, username: user.username });
      } else {
        arcEvents.emit('toast:notify', {
          title: 'Permissions updated',
          message: data.sessionInvalidated ? `${user.username} will need to sign in again.` : 'Changes take effect on the next request.',
          type: 'success'
        });
      }
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Permissions not updated', message: error.message, type: 'error' });
    } finally { setSavingPermissions(false); }
  };

  const signOutAfterPermissionChange = async () => {
    if (!permissionLogoutTarget || !authToken || loggingOutUser) return;
    setLoggingOutUser(true);
    setPermissionLogoutError('');
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(permissionLogoutTarget.id)}/logout`), {
        method: 'POST', headers: { 'x-arc-token': authToken }
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not sign out this member.');
      const username = permissionLogoutTarget.username;
      setPermissionLogoutTarget(null);
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Member signed out', message: `${username} must sign in again to continue.`, type: 'success' });
    } catch (error) {
      setPermissionLogoutError(error.message || 'Could not sign out this member.');
    } finally { setLoggingOutUser(false); }
  };

  const startUsernameEdit = (user) => {
    const changedAt = Date.parse(user.usernameChangedAt || '');
    setUsernameTarget(user);
    setUsernameDraft(user.username || '');
    setUsernameError('');
    setUsernameAvailableAt(Number.isFinite(changedAt) ? changedAt + 10 * 60 * 1000 : 0);
    setUsernameClock(Date.now());
  };

  const renameOwner = async (event) => {
    event.preventDefault();
    if (!usernameTarget || !authToken || usernameSaving) return;
    const nextUsername = usernameDraft.trim();
    if (nextUsername.length < 2 || nextUsername.length > 32) return setUsernameError('Use 2 to 32 characters.');
    if (usernameAvailableAt > Date.now()) return setUsernameError('Please wait for the 10 minute cooldown to end.');
    setUsernameSaving(true);
    setUsernameError('');
    try {
      const response = await fetch(apiUrl('/api/auth/username'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ username: nextUsername })
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        if (data.availableAt) setUsernameAvailableAt(Number(data.availableAt));
        throw new Error(data.error || 'Could not rename the owner account.');
      }
      onCurrentUserChange?.(data.user);
      setUsernameTarget(null);
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: data.changed ? 'Owner account renamed' : 'Username unchanged', message: data.user.username, type: 'success' });
    } catch (error) {
      setUsernameError(error.message || 'Could not rename the owner account.');
    } finally { setUsernameSaving(false); }
  };

  return <>
  <Modal isOpen={isOpen} onClose={onClose} title="Team access" subtitle="Manage studio accounts and roles" icon={Users} maxWidth="max-w-2xl" panelClassName="modal-team-access">
    <form ref={createFormRef} className="team-create-form" noValidate onSubmit={createUser}>
      <div className="team-form-title"><span><UserPlus size={16} /></span><div><strong>Add a member</strong><small>Create a separate sign-in for a collaborator.</small></div></div>
      <div className="team-form-grid">
        <TextInput label="Username" placeholder="Username" value={newUsername} onChange={(event) => { setNewUsername(event.target.value); setFormErrors((current) => ({ ...current, username: '' })); }} error={formErrors.username} minLength={2} autoComplete="off" />
        <PasswordInput label="Initial password" placeholder="At least 6 characters" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setFormErrors((current) => ({ ...current, password: '' })); }} error={formErrors.password} showStrength minLength={6} autoComplete="new-password" />
      </div>
      <SelectInput label="Role" value={newRole} options={ROLE_OPTIONS} onChange={setNewRole} />
      <Toggle label="Require password change at first sign-in" description="The account must choose a different password before opening the workspace." checked={requirePasswordChange} onChange={setRequirePasswordChange} />
      <Button type="submit" variant="primary" loading={creating} icon={UserPlus}>Create account</Button>
    </form>
    <section className="team-list-section">
      <div className="team-list-heading"><h3><Shield size={15} /> Accounts</h3><span>{users.length}</span></div>
      {loading && users.length === 0 ? <div className="team-empty">Loading accounts…</div> : users.length === 0 ? <div className="team-empty">No additional accounts</div> : <div className="team-list">
        {users.map((user) => {
          const primary = Boolean(user.isPrimaryAdmin);
          return <article className="team-user-entry" key={user.id}>
            <div className="team-user-row">
              <span className="team-avatar">{user.avatar ? <img src={apiUrl(user.avatar)} alt="" /> : (user.username?.[0] || 'U').toUpperCase()}</span>
              <div className="team-user-copy"><strong>{user.username}{primary && <small>Primary</small>}</strong><span><i className={`role-dot role-${user.role}`} />{user.role === 'custom' ? 'Custom permissions' : user.role} <em>· {String(user.id).slice(0, 8)}</em></span><small className="team-last-login">Last sign-in: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</small></div>
              <div className="team-user-actions">{primary && user.id === currentUserId && <button type="button" className="icon-button" onClick={() => usernameTarget?.id === user.id ? setUsernameTarget(null) : startUsernameEdit(user)} title="Rename owner account" aria-label="Rename owner account"><Pencil size={15} /></button>}{!primary && user.id !== currentUserId && user.username?.toLowerCase() !== String(currentUsername).toLowerCase() && <><button type="button" className="icon-button" onClick={() => startPermissionEdit(user)} title={`Edit ${user.username} permissions`} aria-label={`Edit ${user.username} permissions`}><SlidersHorizontal size={15} /></button><button type="button" className="icon-button" onClick={() => { setEditingUserId(''); setResetTarget(user); setResetPassword(''); setResetConfirmPassword(''); setResetError(''); }} title={`Reset ${user.username} password`} aria-label={`Reset ${user.username} password`}><KeyRound size={15} /></button></>}{!primary && <button type="button" className="icon-button team-delete-button" onClick={() => deleteUser(user)} title={`Remove ${user.username}`} aria-label={`Remove ${user.username}`}><Trash2 size={15} /></button>}</div>
            </div>
            {usernameTarget?.id === user.id && <form className="team-create-form team-inline-username-form" onSubmit={renameOwner}>
              <div className="team-form-title"><span><Pencil size={16} /></span><div><strong>Rename owner account</strong><small>This username identifies you in the workspace. It can be changed once every 10 minutes.</small></div></div>
              <TextInput label="Username" placeholder="Username" value={usernameDraft} onChange={(event) => { setUsernameDraft(event.target.value); setUsernameError(''); }} minLength={2} maxLength={32} autoComplete="username" />
              {usernameAvailableAt > usernameClock && <p className="team-username-cooldown">You can rename again in {Math.floor((usernameAvailableAt - usernameClock) / 60000)}m {Math.ceil(((usernameAvailableAt - usernameClock) % 60000) / 1000)}s.</p>}
              {usernameError && <p className="form-error" role="alert">{usernameError}</p>}
              <div className="team-reset-actions"><Button type="button" variant="secondary" disabled={usernameSaving} onClick={() => setUsernameTarget(null)}>Cancel</Button><Button type="submit" loading={usernameSaving} disabled={usernameAvailableAt > usernameClock}>Save username</Button></div>
            </form>}
            {editingUserId === user.id && <div className="team-permissions-editor">
              <div className="team-permissions-heading"><strong>Workspace permissions</strong><small>Selecting every permission grants full Admin access, including Team access. Changes take effect on the member’s next request. You can sign them out now to end their current session.</small></div>
              <div className="team-permissions-grid">{PERMISSION_OPTIONS.map((permission) => <label className="team-permission-option" key={permission.value}>
                <input type="checkbox" checked={permissionDraft.includes(permission.value)} onChange={(event) => setPermissionDraft((current) => event.target.checked ? [...current, permission.value] : current.filter((item) => item !== permission.value))} />
                <span><strong>{permission.label}</strong><small>{permission.detail}</small></span>
              </label>)}</div>
              <div className="team-permissions-actions"><Button type="button" variant="secondary" disabled={savingPermissions} onClick={() => setEditingUserId('')}>Cancel</Button><Button type="button" loading={savingPermissions} onClick={() => saveUserPermissions(user)}>Save permissions</Button></div>
            </div>}
            {resetTarget?.id === user.id && <form className="team-create-form team-inline-reset-form" onSubmit={resetUserPassword}>
              <div className="team-form-title"><span><KeyRound size={16} /></span><div><strong>Reset {resetTarget.username}’s password</strong><small>They must choose a new password before continuing.</small></div></div>
              <div className="team-reset-password-grid">
                <PasswordInput label="Temporary password" placeholder="At least 6 characters" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={6} autoComplete="new-password" />
                <PasswordInput label="Confirm temporary password" placeholder="Confirm password" value={resetConfirmPassword} onChange={(event) => setResetConfirmPassword(event.target.value)} minLength={6} autoComplete="new-password" />
              </div>
              {resetError && <p className="form-error" role="alert">{resetError}</p>}
              <div className="team-reset-actions"><Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button><Button type="submit" loading={resetting}>Reset password</Button></div>
            </form>}
          </article>;
        })}
      </div>}
    </section>
    {users.length > 1 && <section className="team-activity-section">
      <div className="team-list-heading"><h3><Activity size={15} /> Recent activity</h3><span>{activity.length}</span></div>
      {activity.length ? <div className="team-activity-list">{activity.map((entry) => <article className="team-activity-row" key={entry.id}>
        <div><div className="team-activity-summary"><strong>{entry.summary}</strong><DiscordDeliveryStatus status={entry.webhookDelivery} /></div><small>{entry.actor?.username || 'Unknown user'} · {new Date(entry.timestamp).toLocaleString()}</small>
          {entry.details?.changedNodes?.length > 0 && <small className="team-activity-node-list">{entry.details.changedNodes.slice(0, 5).map((node) => `${node.change} ${node.name}${node.fields?.length ? ` (${node.fields.join(', ')})` : ''}`).join(' · ')}{entry.details.changedNodes.length > 5 ? ` · +${entry.details.changedNodes.length - 5} more` : ''}</small>}
          {entry.details?.blockTypes?.length > 0 && <small className="team-activity-node-list">Blocks: {entry.details.blockTypes.join(' · ')}</small>}
        </div>
      </article>)}</div> : <div className="team-empty">No activity recorded yet</div>}
    </section>}
  </Modal>
  <Modal isOpen={Boolean(permissionLogoutTarget)} onClose={() => !loggingOutUser && setPermissionLogoutTarget(null)} title="Sign out this member?" subtitle="Their permissions have already been updated" icon={Shield} maxWidth="max-w-md">
    <p className="team-empty">{permissionLogoutTarget?.username} is currently signed in. Their new permissions apply immediately to future requests. Signing them out now ends the current session and requires them to sign in again.</p>
    {permissionLogoutError && <p className="form-error" role="alert">{permissionLogoutError}</p>}
    <div className="team-reset-actions">
      <Button type="button" variant="secondary" disabled={loggingOutUser} onClick={() => setPermissionLogoutTarget(null)}>Keep signed in</Button>
      <Button type="button" variant="danger" loading={loggingOutUser} onClick={signOutAfterPermissionChange}>Sign out now</Button>
    </div>
  </Modal>
  </>;
}
