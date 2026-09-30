"use client";

/**
 * 룰 세트 카드(TSK-08-06 design §6.9). 머리·세트명·설명·룰 목록·룰 추가·검사 목록·입출력 표·버튼(세트 저장·폐기/되살리기)·메시지.
 *
 * 검사 목록·입출력 표·의존 룰은 편집 중 목록에서 `set-model.ts` 로 즉시 계산하고 서버를 부르지 않는다(I21). 화면 검사 결과는 저장 버튼을
 * 막지 않는다 — 판정은 서버가 한다(D9). 폐기는 두 단계(폐기 → 폐기 확인/취소)로만 한다(I14·D14).
 * 분기 세트는 목록 편집·저장을 막고 서버 검사(`view.checks`)를 보인다.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { CardFrame, MutedText } from "../../ruleEdit/cards/CardFrame";
import { searchRules } from "../api";
import { setChecks, setIo } from "../set-model";
import type { RuleIo, RuleSetCheck } from "../types";
import type { RuleSetEditState } from "../state/useRuleSetEdit";
import { RuleListGrid } from "./RuleListGrid";
import { SetIoTables } from "./SetIoTables";

const DEPRECATE_WARNING = "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.";
const DUPLICATE_NOTICE = "이미 담은 룰이다";
const BRANCHED_NOTICE = "분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다";

/** 거부 배지 — shared 배지 톤에 위험 톤이 없어 같은 모양에 위험 토큰을 입힌다. */
const REJECT_BADGE: CSSProperties = { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };

function CheckBadge({ check }: { check: RuleSetCheck }) {
  return check.severity === "REJECT" ? <span style={REJECT_BADGE}>거부</span> : <span style={badgeStyle("warning")}>경고</span>;
}

export interface RuleSetCardProps {
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
  /** 목록 편집(▲▼✕·드래그·룰 추가)을 켤지 — 담당자·INUSE·저장 권한. */
  canEditList: boolean;
}

export function RuleSetCard({ state, canDo, canEditList }: RuleSetCardProps) {
  const view = state.view!;
  const set = view.set;
  const inUse = set.status === "INUSE";
  const busy = state.loading;
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [cands, setCands] = useState<RuleIo[] | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDeprecate(false);
    setAddNotice(null);
  }, [view]);

  const branched = !!set.branched;
  const io = useMemo(() => setIo(state.ids, state.rules), [state.ids, state.rules]);
  // 분기 세트는 한 줄로 다시 계산하면 틀린 결과가 나오므로 서버가 흐름 기준으로 낸 검사를 그대로 보인다.
  const checks = useMemo(
    () => (branched ? (view.checks ?? []) : setChecks(state.ids, state.rules)),
    [branched, view.checks, state.ids, state.rules],
  );

  const canSave = !branched && state.dirty && view.editable && inUse && canDo("save") && !busy;
  const canDeprecate = view.editable && inUse && canDo("delete") && !busy;
  const canRestore = view.restorable && !inUse && canDo("restore") && !busy;

  const findRules = async () => {
    setAddNotice(null);
    try {
      const res = await searchRules(keyword);
      setCands(res.rules ?? []);
    } catch (e) {
      state.reportError(e);
    }
  };

  const add = (r: RuleIo) => setAddNotice(state.addRule(r) ? null : DUPLICATE_NOTICE);

  const message = confirmDeprecate ? { kind: "error" as const, text: DEPRECATE_WARNING } : state.message;

  return (
    <CardFrame
      title="룰 세트"
      testId="set-card"
      right={
        <span style={{ display: "inline-flex", gap: "var(--spacing-xs)", alignItems: "center", fontWeight: 400 }}>
          <span data-testid="set-card-id" style={{ fontWeight: 600 }}>
            {set.setId}
          </span>
          <span data-testid="set-status" style={badgeStyle(inUse ? "success" : "muted")}>
            {set.status}
          </span>
          <span data-testid="set-row-version">{`row_version ${set.rowVersion}`}</span>
          <span style={badgeStyle("neutral")}>버전·승인 없음</span>
        </span>
      }
    >
      <p style={{ margin: "0 0 var(--spacing-xs)" }}>
        <MutedText>저장하면 바로 반영된다. 배포(스냅샷 발행)는 보류다</MutedText>
      </p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>세트명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input data-testid="set-name" value={state.setName} disabled={!canEditList || busy} onChange={state.setSetName} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea data-testid="set-desc" value={state.description} rows={2} disabled={!canEditList || busy} onChange={state.setDescription} />
            </td>
          </tr>
        </tbody>
      </table>
      {branched && (
        <p data-testid="set-branched-notice" role="note" style={{ margin: "var(--spacing-xs) 0 0" }}>
          <span style={badgeStyle("warning")}>분기 세트</span> <MutedText>{BRANCHED_NOTICE}</MutedText>
        </p>
      )}

      <div style={{ paddingTop: "var(--spacing-sm)" }}>
        {state.ids.length === 0 ? (
          <p data-testid="set-rules-empty" style={{ margin: 0, color: "var(--color-text-muted)" }}>
            룰이 없다. 아래에서 룰을 더하거나 오른쪽 지침으로 순서를 받는다
          </p>
        ) : (
          <RuleListGrid
            ids={state.ids}
            rules={state.rules}
            canEdit={canEditList}
            onUp={state.moveUp}
            onDown={state.moveDown}
            onRemove={state.remove}
            onReorder={state.reorder}
          />
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", alignItems: "center", paddingTop: "var(--spacing-sm)" }}>
        <span>룰 추가</span>
        <Input
          data-testid="set-rule-add-keyword"
          value={keyword}
          placeholder="룰 ID·룰명 앞부분"
          disabled={!canEditList}
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canEditList) void findRules();
          }}
          style={{ width: 200 }}
        />
        <Button data-testid="set-rule-add-find" disabled={!canEditList || busy} onClick={() => void findRules()}>
          찾기
        </Button>
        {addNotice && (
          <span data-testid="set-rule-add-notice" role="status" style={{ color: "var(--color-danger)" }}>
            {addNotice}
          </span>
        )}
      </div>
      {cands && canEditList && (
        <div data-testid="set-rule-cands" style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-xs)" }}>
          {cands.length === 0 ? (
            <MutedText>찾은 룰이 없다</MutedText>
          ) : (
            cands.map((r) => (
              <Button key={r.ruleId} size="sm" data-testid={`set-rule-cand-${r.ruleId}`} onClick={() => add(r)}>
                {`${r.ruleId} · ${r.ruleName ?? "(없음)"} · ${r.status ?? "-"}`}
              </Button>
            ))
          )}
        </div>
      )}

      <div data-testid="set-checks" style={{ paddingTop: "var(--spacing-sm)" }}>
        <p style={{ margin: "0 0 var(--spacing-xs)", fontWeight: 600 }}>세트 검사</p>
        {checks.length === 0 ? (
          <span style={badgeStyle("success")}>통과</span>
        ) : (
          checks.map((c, i) => (
            <p key={i} data-testid={`set-check-${i}`} style={{ margin: "0 0 2px" }}>
              <CheckBadge check={c} /> {c.message}
            </p>
          ))
        )}
      </div>

      <SetIoTables io={io} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
        {state.conflict && (
          <Button onClick={() => void state.reload()} disabled={busy}>
            다시 불러오기
          </Button>
        )}
        {inUse ? (
          confirmDeprecate ? (
            <>
              <Button
                variant="danger"
                data-testid="set-deprecate-confirm"
                disabled={!canDeprecate}
                onClick={() => {
                  setConfirmDeprecate(false);
                  void state.deprecate();
                }}
              >
                폐기 확인
              </Button>
              <Button onClick={() => setConfirmDeprecate(false)}>취소</Button>
            </>
          ) : (
            <Button data-testid="set-deprecate" disabled={!canDeprecate} onClick={() => setConfirmDeprecate(true)}>
              폐기
            </Button>
          )
        ) : (
          <Button data-testid="set-restore" disabled={!canRestore} onClick={() => void state.restore()}>
            되살리기
          </Button>
        )}
        <Button variant="primary" data-testid="set-save" disabled={!canSave} onClick={() => void state.save()}>
          세트 저장
        </Button>
      </div>

      {message && (
        <div
          data-testid="set-message"
          role="status"
          style={{ paddingTop: "var(--spacing-xs)", color: message.kind === "error" ? "var(--color-danger)" : "var(--color-text-secondary)" }}
        >
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{message.text}</p>
          {(message.lines ?? []).map((l, i) => (
            <p key={i} style={{ margin: 0 }}>
              <span style={badgeStyle("warning")}>경고</span> {l}
            </p>
          ))}
        </div>
      )}

      <p style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-muted)" }}>
        행을 끌어서 순서를 바꾼다(▲▼도 된다). 폐기한 세트는 고칠 수 없고 되살리기만 한다. 세트 안의 룰은 각자 평가 시각에 유효한 RELEASED 버전으로 돈다. 붉은 조건
        변수는 컬럼 사전에 없는 것으로, 앞 룰의 결과 변수여야 한다.
      </p>
    </CardFrame>
  );
}
