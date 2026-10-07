import React from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface PdfDossierModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

// Everything in the dossier comes from the source: metadata from the feed,
// key points and dated sentences quoted from the document.
export const PdfDossierModal: React.FC<PdfDossierModalProps> = ({ notice, onClose }) => {
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
      `Date in source: ${notice.statutoryDeadline || 'None found'}`,
      `Impact score (heuristic by document type): ${notice.impactScore}/10`,
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
    ['Date in Source', notice.statutoryDeadline || 'None found']
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">description</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                Notice Dossier
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                {notice.ref} • {notice.regulator}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#0D5C63] hover:bg-[#09454A] text-white text-[12px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Download .txt</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-[#857F74] hover:text-[#1E1B18] hover:bg-[#EAE4D7] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-[#FAF7F2] font-['Inter'] space-y-5">
          <div className="border-b-2 border-[#E5DFD5] pb-4 flex justify-between items-start gap-4">
            <div>
              <h1 className="font-['Hanken_Grotesk'] text-[20px] font-bold text-[#1E1B18] leading-snug">
                {notice.title}
              </h1>
              <p className="font-['JetBrains_Mono'] text-[12px] text-[#57534E] mt-1">
                {notice.regulator} • {notice.jurisdiction}
              </p>
            </div>
            <div className="text-right shrink-0 bg-[#FFFFFF] border border-[#E5DFD5] p-2.5 rounded shadow-2xs" title="Heuristic by document type, not a legal assessment">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Impact (heuristic)
              </span>
              <span className="font-['JetBrains_Mono'] text-[20px] font-bold text-[#0D5C63]">
                {notice.impactScore}/10
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-[#E5DFD5]">
            {meta.map(([label, value]) => (
              <div key={label}>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">{label}</span>
                <span className="font-['JetBrains_Mono'] text-[12px] text-[#1E1B18] font-bold break-words">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 text-[13px] text-[#44403C] leading-relaxed">
            {notice.summary && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#0D5C63]">
                  Source Summary
                </h4>
                <p>{notice.summary}</p>
              </section>
            )}

            {keyPoints && keyPoints.points.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#0D5C63]">
                  Key Points, Quoted from Source
                </h4>
                {keyPoints.ocr && (
                  <p className="text-[12px] text-[#B45309] mb-2">
                    This document is a scanned PDF. Its text was read by OCR, so quotes may contain recognition errors; check them against the document.
                  </p>
                )}
                <ul className="space-y-2">
                  {keyPoints.points.map((pt, i) => (
                    <li key={i} className="border-l-2 border-[#B2DFDB] pl-3 italic">{pt}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.facts.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#0D5C63]">
                  Dated Statements
                </h4>
                <ul className="space-y-2">
                  {keyPoints.facts.map((f, i) => (
                    <li key={i} className="border-l-2 border-[#FDE68A] pl-3 italic">{f.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.refs.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#0D5C63]">
                  References Mentioned
                </h4>
                <p className="font-['JetBrains_Mono'] text-[12px]">{keyPoints.refs.join(', ')}</p>
              </section>
            )}

            {!notice.summary && !keyPoints && (
              <p className="text-[#857F74]">No text could be extracted from the source for this notice. Open the source document for details.</p>
            )}
          </div>
        </div>

        <div className="p-3 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-[#857F74]">
          <span>Key points are extractive: sentences quoted from the document{keyPoints?.ocr ? ', read by OCR' : ''}.</span>
          {notice.dossierUrl && (
            <a href={notice.dossierUrl} target="_blank" rel="noopener noreferrer" className="text-[#0D5C63] font-bold hover:underline shrink-0 ml-3">
              Open source document ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
