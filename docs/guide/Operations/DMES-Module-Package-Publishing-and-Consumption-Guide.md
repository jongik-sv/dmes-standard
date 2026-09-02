# DMES 모듈 패키지 발행·소비 가이드

> **쉽게 말하면**: 각 모듈 개발팀이 만든 재사용 코드를 npm이나 Nexus에 **어떤 이름과 버전으로 발행하고, Portal·Backend가 어떻게 고정해서 가져다 쓸지** 정한 문서다.
>
> 이 문서의 결과물은 실행 서버가 아니라 npm 패키지와 Gradle JAR다. 이 패키지들을 소비해 만든 WildFly WAR와 Portal standalone의 서버 설치, 환경 승격, smoke, rollback은 [DMES 통합 배포 가이드](DMES-Deployment-Guide.md)가 담당한다.

`m-mpn`, `m-mpp`, `m-mqc`, `m-mls`, `m-analog` 같은 현행 업무 모듈을 워크스페이스 외부(팀별 단일 프로젝트)로 분리해 발행·개발할 때의 계약 가이드다. Frontend npm 패키지와 Backend Gradle/Nexus 라이브러리를 포함한다.

## 목표

- 현재 모노레포 개발 생산성은 유지한다.
- 이후 모듈 팀이 독립 저장소에서 자체 릴리스 주기로 개발할 수 있게 한다.
- `m-mcm` Portal은 배포된 모듈 패키지를 조합해 통합 화면을 제공한다.
- Backend 제품 라이브러리와 사이트 런타임 모듈의 artifact 책임을 분리한다.

## 적용 범위

- 프론트엔드 모듈 패키지: `@dk-oasis/m-mpn`, `@dk-oasis/m-mpp`, `@dk-oasis/m-mqc`, `@dk-oasis/m-mls`, `@dk-oasis/m-analog`, 향후 신규 `@dk-oasis/m-*`
- 공통 계약/셸: `@dk-oasis/shared` (`portal-shell`, `portal-shell-core`)
- 호스트: `@dk-oasis/mcm` (`src/frontend/m-mcm`)
- 백엔드 모듈 (Gradle/Nexus):
  - `com.dongkuk.dmes:cactus-core:1.0.22-SNAPSHOT` — 사내 공통 보안/필터/플랫폼
  - `com.dongkuk.dmes:aps-core:0.1.0-SNAPSHOT` — DMES-APS 제품 라이브러리(jar)
  - `com.dongkuk.dmes:{mcm,mls,mpn,mpp,mqc}` — 제품 라이브러리를 소비하는 {CLIENT} 사이트 런타임 모듈. 서버 배포 단위는 본 문서가 아닌 공통 배포 전략을 따른다.

## 패키지 발행·통합 모델 요약

1. 모듈 팀은 `m-mpn`, `m-mpp`, `m-mqc`, `m-mls`, `m-analog` 등 담당 모듈을 독립 저장소로 관리할 수 있다.
2. 모듈 팀은 빌드 결과(`dist/**`)를 포함한 npm 패키지를 발행한다.
3. Portal 팀은 발행된 모듈 버전을 의존성으로 설치한다.
4. `portal/app/portal/module-config.ts`에서 모듈 로더 규칙만 추가/갱신한다.

## 모듈 패키지 표준 계약

모듈은 아래 계약을 반드시 지켜야 한다.

- `moduleId` 고정: 예) `m-mpn`, `m-mpp`, `m-mqc`, `m-mls`, `m-analog`
- 페이지 파일 규칙: `pages/**/<pageName>-page.tsx` (예: `ops/queue/detail-page.tsx`)
- 메뉴 데이터: `src/menu-data.ts`의 node 스키마를 사용
  - 필수 필드: `id(uuid)`, `name`, `displayText`, `type(dir|page)`, `items`, `parentId`, `icon`, `expended`, `path`, `moduleId`, `pageName`
  - `path`는 pages 기준 디렉토리다. `/`는 루트, `/summary`는 `pages/summary`를 의미한다.
  - `type = page`인 경우 실제 파일은 `pages/{path}/{pageName}-page.tsx`로 매핑된다.
  - `path/pageName`은 빈 문자열, 선행/후행 `/`, `//`, `.`/`..`, `\\`, `:`를 허용하지 않는다.
- 패키지 export:
  - `./pages/*`
- 페이지 컴포넌트 타입은 `@dk-oasis/shared/portal-shell-core`의 `PageProps` 계약 준수

## 모듈 팀(독립 저장소) 준비 절차

1. 저장소 초기화
- 패키지명: `@dk-oasis/<module>`
- 빌드: `tsup`
- 로컬 preview: 필요할 때만 Next.js (`/portal` 라우트 기반). 운영 배포 단위가 아니며 최종 런타임은 `m-mcm` Portal이다.

2. 의존성 정책
- 로컬 `workspace:*` 사용 금지
- `@dk-oasis/shared`는 배포된 버전으로 의존
- UI5 버전 고정:
  - `@ui5/webcomponents`: `2.19.2`
  - `@ui5/webcomponents-fiori`: `2.19.2`
  - `@ui5/webcomponents-icons`: `2.19.2`
  - `@ui5/webcomponents-react`: `2.19.0`

3. 빌드/발행 스크립트
- `pnpm build` : 라이브러리 산출물 생성(`dist/**`)
- `pnpm build:next` : 로컬 preview·Portal 계약 smoke용 단독 앱 빌드. 운영 artifact로 승격 금지
- `pnpm dev:next` : 로컬 preview 개발 전용. 별도 서버 배포 금지

4. 발행 아티팩트
- npm 패키지는 `dist/**`만 포함
- `package.json` `exports`가 `./pages/*`를 노출해야 하며 하위 경로 import(`./pages/a/b/c-page`)를 지원해야 한다.

## 레지스트리 발행(권장)

사내 npm(예: Verdaccio) 또는 공용 npm을 사용한다.

1. 버전 증가
- 변경 성격에 따라 semver 준수
- `portal` 통합 계약 변경 시 `minor` 이상 권장

2. 배포
```bash
pnpm install
pnpm build
pnpm publish --registry <your-registry>
```

3. 릴리스 노트
- 추가/변경된 pageName 목록
- 메뉴 구조 변경 여부
- `moduleId` 변경 여부(변경 금지)

## Portal 팀 통합 절차

1. 모듈 버전 갱신
```bash
pnpm --filter @dk-oasis/mcm add @dk-oasis/m-mpn@<version>
pnpm --filter @dk-oasis/mcm add @dk-oasis/m-mpp@<version>
```

2. 로더 등록
- `portal/app/portal/module-config.ts`에 모듈 등록
- `packageName`, `moduleId`, `loadPage` 규칙 확인

3. 메뉴 연동
- `portal` 메뉴 저장소(DB/API)에서 `moduleId + path + pageName` 매핑 규칙 유지

4. 런타임 확인
- `/portal`에서 메뉴 노출/탭 전환/페이지 로딩 확인

## 호환성 규칙 (중요)

- `moduleId`는 릴리스 이후 변경 금지
- 이미 배포된 `pageName` 삭제/변경은 breaking change
- `PageProps` 계약을 깨는 변경 금지
- `portal`과 모듈은 동일 UI5 버전 정책을 유지

## 권장 CI 파이프라인

모듈 저장소 CI:
1. `pnpm install`
2. `pnpm lint`
3. `pnpm build`
4. `pnpm build:next` (로컬 preview·계약 smoke 전용, 운영 publish 대상 아님)
5. 태그 기반 publish

portal 저장소 CI:
1. 모듈 버전 업데이터 PR 생성
2. `pnpm install`
3. `pnpm build`
4. 통합 smoke 테스트(`/portal`)

## 운영 체크리스트

모듈 릴리스 전:
- `moduleId/path/pageName` 규칙 검증
- `exports` 경로 검증
- `dist/**` 생성 확인
- 릴리스 노트 작성

portal 반영 전:
- 모듈 버전 고정 설치 확인
- `module-config.ts` 매핑 확인
- 메뉴 데이터와 pageName 일치 확인

---

## Backend 패키지 발행 계약

### 패키지 유형

| 유형 | 예시 | 발행 계약 |
|---|---|---|
| 제품 라이브러리 | `cactus-core`, `aps-core`, `mcm-core`, `caravan-core` | group/artifact/version·checksum·release note를 Nexus에 발행 |
| 사이트 런타임 | `mcm`, `mls`, `mpn`, `mpp`, `mqc`, `caravan-hub` | 제품 버전을 고정해 소비하고 호환성 테스트 후 WAR 생성; 서버 배포는 DMES 통합 배포 가이드 소유 |
| 로컬 동시개발 | 제품 라이브러리 + 소비 모듈 | composite `includeBuild`·`dependencySubstitution`으로 발행 전 소스 호환 검증 |

`aps-core`·`mpn`의 내부 패키지, api/lib 구조, OASIS/REST 역할은 [APS 개발 가이드](../../aps/Aps-Guide.md)가 소유하며 본 문서에 복제하지 않는다.

### Nexus 좌표

- `com.dongkuk.dmes:cactus-core:1.0.22-SNAPSHOT`
- `com.dongkuk.dmes:aps-core:0.1.0-SNAPSHOT`

### 발행·소비 순서

1. 제품 라이브러리 변경을 해당 저장소 테스트와 composite build로 먼저 검증한다.
2. 사내 Nexus에 group/artifact/version을 발행하고 checksum과 release note를 남긴다.
3. 소비 런타임 모듈이 정확한 제품 라이브러리 버전을 고정한다.
4. 런타임 모듈의 api/lib 테스트와 WAR build로 소비 호환성을 확인한다.
5. 서버 승격은 [DMES 통합 배포 가이드](DMES-Deployment-Guide.md)의 동일 artifact 원칙을 따른다.

사이트 런타임 WAR와 Portal standalone은 Nexus/npm에 발행하는 제품 라이브러리와 다른 lifecycle을 가진다. WAR·Portal의 환경별 설정, DB migration, 인증, rollback 규칙은 본 문서에 중복 작성하지 않는다.

### 관련 정본

- Backend 구현·의존성: [Backend Guide](../BackEnd/README.md)
- 인증·인가: [Security Guide](../Security/README.md)
- 전체 런타임·DB·P0·설치·승격·rollback: [DMES 통합 배포 가이드](DMES-Deployment-Guide.md)
