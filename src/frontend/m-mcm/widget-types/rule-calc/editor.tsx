"use client";

/**
 * 룰 계산기 편집기 — 종류(룰·룰 세트)·ID·중간값 표시 옵션과 [입력 칸 확인](io 미리보기, 내 DRAFT 우선).
 * 설정은 {targetTp, targetId, showSteps}. ID 가 비면 저장할 수 없다(onValidate 로 알린다).
 * 중간값 표시는 룰 세트에서만 뜻이 있어 룰이면 끈 채 잠근다. 종류·ID 를 바꾸면 이전 미리보기는 지운다.
 * 미리보기는 저장 전에 입력 칸이 어떻게 생기는지(라벨·단위·필수·결과·단계)를 보는 용도이며 위젯 실행과 달리 내 DRAFT 를 쓴다.
 */
import { useRef, useState } from "react";
import { Button, Checkbox, ComboBox, FormGroup, Input, Select } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { fetchRuleCalcIo, searchRuleCalcTargets } from "./api";
import {
  blocksInput,
  messageText,
  messageTone,
  readRuleCalcConfig,
  FILL_MODE_LABELS,
  searchRowLabel,
  searchRowValue,
  TARGET_TP_LABELS,
  validateRuleCalcConfig,
  type RuleCalcConfig,
  type RuleCalcFillMode,
  type RuleCalcSearchRow,
  type RuleCalcIo,
  type RuleCalcTargetTp,
} from "./rule-calc-model";
import { RULE_CALC_CSS, RULE_CALC_STYLE_HREF } from "./rule-calc-styles";

const TARGET_OPTIONS = (Object.keys(TARGET_TP_LABELS) as RuleCalcTargetTp[]).map((value) => ({ value, label: TARGET_TP_LABELS[value] }));

/** 결과 목록에 한 번에 그리는 최대 건수(검색 상한 이하). */
const RESULT_VISIBLE = 100;

const FILL_OPTIONS = (Object.keys(FILL_MODE_LABELS) as RuleCalcFillMode[]).map((value) => ({ value, label: FILL_MODE_LABELS[value] }));

type SearchState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; rows: RuleCalcSearchRow[] };

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
                {io.steps.map((s, i) => (
                  <li key={`${s.ruleId}-${i}`}>
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
  const key = `${cfg.targetTp}\u0000${cfg.targetId}`;
  const [shown, setShown] = useState<{ key: string; state: PreviewState }>({ key, state: { status: "idle" } });
  useReportErrors(validateRuleCalcConfig(cfg), onValidate);

  // ID 검색 — 키워드로 룰·세트를 찾아 고르면 종류·ID 를 채운다. 늦게 온 옛 검색 응답은 번호로 버린다.
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const searchSeq = useRef(0);
  const doSearch = () => {
    const my = ++searchSeq.current;
    setSearch({ status: "loading" });
    searchRuleCalcTargets("ALL", keyword.trim()).then(
      (rows) => {
        if (searchSeq.current === my) setSearch({ status: "done", rows });
      },
      (e: unknown) => {
        if (searchSeq.current === my) setSearch({ status: "error", message: e instanceof Error && e.message ? e.message : "검색하지 못했습니다." });
      }
    );
  };
  const rows = search.status === "done" ? search.rows : [];

  // 종류·ID 가 바뀌면(키가 달라지면) 이전 미리보기를 보이지 않는다. 응답은 자기 키로 쓰므로 늦게 와도 지금 키의 화면을 덮지 못하고,
  // 키가 되돌아오면 그 키의 결과가 그대로 보인다(「확인 중」 으로 남지 않는다).
  const preview: PreviewState = shown.key === key ? shown.state : { status: "idle" };

  const patch = (next: Partial<RuleCalcConfig>) => {
    const merged: RuleCalcConfig = { ...cfg, ...next };
    // 룰에는 중간값이 없으므로 끈 채 저장한다.
    onChange({ ...merged, showSteps: merged.targetTp === "SET" && merged.showSteps } satisfies RuleCalcConfig);
  };

  const check = () => {
    const at = key;
    const settle = (state: PreviewState) => setShown((prev) => (prev.key === at ? { key: at, state } : prev));
    setShown({ key: at, state: { status: "loading" } });
    fetchRuleCalcIo(cfg.targetTp, cfg.targetId, true).then(
      (io) => settle({ status: "ready", io }),
      (e: unknown) => settle({ status: "error", message: e instanceof Error && e.message ? e.message : "입력 정의를 불러오지 못했습니다." })
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
      <FormGroup label="찾기">
        <div className="mcm-rc-editor__row">
          <Input
            className="mcm-rc-editor__grow"
            aria-label="룰·룰 세트 검색어"
            placeholder="이름 또는 ID 로 찾기"
            value={keyword}
            onChange={setKeyword}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                doSearch();
              }
            }}
            data-testid="rc-editor-keyword"
          />
          <Button onClick={doSearch} disabled={search.status === "loading"} data-testid="rc-editor-search">
            {search.status === "loading" ? "찾는 중…" : "찾기"}
          </Button>
        </div>
      </FormGroup>
      {search.status === "error" && (
        <div className="mcm-rc__msg mcm-rc__msg--error" role="alert" data-testid="rc-editor-search-error">
          {search.message}
        </div>
      )}
      {search.status === "done" && (
        <div className="mcm-rc-editor__row" data-testid="rc-editor-results">
          {rows.length === 0 ? (
            <span className="mcm-rc-editor__note">찾은 룰·룰 세트가 없습니다</span>
          ) : (
            <ComboBox
              className="mcm-rc-editor__grow"
              aria-label="찾은 룰·룰 세트"
              data={rows.map((r) => ({ value: searchRowValue(r), label: searchRowLabel(r), row: r }))}
              value={searchRowValue({ tp: cfg.targetTp, id: cfg.targetId })}
              placeholder={`${rows.length}건 — 골라 넣기`}
              maxVisible={RESULT_VISIBLE}
              onChange={(_v, item) => {
                const row = (item as { row?: RuleCalcSearchRow } | undefined)?.row;
                if (row) patch({ targetTp: row.tp, targetId: row.id });
              }}
            />
          )}
        </div>
      )}
      <FormGroup label="중간값">
        <Checkbox
          checked={cfg.targetTp === "SET" && cfg.showSteps}
          disabled={cfg.targetTp !== "SET"}
          onChange={(showSteps) => patch({ showSteps })}
          label="단계별 중간값 보이기"
          aria-label="단계별 중간값 보이기"
        />
      </FormGroup>
      <FormGroup label="화면 값 채우기">
        <Select
          aria-label="업무 화면 값 채우기 방식"
          value={cfg.fillMode}
          options={FILL_OPTIONS}
          onChange={(v) => patch({ fillMode: v === "button" || v === "off" ? v : "auto" })}
          data-testid="rc-editor-fill"
        />
      </FormGroup>
      <div className="mcm-rc-editor__note">
        업무 화면의 도구 창에서 쓸 때, 화면에서 고른 행의 값 가운데 입력 변수 이름과 같은 것(대소문자·밑줄 차이는 무시)을 입력 칸에 넣습니다. 계산은 직접 눌러야 하며, 위젯 화면(보드)에서는 동작하지 않습니다.
      </div>
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
