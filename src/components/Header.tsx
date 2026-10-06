import React, { useState, useRef, useEffect } from 'react';
import { AlertNotification } from '../types/regulatory';
import { EndpointMetric } from './modals/LiveEndpointsModal';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedJurisdictionFilter: string;
  onJurisdictionFilterChange: (val: string) => void;
  onOpenExport: () => void;
  notifications: AlertNotification[];
  onSelectNotice: (noticeId: string) => void;
  onOpenEndpointsModal?: () => void;
  isSyncing?: boolean;
  onTriggerSync?: () => void;
  lastSyncTime?: string;
  endpoints?: EndpointMetric[];
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  selectedJurisdictionFilter,
  onJurisdictionFilterChange,
  onOpenExport,
  notifications,
  onSelectNotice,
  onOpenEndpointsModal,
  isSyncing = false,
  onTriggerSync,
  lastSyncTime,
  endpoints = []
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => n.unread).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const operationalCount = endpoints.filter(e => e.status === 'Operational').length;
  const checking = endpoints.some(e => e.status === 'Checking');
  const allOperational = !checking && operationalCount === endpoints.length;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E5DFD5] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-14 w-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              alt="RegSonar APAC Regulatory Logo"
              className="h-8 w-auto object-contain cursor-pointer"
              src="https://lh3.googleusercontent.com/aida/AEtjO1WqTvLdQl_IMZ0jnfuyfBhwV9yP0z46r_GR8vYW7is_oWJTWU6HbsT8TTRjAAFLrbFNEpdRuccJ5YYvVbXQ5x9Jvy_HkTSXxNmSJr4V8G2F3mUX6xsP-9vXPsc6S48uyKyv7vaa_jXGAZPTA8teELaSAylEEovWZ54H5ImXJnZ_KgTAOGWwp2onVP45wnA1t3vwu22Qvu_xrX6Le_L1rfImvOeYCoMqNwPeFVHb6TCq_mxP9qxZtk4jl1s"
              onClick={() => onJurisdictionFilterChange('All APAC')}
            />
            <div className="flex flex-col">
              <span className="font-['Hanken_Grotesk'] text-[19px] text-[#1E1B18] tracking-tight font-bold leading-none">
                RegSonar
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] tracking-wider uppercase mt-0.5 font-medium">
                Intelligence APAC &amp; Global
              </span>
            </div>
          </div>

          <div className="hidden xl:flex items-center ml-3">
            <select
              value={selectedJurisdictionFilter}
              onChange={(e) => onJurisdictionFilterChange(e.target.value)}
              className="bg-[#FFFFFF] border border-[#E5DFD5] text-[#44403C] font-['Inter'] text-[11px] font-semibold h-8 px-2.5 rounded-lg focus:outline-none focus:border-[#0D5C63] focus:text-[#1E1B18] cursor-pointer transition-colors shadow-xs"
            >
              <option value="All APAC">All APAC</option>
              <option value="Singapore MAS">Singapore MAS</option>
              <option value="Hong Kong HKMA/SFC">Hong Kong HKMA/SFC</option>
              <option value="Australia ASIC">Australia ASIC</option>
              <option value="Japan JFSA">Japan JFSA</option>
              <option value="Global Cross-Border">Global Cross-Border</option>
            </select>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-2xl mx-3 hidden md:block">
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-3 text-[#857F74] text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search loaded notices by title, regulator, reference or key point..."
              className="w-full h-9 pl-10 pr-10 bg-[#FFFFFF] border border-[#E5DFD5] text-[#1E1B18] placeholder:text-[#857F74] font-['Inter'] text-[12px] rounded-lg focus:outline-none focus:bg-[#FAF8F5] focus:border-[#0D5C63] transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 text-[#857F74] hover:text-[#1E1B18]"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Live Ingestion Indicator & Gateway Trigger */}
          <button
            onClick={onOpenEndpointsModal}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 border rounded-lg cursor-pointer transition-colors shadow-2xs ${
              allOperational
                ? 'bg-[#F0FDF4] hover:bg-[#DCFCE7] border-[#BBF7D0] text-[#15803D]'
                : 'bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]'
            }`}
            title="View monitored government endpoints and their current status"
          >
            <span className={`w-2 h-2 rounded-full ${allOperational ? 'bg-[#15803D]' : 'bg-[#B45309]'}`}></span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wide">
              {checking ? 'Checking Sources' : `${operationalCount}/${endpoints.length} Sources Up`}
            </span>
            <span className="material-symbols-outlined text-[13px] ml-0.5">
              sensors
            </span>
          </button>

          {/* Quick Manual Sync Button */}
          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2.5 h-8 bg-[#0D5C63] hover:bg-[#0A474D] text-white font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
              title="Poll live regulatory APIs for latest circulars and rules"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="hidden sm:inline">
                {isSyncing ? 'Syncing...' : 'Sync Feeds'}
              </span>
            </button>
          )}

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
              className="relative p-1.5 text-[#57534E] hover:text-[#1E1B18] bg-[#FFFFFF] hover:bg-[#F5F1E8] rounded-lg border border-[#E5DFD5] transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-xl">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#DC2626] text-white font-['JetBrains_Mono'] text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#FFFFFF] border border-[#D8D0C2] rounded-lg shadow-xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5DFD5]">
                  <span className="font-['Hanken_Grotesk'] text-[14px] font-semibold text-[#1E1B18] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]"></span>
                    Latest Notices
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74]">From live sources</span>
                </div>
                <div className="divide-y divide-[#E5DFD5] max-h-72 overflow-y-auto mt-1">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        onSelectNotice(n.linkId);
                        setShowNotifications(false);
                      }}
                      className="py-2 px-1.5 hover:bg-[#FAF8F5] rounded cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-['JetBrains_Mono'] font-bold text-[#0D5C63]">
                          {n.regulator}
                        </span>
                        <span className="font-['JetBrains_Mono'] text-[#857F74]">{n.time}</span>
                      </div>
                      <p className="font-['Inter'] text-[12px] text-[#1E1B18] line-clamp-2">
                        {n.title}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export Button */}
          <button
            onClick={onOpenExport}
            className="hidden sm:flex items-center gap-1.5 px-3 h-8 bg-[#FFFFFF] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#57534E] hover:text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Export</span>
          </button>

          {/* User Profile */}
          <div className="relative" ref={profileRef}>
            <div
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 pl-1 cursor-pointer group"
              title="Local session"
            >
              <span className="w-8 h-8 rounded-full shrink-0 ring-1 ring-[#E5DFD5] group-hover:ring-[#0D5C63] transition-all bg-[#F5F1E8] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#57534E] text-lg">person</span>
              </span>
            </div>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-[#FFFFFF] border border-[#D8D0C2] rounded-lg shadow-xl p-3 z-50 text-[12px]">
                <p className="font-semibold text-[#1E1B18]">Local session</p>
                <p className="text-[11px] text-[#57534E] mt-1 leading-relaxed">
                  RegSonar has no accounts or sign-in. Filters and watch rules live in this browser tab only.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
