"use client";

/**
 * codeMng — 마루 코드 조회·등록·수정 화면(2026-09-28 사용자 결정: codeMng+codeEdit 통합, D-101·D-102).
 *
 * 정본: docs/mdm/screens/codeMng/codeMng_기능설계서.md, TSK-06-02 design.md §6.7·§6.8·§6.11·§6.12.
 * 왼쪽은 목록(조회·행 클릭으로 선택), 오른쪽은 선택한 코드의 상세(헤더·라벨·버전 목록, 옛 codeEdit 본문 — `CodeDetail.tsx`)
 * 이다. 등록은 목록 헤더의 [코드 등록]이 여는 팝업에서 한다(2026-09-30) — 팝업을 여닫아도 선택·상세는 그대로다.
 * 새 탭을 열지 않는다 — 등록 뒤에도 같은 화면에서 방금 만든 코드를 고른 채 보인다.
 * 오른쪽 상세의 모든 쓰기는 옛 codeEdit 그대로 `codeEdit` 서비스를 부르고 권한도 `canDoButton(rbac,"codeEdit",action)`
 * 으로 본다(서버 OBJECT codeEdit 는 메뉴만 없어지고 남는다). 등록만 `canDoButton(rbac,"codeMng","reg")`.
 * 진입 코드는 handoff(openMdmPage) > snapshot 순서로 정하고 받은 값은 snapshot 에 남긴다(§6.10, 옛 codeEdit 그대로).
 *
 * 선택과 응답의 정합(2026-09-28 검토 결함 1): 목록 강조(`selectedId`)와 상세(view·form·버전 선택)는 늘 같은 코드를
 * 가리켜야 한다. 그래서 선택을 바꾸는 길은 `select` 하나로 모은다. 코드에서 코드로 옮길 때(목록 행·handoff)는 이전 상세를
 * 비우지 않고 새 상세가 올 때까지 잠근 채(`stale` — 쓰기·입력·버전 선택 불가, 늦으면 흐리게) 두었다가 같은 DOM 위에 바꿔
 * 그린다(2026-09-29, 행을 바꿀 때마다 상세 전체를 지웠다 다시 그려 깜빡이던 문제). 삭제·조회 실패는 전처럼 비운다.
 * 상세 조회·쓰기 응답은 요청 순번(`detailSeq`)이 지금 것과 다르면 버린다 — 늦게 온 A 응답이 B 화면을 덮지 않는다.
 * 같은 코드를 다시 읽어도(행 다시 누르기·쓰기 뒤) 저장하지 않은 헤더 입력은 말없이 지우지 않는다(2026-10-03, ruleMng 과 같은
 * 규칙) — 입력이 이전 서버 값·새 서버 값과 모두 다르면 남기고, 헤더 저장에는 입력을 시작할 때의 auditVer(`formAuditVer`)를
 * 보내 다른 창 변경은 MDM001 로 드러나게 한다. MDM001 오류창을 닫을 때의 다시 읽기만 입력을 버린다.
 * 조회가 실패하면 선택을 비운다. busy 는 진행 중인 요청 수(`pending`)로 센다. 쓰기(저장·폐기·새 버전·DRAFT 액션·
 * 코드 삭제·등록)가 진행 중이면 목록 행 클릭(↑/↓ 키 이동 포함)을 받지 않는다 — 사용자가 누른 쓰기의 결과(토스트,
 * 충돌 모달과 다시 불러오기)를 그 코드 위에서 보게 하려는 것이다. handoff 는 쓰기 중에도 받으므로 응답 가드는 그대로 둔다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, VEIL_FRESH, VEIL_STALE, openMdmPage, useMdmPageParams } from "@/shell";

import { registerCode, searchCodes } from "./api";
import { versionButtons } from "./buttons";
import { CodeRegisterForm } from "./CodeRegisterForm";
import { CodeHeaderCard, CodeLabelsCard, CodeVersionCard } from "./CodeDetail";
import {
  createVersion,
  cancelConfirm,
  deleteCode,
  deprecateCode,
  draftAction,
  restoreVersion,
  saveHeader,
  viewCode,
  type DraftAction,
} from "./edit-api";
import { CONFLICT_PREFIX, headerFormOf, sameHeaderForm, type CodeEditView, type HeaderForm } from "./edit-types";
import { HandoverModal } from "./HandoverModal";
import { NewVersionModal, type VerKind } from "./NewVersionModal";
import { STATUS_OPTIONS, type CodeMngRow, type CodeRegForm } from "./types";

export interface CodeMngPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const COMPONENT_PATH = "dmc/codeMng";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;

// 이전 코드 상세를 잠근 채 두는 동안의 모습(흐림 시점은 `@/shell` stale-veil).
const VEIL_BOX = { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 } as const;
const DETAIL_FRESH = { ...VEIL_BOX, ...VEIL_FRESH } as const;
const DETAIL_STALE = { ...VEIL_BOX, ...VEIL_STALE } as const;

function DetailVeil({ stale, children }: { stale: boolean; children: ReactNode }) {
  return (
    <div data-testid={stale ? "detail-stale" : undefined} aria-busy={stale || undefined} style={stale ? DETAIL_STALE : DETAIL_FRESH}>
      {children}
    </div>
  );
}

type Mode = "none" | "detail";

interface Target {
  maruCodeId: string;
  ver: string | null;
}

function snapshotTarget(snapshot: unknown): Target | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.maruCodeId !== "string" || !s.maruCodeId) return null;
  return { maruCodeId: s.maruCodeId, ver: typeof s.ver === "string" && s.ver ? s.ver : null };
}

export default function CodeMngPage({ tabId, snapshot, onSnapshotChange }: CodeMngPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);

  // ── 목록(조회조건·그리드) ──
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<CodeMngRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  // 마지막으로 조회에 쓴 조건 — 액션 뒤 목록 재조회는 입력만 하고 [조회] 하지 않은 값이 아니라 이 값을 쓴다.
  const appliedQuery = useRef({ keyword: "", status: "" });

  // ── 화면 모드·선택 ──
  const [mode, setMode] = useState<Mode>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 등록 팝업 — 열 때만 마운트해 열 때마다 칸이 빈다.
  const [isRegOpen, setIsRegOpen] = useState(false);
  // 응답 가드용 — 지금 고른 코드와 상세 요청 순번. 선택을 바꾸거나 새 상세 요청을 낼 때마다 순번을 올린다.
  const selectedIdRef = useRef<string | null>(null);
  const detailSeq = useRef(0);
  // 진행 중인 쓰기 수 — 0 이 아니면 목록 행 클릭을 받지 않는다.
  const writing = useRef(0);

  // ── 오른쪽 상세(옛 codeEdit) ──
  const [view, setView] = useState<CodeEditView | null>(null);
  const [form, setForm] = useState<HeaderForm | null>(null);
  const [selectedVer, setSelectedVer] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);
  const [newVersionKind, setNewVersionKind] = useState<VerKind | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const handedOff = useRef(false);
  // 지금 보이는 상세의 코드 ID·서버 헤더 폼 값과 폼이 기대는 auditVer — 다시 읽은 응답이 사용자가 고친 폼을 덮지 않게 하는 데 쓴다.
  const shownId = useRef<string | null>(null);
  const serverForm = useRef<HeaderForm | null>(null);
  // formAuditVer 를 받을 때의 서버 헤더 값 — 입력을 남긴 채 다시 읽었는데 헤더 값이 이것과 같으면 VER 만 오른 것이다.
  const formBase = useRef<HeaderForm | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const [formAuditVer, setFormAuditVer] = useState<number | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const begin = useCallback(() => setPending((n) => n + 1), []);
  const end = useCallback(() => setPending((n) => Math.max(0, n - 1)), []);

  const writeSnapshotTarget = useCallback(
    (id: string, ver: string | null) => {
      const base = { ...((snapshotRef.current as Record<string, unknown> | null) ?? {}) };
      base.maruCodeId = id;
      if (ver) base.ver = ver;
      else delete base.ver;
      onSnapshotChange?.(base);
    },
    [onSnapshotChange],
  );

  const clearSnapshotTarget = useCallback(() => {
    const base = { ...((snapshotRef.current as Record<string, unknown> | null) ?? {}) };
    delete base.maruCodeId;
    delete base.ver;
    onSnapshotChange?.(base);
  }, [onSnapshotChange]);

  // current=false 는 이미 다른 코드로 옮긴 뒤 도착한 쓰기 실패 — 알리기는 하되 지금 코드를 다시 불러오지는 않는다.
  const fail = useCallback((e: unknown, current = true) => {
    const message = e instanceof Error ? e.message : String(e);
    setError({ message, reload: current && message.startsWith(CONFLICT_PREFIX) });
  }, []);

  const loadList = useCallback(async (kw: string, st: string) => {
    appliedQuery.current = { keyword: kw, status: st };
    setListLoading(true);
    try {
      const result = await searchCodes(kw, st);
      setRows(result.rows ?? []);
    } catch (e) {
      fail(e);
    } finally {
      setListLoading(false);
    }
  }, [fail]);

  const reloadList = useCallback(
    () => loadList(appliedQuery.current.keyword, appliedQuery.current.status),
    [loadList],
  );

  /**
   * 선택을 바꾸는 유일한 길(목록 행·handoff·snapshot·삭제 성공·조회 실패). 열린 모달을 닫고 순번을 올려,
   * 이전 코드로 가던 응답이 도착해도 버려지게 한다. keepDetail 이면 이전 상세를 새 상세가 올 때까지 잠근 채 남기고
   * (`stale`), 아니면 상세·버전 선택을 바로 비운다.
   */
  const select = useCallback((id: string | null, nextMode: Mode, keepDetail = false) => {
    selectedIdRef.current = id;
    detailSeq.current += 1;
    setSelectedId(id);
    setMode(nextMode);
    if (!keepDetail) {
      shownId.current = null;
      serverForm.current = null;
      setView(null);
      setForm(null);
      setSelectedVer(null);
    }
    setNewVersionKind(null);
    setHandoverOpen(false);
  }, []);

  // 상세 view 를 화면 상태로 반영. ver 를 주면(목록 선택·handoff) 그 버전을 고르고, 안 주면(액션 뒤 새로고침) 이전 선택을
  // 버전이 아직 있으면 유지한다.
  // 같은 코드를 다시 읽었는데 사용자가 고친 칸이 있으면(이전 서버 값과도 새 서버 값과도 다르면) 서버 값(버전 목록 등)만
  // 새로 바꾸고 헤더·라벨 폼과 그 폼이 기대는 auditVer 는 그대로 둔다. discard 면(MDM001 뒤 다시 불러오기) 입력을 버린다.
  // sent 는 헤더 저장에 성공했을 때 보낸 폼이다 — 입력이 보낸 그대로면 서버가 trim 해 돌려준 값이 달라 보여도 고친 입력이
  // 아니므로 서버 값·새 auditVer 로 맞춘다(검토 I1). 저장하는 사이 또 고쳤으면 위 규칙대로 남긴다.
  const apply = useCallback((next: CodeEditView, ver?: string | null, discard = false, sent?: HeaderForm) => {
    const nextForm = headerFormOf(next.header);
    const cur = formRef.current;
    const base = serverForm.current;
    const keepForm = !discard && shownId.current === next.header.maruCodeId && !!cur && !!base
      && !(sent && sameHeaderForm(cur, sent))
      && !sameHeaderForm(cur, base) && !sameHeaderForm(cur, nextForm);
    shownId.current = next.header.maruCodeId;
    serverForm.current = nextForm;
    setView(next);
    if (!keepForm) {
      formBase.current = nextForm;
      setForm(nextForm);
      setFormAuditVer(next.header.auditVer);
    } else if (formBase.current && sameHeaderForm(nextForm, formBase.current)) {
      // 헤더 값이 입력을 시작할 때와 칸마다 같으면 다른 창이 헤더를 고치지 않았다 — VER 만 오른 자기 쓰기(새 버전·복원의
      // 첫 INUSE 전환 등) 뒤 거짓 충돌이 나지 않게 저장할 auditVer 를 새 값으로 올린다(검토 M1).
      setFormAuditVer(next.header.auditVer);
    }
    setSelectedVer((prev) => {
      const want = ver === undefined ? prev : ver;
      return want && next.versions.some((v) => v.ver === want) ? want : null;
    });
  }, []);

  const loadDetail = useCallback(
    async (id: string, ver?: string | null, discard = false) => {
      if (!id) return;
      const seq = ++detailSeq.current;
      begin();
      try {
        const next = await viewCode(id);
        if (seq !== detailSeq.current) return; // 그사이 다른 코드를 골랐거나 더 새 요청이 나갔다
        apply(next, ver, discard);
      } catch (e) {
        if (seq !== detailSeq.current) return;
        // 강조만 남고 상세가 이전 코드로 남지 않게 선택을 비운다. snapshot 도 바로 지워 다시 열 때 같은 오류를 또 띄우지 않는다.
        select(null, "none");
        clearSnapshotTarget();
        fail(e);
      } finally {
        end();
      }
    },
    [apply, begin, end, select, clearSnapshotTarget, fail],
  );

  const chooseDetail = useCallback(
    (id: string, ver: string | null) => {
      select(id, "detail", true);
      writeSnapshotTarget(id, ver);
      return loadDetail(id, ver);
    },
    [select, writeSnapshotTarget, loadDetail],
  );

  const handleRowClick = useCallback(
    (id: string) => {
      if (writing.current > 0) return; // 쓰기 결과를 그 코드 위에서 보이도록 쓰기 중에는 선택을 바꾸지 않는다
      void chooseDetail(id, null);
    },
    [chooseDetail],
  );

  // 진입 값: handoff(마운트 때·자기 탭 재활성화 때마다) > snapshot. handoff 는 목록도 함께 조회한다(§9) — 이미 열린
  // 탭이 다시 handoff 를 받을 때(재활성화) 목록이 그 코드로 안 좁혀도 최소한 최신 상태를 보이게.
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruCodeId) {
      handedOff.current = true;
      setKeyword("");
      setStatus("");
      void loadList("", "");
      void chooseDetail(params.maruCodeId, params.ver || null);
    }
  });

  useEffect(() => {
    const fromSnapshot = snapshotTarget(snapshotRef.current);
    if (!handedOff.current && fromSnapshot) {
      select(fromSnapshot.maruCodeId, "detail");
      void loadDetail(fromSnapshot.maruCodeId, fromSnapshot.ver);
    }
    // 첫 진입 자동 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청). snapshot 복원은 상세만 불러 목록에 기대지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => void loadList(keyword, status), [loadList, keyword, status]);

  // 상세를 바꾸는 액션(저장·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기) 뒤에는 목록의 상태·현재·미적용 칸도 다시 조회한다.
  // 응답이 올 때 이미 다른 코드를 골랐으면(handoff) 그 view 는 버린다 — 쓰기 자체는 끝났으므로 토스트·목록 재조회는 한다.
  const run = useCallback(
    async (task: () => Promise<CodeEditView>, done?: string, sent?: HeaderForm) => {
      const seq = ++detailSeq.current;
      writing.current += 1;
      begin();
      try {
        const next = await task();
        if (seq === detailSeq.current) apply(next, undefined, false, sent);
        if (done) showMessage({ message: done, toast: true });
        void reloadList();
      } catch (e) {
        fail(e, seq === detailSeq.current);
      } finally {
        writing.current -= 1;
        end();
      }
    },
    [apply, begin, end, fail, showMessage, reloadList],
  );

  // 목록에서 다른 코드를 골랐고 그 상세가 아직 오지 않았다 — 보이는 상세는 이전 코드 것이라 아무 쓰기도 받지 않는다.
  const stale = mode === "detail" && !!view && view.header.maruCodeId !== selectedId;
  const busy = pending > 0 || stale;
  const header = view?.header;
  const selected = view?.versions.find((v) => v.ver === selectedVer) ?? null;

  const handleSaveHeader = useCallback(() => {
    if (!header || !form) return;
    void run(() => saveHeader(header.maruCodeId, formAuditVer, form), "저장했습니다", form);
  }, [header, form, formAuditVer, run]);

  const handleDeprecate = useCallback(() => {
    if (!header) return;
    void run(() => deprecateCode(header.maruCodeId, header.auditVer), "폐기했습니다");
  }, [header, run]);

  const handleDeleteCode = useCallback(async () => {
    if (!header) return;
    const id = header.maruCodeId;
    const seq = ++detailSeq.current;
    writing.current += 1;
    begin();
    try {
      await deleteCode(id, header.auditVer);
      showMessage({ message: "삭제했습니다", toast: true });
      // 그사이 다른 코드를 골랐으면(handoff) 그 선택은 그대로 둔다.
      if (selectedIdRef.current === id) {
        select(null, "none");
        clearSnapshotTarget();
      }
      await reloadList();
    } catch (e) {
      fail(e, seq === detailSeq.current);
    } finally {
      writing.current -= 1;
      end();
    }
  }, [header, begin, end, showMessage, select, clearSnapshotTarget, reloadList, fail]);

  const setField = useCallback((key: keyof HeaderForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSelectVer = useCallback(
    (ver: string) => {
      if (stale) return;
      setSelectedVer(ver);
      // 버전 카드에서 고른 ver 도 snapshot 에 남겨 새로고침 뒤에도 그 버전을 고른 채 연다.
      if (selectedIdRef.current) writeSnapshotTarget(selectedIdRef.current, ver);
    },
    [stale, writeSnapshotTarget],
  );

  const runDraft = useCallback(
    (action: DraftAction, done: string, newOwnerId?: string) => {
      if (!header || !selected) return;
      void run(() => draftAction(action, header.maruCodeId, selected.ver, selected.rowVersion, newOwnerId), done);
    },
    [header, selected, run],
  );

  // 확정 취소(D8) — 같은 delete 액션에 target:"CONFIRM" 을 실어 보낸다.
  const handleCancelConfirm = useCallback(() => {
    if (!header || !selected) return;
    void run(() => cancelConfirm(header.maruCodeId, selected.ver, selected.rowVersion), "확정을 취소했습니다");
  }, [header, selected, run]);

  const handleNewVersion = useCallback(
    (kind: VerKind, sourceVer: string | null) => {
      if (!header) return;
      setNewVersionKind(null);
      void run(
        () => (sourceVer ? restoreVersion(header.maruCodeId, kind, sourceVer) : createVersion(header.maruCodeId, kind)),
        "새 버전을 만들었습니다",
      );
    },
    [header, run],
  );

  const moveTo = useCallback(
    (componentPath: string) => {
      if (!header || !selected) return;
      openMdmPage(componentPath, { maruCodeId: header.maruCodeId, ver: selected.ver });
    },
    [header, selected],
  );

  // ── 등록(팝업) ──
  const handleRegister = useCallback(
    async (regForm: CodeRegForm) => {
      if (!regForm.maruCodeId.trim() || !regForm.maruCodeName.trim()) {
        setError({ message: "마루 코드 ID 와 이름을 입력하세요.", reload: false });
        return;
      }
      writing.current += 1;
      begin();
      try {
        const result = await registerCode(regForm);
        showMessage({ message: "등록했습니다", toast: true });
        setIsRegOpen(false);
        await reloadList();
        // 새 코드의 상세가 올 때까지 busy 를 쥐고 있는다 — 그 전에 풀리면 안내 문구가 잠깐 보인다.
        await chooseDetail(result.maruCodeId, null);
      } catch (e) {
        fail(e);
      } finally {
        writing.current -= 1;
        end();
      }
    },
    [begin, end, reloadList, chooseDetail, showMessage, fail],
  );

  const columns = useMemo<GridColumn[]>(
    () => [
      {
        key: "maruCodeId",
        header: "마루 코드 ID",
        width: 150,
        align: "left",
        render: (value) => (
          <button
            type="button"
            className="mdm-code-edit-link"
            data-testid={`code-edit-link-${String(value)}`}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-primary)",
              textDecoration: "underline",
              font: "inherit",
            }}
            onClick={() => openMdmPage("dmc/codeItemEdit", { maruCodeId: String(value) })}
          >
            {String(value)}
          </button>
        ),
      },
      { key: "maruCodeName", header: "이름", width: 150, align: "left" },
      { key: "sourceKind", header: "원천", width: 70, align: "center" },
      { key: "currentVerLabel", header: "현재", width: 80, align: "left" },
      { key: "status", header: "상태", width: 70, align: "center" },
      { key: "unappliedLabel", header: "미적용", width: 80, align: "left" },
    ],
    [],
  );

  const canReg = canDoButton(rbac, "codeMng", "reg");
  const buttons = useMemo(() => versionButtons(view, selectedVer), [view, selectedVer]);
  const allowed = useCallback(
    (enabled: boolean, action: string) => !busy && enabled && canDoButton(rbac, "codeEdit", action),
    [busy, rbac],
  );

  return (
    <MdmPageLayout
      group="dmc"
      screenId="codeMng"
      title="마루 코드"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: listLoading, action: "search" },
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

      <ContentBody root resizable storageKey="mdm.dmc.codeMng">
        <ContentPanel key="list" width="42%">
          <div data-testid="code-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GridPanel
                title="마루 코드 목록"
                count={rows.length}
                buttons={[
                  // 권한이 없으면 숨기지 않고 비활성으로 둔다.
                  { id: "btn_code_reg", label: "코드 등록", onClick: () => setIsRegOpen(true), disabled: !canReg || busy || listLoading },
                ]}
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={columns}
                  data={rows as unknown as Record<string, unknown>[]}
                  rowKey="maruCodeId"
                  sortable
                  loading={listLoading}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 마루 코드가 없습니다"
                  emptyTestId="code-list-empty"
                  highlightedRowKey={selectedId}
                  onRowClick={(r) => handleRowClick(String(r.maruCodeId))}
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>

        {mode === "detail" && view && form ? (
          // Part B §4-3 MUST: 분할 골격(ContentBody/ContentPanel)은 이 위치의 직접 자식이어야 drag bar 가 붙는다 —
          // 그래서 CodeDetail.tsx 는 카드 "내용"만 내려주고, 골격은 여기서 직접 그린다.
          <ContentBody key="right" direction="column" resizable storageKey="mdm.dmc.codeMng.detail" flex="1 1 0">
            <ContentBody resizable storageKey="mdm.dmc.codeMng.detail.top">
              <ContentPanel flex="1 1 0">
                <DetailVeil stale={stale}>
                  <CodeHeaderCard
                    header={view.header}
                    form={form}
                    flags={view.flags}
                    buttons={buttons}
                    allowed={allowed}
                    editable={!!view.flags.editable}
                    busy={busy}
                    onFieldChange={setField}
                    onSaveHeader={handleSaveHeader}
                    onDeprecate={handleDeprecate}
                    onDeleteCode={() => void handleDeleteCode()}
                  />
                </DetailVeil>
              </ContentPanel>
              <ContentPanel width={360}>
                <DetailVeil stale={stale}>
                  <CodeLabelsCard form={form} editable={!!view.flags.editable} busy={busy} onFieldChange={setField} />
                </DetailVeil>
              </ContentPanel>
            </ContentBody>
            <ContentPanel>
              <DetailVeil stale={stale}>
                <CodeVersionCard
                  view={view}
                  selectedVer={selectedVer}
                  buttons={buttons}
                  allowed={allowed}
                  onSelectVer={handleSelectVer}
                  onDeleteDraft={() => runDraft("delete", "삭제했습니다")}
                  onCancelConfirm={handleCancelConfirm}
                  onLock={() => runDraft("lock", "선점했습니다")}
                  onUnlock={() => runDraft("unlock", "해제했습니다")}
                  onOpenNewVersion={setNewVersionKind}
                  onOpenHandover={() => setHandoverOpen(true)}
                  onConfirmMove={() => moveTo("dmc/codeConfirm")}
                  onItemEdit={() => moveTo("dmc/codeItemEdit")}
                />
              </DetailVeil>
            </ContentPanel>
          </ContentBody>
        ) : mode === "detail" ? (
          <ContentPanel key="right" flex="1 1 0">
            <p data-testid="detail-loading" style={{ padding: "var(--spacing-md)", ...mutedText }}>상세를 불러오는 중입니다</p>
          </ContentPanel>
        ) : (
          <ContentPanel key="right" flex="1 1 0">
            <p style={{ padding: "var(--spacing-md)", ...mutedText }}>목록에서 마루 코드를 고르거나 [코드 등록] 을 누르세요</p>
          </ContentPanel>
        )}
      </ContentBody>

      {/* 옛 codeEdit 그대로 — 모달은 분할 골격 바깥, 이 화면의 최상위 형제로 둔다. */}
      {mode === "detail" && view ? (
        <NewVersionModal
          open={newVersionKind !== null}
          initialKind={newVersionKind ?? "MAJOR"}
          flags={view.flags}
          restoreSources={view.restoreSources}
          busy={busy}
          onClose={() => setNewVersionKind(null)}
          onSubmit={handleNewVersion}
        />
      ) : null}
      <HandoverModal
        open={handoverOpen}
        busy={busy}
        onClose={() => setHandoverOpen(false)}
        onSubmit={(newOwnerId) => {
          setHandoverOpen(false);
          runDraft("handover", "넘겼습니다", newOwnerId);
        }}
      />

      {/* 열 때만 마운트한다. 오류창이 떠 있는 동안에는 Escape 한 번에 두 창이 함께 닫히지 않도록 이 팝업의 닫기를 무시한다(Local-Rules §18). */}
      {isRegOpen && (
        <Modal
          open
          title="마루 코드 등록"
          size="md"
          onClose={() => {
            if (!error) setIsRegOpen(false);
          }}
        >
          <CodeRegisterForm
            canRegister={canReg}
            busy={busy}
            onSubmit={(f) => void handleRegister(f)}
            onCancel={() => setIsRegOpen(false)}
          />
        </Modal>
      )}

      {error && (
        <ErrorModal
          message={error.message}
          onClose={() => {
            const reload = error.reload;
            setError(null);
            // 렌더 때 값이 아니라 지금 선택을 본다 — 모달이 떠 있는 사이 선택이 바뀌었을 수 있다.
            if (reload && selectedIdRef.current) void loadDetail(selectedIdRef.current, undefined, true);
          }}
        />
      )}
    </MdmPageLayout>
  );
}
