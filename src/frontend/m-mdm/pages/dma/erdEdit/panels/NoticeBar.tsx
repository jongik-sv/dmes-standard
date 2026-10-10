"use client";

/** 거절 알림 띠(스펙 4.5). ctx.apply 가 올린 마지막 알림 하나를 보인다. 닫으면 칸 강조도 지운다. */
import { Button } from "@dk-oasis/shared/form";

import type { ErdNotice } from "../edit-context";

export interface NoticeBarProps { notice: ErdNotice | null; onClose(): void }

export function NoticeBar({ notice, onClose }: NoticeBarProps) {
  if (!notice) return null;
  return (
    <div className="erd-notice" data-code={notice.code} role="alert" data-testid="erd-notice">
      <strong className="erd-notice__label">{notice.label}</strong>
      <span data-testid="erd-notice-message">{notice.message}</span>
      {notice.hint && <span className="erd-notice__hint" data-testid="erd-notice-hint">{notice.hint}</span>}
      <span className="erd-notice__spacer" />
      <Button size="mini" data-testid="erd-notice-close" onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
