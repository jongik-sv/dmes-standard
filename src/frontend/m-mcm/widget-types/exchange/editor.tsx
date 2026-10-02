"use client";

/**
 * 환율 편집기 — 통화 다중 선택(최대 10개)·기간(7·30·90일). 관리 화면 오른쪽 상세 영역에 들어간다.
 * 검사(validateExchangeConfig)가 오류를 onValidate 로 알려 저장을 막는다. 오류 문구는 관리 화면이 목록으로 보인다.
 */
import { useMemo } from "react";
import { Checkbox, FormGroup, Select } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import {
  daysOptions,
  EXCHANGE_CURRENCIES,
  MAX_EXCHANGE_CURRENCIES,
  patchConfig,
  readExchangeConfig,
  toggleCurrency,
  validateExchangeConfig,
} from "@/widget-types/_ext/config";
import { EXT_CSS, EXT_STYLE_HREF } from "@/widget-types/_ext/styles";
import { useReportErrors } from "@/widget-types/_ext/use-report-errors";

export default function ExchangeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = useMemo(() => readExchangeConfig(value), [value]);
  const errors = useMemo(() => validateExchangeConfig(value), [value]);
  useReportErrors(errors, onValidate);

  // 목록에 없는 코드(옛 설정)도 체크 해제할 수 있게 함께 보인다.
  const options = useMemo(() => {
    const known = EXCHANGE_CURRENCIES as readonly string[];
    return [...known, ...cfg.currencies.filter((c) => !known.includes(c))];
  }, [cfg.currencies]);
  const full = cfg.currencies.length >= MAX_EXCHANGE_CURRENCIES;
  const dayOptions = useMemo(() => daysOptions(cfg.days).map((d) => ({ value: String(d), label: `${d}일` })), [cfg.days]);

  return (
    <div className="mcm-extedit" data-testid="widget-editor-exchange">
      <style href={EXT_STYLE_HREF} precedence="default">
        {EXT_CSS}
      </style>
      <FormGroup label="통화" labelWidth={80}>
        <div className="mcm-extedit__checks" role="group" aria-label="통화 선택">
          {options.map((cur) => {
            const checked = cfg.currencies.includes(cur);
            return (
              <Checkbox
                key={cur}
                label={cur}
                checked={checked}
                disabled={!checked && full}
                onChange={(on) => onChange(patchConfig(value, { currencies: toggleCurrency(cfg.currencies, cur, on) }))}
              />
            );
          })}
        </div>
      </FormGroup>
      <p className="mcm-extedit__hint">
        원화(KRW) 기준 값입니다. 통화는 {MAX_EXCHANGE_CURRENCIES}개까지 고를 수 있습니다(선택 {cfg.currencies.length}개).
      </p>
      <FormGroup label="기간" labelWidth={80}>
        <Select
          value={String(cfg.days)}
          options={dayOptions}
          onChange={(v) => onChange(patchConfig(value, { days: Number(v) }))}
          aria-label="추이 기간"
        />
      </FormGroup>
    </div>
  );
}
