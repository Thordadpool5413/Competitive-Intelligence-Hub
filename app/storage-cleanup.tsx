'use client';

import { useEffect } from 'react';

const legacyKeys = [
  'andwellReports',
  'andwellReport',
  'andwellCompetitiveReports',
  'competitiveIntelligenceReports'
];

function installJsonParseGuard() {
  if (typeof window === 'undefined') return;
  const marker = '__cihJsonParseGuardInstalled';
  const globalWindow = window as typeof window & { [marker]?: boolean };
  if (globalWindow[marker]) return;
  globalWindow[marker] = true;

  const originalParse = JSON.parse.bind(JSON);
  JSON.parse = ((value: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    try {
      return originalParse(value, reviver);
    } catch (error) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<')) {
        throw new Error('A server request returned HTML instead of JSON. This usually means Hostinger is serving a stale build, a fallback HTML page, or the app is not running through the Node.js server.js startup file. Redeploy from GitHub main, restart the Node app, then test /api/diagnostics and /api/analyze directly in the browser.');
      }
      throw error;
    }
  }) as typeof JSON.parse;
}

export default function StorageCleanup() {
  useEffect(() => {
    installJsonParseGuard();
    try {
      for (const key of legacyKeys) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Browser storage may be unavailable. The app does not require browser report storage.
    }
  }, []);

  return null;
}
