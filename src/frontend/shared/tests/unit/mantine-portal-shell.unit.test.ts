/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { TabsBar } from "../../src/portal-shell/tabs-bar/TabsBar";
import { Header } from "../../src/portal-shell/header/Header";
import { Sidebar } from "../../src/portal-shell/sidebar/Sidebar";
import { FavoritesTree } from "../../src/portal-shell/sidebar/FavoritesTree";
import { FavoriteFolderPickerModal } from "../../src/portal-shell/FavoriteFolderPickerModal";
import { MenuSearchDialog } from "../../src/portal-shell/MenuSearchDialog";
import { PortalLoginForm } from "../../src/auth/login-form";
import type { PortalShellMenuItem } from "../../src/portal-shell/types";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

// happy-dom 환경에서 전역 localStorage 가 노출되지 않는 경우를 대비한다.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(async () => ({ ok: true, error: null, url: "/" })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
}));

/** TabsBar 의 tabs prop 은 TabsBar 지역 TabState(id·title·pageId·isHome) 를 받는다. */
function tab(id: string, title: string, pageId: string, isHome = false) {
  return { id, title, pageId, isHome };
}

function menuNode(
  overrides: Partial<PortalShellMenuItem> & Pick<PortalShellMenuItem, "id" | "displayText" | "type">
): PortalShellMenuItem {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    displayText: overrides.displayText,
    type: overrides.type,
    items: overrides.items ?? [],
    parentId: overrides.parentId ?? null,
    expended: overrides.expended ?? null,
    path: overrides.path ?? "/",
    moduleId: overrides.moduleId ?? null,
    pageName: overrides.pageName ?? null,
    componentPath: overrides.componentPath ?? null,
  };
}

/** 텍스트가 정확히 일치하는 최말단(자식 없는) 요소를 찾는다. */
function leafByText(r: Rendered, text: string): HTMLElement {
  const scopes: ParentNode[] = [r.host, document.body];
  for (const scope of scopes) {
    const found = Array.from(scope.querySelectorAll<HTMLElement>("*")).find(
      (el) => el.textContent?.trim() === text && el.children.length === 0
    );
    if (found) return found;
  }
  throw new Error(`"${text}" 를 가진 요소를 찾지 못했다.`);
}

/** React 제어 입력에 값을 넣는다. 네이티브 setter 를 거쳐야 React 가 변경을 인식한다. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 실제 포인터 입력과 같은 순서로 mousedown → click 을 보낸다. */
function pointerClick(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.click();
  });
}

describe("portal-shell (Mantine 구현) 계약", () => {
  it("TabsBar 는 tab-bar 클래스를 유지하고 탭 클릭/닫기 콜백을 호출한다", () => {
    const onTabClick = vi.fn();
    const onTabClose = vi.fn();
    const tabs = [tab("t1", "사용자 관리", "mcm:csa/commUserMng")];
    const r = renderWithMantine(
      createElement(TabsBar, {
        tabs,
        activeTabId: "t1",
        onTabClick,
        onTabClose,
        onGoHome: () => {},
      })
    );

    expect(r.host.querySelector(".tab-bar")).not.toBeNull();

    pointerClick(leafByText(r, "사용자 관리"));
    expect(onTabClick).toHaveBeenCalledWith("t1");

    const closeButton = r.host.querySelector<HTMLElement>(".tab-close");
    expect(closeButton).not.toBeNull();
    act(() => closeButton!.click());
    expect(onTabClose).toHaveBeenCalledWith("t1");

    r.unmount();
  });

  it("TabsBar 의 우측 액션 버튼은 홈·새로고침·즐겨찾기 콜백을 그대로 호출한다", () => {
    const onRefresh = vi.fn();
    const onToggleFavorite = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, {
        tabs: [tab("home", "홈", "mcm:home", true)],
        activeTabId: "home",
        onTabClick: () => {},
        onTabClose: () => {},
        onGoHome: () => {},
        onRefresh,
        onToggleFavorite,
      })
    );

    const buttons = Array.from(r.host.querySelectorAll<HTMLElement>(".tabs-controls button"));
    const refresh = buttons.find((b) => b.getAttribute("title") === "새로고침");
    const favorite = buttons.find((b) => b.getAttribute("title") === "즐겨찾기 추가");
    expect(refresh).toBeDefined();
    expect(favorite).toBeDefined();

    act(() => refresh!.click());
    act(() => favorite!.click());
    expect(onRefresh).toHaveBeenCalled();
    expect(onToggleFavorite).toHaveBeenCalled();

    r.unmount();
  });

  it("Header 는 사용자명을 표시하고 메뉴에서 로그아웃을 호출한다", () => {
    const onLogout = vi.fn();
    const r = renderWithMantine(
      createElement(Header, {
        appName: "DMES",
        userName: "관리자",
        loginId: "admin",
        onLogout,
      })
    );

    expect(r.host.textContent).toContain("관리자");

    const menuTarget = r.host.querySelector<HTMLElement>(".portal-header__user-button");
    expect(menuTarget).not.toBeNull();
    act(() => menuTarget!.click());

    const logout = leafByText(r, "로그아웃");
    act(() => logout.click());
    expect(onLogout).toHaveBeenCalled();

    r.unmount();
  });

  it("Sidebar 는 tree-item 클래스를 유지하고 페이지 클릭 시 pageId 를 전달한다", () => {
    const onMenuItemClick = vi.fn();
    const onNavigationViewModeChange = vi.fn();
    const menuItems = [
      menuNode({
        id: "csa",
        displayText: "권한관리",
        type: "dir",
        items: [
          menuNode({
            id: "commUserMng",
            displayText: "사용자 관리",
            type: "page",
            moduleId: "mcm",
            pageName: "commUserMng",
            componentPath: "csa/commUserMng",
          }),
        ],
      }),
    ];

    const r = renderWithMantine(
      createElement(Sidebar, {
        appName: "DMES",
        menuItems,
        favoriteFolders: [],
        navigationViewMode: "menu" as const,
        onNavigationViewModeChange,
        isExpanded: true,
        onExpandedChange: () => {},
        activePageId: null,
        onMenuItemClick,
      })
    );

    const folderRow = r.host.querySelector<HTMLElement>(".tree-item");
    expect(folderRow).not.toBeNull();
    act(() => folderRow!.click());

    const pageRow = Array.from(r.host.querySelectorAll<HTMLElement>(".tree-item")).find((el) =>
      el.textContent?.includes("사용자 관리")
    );
    expect(pageRow).toBeDefined();
    act(() => pageRow!.click());
    expect(onMenuItemClick).toHaveBeenCalledWith("mcm:csa/commUserMng");

    // 메뉴 / 즐겨찾기 전환은 SegmentedControl 의 라디오 입력으로 노출된다.
    const favoritesRadio = Array.from(
      r.host.querySelectorAll<HTMLInputElement>("input[type=radio]")
    ).find((input) => input.value === "favorites");
    expect(favoritesRadio).toBeDefined();
    act(() => favoritesRadio!.click());
    expect(onNavigationViewModeChange).toHaveBeenCalledWith("favorites");

    r.unmount();
  });

  it("Sidebar 의 검색 지우기 버튼과 접기 토글은 실제로 클릭이 전달된다", () => {
    const onExpandedChange = vi.fn();
    const r = renderWithMantine(
      createElement(Sidebar, {
        appName: "DMES",
        menuItems: [],
        favoriteFolders: [],
        navigationViewMode: "menu" as const,
        onNavigationViewModeChange: () => {},
        isExpanded: true,
        onExpandedChange,
        activePageId: null,
        onMenuItemClick: () => {},
      })
    );

    const search = r.host.querySelector<HTMLInputElement>("input.search-input");
    expect(search).not.toBeNull();
    act(() => typeInto(search!, "사용자"));
    expect(search!.value).toBe("사용자");

    // Mantine 의 rightSection 은 pointer-events 를 열어 주지 않으면 실제 브라우저에서 클릭이 죽는다.
    const wrapper = r.host.querySelector<HTMLElement>(".mantine-Input-wrapper");
    expect(wrapper?.getAttribute("style")).toContain("--input-right-section-pointer-events: all");

    const clear = r.host.querySelector<HTMLElement>(".clear-btn");
    expect(clear).not.toBeNull();
    act(() => clear!.click());
    expect(r.host.querySelector<HTMLInputElement>("input.search-input")!.value).toBe("");

    const toggle = r.host.querySelector<HTMLElement>(".sidebar-toggle-button");
    expect(toggle).not.toBeNull();
    act(() => toggle!.click());
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    r.unmount();
  });

  it("메뉴 트리 최상위 ul 은 ScrollArea content 아래에 있고 목록 초기화 규칙에 매치된다", () => {
    const r = renderWithMantine(
      createElement(Sidebar, {
        appName: "DMES",
        menuItems: [menuNode({ id: "csa", displayText: "권한관리", type: "dir" })],
        favoriteFolders: [],
        navigationViewMode: "menu" as const,
        onNavigationViewModeChange: () => {},
        isExpanded: true,
        onExpandedChange: () => {},
        activePageId: null,
        onMenuItemClick: () => {},
      })
    );

    const ul = r.host.querySelector<HTMLElement>(".tree-scroll-area ul");
    expect(ul).not.toBeNull();
    // ScrollArea 가 root 와 ul 사이에 viewport > content 두 겹을 끼운다.
    expect(ul!.parentElement?.className).toContain("mantine-ScrollArea-content");

    // Sidebar.css 의 최상위 ul 초기화 규칙(list-style/padding 제거)이 실제 DOM 에 걸려야 한다.
    // 자식 결합자로 두면 ScrollArea 래퍼 때문에 죽어 브라우저 기본 disc/들여쓰기가 살아난다.
    // happy-dom 환경에서는 import.meta.url 이 file: 스킴이 아니라 vitest root 기준으로 읽는다.
    const sidebarCss = readFileSync(
      resolve(process.cwd(), "src/portal-shell/sidebar/Sidebar.css"),
      "utf8"
    );
    const rootListSelector = sidebarCss.match(
      /^(\.sidebar-open[^{]*tree-scroll-area[^{]*ul)\s*\{/m
    );
    expect(rootListSelector).not.toBeNull();
    expect(ul!.matches(rootListSelector![1].trim())).toBe(true);

    r.unmount();
  });

  it("FavoritesTree 는 tree-item 을 유지하고 즐겨찾기 클릭을 전달한다", () => {
    const onMenuItemClick = vi.fn();
    const r = renderWithMantine(
      createElement(FavoritesTree, {
        folders: [
          {
            folderId: "F1",
            folderName: "즐겨찾기",
            children: [{ pageId: "mcm:csa/commUserMng", displayText: "사용자 관리" }],
          },
        ],
        activePageId: null,
        onMenuItemClick,
      })
    );

    const leaf = Array.from(r.host.querySelectorAll<HTMLElement>(".tree-item")).find((el) =>
      el.textContent?.includes("사용자 관리")
    );
    expect(leaf).toBeDefined();
    act(() => leaf!.click());
    expect(onMenuItemClick).toHaveBeenCalledWith("mcm:csa/commUserMng");

    r.unmount();
  });

  it("FavoriteFolderPickerModal 은 공통 Modal(cm-modal) 위에서 폴더 선택을 확정한다", () => {
    const onConfirm = vi.fn();
    const r = renderWithMantine(
      createElement(FavoriteFolderPickerModal, {
        open: true,
        folders: [{ fvtFoldId: "F1", fvtFoldNm: "업무" }],
        pageLabel: "사용자 관리",
        onConfirm,
        onCancel: () => {},
      })
    );

    expect(document.querySelector(".cm-modal")).not.toBeNull();

    const confirm = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
      (b) => b.textContent?.trim() === "추가"
    );
    expect(confirm).toBeDefined();
    act(() => confirm!.click());
    expect(onConfirm).toHaveBeenCalledWith({ fvtFoldId: "F1" });

    r.unmount();
  });

  it("MenuSearchDialog 는 listbox 결과에서 페이지를 열고 modal-overlay 훅을 남긴다", () => {
    const onOpenPage = vi.fn();
    const onClose = vi.fn();
    const r = renderWithMantine(
      createElement(MenuSearchDialog, {
        open: true,
        items: [
          {
            pageId: "mcm:csa/commUserMng",
            title: "사용자 관리",
            parentPathText: "공통관리 / 권한관리",
          },
        ],
        recentItems: [],
        activePageId: null,
        onOpenPage,
        onClose,
      })
    );

    // PageLayout 의 ESC 가드가 document.querySelector(".modal-overlay") 로 열림을 판정한다.
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
    expect(document.querySelector("[role=listbox]")).not.toBeNull();

    const option = document.querySelector<HTMLElement>("[role=option]");
    expect(option).not.toBeNull();
    act(() => option!.click());
    expect(onOpenPage).toHaveBeenCalledWith("mcm:csa/commUserMng");
    expect(onClose).toHaveBeenCalled();

    r.unmount();
  });

  it("PortalLoginForm 은 e2e 클래스와 userId·password 필드 이름을 유지한다", () => {
    const r = renderWithMantine(
      createElement(PortalLoginForm, { appName: "DMES", callbackUrl: "/portal" })
    );

    expect(r.host.querySelector(".login-wrapper")).not.toBeNull();
    expect(r.host.querySelector("form.login-form")).not.toBeNull();
    expect(r.host.querySelector("input[name=userId]")).not.toBeNull();
    expect(r.host.querySelector("input[name=password]")).not.toBeNull();
    expect(r.host.querySelectorAll(".login-input")).toHaveLength(2);
    expect(r.host.querySelector(".login-change-pw")).not.toBeNull();

    const submit = r.host.querySelector<HTMLButtonElement>("button[type=submit]");
    expect(submit?.textContent).toContain("로그인");

    // e2e 셀렉터 계약(login-smoke.spec.ts, portal-tab-history.spec.ts)이 요구하는
    // aria-label·클래스가 실제 DOM 에 존재하는지 검증한다.
    expect(r.host.querySelector('input[aria-label="User ID"]')).not.toBeNull();
    expect(r.host.querySelector('input[aria-label="Password"]#login-password')).not.toBeNull();
    expect(r.host.querySelector("button.login-button")).not.toBeNull();

    r.unmount();
  });
});
