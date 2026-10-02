"use client";

/** 웹 주소 편집기 — 주소 칸 + 즉시 검사 메시지(스펙 §6). 포털과 같은 출처는 거절한다. */
import { FormGroup, Input } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { readWebConfig, validateWebConfig, type WebConfig } from "../_content/config";
import { usePortalOrigin, useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";

export default function WebTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readWebConfig(value);
  const portalOrigin = usePortalOrigin() ?? "";
  const errors = validateWebConfig(cfg, portalOrigin);
  useReportErrors(errors, onValidate);
  // 빈 칸일 때는 붉은 표시를 하지 않는다(저장 막기는 onValidate 가 맡는다).
  const shownError = cfg.url.trim() ? errors[0] : undefined;

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-web">
      <ContentStyle />
      <FormGroup label="웹 주소" required>
        <Input
          type="url"
          value={cfg.url}
          onChange={(url) => onChange({ url } satisfies WebConfig)}
          placeholder="https://"
          spellCheck={false}
          error={shownError}
        />
      </FormGroup>
      <div className="mcm-wt-editor__note">
        사이트가 다른 화면 안에 띄우는 것을 막으면 빈 화면이 보입니다. 그때는 위젯의 [새 탭으로 열기]를 씁니다.
      </div>
    </div>
  );
}
