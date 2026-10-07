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
  // Phones have no room for the search box, so it opens below the header
  const [showMobileSearch, setShowMobileSearch] = useState(false);
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#EEF3EF]/95 backdrop-blur-md border-b border-[#D3DDD7] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="h-14 w-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              alt="RegSonar APAC Regulatory Logo"
              className="h-8 w-auto object-contain cursor-pointer"
              src="/icon-192.png"
              onClick={() => onJurisdictionFilterChange('All')}
            />
            <div className="flex flex-col">
              <span className="font-['Hanken_Grotesk'] text-[19px] text-[#1D2630] tracking-tight font-bold leading-none">
                RegSonar
              </span>
              <span className="hidden sm:block font-['JetBrains_Mono'] text-[10px] text-[#56636B] tracking-wider uppercase mt-0.5 font-medium">
                Intelligence APAC &amp; Global
              </span>
            </div>
          </div>

          <div className="hidden xl:flex items-center ml-3">
            <select
              value={selectedJurisdictionFilter}
              onChange={(e) => onJurisdictionFilterChange(e.target.value)}
              className="bg-[#FBFCFA] border border-[#D3DDD7] text-[#3C4852] font-['Inter'] text-[11px] font-semibold h-8 px-2.5 rounded-lg focus:outline-none focus:border-[#1F4E79] focus:text-[#1D2630] cursor-pointer transition-colors shadow-xs"
            >
              <option value="All">All jurisdictions</option>
              <option value="Singapore MAS">Singapore (MAS)</option>
              <option value="Hong Kong HKMA">Hong Kong (HKMA, SFC, HKEX)</option>
              <option value="Australia Japan">Australia &amp; Japan</option>
              <option value="UK US Global">UK, EU, US &amp; Global</option>
            </select>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-2xl mx-3 hidden md:block">
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-3 text-[#56636B] text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search loaded notices by title, regulator, reference or key point..."
              className="w-full h-9 pl-10 pr-10 bg-[#FBFCFA] border border-[#D3DDD7] text-[#1D2630] placeholder:text-[#56636B] font-['Inter'] text-[12px] rounded-lg focus:outline-none focus:bg-[#F4F7F4] focus:border-[#1F4E79] transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 text-[#56636B] hover:text-[#1D2630]"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Search toggle (phones) */}
          <button
            onClick={() => setShowMobileSearch(v => !v)}
            aria-label={showMobileSearch ? 'Close search' : 'Search notices'}
            aria-expanded={showMobileSearch}
            className="md:hidden w-9 h-9 flex items-center justify-center text-[#3C4852] bg-[#FBFCFA] hover:bg-[#E3EBE6] rounded-lg border border-[#D3DDD7] shadow-xs"
          >
            <span className="material-symbols-outlined text-xl">{showMobileSearch ? 'close' : 'search'}</span>
          </button>

          {/* Live Ingestion Indicator & Gateway Trigger */}
          <button
            onClick={onOpenEndpointsModal}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 border rounded-lg cursor-pointer transition-colors shadow-2xs ${
              allOperational
                ? 'bg-[#EAF3ED] hover:bg-[#D7E9DD] border-[#C3DECB] text-[#2F6249]'
                : 'bg-[#F8F1DC] hover:bg-[#F3E8C6] border-[#DCC68A] text-[#6E5410]'
            }`}
            title="View monitored government endpoints and their current status"
          >
            <span className={`w-2 h-2 rounded-full ${allOperational ? 'bg-[#2F6249]' : 'bg-[#6E5410]'}`}></span>
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
              className="flex items-center justify-center gap-1.5 min-w-9 px-2.5 h-9 sm:h-8 bg-[#1F4E79] hover:bg-[#163A5C] text-white font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
              title="Fetch the latest notices from every source now"
              aria-label="Sync feeds now"
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
              className="relative w-9 h-9 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center text-[#3C4852] hover:text-[#1D2630] bg-[#FBFCFA] hover:bg-[#E3EBE6] rounded-lg border border-[#D3DDD7] transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-xl">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#A8432F] text-white font-['JetBrains_Mono'] text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-auto mt-2 sm:w-96 bg-[#FBFCFA] border border-[#C5D2CA] rounded-lg shadow-xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-[#D3DDD7]">
                  <span className="font-['Hanken_Grotesk'] text-[14px] font-semibold text-[#1D2630] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#A8432F]"></span>
                    Latest Notices
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">From live sources</span>
                </div>
                <div className="divide-y divide-[#D3DDD7] max-h-72 overflow-y-auto mt-1">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        onSelectNotice(n.linkId);
                        setShowNotifications(false);
                      }}
                      className="py-2 px-1.5 hover:bg-[#F4F7F4] rounded cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-['JetBrains_Mono'] font-bold text-[#1F4E79]">
                          {n.regulator}
                        </span>
                        <span className="font-['JetBrains_Mono'] text-[#56636B]">{n.time}</span>
                      </div>
                      <p className="font-['Inter'] text-[12px] text-[#1D2630] line-clamp-2">
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
            className="hidden sm:flex items-center gap-1.5 px-3 h-8 bg-[#FBFCFA] hover:bg-[#E3EBE6] border border-[#D3DDD7] text-[#3C4852] hover:text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded-lg transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Export</span>
          </button>

          {/* User Profile */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center cursor-pointer group"
              title="Local session"
              aria-label="Session details"
              aria-expanded={showProfileMenu}
            >
              <span className="w-9 h-9 sm:w-8 sm:h-8 rounded-full shrink-0 ring-1 ring-[#D3DDD7] group-hover:ring-[#1F4E79] transition-all bg-[#E3EBE6] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#3C4852] text-lg">person</span>
              </span>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-[#FBFCFA] border border-[#C5D2CA] rounded-lg shadow-xl p-3 z-50 text-[12px]">
                <p className="font-semibold text-[#1D2630]">Local session</p>
                <p className="text-[11px] text-[#3C4852] mt-1 leading-relaxed">
                  RegSonar has no accounts or sign-in. Watch rules are saved in this browser only; the notices you have seen are remembered in this browser to mark new ones.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showMobileSearch && (
        <div className="md:hidden absolute left-0 right-0 top-14 px-3 py-2 bg-[#EEF3EF] border-b border-[#D3DDD7] shadow-md">
          <label className="relative flex items-center w-full">
            <span className="sr-only">Search notices</span>
            <span className="material-symbols-outlined absolute left-3 text-[#56636B] text-lg pointer-events-none">search</span>
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setShowMobileSearch(false)}
              placeholder="Search title, regulator, reference, key point"
              className="w-full h-11 pl-10 pr-3 bg-[#FBFCFA] border border-[#D3DDD7] text-[#1D2630] placeholder:text-[#56636B] font-['Inter'] text-[16px] rounded-lg focus:outline-none focus:border-[#1F4E79]"
            />
          </label>
        </div>
      )}
    </header>
  );
};
