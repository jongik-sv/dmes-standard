"use client";

/**
 * codeEdit — 마루 코드 수정 화면(헤더·추가 컬럼 라벨·폐기·버전 목록).
 *
 * 정본: docs/mdm/screens/codeEdit/codeEdit_기능설계서.md, TSK-06-02 design.md §6.12.
 * 진입 코드는 handoff(openMdmPage) > snapshot 순서로 정하고 받은 값은 snapshot 에 남긴다(§6.10).
 * 모든 쓰기는 헤더 auditVer·선택 버전 rowVersion 을 함께 보내고, 서버 응답(CodeEditView)으로 화면을 다시 그린다.
 * "다른 사용자가 수정했습니다"(MDM001) 오류는 모달을 닫을 때 다시 불러온다.
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
import { Button, ComboBox, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  DraftLockBadge,
  MdmPageLayout,
  VersionStatusBadge,
  useMdmPageParams,
  type MdmVersionStatus,
} from "@/shell";

import { deprecateCode, saveHeader, searchCodeOptions, viewCode } from "./api";
import {
  ATTR_KEYS,
  CONFLICT_PREFIX,
  LVL_CNT_OPTIONS,
  headerFormOf,
  type CodeEditView,
  type CodeOption,
  type HeaderForm,
} from "./types";

export interface CodeEditPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const COMPONENT_PATH = "dmc/codeEdit";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;
const cellStyle = { ...DETAIL_VALUE_CELL, padding: "4px 8px" } as const;
const headStyle = { ...DETAIL_LABEL_CELL, padding: "4px 8px", textAlign: "left" as const };

function snapshotCodeId(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object" && "maruCodeId" in snapshot) {
    const id = (snapshot as Record<string, unknown>).maruCodeId;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

export default function CodeEditPage({ tabId, snapshot, onSnapshotChange }: CodeEditPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);
  const [options, setOptions] = useState<CodeOption[]>([]);
  const [codeId, setCodeId] = useState<string>("");
  const [view, setView] = useState<CodeEditView | null>(null);
  const [form, setForm] = useState<HeaderForm | null>(null);
  const [selectedVer, setSelectedVer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);
  const handedOff = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const apply = useCallback((next: CodeEditView) => {
    setView(next);
    setForm(headerFormOf(next.header));
    setSelectedVer((prev) => (prev && next.versions.some((v) => v.ver === prev) ? prev : null));
  }, []);

  const fail = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    setError({ message, reload: message.startsWith(CONFLICT_PREFIX) });
  }, []);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      setBusy(true);
      try {
        apply(await viewCode(id));
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
      setCodeId(id);
      setSelectedVer(null);
      onSnapshotChange?.({ ...((snapshotRef.current as Record<string, unknown> | null) ?? {}), maruCodeId: id });
      void load(id);
    },
    [load, onSnapshotChange],
  );

  // 진입 값: handoff(한 번만) > snapshot
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruCodeId) {
      handedOff.current = true;
      choose(params.maruCodeId);
    }
  });

  useEffect(() => {
    const fromSnapshot = snapshotCodeId(snapshotRef.current);
    if (!handedOff.current && fromSnapshot) {
      setCodeId(fromSnapshot);
      void load(fromSnapshot);
    }
    searchCodeOptions()
      .then(setOptions)
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(
    async (task: () => Promise<CodeEditView>, done?: string) => {
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

  const header = view?.header;
  const flags = view?.flags;
  const editable = !!flags?.editable;
  const unappliedCount = flags?.unappliedCount ?? 0;

  const handleSaveHeader = useCallback(() => {
    if (!header || !form) return;
    void run(() => saveHeader(header.maruCodeId, header.auditVer, form), "저장했습니다");
  }, [header, form, run]);

  const handleDeprecate = useCallback(() => {
    if (!header) return;
    showMessage({
      title: "확인",
      message: "폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?",
      alertType: "confirm",
      onConfirm: () => void run(() => deprecateCode(header.maruCodeId, header.auditVer), "폐기했습니다"),
    });
  }, [header, run, showMessage]);

  const setField = useCallback((key: keyof HeaderForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const comboData = useMemo(
    () => options.map((o) => ({ value: o.maruCodeId, label: `${o.maruCodeId} ${o.maruCodeName}` })),
    [options],
  );

  const canSaveHeader = editable && unappliedCount < 2 && canDoButton(rbac, "codeEdit", "save");
  const canDeprecate =
    editable && header?.storedStatus !== "DEPRECATED" && unappliedCount === 0 && canDoButton(rbac, "codeEdit", "execute");

  return (
    <MdmPageLayout
      group="dmc"
      screenId="codeEdit"
      title="마루 코드 수정"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void load(codeId),
          type: "primary" as const,
          disabled: busy || !codeId,
          action: "search",
        },
      ]}
    >
      <SearchArea onSearch={() => void load(codeId)}>
        <SearchField label="마루 코드">
          <div data-testid="code-pick">
            <ComboBox data={comboData} value={codeId} placeholder="마루 코드 선택" onChange={(v) => v && choose(v)} />
          </div>
        </SearchField>
      </SearchArea>

      {!view || !header || !form ? (
        <ContentBody root>
          <ContentPanel>
            <p style={{ padding: "var(--spacing-md)", ...mutedText }}>마루 코드를 고르세요</p>
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
                    <th style={DETAIL_LABEL_CELL}>마루 코드 ID</th>
                    <td style={DETAIL_VALUE_CELL}>{header.maruCodeId}</td>
                    <th style={DETAIL_LABEL_CELL}>원천</th>
                    <td style={DETAIL_VALUE_CELL}>{header.sourceKind}</td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>상태</th>
                    <td style={DETAIL_VALUE_CELL}>
                      <span data-testid="header-status">{header.status}</span>
                    </td>
                    <th style={DETAIL_LABEL_CELL}>현재 버전</th>
                    <td style={DETAIL_VALUE_CELL}>
                      {header.currentVerLabel} · 미적용 {header.unappliedLabel}
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>이름 *</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Input
                        data-testid="header-name"
                        value={form.maruCodeName}
                        maxLength={100}
                        disabled={!editable || busy}
                        onChange={(v) => setField("maruCodeName", v)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>설명</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Textarea
                        data-testid="header-desc"
                        value={form.description}
                        disabled={!editable || busy}
                        onChange={(v) => setField("description", v)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
                    <td style={DETAIL_VALUE_CELL} colSpan={3}>
                      <Select
                        data-testid="header-lvl"
                        value={form.lvlCnt}
                        options={LVL_CNT_OPTIONS}
                        disabled={!editable || busy}
                        onChange={(v) => setField("lvlCnt", v)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={{ padding: "0 var(--spacing-md)", ...mutedText }}>
                이름·설명·계층 칸 수·라벨은 버전 밖의 값이라 결재 없이 고친다
              </p>
              <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
                <Button data-testid="header-save" variant="primary" disabled={busy || !canSaveHeader} onClick={handleSaveHeader}>
                  경미 수정 저장
                </Button>
                <Button data-testid="header-deprecate" variant="danger" disabled={busy || !canDeprecate} onClick={handleDeprecate}>
                  폐기
                </Button>
              </div>
            </ContentPanel>

            <ContentPanel width={360}>
              <p style={cardTitle}>② 추가 컬럼 라벨</p>
              <table style={DETAIL_TABLE_STYLE}>
                <tbody>
                  {ATTR_KEYS.map((key, i) => {
                    const no = String(i + 1).padStart(2, "0");
                    return (
                      <tr key={key}>
                        <th style={DETAIL_LABEL_CELL}>attr{no}</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            data-testid={`label-attr${no}`}
                            value={form[key]}
                            maxLength={100}
                            disabled={!editable || busy}
                            onChange={(v) => setField(key, v)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ padding: "0 var(--spacing-md) var(--spacing-sm)", ...mutedText }}>
                라벨이 있는 번호만 값을 받는다. 지운 번호를 다른 뜻으로 다시 쓰지 않는다
              </p>
            </ContentPanel>
          </ContentBody>

          <ContentPanel>
            <p style={cardTitle}>③ 버전 목록</p>
            {unappliedCount >= 2 ? (
              <p data-testid="ver-unapplied-warning" style={{ padding: "0 var(--spacing-md)", color: "var(--color-danger)" }}>
                미적용 버전이 2개입니다. 하나를 삭제하세요
              </p>
            ) : null}
            {view.versions.length === 0 ? (
              <p data-testid="version-empty" style={{ padding: "var(--spacing-sm) var(--spacing-md)", ...mutedText }}>
                버전이 없습니다
              </p>
            ) : (
              <div style={{ padding: "0 var(--spacing-md)", overflow: "auto" }}>
                <table data-testid="version-list" style={{ ...DETAIL_TABLE_STYLE, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={headStyle}>버전</th>
                      <th style={headStyle}>종류</th>
                      <th style={headStyle}>상태</th>
                      <th style={headStyle}>적용 구간</th>
                      <th style={headStyle}>확정 일시</th>
                      <th style={headStyle}>소유자</th>
                      <th style={headStyle}>설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.versions.map((v) => (
                      <tr
                        key={v.ver}
                        data-testid={`version-row-${v.ver}`}
                        aria-selected={selectedVer === v.ver}
                        onClick={() => setSelectedVer(v.ver)}
                        style={{
                          cursor: "pointer",
                          background: selectedVer === v.ver ? "var(--color-primary-soft)" : undefined,
                        }}
                      >
                        <td style={cellStyle}>
                          {v.verLabel}
                          {v.restoredLabel ? <span style={mutedText}> ({v.restoredLabel})</span> : null}
                        </td>
                        <td style={cellStyle}>{v.verKind}</td>
                        <td style={cellStyle}>
                          <VersionStatusBadge status={v.status as MdmVersionStatus} applyFrom={v.applyFrom} />
                        </td>
                        <td style={cellStyle}>{v.applyFrom ? `${v.applyFrom} - ${v.applyTo ?? ""}` : "—"}</td>
                        <td style={cellStyle}>{v.releasedAt ?? "—"}</td>
                        <td style={cellStyle}>
                          <DraftLockBadge status={v.status as MdmVersionStatus} ownerId={v.ownerId} currentUserId={view.me} />
                        </td>
                        <td style={cellStyle}>{v.description ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ContentPanel>
        </ContentBody>
      )}

      {error && (
        <ErrorModal
          message={error.message}
          onClose={() => {
            const reload = error.reload;
            setError(null);
            if (reload) void load(codeId);
          }}
        />
      )}
    </MdmPageLayout>
  );
}
