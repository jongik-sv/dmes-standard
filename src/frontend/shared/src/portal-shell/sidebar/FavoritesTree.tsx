"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Group, TextInput } from "@mantine/core";
import { Modal } from "../../components/modal";
import { moveRelative, type DropPlace } from "../reorder";
import { useRowReorder } from "./use-row-reorder";

/** 확정 버튼은 공통 primary 토큰을 그대로 쓴다(레거시 파랑 하드코딩 금지). */
const CONFIRM_BUTTON_STYLES = {
  root: { backgroundColor: "var(--color-primary)" },
} as const;

/** 즐겨찾기 leaf(메뉴) 노드. */
export interface FavoriteLeaf {
  pageId: string;
  displayText: string;
}

/** 즐겨찾기 폴더(그룹) 노드 — 2테이블 모델의 FVT_FOLD_ID/FVT_FOLD_NM. */
export interface FavoriteFolderNode {
  folderId: string;
  folderName: string;
  children: FavoriteLeaf[];
}

export interface FavoritesTreeProps {
  folders: FavoriteFolderNode[];
  activePageId: string | null;
  onMenuItemClick: (pageId: string) => void;
  /** 그룹 추가 — 폴더명 입력 후 호출. 미제공 시 추가 버튼 숨김. */
  onAddFolder?: (folderName: string) => void;
  /** 그룹 삭제 — 폴더 + 하위 즐겨찾기 제거. */
  onDeleteFolder?: (folderId: string) => void;
  /** 즐겨찾기(leaf) 삭제 = 별 해제(토글 off). */
  onDeleteFavorite?: (pageId: string) => void;
  /** 끌어서 그룹 순서를 바꿨다 — 바뀐 전체 그룹 순서(folderId 목록). 미지정 시 그룹을 끌 수 없다. */
  onReorderFolders?: (folderIds: string[]) => void;
  /** 끌어서 한 그룹 안 즐겨찾기 순서를 바꿨다 — 그 그룹의 전체 순서. 그룹 사이 이동은 지원하지 않는다. */
  onReorderItems?: (folderId: string, pageIds: string[]) => void;
}

/** 끌기 키 — 그룹 행과 즐겨찾기 행을 한 훅에서 구분한다(둘의 ID 가 겹쳐도 키는 다르다). */
const folderRowKey = (folderId: string) => `F\u0000${folderId}`;
const leafRowKey = (folderId: string, pageId: string) => `L\u0000${folderId}\u0000${pageId}`;
function parseRowKey(key: string): { kind: "folder"; folderId: string } | { kind: "leaf"; folderId: string; pageId: string } {
  const [kind, folderId, pageId] = key.split("\u0000");
  return kind === "F" ? { kind: "folder", folderId } : { kind: "leaf", folderId, pageId };
}

// 메뉴 트리(TreeItem)와 동일한 폴더/페이지 아이콘 — 시각 일관성 보장.
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      {open ? (
        <line x1="9" y1="14" x2="15" y2="14" stroke="#fff" strokeWidth="2.5" />
      ) : (
        <>
          <line x1="9" y1="14" x2="15" y2="14" stroke="#fff" strokeWidth="2.5" />
          <line x1="12" y1="11" x2="12" y2="17" stroke="#fff" strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}

/** 메뉴 트리와 같은 화면(leaf) 아이콘 — 기본 화면 목록(StartPagesList)도 쓴다. */
export function PageIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
}

export function FavoritesTree({
  folders,
  activePageId,
  onMenuItemClick,
  onAddFolder,
  onDeleteFolder,
  onDeleteFavorite,
  onReorderFolders,
  onReorderItems,
}: FavoritesTreeProps) {
  // 폴더 펼침 상태 — 기본 펼침(undefined=open). collapse-all 시 false 로 세팅.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const folderIds = useMemo(() => folders.map((f) => f.folderId).join(","), [folders]);
  useEffect(() => {
    // 폴더 목록이 바뀌면(추가/삭제) 펼침 상태를 초기화(전체 펼침).
    setCollapsed({});
  }, [folderIds]);

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    folders.forEach((f) => {
      next[f.folderId] = true;
    });
    setCollapsed(next);
  };
  const toggleFolder = (folderId: string) =>
    setCollapsed((prev) => ({ ...prev, [folderId]: !prev[folderId] }));

  // 끌어서 순서 바꾸기 — 그룹은 그룹끼리, 즐겨찾기는 같은 그룹 안에서만(그룹 사이 이동은 하지 않는다).
  const canDrop = useCallback((dragKey: string, targetKey: string) => {
    const drag = parseRowKey(dragKey);
    const target = parseRowKey(targetKey);
    if (drag.kind === "folder") return target.kind === "folder";
    return target.kind === "leaf" && target.folderId === drag.folderId;
  }, []);
  const handleDrop = useCallback(
    (dragKey: string, targetKey: string, place: DropPlace) => {
      const drag = parseRowKey(dragKey);
      const target = parseRowKey(targetKey);
      if (drag.kind === "folder") {
        const next = moveRelative(
          folders.map((f) => folderRowKey(f.folderId)),
          dragKey,
          targetKey,
          place
        );
        if (next) onReorderFolders?.(next.map((key) => parseRowKey(key).folderId));
        return;
      }
      const folder = folders.find((f) => f.folderId === drag.folderId);
      if (!folder) return;
      const next = moveRelative(
        folder.children.map((c) => leafRowKey(folder.folderId, c.pageId)),
        dragKey,
        targetKey,
        place
      );
      if (next && target.kind === "leaf") {
        onReorderItems?.(
          folder.folderId,
          next.map((key) => {
            const parsed = parseRowKey(key);
            return parsed.kind === "leaf" ? parsed.pageId : "";
          })
        );
      }
    },
    [folders, onReorderFolders, onReorderItems]
  );
  const folderReorder = useRowReorder({
    enabled: !!onReorderFolders || !!onReorderItems,
    canDrop,
    onDrop: handleDrop,
  });
  // 그룹 행·즐겨찾기 행 중 해당 콜백이 있는 쪽만 끌 수 있다.
  const folderRowProps = (folderId: string) =>
    onReorderFolders ? folderReorder.rowProps(folderRowKey(folderId)) : {};
  const folderRowClass = (folderId: string) =>
    onReorderFolders ? folderReorder.rowClassName(folderRowKey(folderId)) : "";
  const leafRowProps = (folderId: string, pageId: string) =>
    onReorderItems ? folderReorder.rowProps(leafRowKey(folderId, pageId)) : {};
  const leafRowClass = (folderId: string, pageId: string) =>
    onReorderItems ? folderReorder.rowClassName(leafRowKey(folderId, pageId)) : "";

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddFolder?.(name);
    setNewName("");
    setAddModalOpen(false);
  };

  return (
    <div className="favorites-tree">
      {/* 툴바 — 우측 정렬: [＋ 그룹] [전체 펼치기] [전체 접기] */}
      <Group className="fav-toolbar" gap={4} justify="flex-end" wrap="nowrap">
        {onAddFolder && (
          <Button
            className="toggle-all-button fav-add-group-btn"
            variant="default"
            size="compact-xs"
            onClick={() => {
              setNewName("");
              setAddModalOpen(true);
            }}
            title="그룹 추가"
          >
            ＋ 그룹
          </Button>
        )}
        <ActionIcon
          className="toggle-all-button"
          variant="default"
          size="md"
          onClick={expandAll}
          title="전체 펼치기"
          aria-label="전체 펼치기"
        >
          <span className="tree-expand-icon">
            <span className="lines">≡</span>
            <span className="arrow">▼</span>
          </span>
        </ActionIcon>
        <ActionIcon
          className="toggle-all-button"
          variant="default"
          size="md"
          onClick={collapseAll}
          title="전체 접기"
          aria-label="전체 접기"
        >
          <span className="tree-expand-icon">
            <span className="lines">≡</span>
            <span className="arrow">▲</span>
          </span>
        </ActionIcon>
      </Group>

      {folders.length === 0 ? (
        <div className="no-results">즐겨찾기 항목이 없습니다.</div>
      ) : (
        <ul>
          {folders.map((folder) => {
            const open = collapsed[folder.folderId] !== true;
            return (
              <li key={folder.folderId}>
                <div
                  className={`tree-item tree-item--folder fav-row ${folderRowClass(folder.folderId)}`}
                  onClick={() => toggleFolder(folder.folderId)}
                  {...folderRowProps(folder.folderId)}
                >
                  <span className="folder-icon">
                    <FolderIcon open={open} />
                  </span>
                  <span className="item-name">{folder.folderName}</span>
                  {onDeleteFolder && (
                    <button
                      type="button"
                      className="fav-delete-btn"
                      title="그룹 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder.folderId);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {open && (
                  <ul>
                    {folder.children.length === 0 ? (
                      <li>
                        <div
                          className="tree-item fav-empty"
                          style={{ paddingLeft: 28, opacity: 0.5, cursor: "default" }}
                        >
                          (비어 있음)
                        </div>
                      </li>
                    ) : (
                      folder.children.map((leaf) => (
                        <li key={leaf.pageId}>
                          <div
                            className={`tree-item tree-item--page fav-row ${activePageId === leaf.pageId ? "selected-menu" : ""} ${leafRowClass(folder.folderId, leaf.pageId)}`}
                            style={{ paddingLeft: 28 }}
                            onClick={() => onMenuItemClick(leaf.pageId)}
                            {...leafRowProps(folder.folderId, leaf.pageId)}
                          >
                            <span className="menu-icon">
                              <PageIcon />
                            </span>
                            <span className="item-name">{leaf.displayText}</span>
                            {onDeleteFavorite && (
                              <button
                                type="button"
                                className="fav-delete-btn"
                                title="즐겨찾기 해제"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteFavorite(leaf.pageId);
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 그룹 추가 모달 — 공통 Modal 사용 (자체 오버레이 금지) */}
      <Modal
        open={addModalOpen}
        title="그룹 추가"
        onClose={() => setAddModalOpen(false)}
        size="sm"
        className="fav-add-folder-modal"
        footer={
          <Group gap="xs" justify="flex-end">
            <Button variant="default" onClick={() => setAddModalOpen(false)}>
              취소
            </Button>
            <Button onClick={submitAdd} disabled={!newName.trim()} styles={CONFIRM_BUTTON_STYLES}>
              추가
            </Button>
          </Group>
        }
      >
        <TextInput
          data-autofocus
          value={newName}
          maxLength={30}
          placeholder="그룹명"
          onChange={(event) => setNewName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitAdd();
          }}
        />
      </Modal>
    </div>
  );
}
