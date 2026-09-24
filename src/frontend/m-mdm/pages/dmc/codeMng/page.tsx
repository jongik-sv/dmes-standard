"use client";

/**
 * codeMng — 마루 코드 조회·등록 화면.
 *
 * 정본: docs/mdm/screens/codeMng/codeMng_기능설계서.md, TSK-06-02 design.md §6.11.
 * 목록의 현재 버전·미적용 버전·상태는 서버 계산값을 그대로 보인다(I17·I18). 등록은 MDM 원천만 받으므로 원천은
 * 읽기 전용 표기만 두고 서버로 보내지 않는다(I8). ID 형식은 서버가 검사하고 화면은 필수값만 막는다.
 * 등록이 끝나면 codeEdit 탭을 그 코드로 연다(openMdmPage, §6.10).
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
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, openMdmPage } from "@/shell";

import { registerCode, searchCodes } from "./api";
import { emptyRegForm, LVL_CNT_OPTIONS, STATUS_OPTIONS, type CodeMngRow, type CodeRegForm } from "./types";

const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;

export default function CodeMngPage() {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<CodeMngRow[]>([]);
  const [form, setForm] = useState<CodeRegForm>(emptyRegForm);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openEdit = useCallback((maruCodeId: string) => {
    openMdmPage("dmc/codeEdit", { maruCodeId });
  }, []);

  const columns = useMemo<GridColumn[]>(
    () => [
      {
        key: "maruCodeId",
        header: "마루 코드 ID",
        width: 180,
        align: "left",
        render: (value) => (
          <button
            type="button"
            className="mdm-link-button"
            style={{ background: "none", border: 0, padding: 0, color: "var(--color-primary)", cursor: "pointer" }}
            onClick={() => openEdit(String(value))}
          >
            {String(value)}
          </button>
        ),
      },
      { key: "maruCodeName", header: "이름", width: 200, align: "left" },
      { key: "sourceKind", header: "원천", width: 90, align: "center" },
      { key: "currentVerLabel", header: "현재 버전", width: 150, align: "left" },
      { key: "status", header: "상태", width: 110, align: "center" },
      { key: "unappliedLabel", header: "미적용 버전", width: 200, align: "left" },
    ],
    [openEdit],
  );

  const load = useCallback(async (kw: string, st: string) => {
    setBusy(true);
    try {
      const result = await searchCodes(kw, st);
      setRows(result.rows ?? []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load("", "");
  }, [load]);

  const handleSearch = useCallback(() => void load(keyword, status), [load, keyword, status]);

  const setField = useCallback((key: keyof CodeRegForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRegister = useCallback(async () => {
    if (!form.maruCodeId.trim() || !form.maruCodeName.trim()) {
      setErrorMessage("마루 코드 ID 와 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await registerCode(form);
      showMessage({ message: "등록했습니다", toast: true });
      setForm(emptyRegForm());
      await load(keyword, status);
      openEdit(result.maruCodeId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form, keyword, status, load, openEdit, showMessage]);

  const canReg = canDoButton(rbac, "codeMng", "reg");

  return (
    <MdmPageLayout
      group="dmc"
      screenId="codeMng"
      title="마루 코드"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: busy, action: "search" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="마루 코드">
          <Input
            data-testid="code-search-keyword"
            value={keyword}
            placeholder="ID·이름 부분 일치"
            onChange={setKeyword}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="상태">
          <Select data-testid="code-search-status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </SearchField>
      </SearchArea>

      <ContentBody root>
        <ContentPanel flex="1 1 0">
          <div data-testid="code-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GridPanel title="마루 코드 목록" count={rows.length}>
                <AgDataGrid
                  columnSizing="fit"
                  columns={columns}
                  data={rows as unknown as Record<string, unknown>[]}
                  rowKey="maruCodeId"
                  sortable
                  loading={busy}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 마루 코드가 없습니다"
                />
              </GridPanel>
            </div>
            {loaded && rows.length === 0 && !busy ? (
              <p data-testid="code-list-empty" style={{ ...mutedText, margin: "0 var(--spacing-sm)" }}>
                조회된 마루 코드가 없습니다
              </p>
            ) : null}
          </div>
        </ContentPanel>

        <ContentPanel width={420}>
          <p style={{ padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 }}>마루 코드 등록</p>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>마루 코드 ID *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="code-reg-id"
                    value={form.maruCodeId}
                    maxLength={50}
                    disabled={busy}
                    onChange={(v) => setField("maruCodeId", v)}
                  />
                  <span style={mutedText}>영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 데이터 ID 와 한 이름 공간</span>
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>이름 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="code-reg-name"
                    value={form.maruCodeName}
                    maxLength={100}
                    disabled={busy}
                    onChange={(v) => setField("maruCodeName", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>설명</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Textarea
                    data-testid="code-reg-desc"
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
                    data-testid="code-reg-lvl"
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
                  <span data-testid="code-reg-source">MDM</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
            <Button data-testid="code-reg-save" variant="primary" disabled={busy || !canReg} onClick={() => void handleRegister()}>
              저장
            </Button>
          </div>
        </ContentPanel>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
