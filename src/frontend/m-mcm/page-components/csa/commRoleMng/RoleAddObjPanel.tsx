"use client";

/**
 * 「메뉴에서 오브젝트 추가」 칸(시안 v16 lgRoleNext ④) — 메뉴 폴더 안 오브젝트를 골라 한 번에 퍼미션을 만든다.
 *
 * - RoleAddControls : 폴더 고르기 · 처음 버튼(조회만 / 허용 버튼 모두) · 「고른 n개 추가」 · 「폴더 전체 n개」
 * - RoleAddPickGrid : 후보 목록(체크로 여러 개 고르기). 이미 퍼미션 있음·사용 안 함·초안에 있음은 화면 루트가 미리 뺀다.
 * 두 부분은 화면 루트의 ContentBody(세로) 안 ContentPanel 두 개에 따로 놓인다(GridPanel 안에 글을 두지 않는다 — Local-Rules §45).
 */
import { memo, useCallback, useMemo, type CSSProperties } from "react";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, SegmentedControl, Select } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import type { AddLevel, FolderOption } from "./role-perm";
import type { FolderObjRow } from "./types";

const LEVEL_OPTIONS = [
  { value: "read", label: "조회만" },
  { value: "all", label: "허용 버튼 모두" },
];

const ROW: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 };
const FOLDER_SELECT: CSSProperties = { width: 220 };

export interface RoleAddControlsProps {
  /** 추가할 수 없는 까닭(시스템 관리자·새 역할·역할 없음). 있으면 모두 잠근다. */
  blockedMessage: string | null;
  /** 퍼미션을 불러오는 중·저장 중 — 추가 단추를 잠근다(응답이 추가한 줄을 덮어쓰지 않게). */
  busy: boolean;
  folderOptions: FolderOption[];
  folder: string;
  onFolderChange: (folder: string) => void;
  level: AddLevel;
  onLevelChange: (level: AddLevel) => void;
  pickedCnt: number;
  pickableCnt: number;
  onAddPicked: () => void;
  onAddAll: () => void;
}

export const RoleAddControls = memo(function RoleAddControls({
  blockedMessage,
  busy,
  folderOptions,
  folder,
  onFolderChange,
  level,
  onLevelChange,
  pickedCnt,
  pickableCnt,
  onAddPicked,
  onAddAll,
}: RoleAddControlsProps) {
  const blocked = blockedMessage !== null;
  const changeLevel = useCallback((v: string) => onLevelChange(v === "all" ? "all" : "read"), [onLevelChange]);
  return (
    <CardFrame
      title="메뉴에서 오브젝트 추가"
      testId="role-add-obj"
      right={
        <Select
          aria-label="추가할 메뉴 폴더"
          value={folder}
          options={folderOptions}
          onChange={onFolderChange}
          disabled={blocked}
          style={FOLDER_SELECT}
        />
      }
    >
      {blocked ? (
        <MutedText>{blockedMessage}</MutedText>
      ) : (
        <>
          <div style={ROW}>
            <MutedText>처음 버튼</MutedText>
            <SegmentedControl ariaLabel="처음 버튼" value={level} options={LEVEL_OPTIONS} onChange={changeLevel} />
          </div>
          <div style={ROW}>
            <Button size="sm" variant="primary" disabled={busy || pickedCnt === 0} onClick={onAddPicked}>
              {`고른 ${pickedCnt}개 추가`}
            </Button>
            <Button size="sm" disabled={busy || pickableCnt === 0} onClick={onAddAll}>
              {`폴더 전체 ${pickableCnt}개`}
            </Button>
          </div>
          <MutedText>한 개 = 퍼미션 한 건(ROLE_ID, OBJECT_ID). 추가한 줄은 저장해야 반영됩니다.</MutedText>
        </>
      )}
    </CardFrame>
  );
});

const PICK_COLUMNS: GridColumn[] = [
  { key: "OBJECT_NM", header: "오브젝트명", width: 160, align: "left" },
  { key: "OBJECT_ID", header: "오브젝트 ID", width: 140, align: "left" },
  { key: "MENU_PATH", header: "메뉴", meta: false, width: 160, align: "left" },
];

export interface RoleAddPickGridProps {
  blockedMessage: string | null;
  objs: FolderObjRow[];
  loading: boolean;
  /** 후보가 빌 때의 글(조회 실패 · 오브젝트 없음 · 모두 걸러짐). 잠김 글이 있으면 그것이 먼저다. */
  emptyMessage: string;
  picked: string[];
  onPickedChange: (ids: string[]) => void;
}

export const RoleAddPickGrid = memo(function RoleAddPickGrid({
  blockedMessage,
  objs,
  loading,
  emptyMessage,
  picked,
  onPickedChange,
}: RoleAddPickGridProps) {
  const data = blockedMessage ? EMPTY_OBJS : objs;
  const onRowSelect = useCallback(
    (ids: (string | number)[]) => onPickedChange(ids.map((x) => String(x))),
    [onPickedChange],
  );
  const selectedRows = useMemo(() => (blockedMessage ? EMPTY_IDS : picked), [blockedMessage, picked]);
  return (
    <GridPanel title="고를 오브젝트" count={data.length}>
      <AgDataGrid
        gridId="roleAddObj"
        columnSizing="fit"
        columns={PICK_COLUMNS}
        data={data}
        rowKey="OBJECT_ID"
        selectable
        multiSelect
        selectedRows={selectedRows}
        onRowSelect={onRowSelect}
        loading={loading}
        emptyMessage={blockedMessage ?? emptyMessage}
      />
    </GridPanel>
  );
});

const EMPTY_OBJS: FolderObjRow[] = [];
const EMPTY_IDS: string[] = [];
