"use client";

/**
 * 공지 본문 편집 구역 — 형식(TEXT·MD·HTML)에 맞는 편집기 + [미리보기] 버튼 + 글자 수.
 * 편집기는 상세 패널에서 위 입력표를 뺀 남은 높이를 모두 채운다(notice-styles.ts `.nm-body*`).
 * 미리보기는 여기서 그리지 않고 부모가 팝업(NoticePreviewModal)으로 띄운다.
 * 형식을 바꿔도 본문 문자열은 부모 폼에 그대로 남는다(편집기만 바뀐다).
 * 공지 도메인 전용 조합이라 화면 폴더에 둔다. 들어가는 부품(Textarea·MarkdownField·Button)은 shared 다.
 */
import { Button, Textarea } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";

import {
  CONTENT_FORMAT_HINT,
  CONTENT_MAX,
  MD_MODE_STORAGE_KEY,
  type ContentFormat,
} from "./types";

export interface NoticeBodyEditorProps {
  /** 편집 대상 공지 식별 키 — 바뀌면 마크다운 편집기를 새로 그린다(되돌리기 기록 분리). */
  editorKey: string;
  value: string;
  format: ContentFormat;
  /** 편집 대상이 없으면 false — 비활성 입력만 보인다. */
  enabled: boolean;
  /** 저장 중 등 잠금 — 입력을 막되 내용은 그대로 보인다(Local-Rules §11). */
  locked: boolean;
  onChange: (value: string) => void;
  /** [미리보기] — 홈 화면에 보일 모습을 팝업으로 연다. */
  onPreview: () => void;
}

const fmtCount = (n: number) => n.toLocaleString("ko-KR");

export function NoticeBodyEditor({
  editorKey,
  value,
  format,
  enabled,
  locked,
  onChange,
  onPreview,
}: NoticeBodyEditorProps) {
  const over = value.length > CONTENT_MAX;

  let editor;
  if (!enabled) {
    editor = <Textarea value="" disabled aria-label="공지 본문" />;
  } else if (format === "MD") {
    editor = (
      <MarkdownField
        key={editorKey}
        value={value}
        editable
        fill
        ariaLabel="공지 본문"
        modeStorageKey={MD_MODE_STORAGE_KEY}
        testId="notice-body-md"
        onChange={onChange}
      />
    );
  } else {
    editor = (
      <Textarea
        value={value}
        disabled={locked}
        spellCheck={format === "HTML" ? false : undefined}
        className={format === "HTML" ? "nm-mono" : ""}
        placeholder={
          format === "HTML" ? "<p>HTML 본문</p>" : "공지 내용을 입력하세요."
        }
        aria-label="공지 본문"
        data-testid="notice-body-text"
        onChange={onChange}
      />
    );
  }

  return (
    <section className="nm-section nm-body" aria-label="본문">
      <div className="nm-section__head">
        <h3 className="nm-section__title">본문</h3>
        <span className="nm-section__sub">{CONTENT_FORMAT_HINT[format]}</span>
        <span className="nm-section__tools">
          <Button
            size="sm"
            disabled={!enabled}
            data-testid="notice-preview-open"
            onClick={onPreview}
          >
            미리보기
          </Button>
        </span>
      </div>
      <div className="nm-section__body nm-body__inner">
        <div
          className={locked ? "nm-editor nm-editor--locked" : "nm-editor"}
          aria-busy={locked || undefined}
        >
          {editor}
        </div>
        <div
          className={
            over ? "nm-editor__foot nm-editor__foot--over" : "nm-editor__foot"
          }
          data-testid="notice-body-count"
        >
          <span>
            {fmtCount(value.length)} / {fmtCount(CONTENT_MAX)}자
          </span>
          {over && (
            <span role="alert">
              본문이 상한을 넘었습니다. 줄여야 저장할 수 있습니다.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
