"use client";

/**
 * 홈 공지사항 카드 — 높이 400px 고정(위젯 정의 page.tsx). 안에서 왼쪽 목록 / 오른쪽 본문 뷰어로 나누고 경계를 끌어 크기를 바꾼다
 * (ContentBody resizable, 크기는 사용자별로 "mcm.home.notice" 에 저장). 목록·본문은 각자 스크롤하므로
 * 고른 공지의 본문 길이가 홈 전체 배치를 움직이지 않는다.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { Badge, Button } from "@dk-oasis/shared/form";
import { DashboardCard } from "@dk-oasis/shared/dashboard";
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";

import {
  NOTICE_CATEGORY_LABEL,
  NOTICE_CATEGORY_TONE,
  NOTICE_FORMAT_LABEL,
  NOTICE_LOAD_ERROR,
  NOTICE_MGMT_PAGE_ID,
  NOTICE_SPLIT_STORAGE_KEY,
  noticeAuthor,
  noticeCategory,
  noticeFormat,
  noticeKey,
  openPortalTab,
  toDate,
  toLocalDate,
  toLocalDateTime,
  type NoticeBoardRow,
  type NoticeLoadState,
} from "./types";

export interface NoticeCardProps {
  state: NoticeLoadState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  /** 공지사항 관리 메뉴 권한이 있으면 true — 그때만 "공지 관리 ›" 를 보인다. */
  canManage: boolean;
}

function CategoryBadge({ row }: { row: NoticeBoardRow }) {
  const cat = noticeCategory(row.NOTICE_CATEGORY);
  return <Badge tone={NOTICE_CATEGORY_TONE[cat]} label={NOTICE_CATEGORY_LABEL[cat]} />;
}

function FormatBadge({ row }: { row: NoticeBoardRow }) {
  return (
    <Badge variant="outline" mono label={NOTICE_FORMAT_LABEL[noticeFormat(row.CONTENT_FORMAT)]} />
  );
}

function NoticeViewer({ row }: { row: NoticeBoardRow }) {
  const author = noticeAuthor(row);
  const createdAt = toLocalDateTime(row.C_AT);
  const period = [toDate(row.POST_START_DT), toDate(row.POST_END_DT)].filter(Boolean).join(" ~ ");
  return (
    <div className="mcm-home-viewer">
      <div className="mcm-home-viewer__head">
        <h4 className="mcm-home-viewer__title" data-testid="home-notice-viewer-title">
          {row.TITLE || "(제목 없음)"}
        </h4>
        <CategoryBadge row={row} />
        <FormatBadge row={row} />
        {(author || createdAt) && (
          <span className="mcm-home-viewer__meta">
            {[author, createdAt].filter(Boolean).join(" · ")}
          </span>
        )}
        {period && <span className="mcm-home-viewer__meta">게시 {period}</span>}
      </div>
      <NoticeBodyView
        value={row.CONTENT ?? ""}
        format={noticeFormat(row.CONTENT_FORMAT)}
        emptyText="내용이 없습니다."
        testId="home-notice-body"
      />
    </div>
  );
}

export function NoticeCard({ state, selectedId, onSelect, onRetry, canManage }: NoticeCardProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rows = state.status === "ok" ? state.rows : [];
  const selected = rows.find((r) => noticeKey(r) === selectedId) ?? null;

  // 다른 공지를 고르면 본문을 맨 위부터 보인다.
  useEffect(() => {
    if (viewerRef.current) viewerRef.current.scrollTop = 0;
  }, [selectedId]);

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const idx = rows.findIndex((r) => noticeKey(r) === selectedId);
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(rows.length - 1, idx + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
    else if (e.key === "Enter" || e.key === " ") {
      const li = (e.target as HTMLElement).closest<HTMLElement>("[data-notice-id]");
      if (li?.dataset.noticeId) {
        e.preventDefault();
        onSelect(li.dataset.noticeId);
      }
      return;
    } else return;
    e.preventDefault();
    if (next < 0 || !rows[next]) return;
    const id = noticeKey(rows[next]);
    onSelect(id);
    listRef.current?.querySelector<HTMLElement>(`[data-notice-id="${CSS.escape(id)}"]`)?.focus();
  };

  const subtitle =
    state.status === "ok"
      ? `게시 중 ${rows.length}건`
      : state.status === "loading"
        ? "불러오는 중…"
        : undefined;

  let body;
  if (state.status === "error") {
    body = (
      <div
        className="mcm-home-state mcm-home-state--error mcm-home-scroll"
        role="alert"
        data-testid="home-notice-error"
      >
        <span>{NOTICE_LOAD_ERROR}</span>
        <Button size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  } else if (state.status === "loading") {
    body = <div className="mcm-home-state mcm-home-scroll">공지사항을 불러오는 중입니다.</div>;
  } else if (rows.length === 0) {
    body = <div className="mcm-home-state mcm-home-scroll">게시 중인 공지가 없습니다.</div>;
  } else {
    body = (
      <ContentBody resizable storageKey={NOTICE_SPLIT_STORAGE_KEY}>
        <ContentPanel key="list" flex={5} minSize={200}>
          <div className="mcm-home-scroll">
            <ul
              ref={listRef}
              className="mcm-home-nlist"
              role="listbox"
              aria-label="공지 목록"
              onKeyDown={onListKeyDown}
              data-testid="home-notice-list"
            >
              {rows.map((row) => {
                const id = noticeKey(row);
                const isSelected = id === selectedId;
                return (
                  <li
                    key={id}
                    className="mcm-home-nlist__item"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    data-notice-id={id}
                    onClick={() => onSelect(id)}
                  >
                    <CategoryBadge row={row} />
                    <span className="mcm-home-nlist__title" title={row.TITLE}>
                      {row.TITLE}
                    </span>
                    <FormatBadge row={row} />
                    <span className="mcm-home-nlist__meta">
                      {row.PIN_YN === "Y" && <span className="mcm-home-nlist__pin">고정</span>}
                      {noticeAuthor(row) && <span>{noticeAuthor(row)}</span>}
                      <span>{toLocalDate(row.C_AT)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </ContentPanel>
        <ContentPanel key="viewer" flex={7} minSize={240}>
          <div className="mcm-home-scroll" ref={viewerRef} data-testid="home-notice-viewer">
            {selected ? (
              <NoticeViewer row={selected} />
            ) : (
              <div className="mcm-home-state">선택한 공지가 없습니다.</div>
            )}
          </div>
        </ContentPanel>
      </ContentBody>
    );
  }

  return (
    <DashboardCard
      title="공지사항"
      subtitle={subtitle}
      actions={
        canManage ? (
          <Button size="mini" onClick={() => openPortalTab(NOTICE_MGMT_PAGE_ID)}>
            공지 관리 ›
          </Button>
        ) : undefined
      }
      bodyLayout="fill"
      bodyPadding
      testId="home-notice-card"
    >
      {body}
    </DashboardCard>
  );
}
