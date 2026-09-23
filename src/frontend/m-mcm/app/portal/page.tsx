"use client";

import { useCallback } from "react";
import {
  type FavoriteFolderChoice,
  PortalShell,
  resolvePortalHomePageId,
  usePortalFavorites,
  usePortalMenu,
} from "@dk-oasis/shared/portal-shell";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/modal.css";
import { resolvePortalPage } from "./registered-modules";

const MODULE_ID = "mcm";
const MENU_ENDPOINT = { endpoint: "/api/mcm/oasis/secUser/myMenusTree" };
const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };
const FAVORITE_TOGGLE_ENDPOINT = "/api/mcm/oasis/secFavorite/toggle";
const FAVORITE_ADD_FOLDER_ENDPOINT = "/api/mcm/oasis/secFavorite/addFolder";
const FAVORITE_DELETE_FOLDER_ENDPOINT = "/api/mcm/oasis/secFavorite/deleteFolder";
// 페이지 접근 이력(RECORD_ACCESS) 엔드포인트는 legacy secMenu.bpmn / secMenuService 빈 제거(2026-06-01)와 함께 폐기됨.
// commMenuMng 신규 자산에 대응 action 미도입 — onPageOpen 콜백 자체를 PortalShell 에 전달하지 않는다.
const DEFAULT_HOME_PAGE_ID = resolvePortalHomePageId(MODULE_ID, "home");

function PortalShellWithMessage({
  menu,
  favorites,
  refetchFavorites,
}: {
  menu: NonNullable<ReturnType<typeof usePortalMenu>["menu"]>;
  favorites: ReturnType<typeof usePortalFavorites>["favorites"];
  refetchFavorites: ReturnType<typeof usePortalFavorites>["refetch"];
}) {
  const gfn_message = useGfnMessage();

  const handleBeforeLogout = useCallback(
    (doLogout: () => void) => {
      gfn_message("로그아웃 하시겠습니까?", "", "", "confirm", "로그아웃", doLogout);
    },
    [gfn_message]
  );

  // 별 버튼 클릭 → 백엔드 토글 → 목록 재조회
  // pageId 형식: "{moduleId}:{componentPath}" (예: "mcm:csa/commUserMng")
  // folder: 미등록 → 등록 시 폴더 선택 팝업 결과(기존 fvtFoldId / 신규 fvtFoldNm). 제거 시 undefined.
  const handleToggleFavorite = useCallback(
    async (pageId: string, folder?: FavoriteFolderChoice) => {
      try {
        // 현재 사용자 ID (BE 가 SecurityContext 로 강제 치환하기 전까지 body 로 전달)
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        const me = await meRes.json();
        const userId: string = me.user?.id ?? "";
        if (!userId) {
          gfn_message("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", "", "", "error");
          return;
        }

        const res = await fetch(FAVORITE_TOGGLE_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meta: { userId, menuId: "PORTAL_SHELL" },
            params: {
              userId,
              pageId,
              ...(folder?.fvtFoldId ? { fvtFoldId: folder.fvtFoldId } : {}),
              ...(folder?.fvtFoldNm ? { fvtFoldNm: folder.fvtFoldNm } : {}),
            },
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`즐겨찾기 토글 실패 (${res.status}) ${text}`);
        }
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "즐겨찾기 토글 실패");
        }

        await refetchFavorites();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "즐겨찾기 처리 중 오류가 발생했습니다.";
        gfn_message(msg, "", "", "error");
      }
    },
    [gfn_message, refetchFavorites]
  );

  // 즐겨찾기 그룹 추가/삭제 공통 호출 (OASIS secFavorite/addFolder · deleteFolder)
  const callFavoriteFolderAction = useCallback(
    async (endpoint: string, params: Record<string, unknown>) => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        const me = await meRes.json();
        const userId: string = me.user?.id ?? "";
        if (!userId) {
          gfn_message("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", "", "", "error");
          return;
        }
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meta: { userId, menuId: "PORTAL_SHELL" }, params: { userId, ...params } }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`즐겨찾기 그룹 처리 실패 (${res.status}) ${text}`);
        }
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "즐겨찾기 그룹 처리 실패");
        }
        await refetchFavorites();
      } catch (err) {
        gfn_message(err instanceof Error ? err.message : "즐겨찾기 그룹 처리 중 오류가 발생했습니다.", "", "", "error");
      }
    },
    [gfn_message, refetchFavorites]
  );

  const handleAddFavoriteFolder = useCallback(
    (folderName: string) => {
      void callFavoriteFolderAction(FAVORITE_ADD_FOLDER_ENDPOINT, { fvtFoldNm: folderName });
    },
    [callFavoriteFolderAction]
  );

  const handleDeleteFavoriteFolder = useCallback(
    (folderId: string) => {
      gfn_message(
        "이 그룹을 삭제하시겠습니까? 하위 즐겨찾기도 함께 삭제됩니다.",
        "",
        "",
        "confirm",
        "삭제",
        () => void callFavoriteFolderAction(FAVORITE_DELETE_FOLDER_ENDPOINT, { fvtFoldId: folderId })
      );
    },
    [gfn_message, callFavoriteFolderAction]
  );

  // onPageOpen (메뉴 접근 이력) — legacy secMenuService 제거(2026-06-01)와 함께 미연결.
  // commMenuMng 신규 자산에서 페이지 접근 이력 적재 action 이 도입되면 재연결.

  return (
    <PortalShell
      appName="DMES Portal"
      menu={menu}
      favoriteMenus={favorites}
      resolvePage={resolvePortalPage}
      defaultHomePageId={DEFAULT_HOME_PAGE_ID}
      onBeforeLogout={handleBeforeLogout}
      onToggleFavorite={handleToggleFavorite}
      onAddFavoriteFolder={handleAddFavoriteFolder}
      onDeleteFavoriteFolder={handleDeleteFavoriteFolder}
    />
  );
}

export default function PortalPage() {
  const {
    menu,
    isLoading: isMenuLoading,
    errorMessage: menuErrorMessage,
  } = usePortalMenu(MENU_ENDPOINT);

  const {
    favorites,
    isLoading: isFavoritesLoading,
    errorMessage: favoritesErrorMessage,
    refetch: refetchFavorites,
  } = usePortalFavorites(FAVORITES_ENDPOINT);

  if (isMenuLoading || isFavoritesLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          fontFamily: "var(--font-family)",
          color: "#666",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: "3px solid #e8e8e8",
            borderTopColor: "var(--color-primary, #0b62d6)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            marginRight: 8,
          }}
        />
        로딩 중...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!menu || menuErrorMessage || favoritesErrorMessage) {
    return (
      <p style={{ padding: 16, color: "#dc3545" }}>
        {menuErrorMessage ?? favoritesErrorMessage ?? "메뉴/즐겨찾기를 불러올 수 없습니다."}
      </p>
    );
  }

  return <PortalShellWithMessage menu={menu} favorites={favorites} refetchFavorites={refetchFavorites} />;
}
