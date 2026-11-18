import React, {useState} from 'react';
import {CheckCircle2, RefreshCw, X} from 'lucide-react';
import {applyPwaUpdate, dismissPwaNotice, usePwaState} from '../lib/pwaUpdate';

/**
 * Non-blocking notices for service-worker events. Sits above the mobile bottom
 * navigation. An update is only applied when the user taps "Update now".
 */
export const PwaUpdatePrompt: React.FC = () => {
  const {needRefresh, offlineReady} = usePwaState();
  const [updating, setUpdating] = useState(false);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 md:bottom-4 z-50 flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#183B2B] text-white shadow-xl p-4 flex items-start gap-3">
        {needRefresh ? (
          <RefreshCw className="w-5 h-5 mt-0.5 text-[#F5B942] shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-5 h-5 mt-0.5 text-[#F5B942] shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1 space-y-2">
          {needRefresh ? (
            <>
              <p className="text-sm font-semibold">A new version of the app is ready.</p>
              <p className="text-xs text-white/80">
                Update now to get the latest guides and fixes. Your downloads and saved drafts are kept.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    setUpdating(true);
                    void applyPwaUpdate().finally(() => setUpdating(false));
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-[#F5B942] text-[#183B2B] text-sm font-bold disabled:opacity-60"
                >
                  {updating ? 'Updating…' : 'Update now'}
                </button>
                <button
                  type="button"
                  onClick={() => dismissPwaNotice('needRefresh')}
                  className="min-h-[44px] px-3 rounded-xl border border-white/30 text-sm font-semibold"
                >
                  Later
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold">
              The app is ready to work offline. Guides you download will stay available without internet.
            </p>
          )}
        </div>
        {!needRefresh && (
          <button
            type="button"
            onClick={() => dismissPwaNotice('offlineReady')}
            aria-label="Dismiss"
            className="min-h-[44px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
