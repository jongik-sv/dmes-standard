#!/usr/bin/env node
/**
 * 2026-06-05 Phase 3 codegen — m-mcm/page-components 의 page.tsx glob → PAGE_REGISTRY.
 *
 * 출력: m-mcm/lib/generated/page-registry.ts (auto-generated, do not edit)
 *   export const PAGE_REGISTRY: Record<string, () => Promise<{ default: unknown }>> = {
 *     "cma/masterCodeMng": () => import("@/page-components/cma/masterCodeMng/page"),
 *     "csa/commMenuMng":   () => import("@/page-components/csa/commMenuMng/page"),
 *     "dashboard-overview": () => import("@/page-components/dashboard-overview/page"),
 *     ...
 *   };
 *
 * 호출:
 *   - 수동: node scripts/generate-page-registry.mjs
 *   - 자동: package.json 의 prebuild / predev 훅
 *
 * 사용처: app/portal/module-config.ts 의 sharedPortalPageLoader 가 본 registry 를 직접 사용.
 *   PAGE_REGISTRY 키 존재 여부 = strict 라우팅 검증 (이전 module-pages.ts 의 isPageRegisteredForModule 대체).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PAGE_COMPONENTS = path.join(ROOT, "page-components");
const OUT_DIR = path.join(ROOT, "lib", "generated");
const OUT_FILE = path.join(OUT_DIR, "page-registry.ts");

/**
 * 형제 모듈 패키지의 `pages/` 스캔 대상 목록.
 *
 * m-mcm/page-components 스캔(자체 호스트) 과 별개로, 각 모듈 패키지가 자기 화면 코드를
 * `pages/{group}/{leaf}/page.tsx` 로 보유한다. 여기서 발견한 화면은
 * `import("{pkg}/pages/{group}/{leaf}/page")` 정적 문자열 리터럴로 registry 에 등재된다
 * (turbopack-safe — dynamic 템플릿 아님, page-components shim 미사용).
 *
 * 신규 모듈(m-mqc / m-mls 등) 추가 시 여기에 1줄 등록.
 */
const MODULE_PAGE_PACKAGES = [
  { pkg: "@dk-oasis/m-mpp", dir: path.resolve(ROOT, "..", "m-mpp", "pages") },
  // 향후: { pkg: "@dk-oasis/m-mqc", dir: path.resolve(ROOT, "..", "m-mqc", "pages") },
  // 향후: { pkg: "@dk-oasis/m-mls", dir: path.resolve(ROOT, "..", "m-mls", "pages") },
];

/**
 * 팝업 전용 그룹.
 *
 * 팝업은 라우팅 대상이 아니다 — 부모 화면이 모달로 직접 import 한다.
 * 이 그룹 하위에 `page.tsx` 가 있으면 PAGE_REGISTRY 에 등재되어 메뉴/라우팅에 노출되므로 error.
 *
 * 신규 팝업 그룹 추가 시 여기에 등록.
 */
const POPUP_GROUPS = new Set(["ppz", "lsz", "cmz"]);

/**
 * 팝업 폴더 판별용 이름 접미사 (소문자 비교).
 *
 * `Popup` 이 명명 표준이며, 표준 이전 명명인 `Pop`(예: cmb/masterRuleListPop) 도 함께 잡는다.
 * 이 접미사 검사(V2)는 warn 이므로 오탐이 나도 빌드를 막지 않는다.
 */
const POPUP_NAME_SUFFIXES = ["popup", "pop"];

/** 위반 해소 방법 — 모든 위반 메시지 말미에 공통으로 붙는다. */
const FIX_HINT =
  "해결: 팝업 컴포넌트 파일은 `page.tsx` 가 아니라 폴더명과 같은 `{screenId}.tsx` 로 두고" +
  ' (page.tsx 는 삭제), 같은 폴더에 배럴 `index.ts` (`export { default } from "./{screenId}";`)' +
  " 를 추가해 부모 화면이 직접 import 하게 한다.";

/** 폴더명이 팝업 접미사로 끝나는지. */
function isPopupFolderName(name) {
  const lower = name.toLowerCase();
  return POPUP_NAME_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/** 스캔 루트를 메시지용 짧은 경로로 (`.../m-mpp/pages` → `m-mpp/pages`). */
function displayRoot(dir) {
  return `${path.basename(path.dirname(dir))}/${path.basename(dir)}`;
}

/**
 * 팝업 규약 위반 스캔 (검사 전용 — 수집 결과에 일절 영향 없음).
 *
 * collectPageKeys 와 동일한 탐색 범위(depth 1~2, `_` 접두 스킵)를 본다.
 * 그 범위 밖은 애초에 registry 에 등재되지 않아 라우팅에 잡히지 않기 때문.
 *
 *  - V1 (error): 팝업 그룹 하위의 `page.tsx`.
 *  - V2 (warn) : 폴더명이 팝업 접미사로 끝나는데 `page.tsx` 보유.
 *  - V3 (warn) : 팝업 그룹 하위 폴더의 컴포넌트 파일명이 폴더명과 불일치.
 */
async function collectPopupViolations(rootDir) {
  const label = displayRoot(rootDir);
  const errors = [];
  const warnings = [];

  /** page.tsx 보유 여부로 V1/V2 판정. V1 이 잡은 건 V2 로 중복 경고하지 않는다. */
  const checkPage = async (dir, folderName, key, inPopupGroup) => {
    if (!(await exists(path.join(dir, "page.tsx")))) return;
    const where = `${label}/${key}/page.tsx  (registry key "${key}")`;
    if (inPopupGroup) {
      errors.push(
        `  - ${where}\n` +
          `    팝업 그룹 "${key.split("/")[0]}" 는 라우팅 대상이 아닌데 page.tsx 가 있어 PAGE_REGISTRY 에 등재된다.`,
      );
    } else if (isPopupFolderName(folderName)) {
      warnings.push(
        `  - ${where}\n` +
          `    폴더명이 팝업(${folderName})인데 page.tsx 가 있어 PAGE_REGISTRY 에 등재된다 — 팝업이 라우팅에 노출됨.`,
      );
    }
  };

  /** 팝업 그룹 하위 폴더의 컴포넌트 파일명 규약 (`{폴더명}.tsx`). */
  const checkFileName = async (dir, folderName, key) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    // 대소문자 구분 비교가 필요하므로 fs.access(대소문자 무시 FS) 대신 실제 엔트리명을 쓴다.
    const tsxFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".tsx") && e.name !== "page.tsx")
      .map((e) => e.name);
    // .tsx 가 아예 없는 폴더(api.ts 만 보유)는 아직 컴포넌트 미분리 상태 — 위반 아님.
    if (tsxFiles.length === 0) return;
    if (tsxFiles.includes(`${folderName}.tsx`)) return;
    warnings.push(
      `  - ${label}/${key}/${tsxFiles.join(", ")}\n` +
        `    팝업 컴포넌트 파일명이 폴더명과 다르다 — 기대: "${folderName}.tsx".`,
    );
  };

  const topDirs = await fs.readdir(rootDir, { withFileTypes: true });
  for (const top of topDirs) {
    if (!top.isDirectory()) continue;
    if (top.name.startsWith("_")) continue;
    const topDir = path.join(rootDir, top.name);
    const inPopupGroup = POPUP_GROUPS.has(top.name);

    // depth 1: {leaf}/page.tsx
    await checkPage(topDir, top.name, top.name, inPopupGroup);

    // depth 2: {group}/{leaf}/page.tsx
    const subDirs = await fs.readdir(topDir, { withFileTypes: true });
    for (const sub of subDirs) {
      if (!sub.isDirectory()) continue;
      if (sub.name.startsWith("_")) continue;
      const leafDir = path.join(topDir, sub.name);
      const key = `${top.name}/${sub.name}`;
      await checkPage(leafDir, sub.name, key, inPopupGroup);
      if (inPopupGroup) await checkFileName(leafDir, sub.name, key);
    }
  }

  return { errors, warnings };
}

/**
 * 전 스캔 루트에 대해 팝업 규약을 검사하고 결과를 보고한다.
 * 위반이 없으면 아무것도 출력하지 않는다 (predev/prebuild 훅 로그 오염 방지).
 * V1(error) 이 하나라도 있으면 registry 를 쓰지 않고 즉시 종료한다.
 */
async function enforcePopupConventions(rootDirs) {
  const errors = [];
  const warnings = [];
  for (const dir of rootDirs) {
    const found = await collectPopupViolations(dir);
    errors.push(...found.errors);
    warnings.push(...found.warnings);
  }

  if (warnings.length > 0) {
    console.warn(
      `[generate-page-registry] WARN: 팝업 규약 위반 ${warnings.length}건 — 정리 후 error 로 승격 예정.\n` +
        `${warnings.join("\n")}\n  ${FIX_HINT}`,
    );
  }

  if (errors.length > 0) {
    console.error(
      `[generate-page-registry] ERROR: 팝업이 라우팅에 등재됨 ${errors.length}건.\n` +
        `${errors.join("\n")}\n  ${FIX_HINT}`,
    );
    process.exit(1);
  }
}

/**
 * page-components 디렉터리를 재귀 탐색.
 * `{leaf}/page.tsx` (depth 1) 와 `{group}/{leaf}/page.tsx` (depth 2) 만 수집.
 * depth 3+ 은 무시 (page-components/access-management 같은 도구 디렉터리).
 */
async function collectPageKeys(rootDir) {
  const keys = [];
  const dirs = await fs.readdir(rootDir, { withFileTypes: true });
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    // `_shared` / `_xxx` 등 밑줄 접두 디렉터리는 화면이 아니므로 스킵.
    if (d.name.startsWith("_")) continue;
    // depth 1: {leaf}/page.tsx
    const depth1PagePath = path.join(rootDir, d.name, "page.tsx");
    if (await exists(depth1PagePath)) {
      keys.push(d.name);
    }
    // depth 2: {group}/{leaf}/page.tsx
    const subDirs = await fs.readdir(path.join(rootDir, d.name), { withFileTypes: true });
    for (const s of subDirs) {
      if (!s.isDirectory()) continue;
      if (s.name.startsWith("_")) continue;
      const depth2PagePath = path.join(rootDir, d.name, s.name, "page.tsx");
      if (await exists(depth2PagePath)) {
        keys.push(`${d.name}/${s.name}`);
      }
    }
  }
  keys.sort();
  return keys;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // 0) 팝업 규약 게이트 — 수집 전에 검사 (V1 위반 시 registry 를 쓰지 않고 종료).
  const scanRoots = [PAGE_COMPONENTS];
  for (const mod of MODULE_PAGE_PACKAGES) {
    if (await exists(mod.dir)) scanRoots.push(mod.dir);
  }
  await enforcePopupConventions(scanRoots);

  // key -> import specifier (정적 문자열 리터럴).
  const registry = new Map();

  // 1) m-mcm 자체 호스트: page-components/**/page.tsx → `@/page-components/{k}/page`
  const pcKeys = await collectPageKeys(PAGE_COMPONENTS);
  for (const k of pcKeys) {
    registry.set(k, `@/page-components/${k}/page`);
  }

  // 2) 형제 모듈 패키지: {pkg}/pages/**/page.tsx → `{pkg}/pages/{k}/page`
  //    page-components 우선(duplicate key 가드) — 동일 key 는 무시하고 경고.
  let moduleCount = 0;
  for (const mod of MODULE_PAGE_PACKAGES) {
    if (!(await exists(mod.dir))) continue;
    const keys = await collectPageKeys(mod.dir);
    for (const k of keys) {
      if (registry.has(k)) {
        console.warn(
          `[generate-page-registry] 중복 key "${k}" — page-components 우선, ${mod.pkg} 무시`,
        );
        continue;
      }
      registry.set(k, `${mod.pkg}/pages/${k}/page`);
      moduleCount += 1;
    }
  }

  const keys = [...registry.keys()].sort();
  const entries = keys
    .map((k) => `  ${JSON.stringify(k)}: () => import(${JSON.stringify(registry.get(k))}),`)
    .join("\n");

  const content = `// AUTO-GENERATED by scripts/generate-page-registry.mjs — do not edit manually.
// 2026-06-05 Phase 3 codegen — page-components/**/page.tsx glob 결과.
// 갱신 방법: \`node scripts/generate-page-registry.mjs\` (prebuild/predev 훅 자동 실행).

/**
 * 화면별 동적 import 로더 맵.
 *
 * 키: \`{group}/{leaf}\` 또는 \`{leaf}\` (depth 1 화면).
 *   - DB myMenusTree 응답의 \`componentPath\` 와 1:1 일치.
 *   - admin OBJECT 콤보의 valid pageName 목록도 본 키 set 으로 산출.
 *
 * 값: Turbopack 정적 import() 함수 — 빌드 타임 chunk 분리 가능.
 *
 * 사용처: app/portal/module-config.ts 의 sharedPortalPageLoader.
 */
export const PAGE_REGISTRY: Record<string, () => Promise<{ default: unknown }>> = {
${entries}
};

/** PAGE_REGISTRY 키 목록 — admin OBJECT 콤보 source. */
export const PAGE_REGISTRY_KEYS: ReadonlyArray<string> = Object.keys(PAGE_REGISTRY);

/** PAGE_REGISTRY 에 등록된 pageName 인지 즉시 확인 (strict 라우팅 검증). */
export function isRegisteredPage(pageName: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAGE_REGISTRY, pageName);
}

/**
 * leaf-only pageName 을 \`group/leaf\` 풀 경로로 변환 (등록 시 group prefix 자동 부착).
 * 이미 \`/\` 가 포함된 입력은 등록 여부만 확인 후 그대로 반환.
 * 등록되지 않은 leaf 는 null.
 *
 * 동일 leaf 가 여러 group 에 존재할 가능성에 대비해 첫 매칭 키 반환.
 */
export function resolveRegistryPath(pageName: string): string | null {
  if (PAGE_REGISTRY[pageName]) return pageName;
  if (pageName.includes("/")) return null;
  const suffix = \`/\${pageName}\`;
  for (const key of PAGE_REGISTRY_KEYS) {
    if (key.endsWith(suffix)) return key;
  }
  return null;
}
`;

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, content, "utf8");
  console.log(
    `[generate-page-registry] wrote ${OUT_FILE} (${keys.length} pages; ${moduleCount} from module packages)`,
  );
}

main().catch((err) => {
  console.error("[generate-page-registry] failed:", err);
  process.exit(1);
});
