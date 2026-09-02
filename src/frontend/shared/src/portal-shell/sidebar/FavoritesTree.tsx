"use client";

import { useEffect, useMemo, useState } from "react";

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
}

// 메뉴 트리(TreeItem)와 동일한 폴더/페이지 아이콘 — 시각 일관성 보장.
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function PageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <div className="fav-toolbar">
        {onAddFolder && (
          <button
            type="button"
            className="toggle-all-button fav-add-group-btn"
            onClick={() => { setNewName(""); setAddModalOpen(true); }}
            title="그룹 추가"
          >
            ＋ 그룹
          </button>
        )}
        <button type="button" className="toggle-all-button" onClick={expandAll} title="전체 펼치기">
          <span className="tree-expand-icon"><span className="lines">≡</span><span className="arrow">▼</span></span>
        </button>
        <button type="button" className="toggle-all-button" onClick={collapseAll} title="전체 접기">
          <span className="tree-expand-icon"><span className="lines">≡</span><span className="arrow">▲</span></span>
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="no-results">즐겨찾기 항목이 없습니다.</div>
      ) : (
        <ul>
          {folders.map((folder) => {
            const open = collapsed[folder.folderId] !== true;
            return (
              <li key={folder.folderId}>
                <div className="tree-item tree-item--folder fav-row" onClick={() => toggleFolder(folder.folderId)}>
                  <span className="folder-icon"><FolderIcon open={open} /></span>
                  <span className="item-name">{folder.folderName}</span>
                  {onDeleteFolder && (
                    <button
                      type="button"
                      className="fav-delete-btn"
                      title="그룹 삭제"
                      onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.folderId); }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {open && (
                  <ul>
                    {folder.children.length === 0 ? (
                      <li><div className="tree-item fav-empty" style={{ paddingLeft: 28, opacity: 0.5, cursor: "default" }}>(비어 있음)</div></li>
                    ) : (
                      folder.children.map((leaf) => (
                        <li key={leaf.pageId}>
                          <div
                            className={`tree-item tree-item--page fav-row ${activePageId === leaf.pageId ? "selected-menu" : ""}`}
                            style={{ paddingLeft: 28 }}
                            onClick={() => onMenuItemClick(leaf.pageId)}
                          >
                            <span className="menu-icon"><PageIcon /></span>
                            <span className="item-name">{leaf.displayText}</span>
                            {onDeleteFavorite && (
                              <button
                                type="button"
                                className="fav-delete-btn"
                                title="즐겨찾기 해제"
                                onClick={(e) => { e.stopPropagation(); onDeleteFavorite(leaf.pageId); }}
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

      {/* 그룹 추가 모달 */}
      {addModalOpen && (
        <div
          role="presentation"
          onClick={() => setAddModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="즐겨찾기 그룹 추가"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 320, background: "#fff", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", fontFamily: "var(--font-family)", overflow: "hidden" }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 600 }}>그룹 추가</div>
            <div style={{ padding: 16 }}>
              <input
                type="text"
                autoFocus
                value={newName}
                maxLength={30}
                placeholder="그룹명"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
                style={{ width: "100%", height: 30, padding: "0 8px", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setAddModalOpen(false)} style={{ height: 30, padding: "0 14px", cursor: "pointer" }}>취소</button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={!newName.trim()}
                style={{ height: 30, padding: "0 14px", border: "none", borderRadius: 4, color: "#fff", background: "var(--color-primary, #337ab7)", opacity: newName.trim() ? 1 : 0.5, cursor: newName.trim() ? "pointer" : "not-allowed" }}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
