"use client";

/**
 * 메모장 편집기 — 종류(공용·개인)·형식, 공용이면 형식에 맞는 내용 입력칸(스펙 2026-10-02-widget-admin-generic §17.4).
 * 개인 메모는 내용을 쓰지 않는다(빈 문자열) — 사용자가 홈에서 직접 쓰고, 여기서 고른 형식은 새 메모의 처음 형식이다.
 * 종류를 개인으로 바꿨다 다시 공용으로 돌리면 쓰던 내용이 살아나도록 편집기 안에 잠시 들고 있는다.
 * 미리보기는 관리 화면 미리보기가 맡는다(스펙 §10.1).
 */
import { useRef } from "react";
import { FormGroup, Select, Textarea } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";
import {
  countLabel,
  isMemoFormat,
  isMemoScope,
  MEMO_FORMATS,
  MEMO_PERSONAL_NOTE,
  MEMO_SCOPES,
  readMemoChoices,
  readMemoConfig,
  validateMemoConfig,
  type MemoConfig,
} from "./memo-model";

const SCOPE_OPTIONS = MEMO_SCOPES.map((s) => ({ value: s.value, label: s.label }));
const FORMAT_OPTIONS = MEMO_FORMATS.map((f) => ({ value: f.value, label: f.label }));

export default function MemoTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readMemoConfig(value);
  /** 선택칸에 보일 원본 값 — 빠졌거나 틀렸으면 「선택하세요」(빈 값). */
  const choice = readMemoChoices(value);
  useReportErrors(validateMemoConfig(value), onValidate);
  /** 공용 → 개인으로 바꿀 때 치워 둔 공용 내용. */
  const stashed = useRef("");

  const emit = (next: MemoConfig) => onChange(next satisfies MemoConfig);

  const changeScope = (scope: string) => {
    if (!isMemoScope(scope) || scope === choice.scope) return;
    if (scope === "personal") {
      stashed.current = cfg.content;
      emit({ scope, format: cfg.format, content: "" });
    } else {
      emit({ scope, format: cfg.format, content: stashed.current });
    }
  };

  const changeFormat = (format: string) => {
    if (isMemoFormat(format)) emit({ ...cfg, format });
  };

  const setContent = (content: string) => emit({ ...cfg, content });

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-memo">
      <ContentStyle />
      <FormGroup label="종류" required>
        <Select
          value={choice.scope}
          options={SCOPE_OPTIONS}
          placeholder="선택하세요"
          aria-label="종류"
          onChange={changeScope}
          data-testid="widget-memo-scope"
        />
      </FormGroup>
      <FormGroup label="형식" required>
        <Select
          value={choice.format}
          options={FORMAT_OPTIONS}
          placeholder="선택하세요"
          aria-label="형식"
          onChange={changeFormat}
          data-testid="widget-memo-format"
        />
      </FormGroup>
      {cfg.scope === "shared" ? (
        <FormGroup label="내용" className="mcm-fg-block">
          {cfg.format === "md" ? (
            <MarkdownField
              value={cfg.content}
              onChange={setContent}
              editable
              ariaLabel="메모 내용(md)"
              testId="widget-memo-content-md"
            />
          ) : (
            <Textarea
              value={cfg.content}
              onChange={setContent}
              rows={cfg.format === "html" ? 12 : 8}
              spellCheck={cfg.format === "text"}
              placeholder={cfg.format === "html" ? "<h3>안내</h3><p>내용</p>" : "모두에게 보일 안내를 쓰세요"}
              aria-label={cfg.format === "html" ? "메모 내용(html)" : "메모 내용(텍스트)"}
              className={cfg.format === "html" ? "mcm-wt-code" : undefined}
              data-testid="widget-memo-content"
            />
          )}
        </FormGroup>
      ) : (
        <div className="mcm-wt-editor__note" data-testid="widget-memo-personal-note">
          {MEMO_PERSONAL_NOTE}
        </div>
      )}
      {cfg.scope === "shared" && (
        <div className="mcm-wt-editor__note" data-testid="widget-memo-count">
          {countLabel(cfg.content)}
        </div>
      )}
    </div>
  );
}
