import React, {useEffect, useRef} from 'react';
import {AlertTriangle} from 'lucide-react';

interface Props {
  title: string;
  /** Plain-language consequences, shown before the farmer can confirm. */
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red styling for actions that cannot be undone. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Accessible confirmation. Cancel has focus first, so a stray tap or Enter never deletes. */
export const ConfirmDialog: React.FC<Props> = ({title, children, confirmLabel, cancelLabel = 'Keep it', danger = true, onConfirm, onCancel}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl">
        <h2 id="confirm-title" className="font-display text-xl font-extrabold text-[#183B2B] flex items-start gap-2">
          <AlertTriangle className={`w-6 h-6 shrink-0 ${danger ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
          {title}
        </h2>
        <div className="text-sm text-[#183B2B]/90 space-y-2">{children}</div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[52px] px-6 rounded-2xl border-2 border-[#183B2B]/25 bg-white text-[#183B2B] text-base font-bold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[52px] px-6 rounded-2xl text-white text-base font-bold ${danger ? 'bg-red-700' : 'bg-[#16803C]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
