"use client";

/**
 * dataEdit — 마루 데이터 수정 화면(05 「화면」 마루 데이터 수정, TSK-07-02 design.md §1·§2).
 *
 * 진입 코드는 handoff(dataMng 등록 성공, `openMdmPage`) > 상단 select 순서로 정한다(D7 개정 — 기존 범용 인계 모듈
 * `src/shell/page-handoff.ts` 를 쓴다). 저장은 헤더+키 패턴+라벨+lvl_cnt 를 한 액션으로 묶는다(D3). 저장·폐기 모두
 * `auditVer` 를 함께 보내고, 충돌(MDM001)이면 모달을 닫을 때 다시 불러온다(codeEdit 선례).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Button, ComboBox, Input, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, useMdmPageParams } from "@/shell";

import { deprecateData, saveHeader, searchMaruDataOptions, viewDataEdit } from "./api";
import { ROW_VERSION_CONFLICT_PREFIX } from "./messages";
import type { DataMngRow } from "../dataMng/types";
import { ATTR_KEYS, LVL_CNT_OPTIONS, headerFormOf, type AttrKey, type DataEditView, type HeaderForm } from "./types";

export interface DataEditPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const COMPONENT_PATH = "dmd/dataEdit";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;

function snapshotId(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object" && "maruDataId" in snapshot) {
    const id = (snapshot as Record<string, unknown>).maruDataId;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function DataEditPage({ tabId, snapshot, onSnapshotChange }: DataEditPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);
  const [options, setOptions] = useState<DataMngRow[]>([]);
  const [maruDataId, setMaruDataId] = useState("");
  const [view, setView] = useState<DataEditView | null>(null);
  const [form, setForm] = useState<HeaderForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);
  const handedOff = useRef(false);

  const apply = useCallback((next: DataEditView) => {
    setView(next);
    setForm(headerFormOf(next));
  }, []);

  const fail = useCallback((e: unknown) => {
    const message = errorMessage(e);
    setError({ message, reload: message.startsWith(ROW_VERSION_CONFLICT_PREFIX) });
  }, []);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      setBusy(true);
      try {
        apply(await viewDataEdit(id));
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [apply, fail],
  );

  const choose = useCallback(
    (id: string) => {
      setMaruDataId(id);
      onSnapshotChange?.({ ...((snapshot as Record<string, unknown> | null) ?? {}), maruDataId: id });
      void load(id);
    },
    [load, onSnapshotChange, snapshot],
  );

  // 진입 값: handoff(마운트·탭 활성화 때마다 한 번) > snapshot — dataMng 등록 직후 연 탭이면 이 값이 온다(D7, codeEdit 선례).
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruDataId) {
      handedOff.current = true;
      choose(params.maruDataId);
      // 이미 열린 탭이 재활성화되며 받은 ID 는 마운트 때 한 번 조회한 options 에 아직 없을 수 있다(방금
      // dataMng 에서 새로 등록한 경우 등) — 그러면 콤보박스가 라벨 없이 ID 만 보인다. 옵션에 없을 때만 다시 조회한다.
      if (!options.some((o) => o.maruDataId === params.maruDataId)) {
        void searchMaruDataOptions().then(setOptions).catch(fail);
      }
    }
  });

  useEffect(() => {
    const fromSnapshot = snapshotId(snapshot);
    if (!handedOff.current && fromSnapshot) {
      setMaruDataId(fromSnapshot);
      void load(fromSnapshot);
    }
    searchMaruDataOptions().then(setOptions).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(
    async (task: () => Promise<DataEditView>, done?: string) => {
      setBusy(true);
      try {
        apply(await task());
        if (done) showMessage({ message: done, toast: true });
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [apply, fail, showMessage],
  );

  const setField = useCallback((key: keyof HeaderForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSave = useCallback(() => {
    if (!view || !form) return;
    if (!form.maruDataName.trim() || !form.codePattern.trim()) {
      setError({ message: "이름·키 패턴을 입력하세요.", reload: false });
      return;
    }
    void run(() => saveHeader(view.maruDataId, view.auditVer, form), "저장했습니다");
  }, [view, form, run]);

  const handleDeprecate = useCallback(() => {
    if (!view) return;
    showMessage({
      title: "확인",
      message: "폐기하면 이 마루 데이터의 저장·항목 편집을 더 할 수 없습니다. 폐기할까요?",
      alertType: "confirm",
      onConfirm: () => void run(() => deprecateData(view.maruDataId, view.auditVer), "폐기했습니다"),
    });
  }, [view, run, showMessage]);

  const comboData = useMemo(
    () => options.map((o) => ({ value: o.maruDataId, label: `${o.maruDataId} ${o.maruDataName}` })),
    [options],
  );

  const editable = !!view?.editable;
  const canSave = !busy && editable && canDoButton(rbac, "dataEdit", "save");
  const canDeprecate = !busy && editable && canDoButton(rbac, "dataEdit", "delete");

  return (
    <MdmPageLayout
      group="dmd"
      screenId="dataEdit"
      title="마루 데이터 수정"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void load(maruDataId),
          type: "primary" as const,
          disabled: busy || !maruDataId,
          action: "view",
        },
      ]}
    >
      <SearchArea onSearch={() => void load(maruDataId)}>
        <SearchField label="마루 데이터">
          <div data-testid="data-edit-pick">
            <ComboBox data={comboData} value={maruDataId} placeholder="마루 데이터 선택" onChange={(v) => v && choose(v)} />
          </div>
        </SearchField>
      </SearchArea>

      {!view || !form ? (
        <ContentBody root>
          <ContentPanel>
            <p style={{ padding: "var(--spacing-md)", ...mutedText }} data-testid="data-edit-empty">
              마루 데이터를 고르세요
            </p>
          </ContentPanel>
        </ContentBody>
      ) : (
        <ContentBody root direction="column">
          <ContentBody>
            <ContentPanel flex="1 1 0">
              <p style={cardTitle}>① 헤더</p>
              <table style={DETAIL_TABLE_STYLE}>
                <tbody>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>마루 데이터 ID</th>
                    <td style={DETAIL_VALUE_CELL}>{view.maruDataId}</td>
                    <th style={DETAIL_LABEL_CELL}>원천</th>
                    <td style={DETAIL_VALUE_CELL}>{view.sourceKind}</td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>상태</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <span data-testid="data-edit-status">{view.status}</span>
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>이름 *</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Input
                        data-testid="data-edit-name"
                        value={form.maruDataName}
                        maxLength={100}
                        disabled={!editable}
                        onChange={(v) => setField("maruDataName", v)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>키 패턴 *</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Input
                        data-testid="data-edit-pattern"
                        value={form.codePattern}
                        disabled={!editable}
                        onChange={(v) => setField("codePattern", v)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>설명</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Input
                        data-testid="data-edit-desc"
                        value={form.description}
                        disabled={!editable}
                        onChange={(v) => setField("description", v)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Select
                        data-testid="data-edit-lvl"
                        value={form.lvlCnt}
                        options={LVL_CNT_OPTIONS}
                        disabled={!editable}
                        onChange={(v) => setField("lvlCnt", v)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </ContentPanel>
          </ContentBody>

          <ContentBody>
            <ContentPanel flex="1 1 0">
              <p style={cardTitle}>② 추가 컬럼 라벨</p>
              <table style={DETAIL_TABLE_STYLE}>
                <tbody>
                  {ATTR_KEYS.map((key: AttrKey, i) => (
                    <tr key={key}>
                      <th style={DETAIL_LABEL_CELL}>{`attr${String(i + 1).padStart(2, "0")}`}</th>
                      <td style={DETAIL_VALUE_CELL}>
                        <Input
                          data-testid={`data-edit-${key}`}
                          value={form[key]}
                          maxLength={100}
                          disabled={!editable}
                          onChange={(v) => setField(key, v)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContentPanel>

            <ContentPanel width={360}>
              <p style={cardTitle}>③ 카테고리 요약</p>
              <div data-testid="data-edit-categories" style={{ padding: "0 var(--spacing-md) var(--spacing-md)" }}>
                {view.categories.length === 0 ? (
                  <p style={mutedText}>카테고리가 없습니다</p>
                ) : (
                  <table style={DETAIL_TABLE_STYLE}>
                    <tbody>
                      {view.categories.map((c) => (
                        <tr key={c.cateId} data-testid={`data-edit-cate-${c.cateId}`}>
                          <th style={DETAIL_LABEL_CELL}>{c.cateName}</th>
                          <td style={DETAIL_VALUE_CELL}>
                            {c.defKind} · {c.open ? "열림" : "닫힘"} · 매칭 {c.matchCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </ContentPanel>
          </ContentBody>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "var(--spacing-sm) var(--spacing-md)" }}>
            <Button data-testid="data-edit-deprecate" variant="default" disabled={!canDeprecate} onClick={handleDeprecate}>
              폐기
            </Button>
            <Button data-testid="data-edit-save" variant="primary" disabled={!canSave} onClick={handleSave}>
              저장
            </Button>
          </div>
        </ContentBody>
      )}

      {error && (
        <ErrorModal
          message={error.message}
          onClose={() => {
            setError(null);
            if (error.reload) void load(maruDataId);
          }}
        />
      )}
    </MdmPageLayout>
  );
}
