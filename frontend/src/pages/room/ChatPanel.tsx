/**
 * ChatPanel — collapsible right-side chat sidebar.
 *
 * Layout only. All data logic lives in useChatMessages.
 */

import { useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { formatMessageTime } from '@/hooks/useChatMessages';
import type { ChatMessage } from '@/hooks/useChatMessages';

// ── Sub-components ────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
      <span className="text-xs text-neutral-600 mb-0.5 px-1">
        {msg.isMe ? 'You' : msg.displayName}
      </span>
      <div
        className={`max-w-[90%] px-3 py-2 rounded-2xl text-sm break-words ${msg.isMe
          ? 'bg-neutral-200 text-neutral-950 rounded-br-sm font-medium'
          : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
          }`}
      >
        {msg.message}
      </div>
      <span className="text-[10px] text-neutral-700 mt-0.5 px-1">
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
    <div className="shrink-0 px-3 py-3 border-t border-neutral-900">
      <div className="flex items-center gap-2 bg-neutral-900 rounded-xl px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          maxLength={500}
          className="flex-1 bg-transparent text-sm text-white placeholder-neutral-600 outline-none"
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); handleSend(); }}
          disabled={!input.trim()}
          className="text-neutral-300 hover:text-white disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors shrink-0"
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
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}

const MAX_VISIBLE = 100;

export function ChatPanel({ messages, onSend, onClose }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleMessages = useMemo(
    () => (messages.length > MAX_VISIBLE ? messages.slice(-MAX_VISIBLE) : messages),
    [messages],
  );

  const prevLenRef = useRef(0);
  if (messages.length !== prevLenRef.current) {
    prevLenRef.current = messages.length;
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  return (
    <div className="w-80 bg-neutral-950 border-l border-neutral-900 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-900 shrink-0">
        <span className="text-white font-medium text-sm">Chat</span>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-white transition-colors rounded p-0.5"
          aria-label="Close chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-neutral-700 text-sm text-center mt-8">No messages yet. Say hi!</p>
        ) : (
          <>
            {messages.length > MAX_VISIBLE && (
              <p className="text-neutral-700 text-xs text-center py-1">
                Showing last {MAX_VISIBLE} of {messages.length} messages
              </p>
            )}
            {visibleMessages.map((msg) => <ChatBubble key={msg.eventId} msg={msg} />)}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} />
    </div>
  );
}
