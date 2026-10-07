import React from 'react';

// Marks the words being searched for, matching at the start of a word as the
// search itself does
export const Highlight: React.FC<{ text: string; terms?: string[] }> = ({ text, terms }) => {
  const words = (terms || []).map(t => t.trim()).filter(t => t.length > 1);
  if (words.length === 0) return <>{text}</>;
  const pattern = new RegExp(`\\b(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-ochre-tint text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

// Search box text to the words to look for
export const searchTerms = (query: string) => query.split(/\s+/).filter(w => w.length > 1);
