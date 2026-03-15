/**
 * ChatPanel — collapsible right-side chat sidebar.
 *
 * Layout only. All data logic lives in useChatMessages.
 */

import { useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import type { DbConnection } from '@/module_bindings';
import { useChatMessages, formatMessageTime } from '@/hooks/useChatMessages';
import type { ChatMessage } from '@/hooks/useChatMessages';

// ── Sub-components ────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
      <span className="text-xs text-gray-500 mb-0.5 px-1">
        {msg.isMe ? 'You' : msg.displayName}
      </span>
      <div
        className={`max-w-[90%] px-3 py-2 rounded-2xl text-sm break-words ${
          msg.isMe
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-800 text-gray-100 rounded-bl-sm'
        }`}
      >
        {msg.message}
      </div>
      <span className="text-[10px] text-gray-600 mt-0.5 px-1">
        {formatMessageTime(msg.timestamp)}
      </span>
    </div>
  );
}

function ChatInput({
  onSend,
}: {
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="shrink-0 px-3 py-3 border-t border-gray-800">
      <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          maxLength={500}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors shrink-0"
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ChatPanelProps {
  db: DbConnection | null;
  roomId: bigint | null;
  myDisplayName: string;
  onClose: () => void;
  onNewMessage?: () => void;
}

const MAX_VISIBLE = 100;

export function ChatPanel({ db, roomId, myDisplayName, onClose, onNewMessage }: ChatPanelProps) {
  const { messages, send } = useChatMessages({ db, roomId, myDisplayName, onNewMessage });
  const bottomRef = useRef<HTMLDivElement>(null);

  // Only render the last MAX_VISIBLE messages to avoid DOM bloat.
  const visibleMessages = useMemo(
    () => (messages.length > MAX_VISIBLE ? messages.slice(-MAX_VISIBLE) : messages),
    [messages],
  );

  // Auto-scroll whenever messages change
  const prevLenRef = useRef(0);
  if (messages.length !== prevLenRef.current) {
    prevLenRef.current = messages.length;
    // Schedule after paint so the new message node exists
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <span className="text-white font-medium text-sm">Chat</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors rounded p-0.5"
          aria-label="Close chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-gray-600 text-sm text-center mt-8">No messages yet. Say hi!</p>
        ) : (
          <>
            {messages.length > MAX_VISIBLE && (
              <p className="text-gray-600 text-xs text-center py-1">
                Showing last {MAX_VISIBLE} of {messages.length} messages
              </p>
            )}
            {visibleMessages.map((msg) => <ChatBubble key={msg.eventId} msg={msg} />)}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={send} />
    </div>
  );
}
