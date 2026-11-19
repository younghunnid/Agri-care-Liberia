import React from 'react';
import {CheckCircle2, Circle, PlayCircle} from 'lucide-react';
import type {LessonState} from '../lib/lessonProgress';

const MAP: Record<LessonState, {label: string; cls: string; Icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>}> = {
  not_started: {label: 'Not started', cls: 'bg-slate-100 text-slate-800 border-slate-300', Icon: Circle},
  in_progress: {label: 'In progress', cls: 'bg-amber-50 text-amber-900 border-amber-300', Icon: PlayCircle},
  completed: {label: 'Completed', cls: 'bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/40', Icon: CheckCircle2},
};

/** Text plus icon, never colour alone. */
export const LessonStateBadge: React.FC<{state: LessonState}> = ({state}) => {
  const {label, cls, Icon} = MAP[state];
  return (
    <span data-state={state} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
    </span>
  );
};
