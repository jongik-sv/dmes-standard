"use client";

/**
 * 거절 알림 띠(스펙 4.5). ctx.apply 가 올린 마지막 알림 하나를 보인다. 닫으면 칸 강조도 지운다.
 * CONFLICT 이고 내 값이 있으면 그 값과 [내 값 복사](shared CopyTextButton)를 보인다 — 바뀐 값을 읽은 뒤 내 값을 다시 넣을 수 있다.
 */
import { Button, CopyTextButton } from "@dk-oasis/shared/form";

import { valueText, type ErdNotice } from "../edit-context";

export interface NoticeBarProps { notice: ErdNotice | null; onClose(): void }

/** 복사할 글 — 글자는 그대로, 다른 값은 JSON. */
export const mineText = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

export function NoticeBar({ notice, onClose }: NoticeBarProps) {
  if (!notice) return null;
  const hasMine = notice.code === "CONFLICT" && notice.mine !== null && notice.mine !== undefined;
  return (
    <div className="erd-notice" data-code={notice.code} role="alert" data-testid="erd-notice">
      <strong className="erd-notice__label">{notice.label}</strong>
      <span data-testid="erd-notice-message">{notice.message}</span>
      {notice.hint && <span className="erd-notice__hint" data-testid="erd-notice-hint">{notice.hint}</span>}
      {hasMine && (
        <span data-testid="erd-notice-mine">
          내 값 {valueText(notice.mine)}{" "}
          <span data-testid="erd-notice-copy">
            <CopyTextButton text={mineText(notice.mine)} label="내 값 복사" />
          </span>
        </span>
      )}
      <span className="erd-notice__spacer" />
      <Button size="mini" data-testid="erd-notice-close" onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
