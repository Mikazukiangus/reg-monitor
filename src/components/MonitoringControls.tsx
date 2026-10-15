import React, { useEffect, useState } from 'react';
import { useDialog } from './useDialog';
import { readSavedViews, writeSavedViews, type SavedView } from '../lib/preferences';

interface Props {
  query: string;
  dateFrom: string;
  dateTo: string;
  onDates: (from: string, to: string) => void;
  onlySaved: boolean;
  savedCount: number;
  onToggleSaved: () => void;
  onApply: (query: string) => void;
  onMessage: (message: string) => void;
}
export function MonitoringControls({ query, dateFrom, dateTo, onDates, onlySaved, savedCount, onToggleSaved, onApply, onMessage }: Props) {
  const [views, setViews] = useState(readSavedViews);
  const [selected, setSelected] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (selected && views.find(v => v.id === selected)?.query !== query) setSelected('');
  }, [query, selected, views]);
  const dialogRef = useDialog<HTMLDivElement>(isOpen, () => setIsOpen(false));
  const persist = (next: SavedView[]) => {
    if (!writeSavedViews(next)) { onMessage('This browser could not save your views'); return false; }
    setViews(next);
    return true;
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (views.length >= 30) { onMessage('Remove a saved view before adding another (limit 30)'); return; }
    const view = { id: crypto.randomUUID(), name: trimmed, query };
    if (persist([...views, view])) { setSelected(view.id); setIsOpen(false); onMessage('View saved on this device'); }
  };
  return <>
    <div className="bg-panel border border-line rounded-lg p-3 flex flex-wrap items-end gap-3 text-[12px]">
      <label className="min-w-0 text-muted">Published from
        <input aria-label="Published from" type="date" value={dateFrom} max={dateTo || undefined} onInput={e => onDates(e.currentTarget.value, dateTo)} onChange={e => onDates(e.target.value, dateTo)} className="block mt-1 bg-page border border-line rounded px-2 min-h-9 text-ink max-w-full" />
      </label>
      <label className="min-w-0 text-muted">Published to
        <input aria-label="Published to" type="date" value={dateTo} min={dateFrom || undefined} onInput={e => onDates(dateFrom, e.currentTarget.value)} onChange={e => onDates(dateFrom, e.target.value)} className="block mt-1 bg-page border border-line rounded px-2 min-h-9 text-ink max-w-full" />
      </label>
      {(dateFrom || dateTo) && <button onClick={() => onDates('', '')} className="min-h-9 text-accent hover:underline">Clear dates</button>}
      <button onClick={onToggleSaved} aria-pressed={onlySaved} className={`min-h-9 px-3 rounded border ${onlySaved ? 'bg-accent text-on-accent border-accent' : 'text-ink border-line hover:bg-wash'}`}>Saved notices ({savedCount})</button>
      <label className="text-muted min-w-0 flex-1 basis-40">Saved views
        <select aria-label="Saved views" value={selected} onChange={e => { setSelected(e.target.value); const view = views.find(v => v.id === e.target.value); if (view) onApply(view.query); }} className="block w-full min-w-0 max-w-full mt-1 bg-page border border-line rounded px-2 min-h-9 text-ink">
          <option value="">Choose a view</option>
          {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <button onClick={() => { setName(''); setIsOpen(true); }} className="min-h-9 px-3 border border-line rounded text-accent hover:bg-wash">Save view</button>
      {selected && <button onClick={() => { if (persist(views.filter(v => v.id !== selected))) setSelected(''); }} className="min-h-9 text-muted hover:text-ink" aria-label="Remove selected saved view">Remove view</button>}
      <p className="w-full text-[11px] text-muted">Dates filter the loaded feed and search results. Saved notices and views stay on this device.</p>
    </div>
    {isOpen && <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="save-view-title" tabIndex={-1} className="bg-panel border border-line rounded-xl p-5 w-full max-w-sm focus:outline-none">
        <h2 id="save-view-title" className="text-ink font-bold mb-3">Save this monitoring view</h2>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-muted text-[12px]">View name<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border border-line bg-page text-ink rounded px-3 py-2" /></label>
          <div className="flex justify-end gap-3 text-[12px]"><button type="button" onClick={() => setIsOpen(false)} className="text-muted px-3 py-2">Cancel</button><button type="submit" className="bg-accent text-on-accent rounded px-3 py-2">Save</button></div>
        </form>
      </div>
    </div>}
  </>;
}
