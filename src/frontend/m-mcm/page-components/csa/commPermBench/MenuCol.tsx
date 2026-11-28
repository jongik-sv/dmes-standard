"use client";

/**
 * 메뉴(오브젝트) 칸(시안 colMenu). 고른 역할의 메뉴 트리를 AgDataGrid 한 장으로 편다.
 * - 화면 1,004개 → 그리드가 가상 스크롤한다(시안의 260줄 상한은 두지 않는다).
 * - 체크 = 등록(퍼미션 줄 있음). 2단계부터 체크로 등록·해제(초안), 모듈·폴더 체크 = 아래 화면 전부. 상태 칸에 초안 차이(등록·해제·바뀜).
 * - 모듈·폴더 줄을 누르면 접고 편다. 화면 줄을 누르면 그 화면을 고른다.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBox, IconFold, IconMenu2, IconPlus, IconSelector } from "@tabler/icons-react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, SegmentedControl } from "@dk-oasis/shared/form";
import { PERM_SYSADMIN_ROLE_ID } from "./types";
import { flattenMenuRows, fmtNum, hasPerm, objUseOf, permCount, screenRowOf, type MenuFilter, type MenuGridRow, type MenuTree, type RolePermMap } from "./model";
import { FolderPen, LegacyIconButton, Panel, RoleChip, StatusTag, useBench } from "./parts";
import { permDiffKind } from "./draft";

const CHG_TEXT = { add: "등록", del: "해제", mod: "바뀜" } as const;
const CHG_TIP = { add: "초안에서 새로 등록", del: "초안에서 등록 해제", mod: "초안에서 버튼·팝업이 바뀜" } as const;

const FILTER_OPTIONS = [
  { value: "granted", label: "등록된 것" },
  { value: "all", label: "모두" },
];

/** 모듈·폴더 칸 체크(모두·일부·없음). 공용 Checkbox 에 「일부」 모양이 없어 기본 입력을 쓴다. */
function TriCheck({ state, label, disabled, onChange }: { state: "Y" | "P" | "N"; label: string; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      className="pb-tri"
      aria-label={label}
      checked={state === "Y"}
      disabled={disabled}
      data-pb-stop="1"
      ref={(el) => {
        if (el) el.indeterminate = state === "P";
      }}
      onChange={(e) => onChange(e.currentTarget.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export const MenuCol = memo(function MenuCol({
  roleId, objectId, menuId, tree, rolePerm, basePerm, failed, open, mfilter, unusedObjs, canEdit, registerLoading = false,
  onSelectObject, onToggleOpen, onExpandAll, onCollapseAll, onFilter, onToggleRegister, onRetry,
}: {
  roleId: string | null;
  objectId: string | null;
  /** 고른 화면의 메뉴 줄(같은 화면이 여러 메뉴에 걸릴 때 누른 줄). */
  menuId: string | null;
  /** 고른 역할의 메뉴 트리(searchMenuTree roleId). 읽는 중이면 undefined. */
  tree: MenuTree | undefined;
  /** 고른 역할의 퍼미션 + 초안. */
  rolePerm: RolePermMap | undefined;
  /** 같은 역할의 현재 값(초안 차이 꼬리표용). */
  basePerm: RolePermMap | undefined;
  /** 이 역할의 메뉴 트리·퍼미션 읽기가 실패했는가. */
  failed: boolean;
  open: ReadonlySet<string>;
  mfilter: MenuFilter;
  unusedObjs: ReadonlySet<string>;
  canEdit: boolean;
  /** 등록 체크 전에 폴더 퍼미션 줄을 읽는 중(z2 F5). 그동안 등록 체크를 끈다. */
  registerLoading?: boolean;
  onSelectObject: (objectId: string, menuId: string) => void;
  onToggleOpen: (menuId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFilter: (f: MenuFilter) => void;
  /** 메뉴 등록·해제(ROLE_OBJ 초안). */
  onToggleRegister: (objectIds: readonly string[], on: boolean) => void;
  onRetry: () => void;
}) {
  const { bench, canLink } = useBench();
  const [q, setQ] = useState("");
  const locked = roleId === PERM_SYSADMIN_ROLE_ID;
  /** 현재 값 퍼미션을 읽었는가(boolean 만 열 정의 deps 에 둔다 — 편집마다 열을 새로 만들지 않게). */
  const permReady = !!basePerm && !registerLoading;
  const role = roleId ? bench.roleById.get(roleId) : undefined;
  const roleUnused = role?.USE_TP === "N";

  const rows = useMemo<MenuGridRow[]>(() => {
    if (!tree || !roleId) return [];
    const isReg = locked ? () => true : (oid: string) => hasPerm(rolePerm?.get(oid));
    const btnText = (oid: string) => {
      if (locked) return "모두";
      const c = permCount(roleId, rolePerm?.get(oid), objUseOf(tree.byObject.get(oid)) ?? unusedObjs.has(oid), roleUnused);
      return c ? `${c.nb}/${c.total}` : "";
    };
    const changeOf = !locked && basePerm && rolePerm !== basePerm ? (oid: string) => permDiffKind(basePerm.get(oid), rolePerm?.get(oid)) : undefined;
    return flattenMenuRows(tree, { open, filter: mfilter, query: q, isReg, btnText, objUnused: (oid) => unusedObjs.has(oid), changeOf });
  }, [tree, roleId, locked, rolePerm, basePerm, open, mfilter, q, unusedObjs, roleUnused]);

  const regCount = useMemo(() => {
    if (!roleId) return null;
    // PERM_CNT -1 = SYSADMIN(z2 F3) — 수로 쓰지 않는다
    const permCnt = Math.max(0, role?.PERM_CNT ?? 0);
    if (locked) return tree ? tree.byObject.size : permCnt;
    if (!rolePerm) return permCnt;
    let n = 0;
    for (const r of rolePerm.values()) if (hasPerm(r)) n += 1;
    return n;
  }, [roleId, locked, tree, rolePerm, role]);

  // 셀 render 가 최신 처리기를 읽게 ref 로 둔다 — 열 정의는 canEdit·canLink·locked 가 바뀔 때만 새로 만든다
  const handlers = useRef({ onToggleRegister, tree });
  useEffect(() => {
    handlers.current = { onToggleRegister, tree };
  }, [onToggleRegister, tree]);

  const columns = useMemo<GridColumn[]>(
    () => [
      {
        key: "REG", header: "", width: 34, align: "center", sortable: false, filter: false, meta: false, headerTooltip: "",
        render: (_v, r) => {
          const row = r as MenuGridRow;
          const ids = row.OBJECT_ID ? [row.OBJECT_ID] : handlers.current.tree?.screensUnder.get(row.MENU_ID) ?? [];
          const label = row.OBJECT_ID ? `${row.NAME} 등록` : `${row.NAME} 아래 메뉴 ${row.SCREEN_CNT}개 모두 등록`;
          // 역할 퍼미션(현재 값)을 읽기 전에는 처리기가 아무 일도 하지 않으므로 체크를 끈다(f3 리뷰 13)
          return (
            <TriCheck
              state={row.REG}
              label={permReady ? label : `${label} — 퍼미션을 읽는 중`}
              disabled={!canEdit || locked || !permReady || !ids.length}
              onChange={(on) => handlers.current.onToggleRegister(ids, on)}
            />
          );
        },
      },
      // width 는 fit 비율이다. minWidth 를 주지 않으면 shared 가 width 를 최소 폭으로 써서 칸이 좁아지지 않는다(NAME·STATE)
      {
        key: "NAME", header: "메뉴 · 화면", width: 300, minWidth: 120, sortable: false, filter: false, meta: false,
        render: (_v, r) => {
          const row = r as MenuGridRow;
          const dim = row.HIDDEN || row.OBJ_UNUSED;
          return (
            <span className={`pb-mname${dim ? " is-dim" : ""}`} style={{ paddingLeft: row.LEVEL * 18 }}>
              {!row.OBJECT_ID && <span className="pb-tw" aria-hidden>{row.OPEN ? "▾" : "▸"}</span>}
              <span className="pb-nmt">{row.NAME}</span>
              {row.OBJECT_ID && <span className="pb-mono pb-faint">{row.OBJECT_ID}</span>}
              {!row.OBJECT_ID && row.LEVEL > 0 && <FolderPen folderId={row.MENU_ID} name={row.NAME} canLink={canLink} />}
            </span>
          );
        },
      },
      {
        key: "BTN_TXT", header: "버튼", width: 60, align: "right", sortable: false, filter: false, meta: false,
        render: (_v, r) => {
          const row = r as MenuGridRow;
          if (!row.OBJECT_ID) return fmtNum(row.REG_CNT);
          return row.BTN_TXT ? row.BTN_TXT : <span className="pb-faint">—</span>;
        },
      },
      {
        key: "STATE", header: "상태", width: 110, minWidth: 72, sortable: false, filter: false, meta: false,
        render: (_v, r) => {
          const row = r as MenuGridRow;
          return (
            <>
              {row.HIDDEN && <StatusTag kind="block">숨김</StatusTag>}
              {row.OBJ_UNUSED && <StatusTag kind="del">사용 안 함</StatusTag>}
              {row.CHG && (
                <StatusTag kind={row.CHG} title={CHG_TIP[row.CHG]}>
                  {CHG_TEXT[row.CHG]}
                </StatusTag>
              )}
            </>
          );
        },
      },
    ],
    [canEdit, canLink, locked, permReady],
  );

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // 커서(강조 줄): 기본은 고른 화면 줄. ↑/↓ 로 모듈·폴더 줄에 서면 그 줄에 커서만 둔다(접고 펴지 않는다).
  // 고른 화면이 바뀌면 커서는 다시 그 화면 줄로 돌아간다(cur.obj 가 어긋나면 버린다).
  const [cur, setCur] = useState<{ obj: string | null; key: string } | null>(null);
  const onRowClick = useCallback(
    (r: Record<string, unknown>, ev: Event) => {
      const t = ev?.target as Element | null;
      if (t?.closest?.("[data-pb-stop]")) return;
      const row = r as MenuGridRow;
      if (row.OBJECT_ID) {
        onSelectObject(row.OBJECT_ID, row.MENU_ID);
        return;
      }
      setCur({ obj: objectId, key: row.MENU_ID });
      if (!(ev instanceof KeyboardEvent)) onToggleOpen(row.MENU_ID);
    },
    [onSelectObject, onToggleOpen, objectId],
  );

  const onExpandCollapse = useCallback(
    (key: string | number, expand: boolean) => {
      const row = rowsRef.current.find((x) => x.MENU_ID === key);
      if (row && !row.OBJECT_ID && row.OPEN !== expand) onToggleOpen(row.MENU_ID);
    },
    [onToggleOpen],
  );

  const getRowClass = useCallback((r: Record<string, unknown>) => ((r as MenuGridRow).LEVEL === 0 ? "pb-row-lvl0" : undefined), []);

  const selectedRow = objectId && tree ? screenRowOf(tree, objectId, menuId) : undefined;
  const selectedMenuId = selectedRow?.MENU_ID ?? null;
  const cursorKey = cur && cur.obj === objectId ? cur.key : selectedMenuId;
  const objName = selectedRow?.MENU_NM ?? objectId ?? "";

  const icons = (
    <>
      <LegacyIconButton target="menu" mode="edit" id={selectedMenuId} label={`메뉴 수정 — 「${objName}」의 메뉴 이름·위치·순서·표시`} icon={<IconMenu2 size={16} />} disabled={!objectId} />
      <LegacyIconButton target="obj" mode="edit" id={objectId} label={`오브젝트 수정 — ${objectId ?? ""}의 이름·사용 여부·사용 가능한 버튼`} icon={<IconBox size={16} />} disabled={!objectId} />
      <LegacyIconButton target="obj" mode="new" label="오브젝트 추가" icon={<IconPlus size={16} />} />
    </>
  );

  // 역할이 없어도 그리드는 내리지 않는다(R6) — 안내 글만 바꾼다
  return (
    <Panel
      title="메뉴(오브젝트)"
      count={roleId ? `등록 ${fmtNum(regCount ?? 0)}` : "-"}
      icons={icons}
      bodyClassName="pb-menu-grid"
      hint={
        !roleId ? (
          <span>역할을 고르면 그 역할의 메뉴가 나옵니다.</span>
        ) : (
        <>
          <span>
            <RoleChip roleId={roleId} />의 메뉴. 체크 = 등록(퍼미션 행 있음).{canEdit && !locked && " 모듈·폴더를 체크하면 그 아래 메뉴를 모두 등록하고, 풀면 모두 해제합니다(초안)."} 메뉴 · 오브젝트의 수정과 추가는 원래 프로그램에서 합니다. 칸 머리
            아이콘(↗)이 그 화면을 엽니다. 폴더 이름도 폴더 줄의 연필(↗)로 메뉴 관리를 엽니다.
            {locked && " 시스템 관리자는 모든 메뉴를 받아 등록을 바꿀 수 없습니다."}
            {roleUnused && " 이 역할은 「사용 안 함」이라 등록돼 있어도 아무 버튼도 주지 않습니다."}
          </span>
          <div className="pb-toolbar">
            <Input className="pb-grow" value={q} onChange={setQ} placeholder="메뉴·오브젝트 이름, OBJECT_ID 찾기" aria-label="메뉴·오브젝트 찾기" autoComplete="off" />
            <SegmentedControl value={mfilter} onChange={(v) => onFilter(v as MenuFilter)} options={FILTER_OPTIONS} ariaLabel="보기" />
            <Button size="mini" ariaLabel="모두 펼치기" title="모두 펼치기" onClick={onExpandAll}>
              <IconSelector size={16} />
            </Button>
            <Button size="mini" ariaLabel="모두 접기" title="모두 접기" onClick={onCollapseAll}>
              <IconFold size={16} />
            </Button>
          </div>
          {failed && (
            <span className="pb-err" role="alert">
              메뉴를 읽지 못했습니다.{" "}
              <Button size="mini" onClick={onRetry}>
                다시 읽기
              </Button>
            </span>
          )}
          {tree && (locked || rolePerm) && !rows.length && !q && mfilter === "granted" && <span className="pb-notice">이 역할에 등록된 메뉴가 없습니다. 「모두」로 바꿔 봅니다.</span>}
        </>
        )
      }
    >
      <AgDataGrid
        ariaLabel="메뉴 · 화면"
        columns={columns}
        data={rows}
        rowKey="MENU_ID"
        header={false}
        settingsMenu={false}
        personalize={false}
        sortable={false}
        columnSizing="fit"
        loading={!!roleId && !failed && (!tree || (!locked && !rolePerm))}
        highlightedRowKey={cursorKey}
        onRowClick={onRowClick}
        onRowExpandCollapse={onExpandCollapse}
        getRowClassExtra={getRowClass}
        publishScreenContext={false}
      />
    </Panel>
  );
});
