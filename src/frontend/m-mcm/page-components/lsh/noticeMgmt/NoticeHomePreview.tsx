"use client";

/**
 * 홈 화면 표시 미리보기 팝업 — 포털 홈 공지 뷰어(m-mcm home `NoticeCard` 의 NoticeViewer)와 같은 머리글
 * (제목 · 분류 배지 · 형식 표지 · 작성자·일시 · 게시기간) + 본문(NoticeBodyView).
 * 본문 구역의 [미리보기] 버튼으로 열고, 저장 전 입력값을 그대로 보여 준다.
 */
import { Badge } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";

import { formatPeriod, toLocalDateTime } from "./notice-logic";
import {
  CONTENT_FORMAT_SHORT,
  NOTICE_CATEGORY_LABEL,
  NOTICE_CATEGORY_TONE,
  TARGET_SCOPE_LABEL,
  type NoticeForm,
} from "./types";

export interface NoticeHomePreviewProps {
  open: boolean;
  form: NoticeForm | null;
  /** 게시 대상 표시(전체 / 역할 이름) — 홈 뷰어에는 없지만 누구에게 보일지 함께 알린다. */
  targetText: string;
  onClose: () => void;
}

export function NoticeHomePreview({
  open,
  form,
  targetText,
  onClose,
}: NoticeHomePreviewProps) {
  if (!form) return null;

  const author = form.C_USR_ID.trim();
  const createdAt = toLocalDateTime(form.C_AT);
  const meta = form.NOTICE_ID
    ? [author, createdAt].filter(Boolean).join(" · ")
    : "새 공지 · 저장 전";
  const period = formatPeriod(form.POST_START_DT, form.POST_END_DT);
  const target =
    form.TARGET_SCOPE === "ALL" ? TARGET_SCOPE_LABEL.ALL : targetText;

  return (
    <Modal open={open} title="홈 화면 표시 미리보기" size="lg" onClose={onClose}>
      <p className="nm-hint">홈의 공지 뷰어와 같은 모습입니다. 게시 대상: {target}</p>
      <div className="nm-viewer" data-testid="notice-home-preview">
        <div className="nm-viewer__head">
          <h4 className="nm-viewer__title">
            {form.TITLE.trim() || "(제목 없음)"}
          </h4>
          <Badge
            tone={NOTICE_CATEGORY_TONE[form.NOTICE_CATEGORY]}
            label={NOTICE_CATEGORY_LABEL[form.NOTICE_CATEGORY]}
          />
          <Badge
            variant="outline"
            mono
            label={CONTENT_FORMAT_SHORT[form.CONTENT_FORMAT]}
          />
          {meta && <span className="nm-viewer__meta">{meta}</span>}
          {period && <span className="nm-viewer__meta">게시 {period}</span>}
        </div>
        <NoticeBodyView
          value={form.CONTENT}
          format={form.CONTENT_FORMAT}
          emptyText="내용이 없습니다."
          testId="notice-home-preview-body"
        />
      </div>
    </Modal>
  );
}
