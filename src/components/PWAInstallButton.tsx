import React, {useState} from 'react';
import {Download, Share2, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWA';

export const PWAInstallButton: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#16803C] text-white font-semibold hover:bg-[#116630] transition-colors min-h-[44px] whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-2 text-xs' : 'px-5 py-3 text-sm'
        }`}
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#16803C]/30 bg-white px-4 py-2 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0] transition-colors min-h-[44px] whitespace-nowrap shrink-0"
        >
          <Share2 className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
          Install on iPhone
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#183B2B]/10">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-install-title" className="font-display text-lg font-bold text-[#183B2B]">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#183B2B]/70 hover:bg-[#F3F8F0]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#183B2B]/85 list-decimal pl-5">
                <li>Tap the <strong>Share</strong> button in the Safari toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Open <strong>Agricare</strong> from your home screen to read saved guides offline.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
