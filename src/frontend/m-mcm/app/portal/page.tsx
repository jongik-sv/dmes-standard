"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  type FavoriteFolderChoice,
  getCurrentUser,
  PortalShell,
  resolvePortalHomePageId,
  usePortalFavorites,
  usePortalMenu,
  usePortalStartPages,
} from "@dk-oasis/shared/portal-shell";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/modal.css";
import { resolvePortalPage } from "./registered-modules";
import { useDockRegistry } from "./use-dock-registry";
import { usePortalUsageReporter } from "./use-portal-usage-reporter";
import { buildPopoutUrl } from "../popup/popup-target";
import { publishPortalMenu } from "@/lib/portal-menu-store";
import { publishPortalFavorites } from "@/lib/portal-favorites-store";

const MODULE_ID = "mcm";
const MENU_ENDPOINT = { endpoint: "/api/mcm/oasis/secUser/myMenusTree" };
const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };
const FAVORITE_TOGGLE_ENDPOINT = "/api/mcm/oasis/secFavorite/toggle";
const FAVORITE_ADD_FOLDER_ENDPOINT = "/api/mcm/oasis/secFavorite/addFolder";
const FAVORITE_DELETE_FOLDER_ENDPOINT = "/api/mcm/oasis/secFavorite/deleteFolder";
// 기본 화면(포털을 처음 시작할 때 자동으로 여는 화면) — 즐겨찾기와 같은 방식(사용자별 서버 저장).
const START_PAGES_ENDPOINT = { endpoint: "/api/mcm/oasis/secStartPgm/search" };
const START_PAGE_TOGGLE_ENDPOINT = "/api/mcm/oasis/secStartPgm/toggle";
// 페이지 접근 이력(RECORD_ACCESS) 엔드포인트는 legacy secMenu.bpmn / secMenuService 빈 제거(2026-06-01)와 함께 폐기됨.
// commMenuMng 신규 자산에 대응 action 미도입 — onPageOpen 콜백 자체를 PortalShell 에 전달하지 않는다.
const DEFAULT_HOME_PAGE_ID = resolvePortalHomePageId(MODULE_ID, "home");

function PortalShellWithMessage({
  menu,
  favorites,
  refetchFavorites,
  startPages,
  isStartPagesLoaded,
  refetchStartPages,
}: {
  menu: NonNullable<ReturnType<typeof usePortalMenu>["menu"]>;
  favorites: ReturnType<typeof usePortalFavorites>["favorites"];
  refetchFavorites: ReturnType<typeof usePortalFavorites>["refetch"];
  startPages: ReturnType<typeof usePortalStartPages>["startPages"];
  isStartPagesLoaded: boolean;
  refetchStartPages: ReturnType<typeof usePortalStartPages>["refetch"];
}) {
  const gfn_message = useGfnMessage();
  const { onUsageSegments, flushUsageForLogout } = usePortalUsageReporter();
  // 포털 머리 「도구」 — floatable 위젯(계산기·단위 변환·메모)을 업무 화면 위 떠 있는 창으로 띄운다(사용자별 브라우저 저장).
  const widgetDock = useDockRegistry();

  const handleBeforeLogout = useCallback(
    (doLogout: () => void) => {
      gfn_message("로그아웃 하시겠습니까?", "", "", "confirm", "로그아웃", () => {
        doLogout(); // PortalShell 이 맨 앞에서 열린 구간을 닫아 onUsageSegments 로 넘긴다
        flushUsageForLogout(); // 남은 큐(열린 구간이 없던 경우)를 keepalive 로 보낸다(signOut 이동 중에도 전송 유지)
      });
    },
    [gfn_message, flushUsageForLogout]
  );

  // 별 버튼 클릭 → 백엔드 토글 → 목록 재조회
  // pageId 형식: "{moduleId}:{componentPath}" (예: "mcm:csa/commUserMng")
  // folder: 미등록 → 등록 시 폴더 선택 팝업 결과(기존 fvtFoldId / 신규 fvtFoldNm). 제거 시 undefined.
  const handleToggleFavorite = useCallback(
    async (pageId: string, folder?: FavoriteFolderChoice) => {
      try {
        // 현재 사용자 ID (BE 가 SecurityContext 로 강제 치환하기 전까지 body 로 전달)
        const me = await getCurrentUser(); // 공유 사용자 확인(세션 캐시, K3)
        const userId: string = me.ok ? me.user.id : "";
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
        const me = await getCurrentUser(); // 공유 사용자 확인(세션 캐시, K3)
        const userId: string = me.ok ? me.user.id : "";
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

  // 탭 우클릭 '기본 화면 등록/해제' · 사이드바 해제 버튼 → 백엔드 토글 → 목록 재조회.
  // pageId 는 우클릭한 탭의 것이다. userId 는 BE 가 인증 사용자로 강제한다(body 값은 참고용).
  const handleToggleStartPage = useCallback(
    async (pageId: string) => {
      try {
        const me = await getCurrentUser(); // 공유 사용자 확인(세션 캐시, K3)
        const userId: string = me.ok ? me.user.id : "";
        if (!userId) {
          gfn_message("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", "", "", "error");
          return;
        }
        const res = await fetch(START_PAGE_TOGGLE_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meta: { userId, menuId: "PORTAL_SHELL" }, params: { userId, pageId } }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`기본 화면 처리 실패 (${res.status}) ${text}`);
        }
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "기본 화면 처리 실패");
        }
        await refetchStartPages();
      } catch (err) {
        gfn_message(err instanceof Error ? err.message : "기본 화면 처리 중 오류가 발생했습니다.", "", "", "error");
      }
    },
    [gfn_message, refetchStartPages]
  );

  // 탭 「새 창으로 분리」 — 팝업이 차단되면 안내만 하고 탭은 그대로 둔다(설계 2026-10-06 §5.3).
  const popout = useMemo(
    () => ({
      buildUrl: buildPopoutUrl,
      onBlocked: () =>
        gfn_message(
          "팝업이 차단되어 새 창을 열지 못했습니다. 브라우저 주소창의 팝업 차단을 이 사이트에 대해 허용한 뒤 다시 시도해 주세요.",
          "",
          "",
          "warning"
        ),
      onError: () => gfn_message("새 창을 열지 못했습니다. 다시 시도해 주세요.", "", "", "warning"),
    }),
    [gfn_message]
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
      startPages={startPages}
      isStartPagesLoaded={isStartPagesLoaded}
      onToggleStartPage={handleToggleStartPage}
      onUsageSegments={onUsageSegments}
      widgetDock={widgetDock}
      popout={popout}
      allowDuplicateTabs
    />
  );
}

export default function PortalPage() {
  const {
    menu,
    isLoading: isMenuLoading,
    errorMessage: menuErrorMessage,
  } = usePortalMenu(MENU_ENDPOINT);

  // 받은 메뉴를 화면들이 다시 조회하지 않고 쓰게 올려 둔다(예: 홈의 "공지 관리 ›" 권한 판정).
  useEffect(() => {
    publishPortalMenu(menu?.items ?? null);
  }, [menu]);

  const {
    favorites,
    isLoading: isFavoritesLoading,
    errorMessage: favoritesErrorMessage,
    refetch: refetchFavorites,
  } = usePortalFavorites(FAVORITES_ENDPOINT);

  // 받은 즐겨찾기를 홈 바로가기 위젯이 다시 조회하지 않고 쓰게 올려 둔다(진입 때 같은 목록 중복 요청 방지).
  useEffect(() => {
    publishPortalFavorites(isFavoritesLoading || favoritesErrorMessage ? null : favorites);
  }, [favorites, isFavoritesLoading, favoritesErrorMessage]);
  useEffect(() => () => publishPortalFavorites(null), []);

  // 기본 화면 목록은 포털을 가리지 않는다(로딩 화면 조건에 넣지 않음) — 조회가 끝나면 PortalShell 이 한 번 자동으로 연다.
  // 여기(최상위)에 두어 PortalShell 이 다시 마운트돼도(메뉴·즐겨찾기 첫 로딩 등) 목록·조회 상태를 잃지 않는다.
  const {
    startPages,
    isLoaded: isStartPagesLoaded,
    refetch: refetchStartPages,
  } = usePortalStartPages(START_PAGES_ENDPOINT);

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

  return (
    <PortalShellWithMessage
      menu={menu}
      favorites={favorites}
      refetchFavorites={refetchFavorites}
      startPages={startPages}
      isStartPagesLoaded={isStartPagesLoaded}
      refetchStartPages={refetchStartPages}
    />
  );
}
