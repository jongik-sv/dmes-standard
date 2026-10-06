"use client";

/**
 * 룰 계산기 편집기 — 종류(룰·룰 세트)·ID·중간값 표시 옵션과 [입력 칸 확인](io 미리보기, 내 DRAFT 우선).
 * 설정은 {targetTp, targetId, showSteps}. ID 가 비면 저장할 수 없다(onValidate 로 알린다).
 * 중간값 표시는 룰 세트에서만 뜻이 있어 룰이면 끈 채 잠근다. 종류·ID 를 바꾸면 이전 미리보기는 지운다.
 * 미리보기는 저장 전에 입력 칸이 어떻게 생기는지(라벨·단위·필수·결과·단계)를 보는 용도이며 위젯 실행과 달리 내 DRAFT 를 쓴다.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, FormGroup, Input, Select } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { fetchRuleCalcIo } from "./api";
import {
  blocksInput,
  messageText,
  messageTone,
  readRuleCalcConfig,
  TARGET_TP_LABELS,
  validateRuleCalcConfig,
  type RuleCalcConfig,
  type RuleCalcIo,
  type RuleCalcTargetTp,
} from "./rule-calc-model";
import { RULE_CALC_CSS, RULE_CALC_STYLE_HREF } from "./rule-calc-styles";

const TARGET_OPTIONS = (Object.keys(TARGET_TP_LABELS) as RuleCalcTargetTp[]).map((value) => ({ value, label: TARGET_TP_LABELS[value] }));

type PreviewState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; io: RuleCalcIo };

function IoPreview({ io }: { io: RuleCalcIo }) {
  const blocked = blocksInput(io.messages);
  return (
    <div className="mcm-rc-editor__preview" data-testid="rc-editor-preview">
      <strong>
        {io.target.name || io.target.id}
        {io.target.ver && ` (v${io.target.ver}${io.target.verStatus ? ` ${io.target.verStatus}` : ""})`}
      </strong>
      {io.messages.length > 0 && (
        <ul className="mcm-rc-editor__list">
          {io.messages.map((m, i) => (
            <li key={`${m.code}-${i}`} data-tone={messageTone(m.code)}>
              {messageText(m)}
            </li>
          ))}
        </ul>
      )}
      {!blocked && (
        <>
          <div>입력 칸 {io.inputs.length}개</div>
          <ul className="mcm-rc-editor__list">
            {io.inputs.map((i) => (
              <li key={i.name}>
                {i.label} ({i.name}, {i.dataType || "-"}
                {i.scale != null ? `, 소수 ${i.scale}자리` : ""}
                {i.unit ? `, ${i.unit}` : ""}
                {i.required ? ", 필수" : ""})
              </li>
            ))}
          </ul>
          <div>결과 {io.outputs.length}개</div>
          <ul className="mcm-rc-editor__list">
            {io.outputs.map((o) => (
              <li key={o.name}>
                {o.label} ({o.name}
                {o.scale != null ? `, 소수 ${o.scale}자리` : ""}
                {o.unit ? `, ${o.unit}` : ""})
              </li>
            ))}
          </ul>
          {io.steps.length > 0 && (
            <>
              <div>실행 순서 {io.steps.length}단계</div>
              <ol className="mcm-rc-editor__list">
                {io.steps.map((s) => (
                  <li key={s.ruleId}>
                    {s.name || s.ruleId} → {s.outputs.map((o) => o.label).join(", ")}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function RuleCalcTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readRuleCalcConfig(value);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const seq = useRef(0);
  useReportErrors(validateRuleCalcConfig(cfg), onValidate);

  // 종류·ID 가 바뀌면 이전 미리보기와 진행 중 요청을 버린다.
  useEffect(() => {
    seq.current += 1;
    setPreview({ status: "idle" });
  }, [cfg.targetTp, cfg.targetId]);

  const patch = (next: Partial<RuleCalcConfig>) => {
    const merged: RuleCalcConfig = { ...cfg, ...next };
    // 룰에는 중간값이 없으므로 끈 채 저장한다.
    onChange({ ...merged, showSteps: merged.targetTp === "SET" && merged.showSteps } satisfies RuleCalcConfig);
  };

  const check = () => {
    const my = ++seq.current;
    setPreview({ status: "loading" });
    fetchRuleCalcIo(cfg.targetTp, cfg.targetId, true).then(
      (io) => {
        if (seq.current === my) setPreview({ status: "ready", io });
      },
      (e: unknown) => {
        if (seq.current === my) setPreview({ status: "error", message: e instanceof Error && e.message ? e.message : "입력 정의를 불러오지 못했습니다." });
      }
    );
  };

  return (
    <div className="mcm-rc-editor" data-testid="widget-type-editor-rule-calc">
      <style href={RULE_CALC_STYLE_HREF} precedence="default">
        {RULE_CALC_CSS}
      </style>
      <FormGroup label="대상" required>
        <div className="mcm-rc-editor__row">
          <Select
            aria-label="대상 종류"
            value={cfg.targetTp}
            options={TARGET_OPTIONS}
            onChange={(v) => patch({ targetTp: v === "SET" ? "SET" : "RULE" })}
            data-testid="rc-editor-tp"
          />
          <Input
            className="mcm-rc-editor__grow"
            aria-label="룰 ID 또는 룰 세트 ID"
            placeholder={cfg.targetTp === "SET" ? "룰 세트 ID (예: M47_COAT_WT)" : "룰 ID (예: M47C0001)"}
            value={cfg.targetId}
            onChange={(v) => patch({ targetId: v.trim() })}
            data-testid="rc-editor-id"
          />
        </div>
      </FormGroup>
      <FormGroup label="중간값">
        <Checkbox
          checked={cfg.targetTp === "SET" && cfg.showSteps}
          disabled={cfg.targetTp !== "SET"}
          onChange={(showSteps) => patch({ showSteps })}
          label="단계별 중간값 보이기"
          aria-label="단계별 중간값 보이기"
        />
      </FormGroup>
      <div className="mcm-rc-editor__row">
        <Button onClick={check} disabled={!cfg.targetId || preview.status === "loading"} data-testid="rc-editor-check">
          {preview.status === "loading" ? "확인 중…" : "입력 칸 확인"}
        </Button>
        <span className="mcm-rc-editor__note">내가 작성 중인 DRAFT 버전이 있으면 그것으로 보입니다. 위젯 실행은 확정 버전만 씁니다.</span>
      </div>
      {preview.status === "error" && (
        <div className="mcm-rc__msg mcm-rc__msg--error" role="alert" data-testid="rc-editor-error">
          {preview.message}
        </div>
      )}
      {preview.status === "ready" && <IoPreview io={preview.io} />}
      <div className="mcm-rc-editor__note">
        룰 또는 룰 세트 ID 만 정하면 입력 칸이 자동으로 만들어집니다. 세트에서 앞 룰 결과로 채워지는 값은 입력 칸에서 빠집니다.
      </div>
    </div>
  );
}
