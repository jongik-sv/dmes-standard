interface PortalModuleConfigEntry {
  moduleId: string;
  packageName: string;
  loadPage: (pageName: string) => Promise<unknown | null>;
}

let sharedPageNamePathValidator: ((pageName: string) => boolean) | null = null;

async function isValidPageNamePathFromShared(pageName: string): Promise<boolean> {
  if (!sharedPageNamePathValidator) {
    const sharedPortalShellCore = await import("@dk-oasis/shared/portal-shell-core");
    sharedPageNamePathValidator = sharedPortalShellCore.isValidPageNamePath;
  }

  return sharedPageNamePathValidator(pageName);
}

function isPortalShellPageComponent(
  value: unknown
): value is (props: Record<string, unknown>) => unknown {
  return typeof value === "function";
}

function createSafePageLoader(
  pageLoader: (pageName: string) => Promise<{ default: unknown }>
): (pageName: string) => Promise<unknown | null> {
  return async (pageName: string) => {
    if (!(await isValidPageNamePathFromShared(pageName))) {
      return null;
    }

    try {
      const pageModule = await pageLoader(pageName);
      if (!isPortalShellPageComponent(pageModule.default)) {
        return null;
      }

      return pageModule.default;
    } catch {
      return null;
    }
  };
}

// m-mcm 이 모든 화면의 단일 호스트라 page-components/${pageName}/page 가 공통 entry 다.
// 업무 모듈 화면은 두 갈래로 들어온다.
//   (1) page-components/{group}/{screenId}/page.tsx — m-mcm 자체 화면 또는 타 패키지 re-export shim
//   (2) 모듈 패키지의 pages/{group}/{leaf}/page.tsx — codegen 이 정적 import 리터럴로 등재
//       (scripts/generate-page-registry.mjs 의 MODULE_PAGE_PACKAGES)
//
// PAGE_REGISTRY (auto-generated codegen) 가 단일 진입점이다. 신규 화면은 page.tsx 만 작성하면
// prebuild 훅이 lib/generated/page-registry.ts 를 자동 갱신한다 — 사람이 손대는 정적 카탈로그 ✗.
//
// 예외는 turbopack 의 dynamic-glob 제약에 걸리는 패키지뿐이다. 그 경우 아래 ANALOG_STATIC_PAGES 처럼
// 모듈별 정적 매핑 테이블을 두고 전용 로더를 만든다.
import {
  PAGE_REGISTRY,
  isRegisteredPage as isRegisteredInRegistry,
  resolveRegistryPath,
} from "../../lib/generated/page-registry";

const sharedPortalPageLoader = createSafePageLoader(async (pageName) => {
  const loader = PAGE_REGISTRY[pageName];
  if (!loader) {
    throw new Error(`page not registered in PAGE_REGISTRY: ${pageName}`);
  }
  return loader() as Promise<{ default: unknown }>;
});

// 모듈 패키지가 자기 pages/ 아래 화면을 갖는 경우, PAGE_REGISTRY(codegen)가
// `@dk-oasis/m-{module}/pages/{group}/{leaf}/page` 정적 import 리터럴을 직접 보유한다
// (shim 미사용, turbopack-safe). 이때는 모듈 전용 로더가 따로 필요 없고
// sharedPortalPageLoader(registry 기반)가 그대로 처리한다.

// m-analog 패키지에서 직접 페이지 로딩 — 정적 mapping 패턴(turbopack dynamic-glob 회피).
// m-analog 는 dist 매핑이라 화면 CSS(tsup 추출본)를 dist JS 와 함께 로드한다.
// 새 m-analog 화면 추가 시 아래 ANALOG_STATIC_PAGES 에 1줄 등록.
const ANALOG_STATIC_PAGES: Record<string, () => Promise<{ default: unknown }>> = {
  "anl/logViewer": () =>
    Promise.all([
      import("@dk-oasis/m-analog/pages/anl/logViewer"),
      import("@dk-oasis/m-analog/pages/anl/logViewer.css"),
    ]).then(([pageModule]) => pageModule),
};
const analogDirectPackageLoader = createSafePageLoader(async (pageName) => {
  const loader = ANALOG_STATIC_PAGES[pageName];
  if (!loader) {
    throw new Error(`analog page not registered: ${pageName}`);
  }
  return loader();
});
const analogPackagePageLoader = async (pageName: string) => {
  const direct = await analogDirectPackageLoader(pageName);
  if (direct) return direct;
  return sharedPortalPageLoader(pageName);
};

function createStrictModuleLoader(
  _moduleId: string,
  pageLoader: (pageName: string) => Promise<unknown | null>
): (pageName: string) => Promise<unknown | null> {
  return async (pageName: string) => {
    // 2026-06-05 Phase 3 — module-pages.ts.MODULE_PAGES 의존 제거.
    //   PAGE_REGISTRY (codegen) 의 존재 여부 = strict 라우팅 검증 (디스크 page.tsx 실재 = SoT).
    //   leaf-only 입력은 PAGE_REGISTRY 키 중 매칭 group/leaf 자동 prefix 부착.
    //   moduleId 별 화이트리스트 (이전 isPageRegisteredForModule) 는 DB componentPath 가
    //   sysCd 와 정합한 형태로 내려주는 것을 신뢰 — DB SoT 정책 정합.
    let fullPath: string | null = null;
    if (isRegisteredInRegistry(pageName)) {
      fullPath = pageName;
    } else {
      fullPath = resolveRegistryPath(pageName);
    }
    if (!fullPath) {
      console.warn(
        `[portal-strict] page "${pageName}" is not in PAGE_REGISTRY. page-components/.../page.tsx 파일이 디스크에 있는지 + 'node scripts/generate-page-registry.mjs' 재실행 확인.`
      );
      return null;
    }
    return pageLoader(fullPath);
  };
}

const PORTAL_MODULE_CONFIG: PortalModuleConfigEntry[] = [
  {
    moduleId: "mcm",
    packageName: "@dk-oasis/mcm",
    loadPage: createStrictModuleLoader("mcm", sharedPortalPageLoader),
  },
  {
    moduleId: "analog",
    packageName: "@dk-oasis/m-analog",
    // analog 페이지는 디스크 page.tsx 스캔(PAGE_REGISTRY) 대상이 아니므로 strict 게이트를 우회하고
    // ANALOG_STATIC_PAGES 화이트리스트(analogPackagePageLoader)가 직접 검증한다. 미등록 키는 null 처리.
    loadPage: analogPackagePageLoader,
  },
  {
    // 2026-09-04 — mls(물류) 모듈 포털 등재. 1호 화면 lsh/noticeMgmt(2026-10-07 m-mcm 으로 옮김 — DEC-001, 지금 m-mls 화면 없음).
    //   화면 코드는 m-mls 패키지의 pages/{group}/{leaf}/page.tsx 에 있고, codegen
    //   (generate-page-registry.mjs 의 MODULE_PAGE_PACKAGES) 이 PAGE_REGISTRY 에 정적 import 로 등재한다.
    //   따라서 analog 처럼 전용 로더가 필요 없고 sharedPortalPageLoader 로 충분하다.
    moduleId: "mls",
    packageName: "@dk-oasis/m-mls",
    loadPage: createStrictModuleLoader("mls", sharedPortalPageLoader),
  },
  {
    // 2026-09-23 — mdm 모듈 포털 등재. 1호 화면 dma/mdmSample(스캐폴드 검증용 빈 화면, TSK-01-02 에서 그룹 이동).
    //   화면 코드는 m-mdm 패키지의 pages/{group}/{leaf}/page.tsx 에 있고, codegen 이 등재한다.
    moduleId: "mdm",
    packageName: "@dk-oasis/m-mdm",
    loadPage: createStrictModuleLoader("mdm", sharedPortalPageLoader),
  },
  // 업무 모듈(mpn / mpp / mqc ...) 을 붙일 때 여기에 1개 항목씩 추가한다.
  // 대부분은 sharedPortalPageLoader(= PAGE_REGISTRY) 로 충분하다:
  //   { moduleId: "mpn", packageName: "@dk-oasis/m-mpn",
  //     loadPage: createStrictModuleLoader("mpn", sharedPortalPageLoader) },
];

function validateUniqueModuleIds(entries: PortalModuleConfigEntry[]): void {
  const visitedModuleIds = new Set<string>();

  entries.forEach((entry) => {
    if (visitedModuleIds.has(entry.moduleId)) {
      throw new Error(`중복 moduleId가 존재합니다: ${entry.moduleId}`);
    }

    visitedModuleIds.add(entry.moduleId);
  });
}

validateUniqueModuleIds(PORTAL_MODULE_CONFIG);

const moduleConfigById = new Map(
  PORTAL_MODULE_CONFIG.map((moduleConfig) => [moduleConfig.moduleId, moduleConfig])
);

export const portalModuleConfig = PORTAL_MODULE_CONFIG;

export function loadConfiguredModulePage(
  moduleId: string,
  pageName: string
): Promise<unknown | null> {
  const moduleConfig = moduleConfigById.get(moduleId);
  if (!moduleConfig) {
    return Promise.resolve(null);
  }

  return moduleConfig.loadPage(pageName);
}

export const portalTranspilePackages = [
  "@dk-oasis/shared",
  ...Array.from(
    new Set(
      portalModuleConfig
        .map((entry) => entry.packageName)
        .filter((packageName) => packageName !== "@dk-oasis/mcm")
    )
  ),
];
