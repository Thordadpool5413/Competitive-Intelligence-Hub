'use client';

import { useEffect } from 'react';

const legacyKeys = [
  'andwellReports',
  'andwellReport',
  'andwellCompetitiveReports',
  'competitiveIntelligenceReports'
];

export default function StorageCleanup() {
  useEffect(() => {
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
