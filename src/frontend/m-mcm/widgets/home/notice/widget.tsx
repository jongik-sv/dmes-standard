"use client";

import { useEffect } from "react";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { usePortalMenuPageIds } from "@/lib/portal-menu-store";
import { NoticeCard } from "@/page-components/home/NoticeCard";
import { ensureNoticesLoaded, reloadNotices, selectNotice, useNoticeStore } from "@/page-components/home/notice-store";
import { NOTICE_MGMT_PAGE_ID } from "@/page-components/home/types";

export default function NoticeWidget({ refreshKey }: WidgetProps) {
  const { notices, selectedId } = useNoticeStore();
  const menuPageIds = usePortalMenuPageIds();
  const canManage = menuPageIds?.has(NOTICE_MGMT_PAGE_ID) ?? false;

  useEffect(() => {
    if (refreshKey > 0) void reloadNotices();
    else ensureNoticesLoaded();
  }, [refreshKey]);

  return (
    <NoticeCard
      state={notices}
      selectedId={selectedId}
      onSelect={selectNotice}
      onRetry={() => void reloadNotices()}
      canManage={canManage}
    />
  );
}
