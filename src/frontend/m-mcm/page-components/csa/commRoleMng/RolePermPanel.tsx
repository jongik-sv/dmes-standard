"use client";

/**
 * 「이 역할의 퍼미션」 칸 — 옛 세 칸(현재 버튼 권한 · OBJECT 선택 · 권한 선택)을 대신한다(시안 v16 lgRoleNext ③).
 *
 * 한 줄 = 퍼미션 한 건(ROLE_ID, OBJECT_ID). 버튼·팝업 권한은 오브젝트가 허용한 값만 칩으로 나와 그 자리에서 켜고 끈다.
 * 값·상태는 화면 루트의 초안(role-perm.ts)이 갖고, 이 칸은 보이기와 누름 전달만 한다.
 * 열 정의는 누름 처리 함수가 바뀔 때만 만든다 — 화면 루트가 안정 참조(useCallback, 함수형 갱신)로 넘기므로 마운트 때 한 번이다.
 */
import { memo, useMemo, type CSSProperties } from "react";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Select } from "@dk-oasis/shared/form";
import { ToggleChipGroup, type ToggleChipOption } from "@dk-oasis/shared/toggle-chip-group";
import { chipOptions, codeLabel, outValueNote, type FolderOption, type PermViewRow } from "./role-perm";

export interface RolePermHandlers {
  /** 칩 묶음이 준 새 버튼 값(옵션 순서). 허용 버튼이 비면 화면이 퍼미션 빼기로 본다(D14). */
  onBtnChange: (objectId: string, next: string[]) => void;
  onPopChange: (objectId: string, next: string[]) => void;
  onRemove: (objectId: string) => void;
  onUndo: (objectId: string) => void;
}

export interface RolePermPanelProps extends RolePermHandlers {
  rows: PermViewRow[];
  /** 빼기 대기를 뺀 퍼미션 수. 시스템 관리자면 -1(「모두」). */
  count: number;
  /** 저장할 퍼미션 변경 수. */
  pendingCnt: number;
  loading: boolean;
  /** 퍼미션을 불러오는 중·저장 중 — 칩·빼기·되돌리기를 잠근다. */
  readOnly: boolean;
  /** 목록 대신 보일 글(시스템 관리자·새 역할·역할 없음). 있으면 거르기도 숨긴다. */
  blockedMessage: string | null;
  folderOptions: FolderOption[];
  folder: string;
  onFolderChange: (folder: string) => void;
}

const MUTED: CSSProperties = { color: "var(--color-text-muted)" };
const MONO: CSSProperties = { fontFamily: "var(--font-family-mono)" };
const ACTS: CSSProperties = { display: "inline-flex", gap: 3 };
/** 빼기 대기 줄(ag-row-deleted 의 가운데 선)이 단추 글에 번지지 않게. */
const ACT_BTN: CSSProperties = { textDecoration: "none" };
const FOLDER_SELECT: CSSProperties = { width: 220 };
const EMPTY_TEXT: CSSProperties = { color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" };
const NO_DIFF: readonly string[] | undefined = undefined;
const BTN_CELL: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
const OUT_NOTE: CSSProperties = { color: "var(--color-warning)", fontSize: "var(--font-size-xs)" };

/**
 * 칩 옵션 — 오브젝트 허용 값은 켜고 끄고, 지금 값 중 오브젝트 밖 값(D15)은 가운데 선을 긋고 잠근다(disabled = 눌러도 그대로, 흐림).
 * shared ToggleChipGroup 에 「오브젝트 밖」 상태가 따로 없어 label 의 <s> 와 disabled 로 나타낸다.
 */
function toChipOptions(allowed: string[], now: string[], label: (v: string) => string): ToggleChipOption[] {
  return chipOptions(allowed, now).map(({ value, out }) =>
    out
      ? { value, label: <s>{label(value)}</s>, disabled: true, title: `${value} — 오브젝트에 없는 값이라 계산에서 빠집니다. 줄을 고쳐 저장하면 빠집니다.` }
      : { value, label: label(value), title: value },
  );
}

function ChipCell({
  r,
  kind,
  onChange,
  locked,
}: {
  r: PermViewRow;
  kind: "btn" | "pop";
  onChange: (objectId: string, next: string[]) => void;
  locked: boolean;
}) {
  const allowed = kind === "btn" ? r.objBtn : r.objPop;
  const now = kind === "btn" ? r.btn : r.pop;
  const base = kind === "btn" ? r.baseBtn : r.basePop;
  const options = toChipOptions(allowed, now, kind === "btn" ? codeLabel : (v) => v);
  if (options.length === 0) return <span style={EMPTY_TEXT}>없음</span>;
  return (
    <ToggleChipGroup
      aria-label={`${r.OBJECT_ID} ${kind === "btn" ? "버튼" : "팝업"} 권한`}
      testId={`role-perm-${kind}-${r.OBJECT_ID}`}
      size="xs"
      options={options}
      value={now}
      // 새로 추가한 줄은 비교 기준이 없다. 빼기 대기 줄은 조회 값을 잠가 보인다.
      baseValue={r.status === "same" || r.status === "changed" ? base : NO_DIFF}
      readOnly={locked || r.status === "gone"}
      onChange={(next) => onChange(r.OBJECT_ID, next)}
    />
  );
}

function buildColumns(h: RolePermHandlers, locked: boolean): GridColumn[] {
  return [
    {
      key: "MENU_PATH",
      header: "메뉴",
      meta: false,
      width: 200,
      align: "left",
      render: (_v, row) => {
        const r = row as PermViewRow;
        return (
          <span>
            {r.MENU_PATH ? <span style={MUTED}>{r.MENU_PATH} › </span> : null}
            {r.MENU_NM}
          </span>
        );
      },
    },
    {
      key: "OBJECT_ID",
      header: "오브젝트",
      width: 200,
      align: "left",
      render: (_v, row) => {
        const r = row as PermViewRow;
        return (
          <span>
            <span style={MONO}>{r.OBJECT_ID}</span>
            {r.OBJECT_NM ? <span style={MUTED}> · {r.OBJECT_NM}</span> : null}
          </span>
        );
      },
    },
    {
      key: "__btn",
      header: "버튼 권한",
      headerTooltip: "오브젝트에 적은 값 안에서 켜고 끕니다. 가운데 선 = 오브젝트에 없는 값(계산에서 빠짐).",
      meta: false,
      filter: false,
      tooltip: false,
      sortable: false,
      width: 340,
      align: "left",
      render: (_v, row) => {
        const r = row as PermViewRow;
        // D15 저장 규칙 — 밖 값은 조용히 지우지 않고 줄에 한 줄로 알린다(버튼·팝업 함께).
        const note = r.status === "gone" ? null : outValueNote(r.objBtn, r.btn, r.objPop, r.pop);
        return (
          <span style={BTN_CELL}>
            <ChipCell r={r} kind="btn" onChange={h.onBtnChange} locked={locked} />
            {note ? (
              <span style={OUT_NOTE} title={note} data-testid={`role-perm-out-${r.OBJECT_ID}`}>
                {note}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "__pop",
      header: "팝업 권한",
      meta: false,
      filter: false,
      tooltip: false,
      sortable: false,
      width: 170,
      align: "left",
      render: (_v, row) => <ChipCell r={row as PermViewRow} kind="pop" onChange={h.onPopChange} locked={locked} />,
    },
    // D21 — 데이터 권한은 보이기만 한다.
    { key: "DATA_PERM", header: "데이터 권한", width: 90, align: "left" },
    {
      key: "__act",
      header: "",
      meta: false,
      filter: false,
      tooltip: false,
      sortable: false,
      width: 120,
      align: "center",
      render: (_v, row) => {
        const r = row as PermViewRow;
        const id = r.OBJECT_ID;
        return (
          <span style={ACTS}>
            {r.status === "gone" || r.status === "changed" ? (
              <Button size="mini" style={ACT_BTN} disabled={locked} onClick={() => h.onUndo(id)}>
                되돌리기
              </Button>
            ) : null}
            {r.status !== "gone" ? (
              <Button size="mini" style={ACT_BTN} disabled={locked} onClick={() => h.onRemove(id)}>
                빼기
              </Button>
            ) : null}
          </span>
        );
      },
    },
  ];
}

function rowClass(row: Record<string, unknown>): string | undefined {
  const st = (row as PermViewRow).status;
  if (st === "gone") return "ag-row-deleted";
  if (st === "new") return "ag-row-inserted";
  return undefined;
}

export const RolePermPanel = memo(function RolePermPanel({
  rows,
  count,
  pendingCnt,
  loading,
  readOnly,
  blockedMessage,
  folderOptions,
  folder,
  onFolderChange,
  onBtnChange,
  onPopChange,
  onRemove,
  onUndo,
}: RolePermPanelProps) {
  const columns = useMemo(
    // 잠금(불러오기·저장 중)이 바뀔 때만 열을 다시 만든다.
    () => buildColumns({ onBtnChange, onPopChange, onRemove, onUndo }, readOnly),
    [onBtnChange, onPopChange, onRemove, onUndo, readOnly],
  );
  const data = blockedMessage ? EMPTY_ROWS : rows;
  // 줄 상태(새로·빼기 대기)가 바뀌면 행 클래스를 다시 단다.
  const classToken = useMemo(
    () => data.map((r) => (r.status === "gone" || r.status === "new" ? `${r.OBJECT_ID}:${r.status}` : "")).join(","),
    [data],
  );
  const title = pendingCnt > 0 ? `이 역할의 퍼미션 (바뀜 ${pendingCnt}건)` : "이 역할의 퍼미션";
  return (
    <GridPanel
      title={title}
      count={count < 0 ? undefined : count}
      titleExtra={count < 0 ? <span style={MUTED}>모두</span> : undefined}
      headerExtra={
        blockedMessage ? undefined : (
          <Select
            aria-label="퍼미션 폴더"
            value={folder}
            options={folderOptions}
            onChange={onFolderChange}
            style={FOLDER_SELECT}
          />
        )
      }
    >
      <AgDataGrid
        gridId="rolePerm"
        columnSizing="fit"
        columns={columns}
        data={data}
        rowKey="OBJECT_ID"
        sortable={false}
        loading={loading}
        getRowClassExtra={rowClass}
        rowClassRefreshToken={classToken}
        emptyMessage={blockedMessage ?? "퍼미션이 없습니다. 오른쪽에서 오브젝트를 추가하세요."}
      />
    </GridPanel>
  );
});

const EMPTY_ROWS: PermViewRow[] = [];
