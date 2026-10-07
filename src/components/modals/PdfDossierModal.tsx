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
      <div className="bg-[#FBFCFA] border border-[#C5D2CA] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-[#E3EBE6] border-b border-[#D3DDD7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1F4E79] text-2xl">description</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1D2630] font-bold">
                Notice Dossier
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
                {notice.ref} • {notice.regulator}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#1F4E79] hover:bg-[#163A5C] text-white text-[12px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Download .txt</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-[#56636B] hover:text-[#1D2630] hover:bg-[#DCE4DF] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-[#EEF3EF] font-['Inter'] space-y-5">
          <div className="border-b-2 border-[#D3DDD7] pb-4 flex justify-between items-start gap-4">
            <div>
              <h1 className="font-['Hanken_Grotesk'] text-[20px] font-bold text-[#1D2630] leading-snug">
                {notice.title}
              </h1>
              <p className="font-['JetBrains_Mono'] text-[12px] text-[#3C4852] mt-1">
                {notice.regulator} • {notice.jurisdiction}
              </p>
            </div>
            <div className="text-right shrink-0 bg-[#FBFCFA] border border-[#D3DDD7] p-2.5 rounded shadow-2xs" title="Heuristic by document type, not a legal assessment">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] uppercase block">
                Impact (heuristic)
              </span>
              <span className="font-['JetBrains_Mono'] text-[20px] font-bold text-[#1F4E79]">
                {notice.impactScore}/10
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-[#D3DDD7]">
            {meta.map(([label, value]) => (
              <div key={label}>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] uppercase block">{label}</span>
                <span className="font-['JetBrains_Mono'] text-[12px] text-[#1D2630] font-bold break-words">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 text-[13px] text-[#3C4852] leading-relaxed">
            {notice.summary && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#1F4E79]">
                  Source Summary
                </h4>
                <p>{notice.summary}</p>
              </section>
            )}

            {keyPoints && keyPoints.points.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#1F4E79]">
                  Key Points, Quoted from Source
                </h4>
                {keyPoints.ocr && (
                  <p className="text-[12px] text-[#6E5410] mb-2">
                    This document is a scanned PDF. Its text was read by OCR, so quotes may contain recognition errors; check them against the document.
                  </p>
                )}
                <ul className="space-y-2">
                  {keyPoints.points.map((pt, i) => (
                    <li key={i} className="border-l-2 border-[#B3C8D9] pl-3 italic">{pt}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.facts.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#1F4E79]">
                  Dated Statements
                </h4>
                <ul className="space-y-2">
                  {keyPoints.facts.map((f, i) => (
                    <li key={i} className="border-l-2 border-[#DCC68A] pl-3 italic">{f.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.refs.length > 0 && (
              <section>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-[#1F4E79]">
                  References Mentioned
                </h4>
                <p className="font-['JetBrains_Mono'] text-[12px]">{keyPoints.refs.join(', ')}</p>
              </section>
            )}

            {!notice.summary && !keyPoints && (
              <p className="text-[#56636B]">No text could be extracted from the source for this notice. Open the source document for details.</p>
            )}
          </div>
        </div>

        <div className="p-3 bg-[#E3EBE6] border-t border-[#D3DDD7] flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-[#56636B]">
          <span>Key points are extractive: sentences quoted from the document{keyPoints?.ocr ? ', read by OCR' : ''}.</span>
          {notice.dossierUrl && (
            <a href={notice.dossierUrl} target="_blank" rel="noopener noreferrer" className="text-[#1F4E79] font-bold hover:underline shrink-0 ml-3">
              Open source document ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
