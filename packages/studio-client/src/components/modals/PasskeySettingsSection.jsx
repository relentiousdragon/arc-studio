import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, LoaderCircle, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
import { describePasskeyError, isWebPasskeyAvailable, listPasskeys, registerWebPasskey, removePasskey } from '../../core/passkeys.js';
import { beginDesktopPasskey, cancelDesktopPasskeyFlows } from '../../core/desktopPasskeys.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { TextInput } from '../ui/Inputs.jsx';
//
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function deviceLabel(passkey) {
  if (passkey.deviceType === 'multiDevice') return passkey.backedUp ? 'Synced passkey' : 'Multi device passkey';
  return 'This device only';
}

export function PasskeySettingsSection({ authToken, desktopMode = false, workspaceOrigin = '' }) {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordErrorKey, setPasswordErrorKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const passwordRef = useRef(null);
  const nameRef = useRef(null);
  const [desktopWaiting, setDesktopWaiting] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [confirmRemoveRecord, setConfirmRemoveRecord] = useState(null);
  const webSupported = !desktopMode && isWebPasskeyAvailable();
  const canAdd = Boolean(authToken) && (desktopMode ? Boolean(workspaceOrigin) : webSupported);
  const shakeField = (ref) => {
    const control = ref.current?.closest('.field-control');
    if (!control) return;
    control.classList.remove('field-shake');
    void control.offsetWidth;
    control.classList.add('field-shake');
    window.setTimeout(() => control.classList.remove('field-shake'), 360);
  };
  const showPasswordError = (message) => {
    setPasswordError(message);
    setPasswordErrorKey((value) => value + 1);
    setError('');
    shakeField(passwordRef);
  };

  useEffect(() => {
    if (!authToken) { setPasskeys([]); setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    setLoadError('');
    listPasskeys(authToken)
      .then((items) => { if (active) setPasskeys(items); })
      .catch((requestError) => { if (active) setLoadError(describePasskeyError(requestError, 'Could not load passkeys.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authToken, reloadKey]);

  useEffect(() => {
    if (!passwordErrorKey) return;
    passwordRef.current?.focus();
  }, [passwordErrorKey]);

  useEffect(() => {
    const offChanged = arcEvents.on('passkeys:changed', () => setReloadKey((value) => value + 1));
    const offFinished = arcEvents.on('desktop-passkey:finished', (detail) => {
      if (detail?.kind !== 'registration') return;
      setDesktopWaiting(false);
      if (detail.ok) {
        setPassword('');
        setName('');
        setError('');
        setPasswordError('');
        setReloadKey((value) => value + 1);
      } else if (detail.error) {
        setError(detail.error);
      }
    });
    return () => { offChanged(); offFinished(); };
  }, []);

  const addPasskey = async (event) => {
    event.preventDefault();
    if (!canAdd || adding || desktopWaiting) return;
    if (!password) { showPasswordError('Enter your current password.'); return; }
    setError('');
    setPasswordError('');
    setAdding(true);
    try {
      if (desktopMode) {
        await beginDesktopPasskey({
          kind: 'registration',
          workspaceOrigin,
          authToken,
          password,
          name,
          persistSession: true
        });
        setDesktopWaiting(true);
        setPassword('');
        setPasswordError('');
        arcEvents.emit('toast:notify', {
          title: 'Continue in your browser',
          message: 'Finish adding the passkey, then return to ARC Studio.',
          type: 'info',
          duration: 7000
        });
      } else {
        const result = await registerWebPasskey({ authToken, password, name });
        setPasskeys(Array.isArray(result?.passkeys) ? result.passkeys : []);
        setPassword('');
        setName('');
        arcEvents.emit('toast:notify', { title: 'Passkey added', message: 'You can use it the next time you sign in.', type: 'success' });
      }
    } catch (requestError) {
      if (requestError?.code === 'PASSKEY_PASSWORD_REQUIRED') showPasswordError('That password is not correct for this account.');
      else setError(describePasskeyError(requestError, 'Could not add this passkey.'));
    } finally {
      setAdding(false);
    }
  };

  const cancelDesktop = () => {
    cancelDesktopPasskeyFlows();
    setDesktopWaiting(false);
    setError('');
  };

  const openRemoveConfirm = (record) => {
    setError('');
    setConfirmRemoveRecord(record);
    setConfirmRemoveOpen(true);
  };

  const closeRemoveConfirm = () => {
    setConfirmRemoveOpen(false);
    setConfirmRemoveRecord(null);
    setError('');
  };

  const confirmRemove = async () => {
    const record = confirmRemoveRecord;
    if (!authToken || removingId || !record) return;
    const recordId = record.id;
    closeRemoveConfirm();
    setRemovingId(recordId);
    try {
      const next = await removePasskey(authToken, recordId);
      setPasskeys(next);
      arcEvents.emit('toast:notify', { title: 'Passkey removed', message: 'It can no longer sign in to this account.', type: 'success' });
    } catch (requestError) {
      setError(describePasskeyError(requestError, 'Could not remove this passkey.'));
    } finally {
      setRemovingId('');
    }
  };

  const remove = async (recordId) => {
    if (!authToken || removingId) return;
    setRemovingId(recordId);
    setError('');
    try {
      const next = await removePasskey(authToken, recordId);
      setPasskeys(next);
      arcEvents.emit('toast:notify', { title: 'Passkey removed', message: 'It can no longer sign in to this account.', type: 'success' });
    } catch (requestError) {
      setError(describePasskeyError(requestError, 'Could not remove this passkey.'));
    } finally {
      setRemovingId('');
    }
  };

  return <div className="passkey-settings">
    <section className="passkey-list-section" aria-labelledby="passkey-list-heading">
      <div className="settings-section-heading"><span id="passkey-list-heading">Saved passkeys</span>{!loading && <small>{passkeys.length} of 20</small>}</div>
      {loading ? <div className="passkey-loading" role="status"><LoaderCircle size={15} className="is-spinning" /> Loading passkeys…</div> : null}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!loading && !loadError && !passkeys.length && <div className="passkey-empty">
        <ShieldCheck size={18} />
        <div><strong>No passkeys yet</strong><span>Add one below to sign in without a password.</span></div>
      </div>}
      {passkeys.length > 0 && <ul className="passkey-list">
        {passkeys.map((passkey) => <li key={passkey.id} className="passkey-row">
          <span className="passkey-row-icon" aria-hidden="true"><KeyRound size={16} /></span>
          <div className="passkey-row-copy">
            <strong>{passkey.name || 'Passkey'}</strong>
            <span>{deviceLabel(passkey)} · Added {formatDate(passkey.createdAt)}{passkey.lastUsedAt ? ` · Last used ${formatDate(passkey.lastUsedAt)}` : ''}</span>
          </div>
          {removingId === passkey.id ? <button type="button" className="passkey-remove-button passkey-remove-button-loading" disabled aria-label={`Removing ${passkey.name || 'passkey'}`} title="Removing…"><LoaderCircle size={12} /></button> : <button type="button" className="passkey-remove-button" onClick={() => openRemoveConfirm(passkey)} aria-label={`Remove passkey ${passkey.name || ''}`} title="Remove passkey"><Trash2 size={15} /></button>}
        </li>)}
      </ul>}
    </section>

    <Modal
      isOpen={confirmRemoveOpen}
      onClose={closeRemoveConfirm}
      title="Remove passkey?"
      subtitle="Confirm passkey removal"
      icon={Trash2}
      footer={
        <>
          <Button variant="secondary" onClick={closeRemoveConfirm} disabled={removingId === confirmRemoveRecord?.id}>Cancel</Button>
          <Button variant="danger" loading={removingId === confirmRemoveRecord?.id} onClick={confirmRemove} disabled={!confirmRemoveRecord || removingId === confirmRemoveRecord?.id}>Remove</Button>
        </>
      }>
      <p className="passkey-remove-copy">Removing <strong>{confirmRemoveRecord?.name}</strong> will delete it from this account.</p>
      <p className="passkey-remove-copy">You will not be able to sign in with this passkey again.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>

    <form className="passkey-add-form" onSubmit={addPasskey}>
      <div className="settings-section-heading"><span>Add a passkey</span></div>
      {!desktopMode && !webSupported && <p className="settings-description">This browser does not support passkeys. Use a current version of Chrome, Edge, Safari, or Firefox over HTTPS.</p>}
      {desktopMode && !workspaceOrigin && <p className="settings-description">Connect to an external workspace before adding a passkey.</p>}
      {desktopWaiting ? <div className="passkey-waiting" role="status">
        <LoaderCircle size={16} className="is-spinning" />
        <div><strong>Waiting for your browser</strong><span>Finish the passkey prompt there, then return here.</span></div>
        <Button size="sm" variant="secondary" onClick={cancelDesktop}>Cancel</Button>
      </div> : <>
        <TextInput
          label="Current password"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(''); setPasswordError(''); }}
          placeholder="Confirm your password"
          icon={KeyRound}
          error={passwordError}
          inputRef={passwordRef}
          disabled={!canAdd || adding}
        />
        <TextInput
          label="Passkey name"
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          placeholder="Work, Home, Phone, Laptop…"
          helper="Optional"
          inputRef={nameRef}
          disabled={!canAdd || adding}
        />
        <div className="passkey-add-actions">
          <Button type="submit" icon={Fingerprint} loading={adding} disabled={!canAdd || !password}>{desktopMode ? 'Add with browser' : 'Add passkey'}</Button>
        </div>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>

    <div className="passkey-safety-note">
      {desktopMode ? <Smartphone size={15} /> : <ShieldCheck size={15} />}
      <p>Passkeys are bound to the workspace address. ARC never receives your fingerprint, face, or device PIN, and your passkey private key never leaves your device.</p>
    </div>
  </div>;
}
