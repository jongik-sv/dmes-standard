"use client";

/**
 * dataCsvUploadPop — 항목 CSV 업로드 팝업(TSK-07-04 design.md §1 D2). `dataItemMng` 화면 안에서 "CSV 업로드" 버튼으로
 * 연다(page.tsx·메뉴 leaf 없음, termRegPop 과 같은 모양).
 *
 * 화면은 CSV 를 파싱하지 않는다(D3) — `FileReader.readAsText`(UTF-8)로 원문만 읽어 "검증"·"저장" 두 조작만
 * 서버(`validateCsv`/`saveCsv`)에 넘긴다. "검증"에서 받은 오류 0건이어야 "저장"이 눌린다(서버가 저장 시점에 다시
 * 검사하므로 화면의 이 판정은 버튼 가드일 뿐이다, D3).
 *
 * RBAC: 팝업은 자기 serviceId(dataCsvUploadPop)로 OASIS 를 호출하므로 자기 OBJ_ID × 실제 액션명으로 판정한다
 * (termRegPop 선례). [검증]은 `validate`, [저장]은 `save`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import type { AttrLabel } from "../dataItemMng/types";
import { CSV_COLS, saveCsv, validateCsv, type DataCsvRow, type DataCsvValidateResult } from "./api";

export const OBJ_ID = "dataCsvUploadPop";

export interface DataCsvUploadPopModalProps {
  open: boolean;
  maruDataId: string;
  maruDataName: string;
  lvlCnt: number;
  attrLabels: AttrLabel[];
  onClose: () => void;
  /** 저장 성공 후 — 부모(dataItemMng)가 목록을 다시 부른다. */
  onSaved: () => void;
}

const columns: GridColumn[] = [
  { key: "lineNo", header: "줄", meta: false, width: 60, align: "right" },
  { key: "code", header: "키", width: 140 },
  { key: "action", header: "동작", meta: false, width: 90, align: "center" },
  {
    key: "issues",
    header: "오류",
    meta: false,
    width: 320,
    render: (_v, row) => {
      const issues = (row.issues as string[] | undefined) ?? [];
      return issues.join(" · ");
    },
  },
];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DataCsvUploadPopModal({
  open,
  maruDataId,
  maruDataName,
  lvlCnt,
  attrLabels,
  onClose,
  onSaved,
}: DataCsvUploadPopModalProps) {
  const rbac = useUserButtonRbac(true);
  const canValidate = canDoButton(rbac, OBJ_ID, "validate");
  const canSave = canDoButton(rbac, OBJ_ID, "save");
  const { showMessage } = useMessage();

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<DataCsvValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 열릴 때마다 이전 팝업의 상태를 남기지 않는다.
  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setCsvText(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  const handleFile = useCallback((file: File | null) => {
    setResult(null);
    setError(null);
    if (!file) {
      setFileName(null);
      setCsvText(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.onerror = () => setError("파일을 읽지 못했습니다.");
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleValidate = useCallback(async () => {
    if (csvText === null) return;
    setBusy(true);
    setError(null);
    try {
      const out = await validateCsv(maruDataId, csvText);
      setResult(out);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [csvText, maruDataId]);

  const handleSave = useCallback(async () => {
    if (csvText === null) return;
    setBusy(true);
    setError(null);
    try {
      await saveCsv(maruDataId, csvText);
      showMessage({ message: "저장했습니다", toast: true });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [csvText, maruDataId, onClose, onSaved, showMessage]);

  const canSubmitSave = !!result && result.errorCount === 0;
  const rows: DataCsvRow[] = result?.rows ?? [];

  return (
    <Modal
      open={open}
      title={`CSV 업로드 — ${maruDataName}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            data-testid="csv-pop-save"
            disabled={busy || !canSave || !canSubmitSave}
            onClick={() => void handleSave()}
          >
            저장
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div
        data-testid="csv-pop"
        style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)", padding: "var(--spacing-sm)" }}
      >
        <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          열 {lvlCnt}차까지 계층{attrLabels.length > 0 ? `, 추가 칸 ${attrLabels.map((a) => a.label).join("·")}` : ""} —
          헤더는 {CSV_COLS.join(",")} 20열 고정 순서입니다.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
          <input
            ref={fileInputRef}
            data-testid="csv-pop-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            data-testid="csv-pop-validate"
            size="sm"
            disabled={busy || !canValidate || csvText === null}
            onClick={() => void handleValidate()}
          >
            검증
          </Button>
          {fileName && <span style={{ color: "var(--color-text-secondary)" }}>{fileName}</span>}
        </div>

        {result && (
          <p data-testid="csv-pop-summary" style={{ margin: 0 }}>
            신규 {result.insertCount} · 수정 {result.updateCount} · 변경없음 {result.noneCount} · 오류{" "}
            {result.errorCount}
          </p>
        )}

        {result && (
          <div data-testid="csv-pop-rows" style={{ height: 260 }}>
            <AgDataGrid
              columnSizing="fit"
              columns={columns}
              data={rows as unknown as Record<string, unknown>[]}
              rowKey="lineNo"
              emptyMessage="결과가 없습니다."
            />
          </div>
        )}

        {error && (
          <p className="form-error-message" role="alert" data-testid="csv-pop-error" style={{ margin: 0, whiteSpace: "pre-line" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
