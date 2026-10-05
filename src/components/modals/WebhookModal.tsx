import React, { useState } from 'react';

interface WebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WebhookModal: React.FC<WebhookModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [slackWebhookUrl, setSlackWebhookUrl] = useState('https://hooks.slack.com/services/T012345/B067890/abc123def456');
  const [grcEndpoint, setGrcEndpoint] = useState('https://grc-api.regsonar.internal/v1/statutory-events');
  const [minThreshold, setMinThreshold] = useState('8.0');
  const [testSent, setTestSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSendTestPayload = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">webhook</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                Configure Webhooks &amp; Enterprise Pipeline Sync
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                Real-time delivery to Slack, Teams, PagerDuty, and Internal GRC Registrars
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#857F74] hover:text-[#1E1B18] hover:bg-[#EAE4D7] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 font-['Inter'] space-y-4 text-[13px] bg-[#FAF7F2]">
          <div>
            <label className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] block mb-1 font-medium">
              Slack Incoming Webhook URL
            </label>
            <input
              type="text"
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#E5DFD5] px-3 py-2 rounded text-[#1E1B18] font-['JetBrains_Mono'] text-[12px] focus:outline-none focus:border-[#0D5C63]"
            />
          </div>

          <div>
            <label className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] block mb-1 font-medium">
              Internal Legal / GRC Webhook Destination
            </label>
            <input
              type="text"
              value={grcEndpoint}
              onChange={(e) => setGrcEndpoint(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#E5DFD5] px-3 py-2 rounded text-[#1E1B18] font-['JetBrains_Mono'] text-[12px] focus:outline-none focus:border-[#0D5C63]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] block mb-1 font-medium">
                Minimum Trigger Score
              </label>
              <select
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E5DFD5] px-3 py-2 rounded text-[#1E1B18] text-[12px] focus:outline-none focus:border-[#0D5C63]"
              >
                <option value="9.0">Score ≥ 9.0 (Critical Emergency Only)</option>
                <option value="8.0">Score ≥ 8.0 (High Urgency &amp; Enforcement)</option>
                <option value="7.0">Score ≥ 7.0 (All Material Consultations)</option>
              </select>
            </div>

            <div>
              <label className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] block mb-1 font-medium">
                Payload Format
              </label>
              <div className="px-3 py-2 bg-[#FFFFFF] border border-[#E5DFD5] rounded text-[#1E1B18] font-['JetBrains_Mono'] text-[12px]">
                JSON (Schema v2.4 Compliant)
              </div>
            </div>
          </div>

          {/* Test Payload Button */}
          <div className="pt-2">
            <button
              onClick={handleSendTestPayload}
              disabled={isSending}
              className="px-4 py-2 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D8D0C2] text-[#1E1B18] rounded font-semibold text-[12px] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-base text-[#0D5C63]">
                {isSending ? 'hourglass_top' : 'send'}
              </span>
              <span>{isSending ? 'Dispatching Ping...' : 'Send Live Test Event Payload'}</span>
            </button>

            {testSent && (
              <p className="text-[#15803D] font-['JetBrains_Mono'] text-[11px] mt-2 flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                200 OK — Test webhook payload delivered to Slack channel #legal-regsonar-wire.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
            Mutual TLS 1.3 / HMAC-SHA256 Signing Active
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0D5C63] text-white text-[12px] font-semibold rounded hover:bg-[#0A474D] transition-colors shadow-xs"
          >
            Save &amp; Activate
          </button>
        </div>
      </div>
    </div>
  );
};
