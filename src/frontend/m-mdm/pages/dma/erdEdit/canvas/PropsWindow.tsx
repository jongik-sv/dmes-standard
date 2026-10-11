"use client";

/**
 * Space 속성 창(2차 c4) — 고른 표 하나의 표 기본·컬럼 기본 칸·키·관계를 한 창에서 고친다. [적용] = 고친 것만 명령 한 묶음(되돌리기 1번).
 * 초안 state 는 이 창 안에만 있다. 글자를 칠 때 캔버스·화면 루트는 다시 그려지지 않는다(R12).
 * 창을 연 뒤 모델이 바뀌어도 초안은 그대로 둔다(내가 고치던 값을 덮지 않는다). 고쳤는지는 열 때 값(base)과 비교한다 —
 * 손대지 않은 칸은 보내지 않고, 내가 고친 칸을 남도 바꿨으면 보내지 않고 다시 열라고 알린다(propsCommands).
 * 바깥 누르기로는 닫지 않는다(초안을 잃지 않게). 도메인 찾기 팝업이 떠 있는 동안 Esc 는 팝업만 닫는다(Local-Rules §18).
 * 컬럼 타입·길이·기본값·설명 같은 자세한 칸은 컬럼 그리드에서 고친다.
 * 컬럼·키·관계 목록은 AgDataGrid(height="auto")다. 열 정의와 셀 부품은 모듈 상수이고, 셀은 행의 자리(i)만 받아 초안·잠금 같은 최신 값을
 * 컨텍스트(PropsCtx)에서 읽는다 — 글자를 칠 때 그리드는 rowData·열 정의를 다시 받지 않아 입력 칸이 다시 만들어지지 않는다(초점 유지).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button, Checkbox, Input, MultiSelectComboBox, Select, type SelectOption } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import { DomainField, type DomainRow } from "@/domain";

import { searchErdDomains } from "../panels/GridInputBar";
import type { ErdModelJson } from "../types";
import {
  CARD_LABEL, CHILD_CARDS, PARENT_CARDS, draftOf, propsCommands, type DraftColumn, type DraftKey, type DraftRelation, type PropsDraft,
} from "./erd-props";

export interface PropsWindowProps {
  /** 연 표 id. null = 닫힘. */
  tableId: string | null;
  model: ErdModelJson;
  /** 도메인 이름(모델에 쓰인 도메인, 키 = domainId 문자열). 고르기는 도메인 사전 전체에서 찾는다. */
  domains: Readonly<Record<string, { name: string }>>;
  /** 고칠 수 없으면 그 이유(창은 읽기 전용으로 연다). 추정 관계 판정도 리뷰 패널처럼 모델 편집 권한으로 막는다. */
  readOnly: string | null;
  /** 적용. 거절이면 창에 보일 문구, 받아들이면 null(창을 닫는다). */
  onSubmit(commands: ReturnType<typeof propsCommands>["commands"], tableId: string): Promise<string | null>;
  newKeyId(): string;
  onClose(): void;
}

const PARENT_OPTIONS: SelectOption[] = PARENT_CARDS.map((v) => ({ value: v, label: CARD_LABEL[v] }));
const CHILD_OPTIONS: SelectOption[] = CHILD_CARDS.map((v) => ({ value: v, label: CARD_LABEL[v] }));
const KIND_OPTIONS: SelectOption[] = [{ value: "UK", label: "UK(고유)" }, { value: "IX", label: "IX(색인)" }];
const DECISION_OPTIONS: SelectOption[] = [{ value: "", label: "그대로" }, { value: "confirm", label: "확정" }, { value: "reject", label: "기각" }];
const STATE_LABEL: Readonly<Record<string, string>> = { DB: "DB", INFERRED: "추정", CONFIRMED: "확정", REJECTED: "기각" };

/** 그리드 행. rid = 행 id(새 키는 `new-자리`), i = 초안 배열 자리. 셀은 이 둘만 알고 값은 컨텍스트에서 읽는다. */
interface PropsRow extends Record<string, unknown> {
  rid: string;
  i: number;
}

interface PropsActions {
  patchCol(id: string, p: Partial<DraftColumn>): void;
  patchKey(k: number, p: Partial<DraftKey>): void;
  patchRel(id: string, p: Partial<DraftRelation>): void;
  pickDomain(col: string, row: DomainRow | null): void;
  setFinding(open: boolean): void;
}

interface PropsView extends PropsActions {
  draft: PropsDraft;
  locked: boolean;
  columnOptions: readonly { value: string; label: string }[];
  domainLabel(d: number | null): string;
  physOf(t: string): string;
}

const PropsCtx = createContext<PropsView | null>(null);

function usePropsView(): PropsView {
  const v = useContext(PropsCtx);
  if (!v) throw new Error("PropsCtx 밖에서 속성 창 셀을 그렸습니다.");
  return v;
}

/** id 목록이 그대로면 같은 행 배열을 돌려준다(그리드가 rowData 를 다시 받지 않게). */
function useRows(ids: readonly string[]): PropsRow[] {
  const ref = useRef<{ ids: readonly string[]; rows: PropsRow[] }>({ ids: [], rows: [] });
  const prev = ref.current.ids;
  if (prev.length !== ids.length || ids.some((x, n) => x !== prev[n])) {
    ref.current = { ids, rows: ids.map((rid, i) => ({ rid, i })) };
  }
  return ref.current.rows;
}

const NO_IDS: readonly string[] = [];
const rowHeight = () => 34;
/** 작은 목록 공통 — 머리줄·설정 메뉴·걸러 보기·개인화 없이 행 수만큼 늘어난다. 셀은 입력 칸이라 행 커서·화면 문맥 게시도 끈다. */
const SMALL_GRID = {
  height: "auto", columnSizing: "fit", header: false, settingsMenu: false, filter: false, personalize: false, excelExport: false,
  sortable: false, highlightedRowKey: null, publishScreenContext: false, getRowHeight: rowHeight,
} as const;

function Cell({ deleted, center, testId, children }: { deleted?: boolean; center?: boolean; testId?: string; children: ReactNode }) {
  return (
    <div className={center ? "erd-props__cell erd-props__cell--center" : "erd-props__cell"} data-testid={testId} data-deleted={deleted ? "" : undefined}>
      {children}
    </div>
  );
}

function ColLogical({ i }: { i: number }) {
  const { draft, locked, patchCol } = usePropsView();
  const c = draft.columns[i];
  if (!c) return null;
  return (
    <Cell testId={`erd-props-col-${c.id}`}>
      <Input aria-label="논리명" value={c.logical} disabled={locked} onChange={(v) => patchCol(c.id, { logical: v })} />
    </Cell>
  );
}

function ColPhys({ i }: { i: number }) {
  const { draft, locked, patchCol } = usePropsView();
  const c = draft.columns[i];
  if (!c) return null;
  return (
    <Cell>
      <Input aria-label="물리명" value={c.phys} disabled={locked} onChange={(v) => patchCol(c.id, { phys: v.toUpperCase() })} />
    </Cell>
  );
}

function ColDomain({ i }: { i: number }) {
  const { draft, locked, domainLabel, pickDomain, setFinding } = usePropsView();
  const c = draft.columns[i];
  if (!c) return null;
  return (
    <Cell>
      <DomainField testId={`erd-props-domain-${c.id}`} ariaLabel="도메인" domainId={c.domainId} label={domainLabel(c.domainId)}
        search={searchErdDomains} onChange={(row) => pickDomain(c.id, row)} onPopupChange={setFinding} disabled={locked} />
    </Cell>
  );
}

function ColNull({ i }: { i: number }) {
  const { draft, locked, patchCol } = usePropsView();
  const c = draft.columns[i];
  if (!c) return null;
  return (
    <Cell center>
      <Checkbox aria-label="NULL 허용" checked={!c.notNull && !c.pk} disabled={locked || c.pk} onChange={(v) => patchCol(c.id, { notNull: !v })} />
    </Cell>
  );
}

function ColPk({ i }: { i: number }) {
  const { draft, locked, patchCol } = usePropsView();
  const c = draft.columns[i];
  if (!c) return null;
  return (
    <Cell center>
      <Checkbox aria-label="PK" checked={c.pk} disabled={locked} onChange={(v) => patchCol(c.id, { pk: v })} />
    </Cell>
  );
}

const idx = (row: Record<string, unknown>) => (row as PropsRow).i;

const COLUMN_GRID_COLUMNS: GridColumn[] = [
  { key: "logical", header: "논리명", width: 170, meta: false, tooltip: false, sortable: false, render: (_v, row) => <ColLogical i={idx(row)} /> },
  { key: "phys", header: "물리명", width: 170, meta: false, tooltip: false, sortable: false, render: (_v, row) => <ColPhys i={idx(row)} /> },
  { key: "domain", header: "도메인", width: 200, meta: false, tooltip: false, sortable: false, render: (_v, row) => <ColDomain i={idx(row)} /> },
  { key: "null", header: "NULL", width: 64, meta: false, tooltip: false, sortable: false, headerAlign: "center", render: (_v, row) => <ColNull i={idx(row)} /> },
  { key: "pk", header: "PK", width: 56, meta: false, tooltip: false, sortable: false, headerAlign: "center", render: (_v, row) => <ColPk i={idx(row)} /> },
];

function KeyKind({ i }: { i: number }) {
  const { draft, locked, patchKey } = usePropsView();
  const k = draft.keys[i];
  if (!k) return null;
  return (
    <Cell deleted={k.deleted} testId={`erd-props-key-${i}`}>
      {k.id ? k.kind : (
        <Select aria-label="키 종류" options={KIND_OPTIONS} value={k.kind} disabled={locked}
          onChange={(v) => patchKey(i, { kind: v as DraftKey["kind"] })} />
      )}
    </Cell>
  );
}

function KeyName({ i }: { i: number }) {
  const { draft, locked, patchKey } = usePropsView();
  const k = draft.keys[i];
  if (!k) return null;
  return (
    <Cell deleted={k.deleted}>
      <Input aria-label="키 이름" value={k.name} disabled={locked || k.deleted} onChange={(v) => patchKey(i, { name: v.toUpperCase() })} />
    </Cell>
  );
}

function KeyColumns({ i }: { i: number }) {
  const { draft, locked, columnOptions, patchKey } = usePropsView();
  const k = draft.keys[i];
  if (!k) return null;
  return (
    <Cell deleted={k.deleted}>
      <MultiSelectComboBox aria-label="키 컬럼" data={columnOptions as { value: string; label: string }[]} value={k.columns}
        disabled={locked || k.deleted} onChange={(v) => patchKey(i, { columns: v })} />
    </Cell>
  );
}

function KeyDelete({ i }: { i: number }) {
  const { draft, locked, patchKey } = usePropsView();
  const k = draft.keys[i];
  if (!k) return null;
  return (
    <Cell deleted={k.deleted} center>
      <Checkbox aria-label="키 지우기" checked={k.deleted} disabled={locked} onChange={(v) => patchKey(i, { deleted: v })} />
    </Cell>
  );
}

const KEY_GRID_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 110, meta: false, tooltip: false, sortable: false, render: (_v, row) => <KeyKind i={idx(row)} /> },
  { key: "name", header: "이름", width: 200, meta: false, tooltip: false, sortable: false, render: (_v, row) => <KeyName i={idx(row)} /> },
  { key: "columns", header: "컬럼", width: 260, meta: false, tooltip: false, sortable: false, render: (_v, row) => <KeyColumns i={idx(row)} /> },
  { key: "del", header: "지우기", width: 64, meta: false, tooltip: false, sortable: false, headerAlign: "center", render: (_v, row) => <KeyDelete i={idx(row)} /> },
];

/** 관계 셀 공통 — 지운 관계는 흐리게, 칸 막힘은 잠금 또는 지움. */
function RelCell({ i, center, first, children }: { i: number; center?: boolean; first?: boolean; children: (r: DraftRelation, off: boolean, view: PropsView) => ReactNode }) {
  const view = usePropsView();
  const r = view.draft.relations[i];
  if (!r) return null;
  return (
    <Cell deleted={r.deleted} center={center} testId={first ? `erd-props-rel-${r.id}` : undefined}>
      {children(r, view.locked || r.deleted, view)}
    </Cell>
  );
}

const REL_GRID_COLUMNS: GridColumn[] = [
  {
    key: "other", header: "상대 표", width: 190, meta: false, tooltip: false, sortable: false,
    render: (_v, row) => (
      <RelCell i={idx(row)} first>
        {(r, _off, v) => (
          <span>{r.asChild ? "부모 " : "자식 "}<span className="erd-mono">{r.crossModel && r.asChild ? `(다른 모델) ${r.other}` : v.physOf(r.other)}</span></span>
        )}
      </RelCell>
    ),
  },
  {
    key: "state", header: "상태", width: 60, meta: false, tooltip: false, sortable: false,
    render: (_v, row) => <RelCell i={idx(row)}>{(r) => STATE_LABEL[r.state] ?? r.state}</RelCell>,
  },
  {
    key: "identifying", header: "식별", width: 56, meta: false, tooltip: false, sortable: false, headerAlign: "center",
    render: (_v, row) => (
      <RelCell i={idx(row)} center>
        {(r, off, v) => <Checkbox aria-label="식별 관계" checked={r.identifying} disabled={off} onChange={(x) => v.patchRel(r.id, { identifying: x })} />}
      </RelCell>
    ),
  },
  {
    key: "parentCard", header: "부모 쪽", width: 130, meta: false, tooltip: false, sortable: false,
    render: (_v, row) => (
      <RelCell i={idx(row)}>
        {(r, off, v) => <Select aria-label="부모 쪽 기수" options={PARENT_OPTIONS} value={r.parentCard} disabled={off} onChange={(x) => v.patchRel(r.id, { parentCard: x })} />}
      </RelCell>
    ),
  },
  {
    key: "childCard", header: "자식 쪽", width: 130, meta: false, tooltip: false, sortable: false,
    render: (_v, row) => (
      <RelCell i={idx(row)}>
        {(r, off, v) => <Select aria-label="자식 쪽 기수" options={CHILD_OPTIONS} value={r.childCard} disabled={off} onChange={(x) => v.patchRel(r.id, { childCard: x })} />}
      </RelCell>
    ),
  },
  {
    key: "dbFk", header: "DB FK", width: 60, meta: false, tooltip: false, sortable: false, headerAlign: "center",
    render: (_v, row) => (
      <RelCell i={idx(row)} center>
        {(r, off, v) => <Checkbox aria-label="DB FK" checked={r.dbFk} disabled={off || r.crossModel} onChange={(x) => v.patchRel(r.id, { dbFk: x })} />}
      </RelCell>
    ),
  },
  {
    key: "decision", header: "판정", width: 110, meta: false, tooltip: false, sortable: false,
    render: (_v, row) => (
      <RelCell i={idx(row)}>
        {(r, off, v) => r.state === "INFERRED" ? (
          <Select aria-label="판정" options={DECISION_OPTIONS} value={r.decision ?? ""} disabled={off}
            onChange={(x) => v.patchRel(r.id, { decision: x === "" ? null : (x as DraftRelation["decision"]) })} />
        ) : "-"}
      </RelCell>
    ),
  },
  {
    key: "del", header: "지우기", width: 64, meta: false, tooltip: false, sortable: false, headerAlign: "center",
    render: (_v, row) => (
      <RelCell i={idx(row)} center>
        {(r, _off, v) => <Checkbox aria-label="관계 지우기" checked={r.deleted} disabled={v.locked} onChange={(x) => v.patchRel(r.id, { deleted: x })} />}
      </RelCell>
    ),
  },
];

export function PropsWindow({ tableId, model, domains, readOnly, onSubmit, newKeyId, onClose }: PropsWindowProps) {
  const [base, setBase] = useState<PropsDraft | null>(null);
  const [draft, setDraft] = useState<PropsDraft | null>(null);
  /** 이 창에서 새로 고른 도메인 이름(모델에 아직 없는 도메인). */
  const [picked, setPicked] = useState<Readonly<Record<string, string>>>({});
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  // 열 때(또는 다른 표로 바뀔 때)만 초안을 새로 만든다.
  useEffect(() => {
    const d = tableId ? draftOf(modelRef.current, tableId) : null;
    setBase(d);
    setDraft(d);
    setPicked({});
    setFinding(false);
    setError(null);
    setBusy(false);
  }, [tableId]);

  const plan = useMemo(() => (base && draft ? propsCommands(model, base, draft, newKeyId) : null), [model, base, draft, newKeyId]);
  const changed = (plan?.commands.length ?? 0) > 0;
  const locked = readOnly !== null || busy;

  const columnOptions = useMemo(
    () => (draft ? draft.columns.map((c) => ({ value: c.id, label: c.phys })) : []),
    [draft],
  );

  // 셀이 부르는 고치기 함수 — setState 만 쓰므로 한 번 만들어 둔다(컨텍스트가 바뀌어도 함수는 그대로).
  const actions = useMemo<PropsActions>(() => {
    const patchCol = (id: string, p: Partial<DraftColumn>) =>
      setDraft((d) => (d ? { ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, ...p } : c)) } : d));
    return {
      patchCol,
      patchKey: (k, p) => setDraft((d) => (d ? { ...d, keys: d.keys.map((x, i) => (i === k ? { ...x, ...p } : x)) } : d)),
      patchRel: (id, p) => setDraft((d) => (d ? { ...d, relations: d.relations.map((r) => (r.id === id ? { ...r, ...p } : r)) } : d)),
      pickDomain: (col, row) => {
        if (row) setPicked((p) => ({ ...p, [String(row.domainId)]: row.stdName }));
        patchCol(col, { domainId: row ? row.domainId : null });
      },
      setFinding,
    };
  }, []);

  const tables = model.tables;
  const view = useMemo<PropsView | null>(
    () => (draft ? {
      ...actions, draft, locked, columnOptions,
      domainLabel: (d) => (d == null ? "" : picked[String(d)] ?? domains[String(d)]?.name ?? `도메인 ${d}`),
      physOf: (t) => tables[t]?.phys ?? t,
    } : null),
    [actions, draft, locked, columnOptions, picked, domains, tables],
  );

  const colRows = useRows(draft ? draft.columns.map((c) => c.id) : NO_IDS);
  const keyRows = useRows(draft ? draft.keys.map((k, i) => k.id ?? `new-${i}`) : NO_IDS);
  const relRows = useRows(draft ? draft.relations.map((r) => r.id) : NO_IDS);

  if (!tableId || !draft || !view) return null;

  const patch = (p: Partial<PropsDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setError(null);
  };
  const addKey = () => setDraft((d) => (d ? { ...d, keys: [...d.keys, { id: null, kind: "UK", name: "", columns: [], deleted: false }] } : d));
  const close = () => {
    if (!finding) onClose();
  };

  const submit = async () => {
    if (!plan || locked) return;
    if (plan.error) {
      setError(plan.error);
      return;
    }
    if (plan.commands.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const msg = await onSubmit(plan.commands, tableId);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`속성 — ${draft.phys}`}
      size="xl"
      onClose={close}
      closeOnClickOutside={false}
      resizable
      resizeStorageKey="dmes.erdEdit.propsWindow"
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-props-cancel" onClick={close}>닫기</Button>
          <Button variant="primary" data-testid="erd-props-ok" disabled={locked || !changed} onClick={() => void submit()}>적용</Button>
        </div>
      }
    >
      <div className="erd-props" data-testid="erd-props">
        {readOnly && <div className="erd-props__note" role="status">{readOnly}</div>}
        <section className="erd-props__sec">
          <h4 className="erd-props__h">표</h4>
          <div className="erd-props__grid2">
            <label htmlFor="erd-props-logical">논리명</label>
            <Input id="erd-props-logical" data-testid="erd-props-logical" data-autofocus value={draft.logical} disabled={locked}
              onChange={(v) => patch({ logical: v })} />
            <label htmlFor="erd-props-phys">물리명</label>
            <Input id="erd-props-phys" data-testid="erd-props-phys" value={draft.phys} disabled={locked}
              onChange={(v) => patch({ phys: v.toUpperCase() })} />
            <label htmlFor="erd-props-comment">설명</label>
            <Input id="erd-props-comment" data-testid="erd-props-comment" value={draft.comment} disabled={locked}
              onChange={(v) => patch({ comment: v })} />
          </div>
        </section>

        <PropsCtx.Provider value={view}>
          <section className="erd-props__sec">
            <h4 className="erd-props__h">컬럼 <span className="erd-props__sub">기본 칸만. 타입·길이·기본값은 컬럼 그리드에서 고칩니다.</span></h4>
            <AgDataGrid gridId="erdPropsColumns" ariaLabel="컬럼 기본 칸" {...SMALL_GRID} columns={COLUMN_GRID_COLUMNS} data={colRows} rowKey="rid" />
          </section>

          <section className="erd-props__sec erd-props__keys">
            <h4 className="erd-props__h">키 <span className="erd-props__sub">PK 는 컬럼의 PK 칸으로 정합니다.</span></h4>
            <AgDataGrid gridId="erdPropsKeys" ariaLabel="키" {...SMALL_GRID} columns={KEY_GRID_COLUMNS} data={keyRows} rowKey="rid" />
            <Button size="mini" data-testid="erd-props-add-key" disabled={locked} onClick={addKey}>키 추가</Button>
          </section>

          <section className="erd-props__sec">
            <h4 className="erd-props__h">관계</h4>
            <AgDataGrid gridId="erdPropsRelations" ariaLabel="관계" {...SMALL_GRID} columns={REL_GRID_COLUMNS} data={relRows} rowKey="rid"
              emptyMessage="이 표에 걸린 관계가 없습니다." />
          </section>
        </PropsCtx.Provider>

        {(error ?? plan?.error) && (
          <div className="erd-dialog__error" role="alert" data-testid="erd-props-error">{error ?? plan?.error}</div>
        )}
      </div>
    </Modal>
  );
}
