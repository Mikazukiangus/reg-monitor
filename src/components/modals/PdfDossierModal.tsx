import React from 'react';
import { useDialog } from '../useDialog';
import { RegulatoryNotice } from '../../types/regulatory';

interface PdfDossierModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

// Everything in the dossier comes from the source: metadata from the feed,
// key points and dated sentences quoted from the document.
export const PdfDossierModal: React.FC<PdfDossierModalProps> = ({ notice, onClose }) => {
  const dialogRef = useDialog<HTMLDivElement>(!!notice, onClose);
  if (!notice) return null;

  const published = notice.publishedAt ? new Date(notice.publishedAt).toUTCString().slice(5, 16) : 'Unknown';
  const keyPoints = notice.keyPoints;

  const handleDownload = () => {
    const lines = [
      `REGSONAR NOTICE DOSSIER`,
      ``,
      `Title: ${notice.title}`,
      `Regulator: ${notice.regulator} (${notice.jurisdiction})`,
      `Reference: ${notice.ref}`,
      `Type: ${notice.type}`,
      `Published: ${published}`,
      `Key date: ${notice.statutoryDeadline || 'None found'}${notice.deadlineQuote ? ` (from: "${notice.deadlineQuote}")` : ''}`,
      `Impact score (rubric by document kind and dates): ${notice.impactScore.toFixed(1)}/10${notice.tagging?.impact ? ` (${notice.tagging.impact.join('; ')})` : ''}`,
      `Source: ${notice.dossierUrl || 'n/a'}`,
      ``,
      ...(notice.summary ? [`SOURCE SUMMARY`, notice.summary, ``] : []),
      ...(keyPoints?.ocr ? [`NOTE: the source is a scanned PDF read by OCR; quotes may contain recognition errors.`, ``] : []),
      ...(keyPoints?.points.length ? [`KEY POINTS (quoted verbatim from the source document)`, ...keyPoints.points.map(p => `- "${p}"`), ``] : []),
      ...(keyPoints?.facts.length ? [`DATED STATEMENTS (quoted)`, ...keyPoints.facts.map(f => `- "${f.text}"`), ``] : []),
      ...(keyPoints?.refs.length ? [`REFERENCES MENTIONED`, keyPoints.refs.join(', '), ``] : []),
      `Generated ${new Date().toISOString()} by RegSonar from public regulator publications.`
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RegSonar_Dossier_${notice.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const meta: [string, string][] = [
    ['Reference', notice.ref],
    ['Type', notice.type],
    ['Published', published],
    ['Key Date', notice.statutoryDeadline || 'None found']
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dossier-title" tabIndex={-1} className="focus:outline-none bg-panel border border-line-strong rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-wash border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-prussian text-2xl" aria-hidden="true">description</span>
            <div>
              <h2 id="dossier-title" className="font-['Hanken_Grotesk'] text-[17px] text-ink font-bold">
                Notice Dossier
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-muted">
                {notice.ref} • {notice.regulator}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-prussian hover:bg-prussian-deep text-on-accent text-[12px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
              <span>Download .txt</span>
            </button>
            <button
              onClick={onClose}
            aria-label="Close"
              className="p-1 rounded text-muted hover:text-ink hover:bg-wash-strong transition-colors"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        <div tabIndex={0} aria-label="Dossier contents" className="p-6 overflow-y-auto flex-1 bg-page font-['Inter'] space-y-5">
          <div className="border-b-2 border-line pb-4 flex justify-between items-start gap-4">
            <div>
              <h1 lang={notice.language} className="font-['Hanken_Grotesk'] text-[20px] font-bold text-ink leading-snug">
                {notice.title}
              </h1>
              <p className="font-['JetBrains_Mono'] text-[12px] text-ink-soft mt-1">
                {notice.regulator} • {notice.jurisdiction}
              </p>
            </div>
            <div className="text-right shrink-0 bg-panel border border-line p-2.5 rounded shadow-2xs" title={notice.tagging?.impact ? `${notice.tagging.impact.join("; ")}. A rubric, not a legal assessment.` : "A rubric by document kind and dates, not a legal assessment"}>
              <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase block">
                Impact (rubric)
              </span>
              <span className="font-['JetBrains_Mono'] text-[20px] font-bold text-prussian">
                {notice.impactScore.toFixed(1)}/10
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-line">
            {meta.map(([label, value]) => (
              <div key={label}>
                <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase block">{label}</span>
                <span className="font-['JetBrains_Mono'] text-[12px] text-ink font-bold break-words">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 text-[13px] text-ink-soft leading-relaxed">
            {notice.summary && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-prussian">
                  Source Summary
                </h2>
                <p>{notice.summary}</p>
              </section>
            )}

            {keyPoints && keyPoints.points.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-prussian">
                  Key Points, Quoted from Source
                </h2>
                {keyPoints.ocr && (
                  <p className="text-[12px] text-ochre mb-2">
                    This document is a scanned PDF. Its text was read by OCR, so quotes may contain recognition errors; check them against the document.
                  </p>
                )}
                <ul className="space-y-2">
                  {keyPoints.points.map((pt, i) => (
                    <li key={i} className="border-l-2 border-prussian-line pl-3 italic">{pt}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.facts.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-prussian">
                  Dated Statements
                </h2>
                <ul className="space-y-2">
                  {keyPoints.facts.map((f, i) => (
                    <li key={i} className="border-l-2 border-ochre-line pl-3 italic">{f.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.refs.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-prussian">
                  References Mentioned
                </h2>
                <p className="font-['JetBrains_Mono'] text-[12px]">{keyPoints.refs.join(', ')}</p>
              </section>
            )}

            {!notice.summary && !keyPoints && (
              <p className="text-muted">No text could be extracted from the source for this notice. Open the source document for details.</p>
            )}
          </div>
        </div>

        <div className="p-3 bg-wash border-t border-line flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-muted">
          <span>Key points are extractive: sentences quoted from the document{keyPoints?.ocr ? ', read by OCR' : ''}.</span>
          {notice.dossierUrl && (
            <a href={notice.dossierUrl} target="_blank" rel="noopener noreferrer" className="text-prussian font-bold hover:underline shrink-0 ml-3">
              Open source document ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
