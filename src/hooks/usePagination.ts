// The feed's layout (cards, or a dense list; remembered in this browser) and
// the page of notices it shows
import React, { useState } from 'react';
import { readFeedLayout, writeFeedLayout, type FeedLayout } from '../lib/preferences';
import { RegulatoryNotice } from '../../shared/regulatory';

const perPage = (layout: FeedLayout) => (layout === 'list' ? 20 : 5);

export function usePagination(items: RegulatoryNotice[], currentPage: number, setCurrentPage: React.Dispatch<React.SetStateAction<number>>) {
  const [layout, setLayout] = useState<FeedLayout>(readFeedLayout);
  const itemsPerPage = perPage(layout);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const pageItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  React.useEffect(() => setCurrentPage(p => Math.min(p, totalPages)), [totalPages]);

  // Keeps the first notice shown on the new page
  const changeLayout = (next: FeedLayout) => {
    if (next === layout) return;
    const first = (page - 1) * itemsPerPage;
    setCurrentPage(Math.floor(first / perPage(next)) + 1);
    setLayout(next);
    writeFeedLayout(next);
  };

  return { layout, changeLayout, itemsPerPage, totalPages, page, pageItems };
}

export type Pagination = ReturnType<typeof usePagination>;
