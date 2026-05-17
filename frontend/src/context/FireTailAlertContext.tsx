import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type FireTailMode = 'normal' | 'wicket';

interface FireTailAlertContextType {
  mode: FireTailMode;
  /**
   * Trigger a 10-second "wicket" pulse — LogoFireTail will spin fast (5s per revolution)
   * and switch to all-red dots. Auto-reverts to normal (rainbow, 30s) afterwards.
   */
  triggerWicketAlert: () => void;
}

const FireTailAlertContext = createContext<FireTailAlertContextType | null>(null);

const WICKET_PULSE_MS = 10_000; // User-requested: stay red-fast for 10s

export const FireTailAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<FireTailMode>('normal');
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerWicketAlert = useCallback(() => {
    // Restart the 10-second window every time a new wicket fires — that way
    // two wickets in the same over extend the alert rather than truncating it.
    if (revertTimerRef.current) {
      clearTimeout(revertTimerRef.current);
      revertTimerRef.current = null;
    }
    setMode('wicket');
    revertTimerRef.current = setTimeout(() => {
      setMode('normal');
      revertTimerRef.current = null;
    }, WICKET_PULSE_MS);
  }, []);

  return (
    <FireTailAlertContext.Provider value={{ mode, triggerWicketAlert }}>
      {children}
    </FireTailAlertContext.Provider>
  );
};

export const useFireTailAlert = (): FireTailAlertContextType => {
  const ctx = useContext(FireTailAlertContext);
  // Safe default when used outside the provider (e.g., during tests)
  if (!ctx) return { mode: 'normal', triggerWicketAlert: () => {} };
  return ctx;
};
