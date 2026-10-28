import { useState, type KeyboardEvent } from 'react';

type AddCardProps = {
  label: string;
  placeholder: string;
  onAdd: (text: string) => void;
  className?: string;
};

/** "+ Add" button that turns into an input; stays open after Enter for rapid entry. */
export function AddCard({ label, placeholder, onAdd, className = '' }: AddCardProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const submit = () => {
    const text = draft?.trim();
    if (text) onAdd(text);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setDraft(null);
    }
  };

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft('')}
        className={`w-full rounded-md border border-dashed border-stone-300 px-3 py-2 text-left text-sm text-stone-500 hover:border-stone-400 hover:bg-white/60 hover:text-stone-700 ${className}`}
      >
        + {label}
      </button>
    );
  }

  return (
    <textarea
      autoFocus
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (draft.trim()) onAdd(draft.trim());
        setDraft(null);
      }}
      className={`field-sizing-content block w-full resize-none rounded-md border border-stone-300 bg-white p-2 text-sm outline-2 outline-sky-500 ${className}`}
    />
  );
}
