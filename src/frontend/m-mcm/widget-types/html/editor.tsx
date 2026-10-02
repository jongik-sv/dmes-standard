"use client";

/** html 편집기 — html 원문 칸 + 「스크립트 허용」(켜면 격리 안내 경고). 스펙 §6. */
import { Checkbox, FormGroup, Textarea } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { readHtmlConfig, validateHtmlConfig, type HtmlConfig } from "../_content/config";
import { useReportErrors } from "../_content/hooks";
import { HTML_SCRIPT_WARNING } from "../_content/html-frame";
import { ContentStyle } from "../_content/styles";

export default function HtmlTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readHtmlConfig(value);
  useReportErrors(validateHtmlConfig(cfg), onValidate);
  const set = (patch: Partial<HtmlConfig>) => onChange({ ...cfg, ...patch } satisfies HtmlConfig);

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-html">
      <ContentStyle />
      <FormGroup label="html" required className="mcm-fg-block">
        <Textarea
          value={cfg.html}
          onChange={(html) => set({ html })}
          rows={12}
          spellCheck={false}
          placeholder="<h3>안내</h3><p>내용</p>"
          className="mcm-wt-code"
        />
      </FormGroup>
      <FormGroup label="스크립트">
        <Checkbox
          checked={cfg.allowScript}
          onChange={(allowScript) => set({ allowScript })}
          label="스크립트 허용"
        />
      </FormGroup>
      {cfg.allowScript ? (
        <div className="mcm-wt-editor__warn" role="note">
          {HTML_SCRIPT_WARNING}
        </div>
      ) : (
        <div className="mcm-wt-editor__note">
          스크립트·스타일·이벤트 속성은 지우고 포털 안에 그립니다.
        </div>
      )}
    </div>
  );
}
