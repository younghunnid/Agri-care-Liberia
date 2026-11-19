import React from 'react';
import {CheckCircle2, Clock, FlaskConical, PencilLine} from 'lucide-react';
import {STATUS_LABELS, type StatusKind} from '../lib/statusLabels';

const STYLE: Record<StatusKind, {cls: string; Icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>}> = {
  working: {cls: 'bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/40', Icon: CheckCircle2},
  simulated: {cls: 'bg-sky-50 text-sky-900 border-sky-300', Icon: FlaskConical},
  draft: {cls: 'bg-amber-50 text-amber-900 border-amber-300', Icon: PencilLine},
  future: {cls: 'bg-slate-100 text-slate-700 border-slate-300', Icon: Clock},
};

/** Small pill that states plainly whether something is working, simulated, an unreviewed draft or a future feature. */
export const StatusLabel: React.FC<{kind: StatusKind; className?: string; text?: string}> = ({kind, className = '', text}) => {
  const {cls, Icon} = STYLE[kind];
  return (
    <span
      data-status={kind}
      title={STATUS_LABELS[kind].long}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      <span>{text ?? STATUS_LABELS[kind].short}</span>
    </span>
  );
};
