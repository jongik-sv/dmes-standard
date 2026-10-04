"use client";

/**
 * termRegPop — 용어 인라인 등록 팝업(TSK-04-04 design.md §6.18). columnMng 분해 결과의 `***` 자리에서 연다.
 *
 * 1단 "유사어 확인": 1차 문자열 추천(표기 유사·부분 일치·동의어·영문명). 기존 용어를 고르면 서버 호출 없이 돌려준다.
 * 2단 "새 용어 등록": 표기·의미 번호·정의·맥락·영문명·약어. 동의어·별칭·사용 시스템 입력은 용어 관리(TSK-04-02) 몫이다.
 *
 * RBAC: 팝업은 자기 serviceId(termRegPop)로 OASIS 를 호출하므로 자기 OBJ_ID × 실제 액션명으로 판정한다
 * (masterRuleListPop 선례). [등록]은 `reg`, [약어 제안]은 `search`. 열릴 때 자동 조회는 사용자 조작이 아니라
 * 가드를 태우지 않는다. 서버도 표준 관리자 역할을 다시 본다(MDM016, D1).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";

import type { PickedTerm } from "../columnMng/types";
import {
  regTerm,
  searchTerms,
  type AbbrSuggestion,
  type SimilarTermRow,
} from "./api";

export const OBJ_ID = "termRegPop";

const REASON_LABEL: Record<SimilarTermRow["reason"], string> = {
  EXACT: "같은 표기",
  ENG_NAME: "영문명",
  SYNONYM_ALIAS: "동의어·별칭",
  NAME_PARTIAL: "표기 부분 일치",
  NAME_SIMILAR: "표기 유사",
};

export interface TermRegPopModalProps {
  open: boolean;
  /** `***` 자리의 원 글자. 표기 칸에 미리 채운다. */
  token: string;
  onSelect: (term: PickedTerm) => void;
  onClose: () => void;
}

interface RegForm {
  termName: string;
  senseNo: string;
  definition: string;
  context: string;
  engName: string;
  engAbbr: string;
}

const sectionTitleStyle = {
  margin: "var(--spacing-sm) 0 var(--spacing-xs)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
} as const;

export function TermRegPopModal({
  open,
  token,
  onSelect,
  onClose,
}: TermRegPopModalProps) {
  const rbac = useUserButtonRbac(true);
  const canReg = canDoButton(rbac, OBJ_ID, "reg");
  const canSearch = canDoButton(rbac, OBJ_ID, "search");

  const [similar, setSimilar] = useState<SimilarTermRow[]>([]);
  const [form, setForm] = useState<RegForm>({
    termName: token,
    senseNo: "1",
    definition: "",
    context: "",
    engName: "",
    engAbbr: "",
  });
  const [abbr, setAbbr] = useState<AbbrSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때 유사어·다음 의미 번호 자동 조회(사용자 조작이 아니라 권한 가드 없음).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setForm({
      termName: token,
      senseNo: "1",
      definition: "",
      context: "",
      engName: "",
      engAbbr: "",
    });
    setAbbr(null);
    setError(null);
    setSimilar([]);
    searchTerms(token)
      .then((result) => {
        if (!alive) return;
        setSimilar(result.similar ?? []);
        setForm((prev) => ({
          ...prev,
          senseNo: String(result.nextSenseNo ?? 1),
        }));
      })
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      alive = false;
    };
  }, [open, token]);

  const change = useCallback((key: keyof RegForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === "engAbbr" ? value.toUpperCase() : value,
    }));
  }, []);

  const handleSuggest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await searchTerms(form.termName, form.engName);
      setAbbr(result.abbr);
      if (result.abbr?.suggested) {
        setForm((prev) => ({
          ...prev,
          engAbbr: result.abbr?.suggested ?? prev.engAbbr,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form.termName, form.engName]);

  const handleReg = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const term = await regTerm({
        termName: form.termName.trim(),
        senseNo: Number(form.senseNo),
        definition: form.definition,
        context: form.context,
        engName: form.engName,
        engAbbr: form.engAbbr.trim(),
      });
      onSelect(term);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form, onSelect]);

  const similarColumns = useMemo<GridColumn[]>(
    () => [
      { key: "termName", header: "표기", width: 110 },
      { key: "senseNo", header: "의미", width: 60, align: "center" },
      { key: "definition", header: "정의", width: 220 },
      { key: "engAbbr", header: "약어", width: 90 },
      { key: "reasonLabel", header: "근거", width: 110 },
      {
        key: "use",
        header: "선택",
        width: 110,
        align: "center",
        render: (_value, row) => (
          <Button
            size="mini"
            data-testid={`term-pop-use-${String(row.termId)}`}
            onClick={() =>
              onSelect({
                termId: Number(row.termId),
                termName: String(row.termName),
                senseNo: Number(row.senseNo),
                engAbbr: (row.engAbbr as string | null) ?? null,
              })
            }
          >
            이 용어 사용
          </Button>
        ),
      },
    ],
    [onSelect],
  );

  const similarRows = useMemo(
    () =>
      similar.map((s) => ({
        ...s,
        reasonLabel: REASON_LABEL[s.reason] ?? s.reason,
      })),
    [similar],
  );

  return (
    <Modal
      open={open}
      title={`용어 인라인 등록 — ${token}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            data-testid="term-pop-reg"
            onClick={() => void handleReg()}
            disabled={busy || !canReg}
          >
            등록
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div
        data-testid="term-pop"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-xs)",
          padding: "var(--spacing-sm)",
        }}
      >
        <p style={sectionTitleStyle}>1. 유사어 확인</p>
        <div data-testid="term-pop-similar" style={{ height: 180 }}>
          <AgDataGrid
            columnSizing="fit"
            columns={similarColumns}
            data={similarRows}
            rowKey="termId"
            emptyMessage="비슷한 용어가 없습니다."
          />
        </div>

        <p style={sectionTitleStyle}>2. 새 용어 등록</p>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>표기 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="term-pop-term-name"
                  value={form.termName}
                  maxLength={100}
                  onChange={(v) => change("termName", v)}
                />
              </td>
              <th style={DETAIL_LABEL_CELL}>의미 번호 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="term-pop-sense-no"
                  type="number"
                  value={form.senseNo}
                  onChange={(v) => change("senseNo", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>정의 *</th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <Textarea
                  data-testid="term-pop-definition"
                  value={form.definition}
                  rows={2}
                  onChange={(v) => change("definition", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>맥락</th>
              <td style={DETAIL_VALUE_CELL} colSpan={3}>
                <Input
                  data-testid="term-pop-context"
                  value={form.context}
                  maxLength={100}
                  onChange={(v) => change("context", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>영문명</th>
              <td style={DETAIL_VALUE_CELL}>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--spacing-xs)",
                    alignItems: "center",
                  }}
                >
                  <Input
                    data-testid="term-pop-eng-name"
                    value={form.engName}
                    maxLength={100}
                    onChange={(v) => change("engName", v)}
                  />
                  <Button
                    size="sm"
                    data-testid="term-pop-abbr-suggest"
                    onClick={() => void handleSuggest()}
                    disabled={busy || !canSearch || form.engName.trim() === ""}
                  >
                    약어 제안
                  </Button>
                </div>
              </td>
              <th style={DETAIL_LABEL_CELL}>영문 약어 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="term-pop-abbr"
                  value={form.engAbbr}
                  maxLength={50}
                  onChange={(v) => change("engAbbr", v)}
                />
                {abbr?.baseTaken && abbr.alternatives.length > 0 ? (
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {abbr.base} 사용 중 — 대안: {abbr.alternatives.join(", ")}
                  </span>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>

        {!canReg && !rbac.isLoading ? (
          <p
            data-testid="term-pop-no-permission"
            style={{ color: "var(--color-text-secondary)", margin: 0 }}
          >
            용어 등록은 표준 관리자만 할 수 있습니다. 표준 관리자에게 요청하세요
          </p>
        ) : null}
        {error ? (
          <p
            className="form-error-message"
            role="alert"
            data-testid="term-pop-error"
            style={{ margin: 0, whiteSpace: "pre-line" }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
