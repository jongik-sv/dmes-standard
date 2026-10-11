"use client";

/**
 * 주제별로 나누기 창(U52) — 표 이름 앞부분으로 묶은 묶음을 미리 보이고, 고른 묶음마다 다이어그램을 만든다.
 * 묶음 목록은 AgDataGrid 이고, 만들기 체크는 표 칸 안의 체크박스다(그리드 행 선택은 첫 렌더에 기본 선택을 반영하지 못한다). 같은 이름 다이어그램이 그 업무영역에 이미 있으면 그 묶음은 고를 수 없다.
 * 다이어그램 명령이라 rights.diagram 을 본다(S2-20). 명령 묶음은 차례로 보내고, 하나라도 거절되면 멈춘다(앞 것은 남는다).
 * 부모(useCanvasEditing)는 state·권한만 좁게 넘기고 쓰기는 안정된 콜백으로 받는다 — 끄는 동안 창이 다시 그려지지 않게.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import type { ApplyOutcome, Right } from "../edit-context";
import { shortReason } from "../state/permissions";
import type { ErdCommandJson, ErdState } from "../types";
import { newElementId } from "./erd-commands";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "./erd-edit-styles";
import { splitCommands, subjectGroups } from "./erd-split";

/** 업무영역 이름 기본값. */
export const SPLIT_AREA_DEFAULT = "주제별";
/** 목록의 "앞 표" 개수. */
const HEAD_COUNT = 3;
const LABEL = "주제별로 나누기";

const NOTE = { margin: "0 0 var(--spacing-sm)", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" } as const;
const GRID_BOX = { marginTop: "var(--spacing-xs)", maxHeight: 360, overflowY: "auto" } as const;
const COUNT_LINE = { marginTop: "var(--spacing-xs)", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" } as const;

interface SplitRow extends Record<string, unknown> {
  id: string;
  name: string;
  count: number;
  head: string;
  /** 만들 묶음으로 골랐는가(체크). */
  make: boolean;
  /** 같은 이름 다이어그램이 그 업무영역에 이미 있다. */
  exists: boolean;
  state: string;
}

/** 열 정의 — 체크 칸이 바꾸기 콜백을 쓰므로 콜백이 안정된 동안 한 번만 만든다. */
function splitColumns(onToggle: (id: string, on: boolean) => void): GridColumn[] {
  return [
    {
      key: "make", header: "만들기", width: 70, align: "center", meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <span data-testid={`erd-split-group-${String(row.id)}`}>
          <Checkbox aria-label={`${String(row.name)} 만들기`} checked={row.make === true} disabled={row.exists === true}
            onChange={(on) => onToggle(String(row.id), on)} />
        </span>
      ),
    },
    { key: "name", header: "이름", width: 110, meta: false },
    { key: "count", header: "표 수", width: 60, align: "right", type: "number", meta: false },
    { key: "head", header: "앞 표 3개", width: 300, meta: false },
    { key: "state", header: "상태", width: 80, align: "center", meta: false },
  ];
}

export interface SplitDialogProps {
  /** 나눌 모델·지금 있는 다이어그램을 담은 상태. null 이면 닫힘 — 부모는 닫힌 동안 상태를 넘기지 않아 모델이 바뀌어도 이 창이 다시 그려지지 않는다. */
  state: ErdState | null;
  /** 다이어그램 권한(rights.diagram). */
  right: Right;
  showAudit: boolean;
  /** 지금 캔버스의 가로/세로 비(2-D 배치 목표 모양). 보내는 순간에 읽는다. */
  getAspect(): number;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  onClose(): void;
  /** 모두 만들었다. 첫 새 다이어그램 id 와 만든 수. */
  onCreated(firstDiagramId: string, count: number): void;
}

export function SplitDialog({ state, ...rest }: SplitDialogProps) {
  // 닫힌 뒤에도 닫힘 전환 동안 마지막 상태로 본문을 그린다.
  const last = useRef<ErdState | null>(null);
  if (state) last.current = state;
  const shown = state ?? last.current;
  return shown ? <SplitInner open={state !== null} state={shown} {...rest} /> : null;
}

interface InnerProps extends Omit<SplitDialogProps, "state"> {
  open: boolean;
  state: ErdState;
}

function SplitInner({ open, state, right, showAudit, getAspect, apply, onClose, onCreated }: InnerProps) {
  const [area, setArea] = useState(SPLIT_AREA_DEFAULT);
  // 사용자가 체크를 끈 묶음. 기본은 만들 수 있는 묶음 모두 켬 — 업무영역을 바꿔 "이미 있음"이 달라져도 이 집합에서 바로 정한다.
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  // 보내는 동안에는 창을 닫지 못한다(취소·× 막음)라서 다시 열 때 busy 를 되돌리지 않는다. 사라지거나 닫힌 뒤에는 결과를 쓰지 않는다.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const openRef = useRef(open);
  openRef.current = open;
  const closeIfIdle = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  // 열 때마다 처음부터.
  useEffect(() => {
    if (!open) return;
    setArea(SPLIT_AREA_DEFAULT);
    setOff((cur) => (cur.size === 0 ? cur : new Set()));
    setFailure(null);
  }, [open]);

  const model = state.model;
  const groups = useMemo(() => subjectGroups(model, Object.keys(model.tables)), [model]);
  const areaName = area.trim();
  // 이미 있는 묶음의 키를 한 글(문자열)로 둔다 — 업무영역을 한 글자 칠 때마다 결과가 같으면 rows·그리드 data 를 새로 만들지 않는다(R12).
  const existKey = useMemo(() => {
    const names = new Set<string>();
    for (const d of Object.values(state.diagrams)) if (d.areaName === areaName) names.add(d.diagramName);
    return groups.filter((g) => names.has(g.name)).map((g) => g.key).join("\n");
  }, [groups, state.diagrams, areaName]);
  const rows = useMemo<SplitRow[]>(() => {
    const existing = new Set(existKey === "" ? [] : existKey.split("\n"));
    return groups.map((g) => {
      const exists = existing.has(g.key);
      return {
        id: g.key, name: g.name, count: g.tables.length, exists, make: !exists && !off.has(g.key), state: exists ? "이미 있음" : "",
        head: g.tables.slice(0, HEAD_COUNT).map((t) => model.tables[t].phys).join(", "),
      };
    });
  }, [groups, existKey, off, model]);
  const chosenKeys = useMemo(() => rows.filter((r) => r.make).map((r) => r.id), [rows]);
  const chosenTables = useMemo(() => {
    const keys = new Set(chosenKeys);
    return groups.reduce((n, g) => (keys.has(g.key) ? n + g.tables.length : n), 0);
  }, [groups, chosenKeys]);

  const toggle = useCallback((id: string, on: boolean) => {
    setOff((cur) => {
      if (cur.has(id) === !on) return cur;
      const next = new Set(cur);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const columns = useMemo(() => splitColumns(toggle), [toggle]);

  const blockReason = !right.ok ? shortReason(right.reason) || "권한 없음"
    : areaName === "" ? "업무영역을 넣으세요"
      : chosenKeys.length === 0 ? "만들 묶음을 고르세요" : null;

  const create = async () => {
    if (busyRef.current || blockReason !== null) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    const start = stateRef.current.modelId;
    try {
      const keys = new Set(chosenKeys);
      const batches = splitCommands(stateRef.current, groups.filter((g) => keys.has(g.key)), areaName, () => newElementId("d"), showAudit, getAspect());
      const first = batches[0]?.find((c) => c.op === "addDiagram")?.id;
      let made = 0;
      for (const commands of batches) {
        const out = await apply(commands, LABEL);
        if (!alive.current) return;
        // 기다리는 동안 모델이 바뀌었으면 그 모델의 다이어그램을 열지 않는다(Local-Rules §37).
        if (stateRef.current.modelId !== start) return;
        const n = commands.filter((c) => c.op === "addDiagram").length;
        if (!out.ok) {
          // 거절은 apply 가 알림으로 올렸다. 앞 묶음은 이미 만들어졌으므로 창에 몇 개까지 만들었는지 적는다.
          setFailure(made === 0 ? "다이어그램을 만들지 못했습니다." : `${made}개 만들었습니다. 나머지는 만들지 못했습니다.`);
          return;
        }
        made += n;
      }
      if (typeof first === "string" && alive.current && openRef.current) {
        onClose();
        onCreated(first, made);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const footer = (
    <div className="erd-dialog__actions">
      <Button data-testid="erd-split-cancel" disabled={busy} onClick={closeIfIdle}>취소</Button>
      {/* 꺼진 단추는 title 이 안 보이므로 감싼 span 에 이유를 단다 */}
      <span data-testid="erd-split-ok-tip" title={blockReason ?? undefined}>
        <Button variant="primary" data-testid="erd-split-ok" disabled={busy || blockReason !== null} onClick={() => void create()}>만들기</Button>
      </span>
    </div>
  );

  return (
    <Modal open={open} title={LABEL} size="md" onClose={closeIfIdle} footer={footer}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      <div data-testid="erd-split-dialog">
        <p style={NOTE}>표 이름 앞부분(예: SEC, CODE)으로 5-20개씩 나눠 다이어그램을 만듭니다. 만든 뒤에는 보통 다이어그램처럼 고칩니다.</p>
        <div className="erd-dialog__row">
          <label htmlFor="erd-split-area">업무영역</label>
          <Input id="erd-split-area" data-testid="erd-split-area" value={area} onChange={setArea} />
        </div>
        <div style={GRID_BOX}>
          <AgDataGrid gridId="modal-erdSplit" title="묶음" height="auto" columnSizing="fit" columns={columns} data={rows} rowKey="id"
            emptyMessage="나눌 표가 없습니다." personalize={false} />
        </div>
        <div style={COUNT_LINE} data-testid="erd-split-count">고른 묶음 {chosenKeys.length}개 · 표 {chosenTables}개</div>
        {failure && (
          <div className="erd-dialog__error" role="alert" data-testid="erd-split-error">
            {failure}
          </div>
        )}
      </div>
    </Modal>
  );
}
