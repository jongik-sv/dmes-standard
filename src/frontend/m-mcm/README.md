# @dk-oasis/mcm (m-mcm)

프론트엔드의 **단일 호스트 애플리케이션**이자 **BFF** 다. 유일한 Next.js(App Router) 앱이며,
자기 화면(`page-components/`)과 `@dk-oasis/m-*` 화면 라이브러리가 내보낸 페이지를 함께 조합해 렌더링한다.

## 역할

| 구분 | 담당 |
| --- | --- |
| 라우팅·번들링·배포 | m-mcm (여기) |
| BFF — 백엔드 프록시·NextAuth·API 권한 검증 | m-mcm `app/api/` + `proxy.ts` |
| 공통관리 화면 (마스터·시스템·업무기준) | m-mcm `page-components/{cma,cme,cmb,csa,cmz}` |
| 포털 셸·인증 UI·공용 컴포넌트 | `@dk-oasis/shared` |
| 업무 화면 구현 | `@dk-oasis/m-mpn` / `m-mls` / `m-mqc` / `m-mpp` / `m-analog` |

## 디렉토리

```
app/layout.tsx                     루트 레이아웃 (전역 스타일 진입점)
app/page.tsx                       랜딩 — /portal 로 이어짐
app/login/page.tsx                 로그인
app/portal/page.tsx                포털 셸 (PortalShell + usePortalMenu)
app/portal/module-config.ts        moduleId → 페이지 로더 매핑 (모듈 추가 지점)
app/portal/registered-modules.ts   pageId → 페이지 컴포넌트 해석
app/popup/[...slug]/page.tsx       팝업 화면 라우트
app/api/[module]/**                BFF 프록시 (oasis / query / lov / rest / service)
app/api/auth/**                    NextAuth · 내 정보 · 비밀번호 변경 · 강제 로그아웃
app/api/mcm/internal/**            역할 변경 시 권한 캐시 무효화 (BE → BFF)
proxy.ts                           포털 인증 보호 + API 권한(RBAC) 검증 미들웨어
lib/auth/                          NextAuth 설정 · 서버측 권한 캐시
lib/http/                          BE 프록시 · OASIS 클라이언트
lib/generated/page-registry.ts     ★ 코드젠 산출물 (직접 수정 금지)
page-components/{group}/{screenId}/page.tsx   화면 구현 또는 re-export shim
scripts/generate-page-registry.mjs 화면 레지스트리 코드젠
```

## 들어 있는 화면

| 그룹 | 메뉴 | 화면 |
| --- | --- | --- |
| `cma` | 공통관리 › 마스터관리(원장) | `masterCategoryMng` · `masterCodeMng` |
| `cme` | 공통관리 › 마스터관리(가동) | `masterCodeMngList` |
| `cmb` | 공통관리 › 업무기준관리(원장) | `masterRuleList` · `masterRuleData` · `masterRuleDataList` · `masterRuleFrame` |
| `csa` | 공통관리 › 시스템관리 | `commObjMng` · `commMenuMng` · `commRoleMng` · `commRoleGrpMng` · `commUserMng` · `commPermMng` · `commUserRoleCopy` · `commSyncMng` |
| `cmz` | (팝업 전용 — 사이드바 숨김) | `masterCodeSelPop` · `masterCodeUploadFilePopup` · `masterRuleListPop` · `masterRuleFrameColListPopup` · `masterRuleDataUploadFilePopup` |
| `anl` | 로그 분석 › 로그 조회 | `logViewer` (`@dk-oasis/m-analog` re-export shim) |

그 밖에 포털 기본 화면 `home` · `dashboard-overview` · `operations-queue` 가 있다.

## 화면을 추가하는 법

1. `page-components/{group}/{screenId}/page.tsx` 를 만든다. 파일이 곧 진입점이다.
2. `predev` / `prebuild` 훅이 `scripts/generate-page-registry.mjs` 를 돌려
   `lib/generated/page-registry.ts` 를 갱신한다 (수동 실행: `pnpm generate:page-registry`).
3. 백엔드 `DataInitializer` 에 메뉴 leaf + OBJECT + RBAC 를 시드한다.
   `componentPath` = `PARENT_MENU_ID + "/" + OBJECT_ID` = 위 `{group}/{screenId}` 와 반드시 일치해야 한다.

**팝업은 `page.tsx` 로 만들지 않는다.** 팝업 그룹(`cmz` 등) 아래에는 `{screenId}.tsx` + 배럴 `index.ts` 를 두고
부모 화면이 직접 import 한다. 코드젠이 이 규칙을 검사해 위반 시 빌드를 막는다.

## 포털 셸

`app/portal/page.tsx` 가 `@dk-oasis/shared/portal-shell` 의 `PortalShell` 을 띄운다.
`usePortalMenu` 가 백엔드에서 메뉴 트리를 받고, 각 항목의 `componentPath` 를
`app/portal/module-config.ts` 의 로더가 해석해 탭에 마운트한다. 화면은 `PageProps`
(tabId / snapshot / onSnapshotChange) 를 받는다.

업무 모듈을 붙일 때는 `module-config.ts` 의 `PORTAL_MODULE_CONFIG` 에 항목을 1개 추가한다.
대부분 `createStrictModuleLoader(moduleId, sharedPortalPageLoader)` 로 충분하고,
turbopack 의 dynamic-glob 제약에 걸리는 패키지만 `ANALOG_STATIC_PAGES` 처럼 정적 매핑 테이블을 둔다.

## 환경변수

`.env.example` 을 `.env` 또는 `.env.local` 로 복사해 채운다 (둘 다 git 제외).
최소한 `AUTH_SECRET` · `NEXTAUTH_URL` · `BACKEND_API_URL` · `BACKEND_CLIENT_KEY` 가 없으면 빌드가 실패한다.
`BACKEND_CLIENT_KEY` 는 백엔드 `cactus.security.client-key` 와 같은 값이어야 한다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 포트 5000 개발 서버 (turbopack). `predev` 가 레지스트리 코드젠 선행 |
| `pnpm build` | 프로덕션 빌드 (`output: "standalone"`) |
| `pnpm start` | 빌드 산출물 실행 |
| `pnpm lint` | eslint |
| `pnpm pack` | standalone 배포 산출물 패키징 |

화면 라이브러리는 `dist/` 를 소비하므로, dev 중에는 각 `m-*` 패키지에서 `pnpm dev`(tsup watch)를
함께 띄워야 변경이 반영된다.
