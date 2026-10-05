"use client";

/**
 * 탭 공유 창(widget-tabs 2026-10-05, 설계 design-widget-tabs §3.1 shareTab·searchUsers).
 * shared LookupMultiModal 로 받는 사람을 찾아(SHARE_KEYWORD_MIN 자 이상) 최대 MAX_SHARE_USERS 명 고르고, [보내기] 는 onShare 에 사용자 ID 를 넘긴다.
 * 공유는 사본 전달이다 — 받는 사람에게 「(공유) 이름」 새 탭으로 바로 복사되고 메모·대화 내용은 빠진다.
 * 결과 알림·닫기는 onShare(작업 공간)가 한다. 작업 공간은 열 때만 이 창을 마운트한다(MantineProvider 없는 화면·시험에서 닫힌 창이 그려지지 않게).
 */
import { useCallback, useMemo } from "react";

import { LookupMultiModal, type LookupMultiRow } from "../components/lookup/LookupMultiModal";
import { MAX_SHARE_USERS, SHARE_KEYWORD_MIN } from "./constants";
import type { WidgetShareUser } from "./types";

export interface WidgetShareDialogProps {
  tabName: string;
  searchUsers: (keyword: string) => Promise<WidgetShareUser[]>;
  /**
   * 고른 사람들에게 보낸다. 실패를 던지면 창이 고른 것을 둔 채 열려 있다.
   * 일부만 실패하면 실패한 사람 ID 를 돌려준다 — 창은 열린 채 그 사람만 고른 상태로 남는다.
   */
  onShare: (userIds: string[], names: Record<string, string>) => Promise<void | string[]>;
  onClose: () => void;
  /** 로그인 사용자 — 검색 결과에서 뺀다(서버도 본인을 뺀다). */
  selfUserId?: string | null;
}

export function WidgetShareDialog({ tabName, searchUsers, onShare, onClose, selfUserId }: WidgetShareDialogProps) {
  const search = useCallback(
    async (keyword: string): Promise<LookupMultiRow[]> =>
      (await searchUsers(keyword)).map((u) => ({ code: u.userId, name: u.userNm || u.userId, detail: u.deptNm || undefined })),
    [searchUsers]
  );
  const exclude = useMemo(() => (selfUserId ? [selfUserId] : undefined), [selfUserId]);
  const confirm = useCallback(
    async (rows: LookupMultiRow[]) => {
      const failed = await onShare(rows.map((r) => r.code), Object.fromEntries(rows.map((r) => [r.code, r.name])));
      return failed ? rows.filter((r) => failed.includes(r.code)) : undefined;
    },
    [onShare]
  );
  return (
    <LookupMultiModal
      open
      title={`「${tabName}」 탭 공유`}
      description={`받는 사람에게 「(공유) ${tabName}」 탭으로 바로 복사됩니다. 배치와 위젯 설정만 넘어가고 메모·대화 내용은 복사되지 않습니다. 최대 ${MAX_SHARE_USERS}명.`}
      placeholder={`이름 또는 사번(${SHARE_KEYWORD_MIN}자 이상)`}
      minKeywordLength={SHARE_KEYWORD_MIN}
      maxSelect={MAX_SHARE_USERS}
      excludeCodes={exclude}
      confirmLabel="보내기"
      search={search}
      onConfirm={confirm}
      onClose={onClose}
      testId="widget-share-dialog"
    />
  );
}
