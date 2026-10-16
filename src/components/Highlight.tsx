import React from 'react';
import { createSearchPattern } from '../lib/search';

// Marks exactly the prefixes or native-script text the search matches.
export const Highlight: React.FC<{ text: string; terms?: string[] }> = ({ text, terms }) => {
  const words = (terms || []).map(t => t.trim()).filter(t => t.length > 1);
  if (words.length === 0) return <>{text}</>;
  const pattern = createSearchPattern(words, true);
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-cream-tint text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};
