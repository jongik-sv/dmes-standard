"use client";

import { useCallback, useMemo, useState } from "react";
import type { PortalFavoriteMenuRecord } from "../portal-menu";
import type { FavoriteFolderChoice } from "./FavoriteFolderPickerModal";
import { type FavoriteReorder, favoriteRecordPageId as toPageIdFromFavoriteMenuItem } from "./reorder";
import type { FavoriteFolderNode } from "./sidebar/FavoritesTree";

/**
 * PortalShell 내부 훅 — 즐겨찾기 트리·등록 여부·폴더 선택 팝업과 즐겨찾기 콜백.
 * 서버 조회 훅 `usePortalFavorites`(use-portal-favorites.ts)와는 다르다. 패키지 공개 export 가 아니다.
 * effect 가 없어 호출 위치(순서)에 묶이지 않는다.
 *
 * `tabs` 는 팝업 제목으로 탭 제목을 찾는 데 쓴다 — deps 에 그대로 두어 콜백 정체성이 원래와 같게 한다.
 */
export function usePortalShellFavorites({
  favoriteMenus,
  onToggleFavorite,
  onAddFavoriteFolder,
  onDeleteFavoriteFolder,
  onReorderFavorites,
  resolveDisplayText,
  tabs,
}: {
  favoriteMenus: PortalFavoriteMenuRecord[];
  onToggleFavorite?: (pageId: string, folder?: FavoriteFolderChoice) => void;
  onAddFavoriteFolder?: (folderName: string) => void;
  onDeleteFavoriteFolder?: (folderId: string) => void;
  onReorderFavorites?: (change: FavoriteReorder) => void;
  resolveDisplayText: (pageId: string, fallback: string) => string;
  tabs: ReadonlyArray<{ pageId: string; title: string }>;
}) {
  // 즐겨찾기 트리 — 폴더(그룹) → leaf(메뉴). 2테이블 모델(FVT_FOLD_ID 별 그룹화).
  const favoriteTree = useMemo<FavoriteFolderNode[]>(() => {
    const folderRows = favoriteMenus.filter((f) => f.type === "folder");
    const pageRows = favoriteMenus.filter((f) => f.type !== "folder");
    return folderRows.map((folder) => {
      const seen = new Set<string>();
      const children: { pageId: string; displayText: string }[] = [];
      for (const p of pageRows) {
        if (p.parentId !== folder.name) continue;
        const pageId = toPageIdFromFavoriteMenuItem(p);
        if (!pageId || seen.has(pageId)) continue;
        seen.add(pageId);
        children.push({
          pageId,
          displayText: p.displayText?.trim() || resolveDisplayText(pageId, pageId),
        });
      }
      return {
        folderId: folder.name,
        folderName: folder.displayText?.trim() || folder.name || "폴더",
        children,
      };
    });
  }, [favoriteMenus, resolveDisplayText]);

  // 현재 페이지 즐겨찾기 여부 판정용 — 전체 leaf pageId 집합.
  const favoritePageIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of favoriteMenus) {
      if (f.type === "folder") continue;
      const pid = toPageIdFromFavoriteMenuItem(f);
      if (pid) s.add(pid);
    }
    return s;
  }, [favoriteMenus]);

  // 폴더 선택 팝업용 — 기존 즐겨찾기 폴더 목록 (folder 행에서 추출. name=FVT_FOLD_ID / displayText=FVT_FOLD_NM).
  const favoriteFolders = useMemo(
    () =>
      favoriteMenus
        .filter((f) => f.type === "folder")
        .map((f) => ({ fvtFoldId: f.name, fvtFoldNm: f.displayText || f.name })),
    [favoriteMenus]
  );
  /** 폴더 선택 팝업의 대상 화면 — 탭 우클릭 '즐겨찾기 추가'로 연다(활성 탭이 아니라 우클릭한 탭). */
  const [favoritePickerTarget, setFavoritePickerTarget] = useState<{
    pageId: string;
    title: string;
  } | null>(null);

  const handleToggleFavoritePage = useCallback(
    (pageId: string) => {
      if (!onToggleFavorite) return;
      if (favoritePageIdSet.has(pageId)) {
        onToggleFavorite(pageId); // 이미 등록 → 폴더 무관 제거
        return;
      }
      const title = tabs.find((tab) => tab.pageId === pageId)?.title;
      setFavoritePickerTarget({ pageId, title: title ?? resolveDisplayText(pageId, pageId) }); // 미등록 → 폴더 선택 팝업
    },
    [onToggleFavorite, favoritePageIdSet, tabs, resolveDisplayText]
  );

  const handleFolderPickerConfirm = useCallback(
    (choice: FavoriteFolderChoice) => {
      const target = favoritePickerTarget;
      setFavoritePickerTarget(null);
      if (!target || !onToggleFavorite) return;
      onToggleFavorite(target.pageId, choice);
    },
    [favoritePickerTarget, onToggleFavorite]
  );

  // 사이드바 즐겨찾기 그룹 추가/삭제 + leaf 해제(=토글 off).
  const handleAddFavoriteFolder = useCallback(
    (folderName: string) => onAddFavoriteFolder?.(folderName),
    [onAddFavoriteFolder]
  );
  const handleDeleteFavoriteFolder = useCallback(
    (folderId: string) => onDeleteFavoriteFolder?.(folderId),
    [onDeleteFavoriteFolder]
  );
  const handleDeleteFavorite = useCallback(
    (pageId: string) => onToggleFavorite?.(pageId),
    [onToggleFavorite]
  );

  // 사이드바에서 끌어서 바꾼 순서 — 폴더끼리 또는 한 폴더 안 메뉴끼리. 미지정이면 트리를 끌 수 없다.
  const handleReorderFavoriteFolders = useMemo(
    () =>
      onReorderFavorites
        ? (folderIds: string[]) => onReorderFavorites({ kind: "folders", folderIds })
        : undefined,
    [onReorderFavorites]
  );
  const handleReorderFavoriteItems = useMemo(
    () =>
      onReorderFavorites
        ? (folderId: string, pageIds: string[]) =>
            onReorderFavorites({ kind: "items", folderId, pageIds })
        : undefined,
    [onReorderFavorites]
  );

  return {
    favoriteTree,
    favoritePageIdSet,
    favoriteFolders,
    favoritePickerTarget,
    setFavoritePickerTarget,
    handleToggleFavoritePage,
    handleFolderPickerConfirm,
    handleAddFavoriteFolder,
    handleDeleteFavoriteFolder,
    handleDeleteFavorite,
    handleReorderFavoriteFolders,
    handleReorderFavoriteItems,
  };
}
