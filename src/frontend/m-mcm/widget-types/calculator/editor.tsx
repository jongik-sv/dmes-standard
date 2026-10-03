"use client";

/**
 * 계산기 편집기 — 「계산 기록 보이기」 체크박스 하나(설정 showHistory). 검증 오류는 없다(그래도 onValidate 관례대로 빈 목록을 알린다).
 * 읽기는 readCalculatorConfig — 값이 잘못됐으면 기본값(켬)으로 보인다. 미리보기는 관리 화면 미리보기가 맡는다.
 */
import { Checkbox, FormGroup } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";
import { readCalculatorConfig, type CalculatorConfig } from "./calculator-model";

export default function CalculatorTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readCalculatorConfig(value);
  useReportErrors([], onValidate);

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-calculator">
      <ContentStyle />
      <FormGroup label="계산 기록">
        <Checkbox
          checked={cfg.showHistory}
          onChange={(showHistory) => onChange({ showHistory } satisfies CalculatorConfig)}
          label="계산 기록 보이기"
        />
      </FormGroup>
      <div className="mcm-wt-editor__note">
        본문 너비가 충분할 때(약 420px 이상) 계산기 오른쪽에 최근 10건을 보입니다. 기록은 화면에서만 들고 저장하지 않습니다.
      </div>
    </div>
  );
}
