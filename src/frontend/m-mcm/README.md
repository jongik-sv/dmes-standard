# @dk-oasis/mcm (m-mcm)

프론트엔드의 **단일 호스트 애플리케이션**이다. 유일한 Next.js(App Router) 앱이며,
업무 화면은 자기가 직접 갖지 않고 `@dk-oasis/m-*` 화면 라이브러리들이 내보낸 페이지 컴포넌트를
마이크로 프론트엔드 모듈로 조합해 렌더링한다.

## 역할

| 구분 | 담당 |
| --- | --- |
| 라우팅·번들링·배포 | m-mcm (여기) |
| 인증·포털 셸·공용 컴포넌트 | `@dk-oasis/shared` |
| 업무 화면 구현 | `@dk-oasis/m-mpn` / `m-mls` / `m-mqc` / `m-mpp` / `m-analog` |

## 디렉토리

```
app/layout.tsx        루트 레이아웃 (전역 스타일 진입점)
app/page.tsx          랜딩 — /portal 로 이어짐
app/portal/page.tsx   포털 셸 (화면 라이브러리 조합 지점)
app/login/page.tsx    로그인 자리표시자
app/globals.css       전역 스타일 — shared 디자인 토큰 import
next.config.ts        transpilePackages 로 워크스페이스 패키지 트랜스파일
```

원본 프로젝트에서는 여기에 `app/api/`(BFF 프록시·인증 라우트), `app/popup/[...slug]`(팝업 화면),
`page-components/{area}/`(화면별 얇은 re-export shim) 이 추가된다. 화면 수가 늘면
정적 카탈로그 대신 코드젠으로 페이지 레지스트리를 생성하는 방식을 쓴다.

## 포털 셸

`app/portal/page.tsx` 는 **자리표시자**다. 네 개 화면 라이브러리의 `pages/sample` 엔트리를
정적 import 해 좌측 모듈 목록으로 전환하며 보여줄 뿐이다.

실제 배포에서는 다음으로 대체한다.

1. `@dk-oasis/shared/portal-shell` 의 `PortalShell` 로 탭·즐겨찾기·메뉴 UI 를 구성한다.
2. `usePortalMenu` 로 백엔드에서 메뉴 트리를 받아 각 항목의 `componentPath` 를 얻는다.
3. `componentPath` 를 `@dk-oasis/m-{module}/pages/{area}/{screenId}` 동적 import 로 해석해
   탭에 마운트한다. 이때 각 화면은 `PageProps`(tabId / snapshot / onSnapshotChange) 를 받는다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 포트 5000 개발 서버 (turbopack) |
| `pnpm build` | 프로덕션 빌드 (`output: "standalone"`) |
| `pnpm start` | 빌드 산출물 실행 |
| `pnpm lint` | `tsc --noEmit` 타입 검사 |

화면 라이브러리는 `dist/` 를 소비하므로, dev 중에는 각 `m-*` 패키지에서 `pnpm dev`(tsup watch)를
함께 띄워야 변경이 반영된다.
