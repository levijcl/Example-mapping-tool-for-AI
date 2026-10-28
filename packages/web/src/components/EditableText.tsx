import { useState, type KeyboardEvent } from 'react';

type EditableTextProps = {
  value: string;
  onSave: (text: string) => void;
  placeholder?: string;
  /** Whether saving an empty string is allowed (otherwise empty edits are discarded). */
  allowEmpty?: boolean;
  label: string;
  className?: string;
};

/** Click to edit. Enter or blur saves, Shift+Enter inserts a newline, Escape cancels. */
export function EditableText({
  value,
  onSave,
  placeholder = 'Click to edit',
  allowEmpty = false,
  label,
  className = '',
}: EditableTextProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === value || (!text && !allowEmpty)) return;
    onSave(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(null);
    }
  };

  if (draft !== null) {
    return (
      <textarea
        autoFocus
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.target.select()}
        className={`field-sizing-content block w-full resize-none rounded bg-white/80 p-1 outline-2 outline-sky-500 ${className}`}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${label}`}
      onClick={() => setDraft(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setDraft(value);
        }
      }}
      className={`cursor-text rounded p-1 whitespace-pre-wrap break-words hover:bg-white/50 ${
        value ? '' : 'text-stone-400 italic'
      } ${className}`}
    >
      {value || placeholder}
    </div>
  );
}
