"use client";

/**
 * dataMng — 마루 데이터 조회·등록 화면(05 「화면」 마루 데이터 조회·등록, TSK-07-02 design.md §1·§2).
 *
 * 조회는 ID·이름·상태(D2, 배포 대상·항목 수 등은 뺀다). 등록은 MDM 원천만 받고(R10) ID·이름·설명·키 패턴·계층 칸 수를
 * 입력받는다 — 원천 종류·원천 시스템·배포 대상 시스템 카드는 만들지 않는다(D1). 등록이 성공하면 dataEdit 탭을 그 ID 로
 * 연다(D7 개정 — 전용 `dataHandoff` 모듈 대신 기존 범용 인계 모듈 `src/shell/page-handoff.ts`(TSK-06-02 D12)의
 * `openMdmPage`를 쓴다, `dmc/codeMng` 선례와 동일).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, openMdmPage } from "@/shell";

import { registerDataMng, searchDataMng } from "./api";
import { buildDataMngColumns } from "./columns";
import { LVL_CNT_OPTIONS, STATUS_OPTIONS, emptyRegForm, errorMessage, type DataMngRegForm, type DataMngRow } from "./types";

const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;

export default function DataMngPage() {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<DataMngRow[]>([]);
  const [form, setForm] = useState<DataMngRegForm>(emptyRegForm);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEdit = useCallback((maruDataId: string) => {
    openMdmPage("dmd/dataEdit", { maruDataId });
  }, []);

  const load = useCallback(async (i: string, n: string, s: string) => {
    setBusy(true);
    try {
      const result = await searchDataMng(i, n, s);
      setRows(result.list ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load("", "", "");
  }, [load]);

  const handleSearch = useCallback(() => void load(id, name, status), [load, id, name, status]);

  const columns = useMemo(() => buildDataMngColumns(openEdit), [openEdit]);

  const setField = useCallback((key: keyof DataMngRegForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRegister = useCallback(async () => {
    if (!form.maruDataId.trim() || !form.maruDataName.trim() || !form.codePattern.trim()) {
      setError("마루 데이터 ID·이름·키 패턴을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await registerDataMng(form);
      showMessage({ message: "등록했습니다", toast: true });
      setForm(emptyRegForm());
      await load(id, name, status);
      const registeredId = result.maruDataId ?? form.maruDataId.trim();
      openEdit(registeredId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [form, id, name, status, load, openEdit, showMessage]);

  const canReg = canDoButton(rbac, "dataMng", "reg");

  return (
    <MdmPageLayout
      group="dmd"
      screenId="dataMng"
      title="마루 데이터"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: busy, action: "search" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="ID">
          <Input
            data-testid="data-mng-search-id"
            value={id}
            onChange={setId}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="이름">
          <Input
            data-testid="data-mng-search-name"
            value={name}
            onChange={setName}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="상태">
          <Select data-testid="data-mng-search-status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dmd.dataMng">
        <ContentPanel flex="1 1 0">
          <div data-testid="data-mng-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GridPanel title="마루 데이터 목록" count={rows.length}>
                <AgDataGrid
                  columnSizing="fit"
                  columns={columns}
                  data={rows as unknown as Record<string, unknown>[]}
                  rowKey="maruDataId"
                  sortable
                  loading={busy}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 마루 데이터가 없습니다"
                />
              </GridPanel>
            </div>
            {loaded && rows.length === 0 && !busy ? (
              <p data-testid="data-mng-list-empty" style={{ ...mutedText, margin: "0 var(--spacing-sm)" }}>
                조회된 마루 데이터가 없습니다
              </p>
            ) : null}
          </div>
        </ContentPanel>

        <ContentPanel width={420}>
          <p style={{ padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 }}>마루 데이터 등록</p>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>마루 데이터 ID *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="data-mng-reg-id"
                    value={form.maruDataId}
                    maxLength={50}
                    disabled={busy}
                    onChange={(v) => setField("maruDataId", v)}
                  />
                  <span style={mutedText}>영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 코드 ID 와 한 이름 공간</span>
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>이름 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="data-mng-reg-name"
                    value={form.maruDataName}
                    maxLength={100}
                    disabled={busy}
                    onChange={(v) => setField("maruDataName", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>키 패턴 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="data-mng-reg-pattern"
                    value={form.codePattern}
                    disabled={busy}
                    onChange={(v) => setField("codePattern", v)}
                  />
                  <span style={mutedText}>항목 키 형식 정규식</span>
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>설명</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="data-mng-reg-desc"
                    value={form.description}
                    disabled={busy}
                    onChange={(v) => setField("description", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    data-testid="data-mng-reg-lvl"
                    value={form.lvlCnt}
                    options={LVL_CNT_OPTIONS}
                    disabled={busy}
                    onChange={(v) => setField("lvlCnt", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>원천</th>
                <td style={DETAIL_VALUE_CELL}>
                  <span data-testid="data-mng-reg-source">MDM</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
            <Button
              data-testid="data-mng-reg-save"
              variant="primary"
              disabled={busy || !canReg}
              onClick={() => void handleRegister()}
            >
              등록
            </Button>
          </div>
        </ContentPanel>
      </ContentBody>

      {error && <ErrorModal message={error} onClose={() => setError(null)} />}
    </MdmPageLayout>
  );
}
