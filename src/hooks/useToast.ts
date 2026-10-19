import { useState } from 'react';

// A short confirmation message, cleared after 2.5 seconds unless replaced
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => (current === message ? null : current)), 2500);
  };
  return { toast, showToast };
}
