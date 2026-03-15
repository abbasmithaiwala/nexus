import type { ReactNode } from 'react';

export interface MediaToggleButtonProps {
  active: boolean;
  /** Icon to render — caller switches between on/off icons as needed. */
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function MediaToggleButton({ active, icon, label, onClick, disabled }: MediaToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white ${active ? 'bg-gray-700/80 hover:bg-gray-600/80' : 'bg-red-600/90 hover:bg-red-500/90'}`}
    >
      {icon}
    </button>
  );
}
