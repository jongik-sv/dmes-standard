"use client";

/**
 * 홈 내 알림 카드 — 알림 기능이 아직 없어 시안의 샘플 알림을 보인다("구현 예정" 표시).
 * 종류 필터·모두 읽음·누르면 읽음 처리는 화면 안 상태로만 한다(새로 열면 처음 상태로 돌아간다).
 * 공지 알림을 누르면 onOpenNotice 로 홈 공지 카드에서 공지를 고르게 한다.
 * 카드 높이는 공지 카드와 같은 400px 고정, 목록만 스크롤한다.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import { DashboardCard } from "@dk-oasis/shared/dashboard";

import {
  NOTIFICATION_FILTERS,
  NOTIFICATION_ICON,
  SAMPLE_NOTIFICATIONS,
  filterNotifications,
  type NotificationFilter,
  type SampleNotification,
} from "./sample-data";

export interface NotificationCardProps {
  /** 공지 알림을 눌렀을 때. */
  onOpenNotice: () => void;
}

export function NotificationCard({ onOpenNotice }: NotificationCardProps) {
  const [items, setItems] = useState<SampleNotification[]>(SAMPLE_NOTIFICATIONS);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const unread = items.filter((n) => n.unread).length;
  const shown = useMemo(() => filterNotifications(items, filter), [items, filter]);

  const open = (n: SampleNotification) => {
    if (n.unread)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    if (n.opensNotice) onOpenNotice();
  };
  const readAll = () =>
    setItems((prev) => prev.map((x) => (x.unread ? { ...x, unread: false } : x)));
  const onKey = (e: KeyboardEvent<HTMLLIElement>, n: SampleNotification) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(n);
    }
  };

  return (
    <DashboardCard
      title="내 알림"
      subtitle={`안읽음 ${unread}건`}
      titleExtra={<Badge tone="warning" label="구현 예정" />}
      actions={
        <Button size="mini" onClick={readAll} disabled={unread === 0}>
          모두 읽음
        </Button>
      }
      toolbar={
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as NotificationFilter)}
          options={NOTIFICATION_FILTERS}
          ariaLabel="알림 종류"
          fullWidth
          testId="home-notification-filter"
        />
      }
      bodyPadding={false}
      testId="home-notification-card"
    >
      <ul className="mcm-home-nf" aria-label="알림 목록" data-testid="home-notification-list">
        {shown.length === 0 ? (
          <li className="mcm-home-state">해당하는 알림이 없습니다.</li>
        ) : (
          shown.map((n) => {
            const icon = NOTIFICATION_ICON[n.type];
            return (
              <li
                key={n.id}
                className={
                  n.unread ? "mcm-home-nf__item mcm-home-nf__item--unread" : "mcm-home-nf__item"
                }
                tabIndex={0}
                title={n.type}
                aria-label={`${n.unread ? "안읽음 · " : ""}${n.type} · ${n.title}`}
                onClick={() => open(n)}
                onKeyDown={(e) => onKey(e, n)}
                data-unread={n.unread ? "true" : undefined}
              >
                <span
                  className={`mcm-home-nf__icon mcm-home-nf__icon--${icon.tone}`}
                  aria-hidden="true"
                >
                  {icon.text}
                </span>
                <span className="mcm-home-nf__title">{n.title}</span>
                <time className="mcm-home-nf__time">{n.time}</time>
                <span className="mcm-home-nf__sub">{n.sub}</span>
              </li>
            );
          })
        )}
      </ul>
    </DashboardCard>
  );
}
