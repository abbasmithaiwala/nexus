/**
 * ChatPanel — collapsible right-side chat sidebar.
 * (Coming Soon)
 */

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-white font-medium text-sm">Chat</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xs transition-colors"
        >
          Close
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Chat (Coming Soon)</p>
      </div>
    </div>
  );
}
