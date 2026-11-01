import React, { useMemo, useState } from 'react';
import { ArrowRight, Fingerprint, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { apiUrl } from '../../core/api.js';
import { passkeyCeremonyError, passkeyRequest } from '../../core/passkeys.js';
import { AuthGridCanvas } from './AuthGridCanvas.jsx';
//
const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function readBridgeRequest() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('arc_passkey_state') || '';
  const purpose = params.get('arc_passkey_purpose') === 'registration' ? 'registration' : 'authentication';
  return { state, purpose };
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function validCallbackUrl(value, state) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'arcstudio:') return '';
    const route = `${url.hostname}/${url.pathname}`.replace(/\/+/g, '/').replace(/^\//, '').toLowerCase();
    if (route !== 'passkey/callback') return '';
    if (url.searchParams.get('state') !== state) return '';
    if (!TICKET_PATTERN.test(url.searchParams.get('ticket') || '')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function DesktopPasskeyBridge() {
  const request = useMemo(readBridgeRequest, []);
  const [phase, setPhase] = useState(STATE_PATTERN.test(request.state) ? 'ready' : 'invalid');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const registration = request.purpose === 'registration';

  const finish = async () => {
    if (!STATE_PATTERN.test(request.state) || phase === 'working') return;
    setPhase('working');
    setMessage('');
    setStatus('Waiting for your passkey…');
    try {
      const optionsPath = registration
        ? '/api/auth/passkeys/desktop/register/options'
        : '/api/auth/passkeys/desktop/login/options';
      const ceremony = await passkeyRequest(apiUrl(optionsPath), { body: { state: request.state } });
      if (!ceremony?.ceremonyId || !ceremony?.options) throw new Error('The workspace returned an invalid passkey request.');
      let credential;
      try {
        credential = registration
          ? await startRegistration({ optionsJSON: ceremony.options })
          : await startAuthentication({ optionsJSON: ceremony.options });
      } catch (error) {
        throw passkeyCeremonyError(error, registration ? 'Passkey setup was cancelled or timed out.' : 'Passkey sign in was cancelled or timed out.');
      }
      setStatus('Verifying with the workspace…');
      const verifyPath = registration
        ? '/api/auth/passkeys/desktop/register/verify'
        : '/api/auth/passkeys/desktop/login/verify';
      let result = await passkeyRequest(apiUrl(verifyPath), {
        body: { state: request.state, ceremonyId: ceremony.ceremonyId, response: credential }
      });
      for (let attempt = 0; result?.replacementPending && attempt < 12; attempt += 1) {
        setStatus('Signing out the other session…');
        const retryAfter = Number(result.retryAfter);
        await wait(Math.max(250, Math.min(1500, (Number.isFinite(retryAfter) ? retryAfter : 500))));
        result = await passkeyRequest(apiUrl('/api/auth/passkeys/desktop/login/continue'), {
          body: { state: request.state }
        });
      }
      if (result?.replacementPending) throw new Error('The other session did not sign out in time. Try again.');
      const nextCallback = validCallbackUrl(result?.callbackUrl, request.state);
      if (!nextCallback) throw new Error('The workspace returned an invalid passkey response.');
      setCallbackUrl(nextCallback);
      setStatus('');
      setPhase('complete');
    } catch (error) {
      setStatus('');
      setMessage(error?.message || 'The passkey request could not be completed.');
      setPhase('error');
    }
  };

  const heading = phase === 'complete'
    ? registration ? 'Passkey added' : 'Passkey verified'
    : registration ? 'Add a passkey to ARC Studio' : 'Finish signing in to ARC Studio';
  const description = phase === 'complete'
    ? 'Return to the ARC Studio desktop app to continue.'
    : registration
      ? 'The desktop app is waiting. Use Touch ID, Windows Hello, a phone, or a security key to add a passkey to this account.'
      : 'The desktop app is waiting. Use Touch ID, Windows Hello, a phone, or a security key to approve this sign in.';

  return <main className="auth-screen passkey-bridge-screen">
    <AuthGridCanvas reducedMotion={reducedMotion} />
    <div className="auth-backdrop" aria-hidden="true"><span /><span /><span /></div>
    <div className="auth-layout passkey-bridge-layout">
      <section className="auth-intro" aria-label="ARC Studio">
        <div className="auth-intro-brand"><img src="/arc.png" alt="" /><span>ARC <b>STUDIO</b></span></div>
        <div className="auth-intro-copy"><h1>One quick check to connect your desktop.</h1></div>
      </section>
      <section className="auth-card passkey-bridge-card" aria-labelledby="passkey-bridge-title">
        <div className="passkey-bridge-icon" aria-hidden="true">
          {phase === 'complete' ? <ShieldCheck size={22} /> : phase === 'error' || phase === 'invalid' ? <TriangleAlert size={22} /> : <Fingerprint size={22} />}
        </div>
        <span className="auth-kicker">PASSKEY</span>
        <h1 id="passkey-bridge-title">{phase === 'invalid' ? 'This link cannot be used' : heading}</h1>
        <p className="passkey-bridge-description">
          {phase === 'invalid'
            ? 'Open ARC Studio and start the passkey request again from the sign in screen.'
            : description}
        </p>

        {phase === 'working' && <div className="passkey-bridge-status" role="status"><LoaderCircle size={16} className="is-spinning" /><span>{status}</span></div>}
        {message && <p className="form-error" role="alert">{message}</p>}

        {phase === 'ready' && <button className="auth-submit" type="button" onClick={finish}>
          {registration ? 'Add passkey' : 'Continue with passkey'} <ArrowRight size={16} />
        </button>}

        {phase === 'error' && <button className="auth-submit" type="button" onClick={finish}>
          Try again <ArrowRight size={16} />
        </button>}

        {phase === 'complete' && <a className="auth-submit passkey-bridge-return" href={callbackUrl}>
          Return to ARC Studio <ArrowRight size={16} />
        </a>}

        <p className="passkey-bridge-note">ARC never receives your fingerprint, face, or device PIN. This browser only shares a signed confirmation with the workspace.</p>
      </section>
    </div>
  </main>;
}
