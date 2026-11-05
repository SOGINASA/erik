import { api } from './api';
import { guestReturnTo } from './authReturnTo';

const KEY = 'erik-google-login';
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function startGoogleLogin(returnTo) {
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(KEY, JSON.stringify({ verifier, returnTo, createdAt: Date.now() }));
  window.location.assign(api.oauthStartUrl(challenge));
}

export function readGoogleLogin(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  try {
    if (params.has('error')) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (!saved || !Number.isFinite(saved.createdAt) || Date.now() - saved.createdAt > 20 * 60 * 1000) return null;
    const code = params.get('code') || saved.code;
    if (!/^[A-Za-z0-9_-]{43}$/.test(code || '') || !/^[A-Za-z0-9_-]{43}$/.test(saved.verifier || '')) return null;
    const result = { ...saved, code, returnTo: guestReturnTo(`?returnTo=${encodeURIComponent(saved.returnTo || '')}`) };
    sessionStorage.setItem(KEY, JSON.stringify(result));
    return result;
  } catch (_) {
    return null;
  }
}

export function clearGoogleLogin() {
  sessionStorage.removeItem(KEY);
}
