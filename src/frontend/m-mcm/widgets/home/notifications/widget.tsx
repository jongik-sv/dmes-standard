"use client";

import { NotificationCard } from "@/page-components/home/NotificationCard";
import { selectUrgentOrFirst } from "@/page-components/home/notice-store";

/** 공지 알림을 누르면 긴급 공지(없으면 첫 공지)를 고르고, 공지 위젯이 이 탭에 있으면 그 자리로 스크롤한다. */
export default function NotificationsWidget() {
  return (
    <NotificationCard
      onOpenNotice={() => {
        selectUrgentOrFirst();
        document.querySelector('[data-widget-id="home.notice"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
    />
  );
}
