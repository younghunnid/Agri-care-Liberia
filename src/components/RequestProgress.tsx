import React from 'react';
import {CheckCircle2, Circle} from 'lucide-react';
import {STEP_LABELS, describeStatus} from '../lib/expertStatus';

/** Three-step tracker (Sent, With an expert, Answered). Text and icons, never colour alone. */
export const RequestProgress: React.FC<{status: string}> = ({status}) => {
  const info = describeStatus(status);
  return (
    <div data-testid="request-progress" data-step={info.step}>
      <p className="text-sm font-extrabold text-[#183B2B]">Status: <span data-testid="status-label">{info.label}</span></p>
      <ol className="mt-1 flex flex-wrap gap-x-4 gap-y-1" aria-label="Request progress">
        {STEP_LABELS.map((l, i) => {
          const done = i + 1 <= info.step;
          return (
            <li key={l} aria-current={i + 1 === info.step ? 'step' : undefined} className={`inline-flex items-center gap-1 text-sm ${done ? 'font-bold text-[#0F5C2A]' : 'text-[#183B2B]/70'}`}>
              {done ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <Circle className="w-4 h-4" aria-hidden />}{l}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-[#183B2B]/70 mt-1">{info.hint}</p>
    </div>
  );
};
