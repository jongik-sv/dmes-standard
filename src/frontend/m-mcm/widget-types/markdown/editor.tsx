"use client";

/** 글(md) 편집기 — shared MarkdownField(서식·MD 두 방식). 미리보기는 관리 화면 미리보기가 맡는다(스펙 §6·§10.1). */
import { FormGroup } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { readMarkdownConfig, validateMarkdownConfig, type MarkdownConfig } from "../_content/config";
import { useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";

export default function MarkdownTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readMarkdownConfig(value);
  useReportErrors(validateMarkdownConfig(cfg), onValidate);
  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-markdown">
      <ContentStyle />
      <FormGroup label="글" required className="mcm-fg-block">
        <MarkdownField
          value={cfg.markdown}
          onChange={(md) => onChange({ markdown: md } satisfies MarkdownConfig)}
          editable
          ariaLabel="글(md)"
          testId="widget-markdown-editor"
        />
      </FormGroup>
    </div>
  );
}
