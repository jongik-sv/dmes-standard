# Frontend Local Rules

이 문서는 DMES {CLIENT} 저장소의 Frontend 로컬 운영 규칙만 둔다. 공통 Frontend 개발 표준은 [FrontEnd 표준 통합 개발가이드 v2](FrontEnd_표준_통합_개발가이드_v2.md)가 정본이다.

## 1. 정본 관계

- Frontend 화면 구현 표준: [FrontEnd_표준_통합_개발가이드_v2.md](FrontEnd_표준_통합_개발가이드_v2.md)
- BFF URL, OASIS/REST, Phase 7, 모듈별 Phase 7 허용 조건: [standard-v2/frontend-standard/01-rules-decisions-files.md](standard-v2/frontend-standard/01-rules-decisions-files.md)
- 외부 도메인 / 인프라 미구축 처리와 Decision Log: [standard-v2/frontend-standard/03-cases-checklist-menu.md](standard-v2/frontend-standard/03-cases-checklist-menu.md)
- Portal 화면/메뉴/BFF 개발: [Portal-Development-Guide.md](Portal-Development-Guide.md)
- Portal 메뉴 역할 정책: [Portal-Menu-Role-Policy.md](Portal-Menu-Role-Policy.md)
- 화면 시각 표준(톤·토큰·셸·그리드·토스트): [UI-Visual-Standard.md](UI-Visual-Standard.md)
- 새 화면 성능(조회 범위·진입 호출·공통 계층 재렌더·측정 절차·예산): [Screen-Performance-Guide.md](Screen-Performance-Guide.md)

## 2. 로컬 작업 규칙

- 중요한 Frontend 작업 규칙이 바뀌면 이 문서 또는 위 정본 문서를 갱신한다.
- 개발 중에는 매번 `pnpm lint`, `pnpm build`를 실행하지 않는다. 중간에는 변경 범위에 맞는 빠른 검증을 우선하고, lint/build 검증은 작업 최종 완료 시점에 실행한다.
- 작업 완료 전에는 변경 범위에 맞게 `pnpm lint`, `pnpm build`, `pnpm test:all` 또는 대상 패키지의 동등 검증을 실행한다.
- 수정 후 해당 파일만 포맷한다.

### 2-1. 단위 게이트 명령 — 의존 패키지만 빌드한다 (2026-09-26, 새 Task 부터 적용)

- D'Flow Task 의 설계서·기준선·게이트에 적는 프런트 단위 테스트 명령은 **대상 패키지가 의존하는 workspace 패키지만 빌드**한 뒤 그 패키지의 테스트를 돌린다. `pnpm build:libs`(라이브러리 7개 전체 빌드)는 쓰지 않는다.
  - 형식: `cd src/frontend && pnpm --filter "<패키지>^..." build && pnpm --filter <패키지> test`
  - `<패키지>^...` 는 그 패키지가 (전이적으로) 의존하는 workspace 패키지만 고르고 자기 자신은 뺀다. `^` 가 셸 특수문자일 수 있으므로 따옴표로 감싼다.
  - m-mdm: `cd src/frontend && pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test` (shared 만 빌드한다). lint 를 게이트에 넣으면 뒤에 `&& pnpm --filter @dk-oasis/m-mdm lint` 를 붙인다.
  - m-mpn·m-mpp·m-mqc·m-mls 도 같은 형식이다(의존 패키지 = shared). shared 는 의존 패키지가 없으므로 빌드 단계 없이 `pnpm --filter @dk-oasis/shared test:unit` 을 쓴다.
- **새 Task 부터 적용한다.** 이미 기준선을 잰 Task 는 게이트 명령을 도중에 바꾸지 않는다. 기준선 캐시 키(기점 sha + 명령 문자열)와 총수 규칙이 어긋난다.
- 근거: `build:libs` 는 m-mdm 이 쓰지 않는 라이브러리(m-mpn·m-mpp·m-mqc·m-mls·m-analog)와 m-mdm 자신까지 빌드한다(docs/dflow-team/perf-audit-report.md P4). 2026-09-26 실측: `m-mdm^...` 빌드 37.8초·CPU 61초, `build:libs` 44.1초·CPU 87초(동시 부하 18~28, 잡음 있음).
- 게이트가 **lint 를 돌리지 않으면** 의존 패키지 빌드에서 `.d.ts` 생성을 끌 수 있다: `TSUP_DTS=0 pnpm --filter "<패키지>^..." build`. vitest·next dev 는 `.d.ts` 를 쓰지 않는다.
  lint(`tsc --noEmit`)는 의존 패키지의 `.d.ts`(shared·m-mdm 은 `dist/types/**/*.d.ts`, 그 밖의 m-* 는 `dist/*.d.ts`)로 타입을 읽으므로, **lint 가 들어간 게이트에서는 `TSUP_DTS=0` 을 쓰지 않는다.** 기본값(환경 변수 없음)은 지금처럼 `.d.ts` 를 만든다.
- shared 의 `.d.ts` 는 tsup 이 아니라 tsc 가 만든다(2026-10-02): tsup 은 JS 만 묶고(`dts: false`), `scripts/lib-dev.mjs` 가 뒤이어 `tsc -p tsconfig.build.json` 으로 `dist/types/` 에 파일별 선언을 만든다. package.json exports 의 `types` 가 그쪽을 가리키며, 진입점을 추가하면 exports 의 `types` 를 `./dist/types/<src 기준 경로>.d.ts` 로 적는다(`tests/unit/package-exports.unit.test.ts` 가 tsup 진입점과 대조한다). 실측: tsup 의 dts(rollup-plugin-dts)는 RSS 3.1GB·13.5초에 4GB 힙에서 OOM, tsc 는 RSS 약 0.6GB·1.9초(dev incremental 0.9초).
- m-mdm 도 같은 방식이다(2026-10-04). 진입점이 `src/` 와 `pages/` 둘에 있어 `tsconfig.build.json` 의 rootDir 은 패키지 폴더이고, types 는 `./dist/types/src/…`·`./dist/types/pages/…` 로 갈린다. 화면 exports 는 와일드카드(`./pages/*`) 대신 화면마다 한 줄씩 적는다 — lib-dev 의 빌드 뒤 types 파일 검사가 와일드카드를 풀지 못한다. **새 `page.tsx` 는 tsup entry 와 package.json exports 에 함께 추가한다**(`m-mdm/tests/package-exports.test.ts` 가 대조한다). `"@/*"` 별칭은 tsc 가 `.d.ts` 에서 바꾸지 않으므로 공개 진입점에서 닿는 선언(화면 props 등)에 별칭 import 타입이 새지 않게 한다.
- vitest 워커는 m-mdm·shared 모두 기본 4개다. 동시에 도는 게이트가 많으면 `VITEST_MAX_WORKERS=<수>` 로 더 줄인다(테스트 총수는 변하지 않는다).
- 포털 전체 기동·빌드(`fe-run.sh`, m-mcm)는 모든 모듈의 dist 가 필요하므로 지금처럼 `build:libs` 를 쓴다.
- m-mdm 의 `test` 스크립트(`scripts/test.mjs`)는 일반 스위트(병렬)와 부하 민감 성능 스위트(`vitest.perf.config.ts`, 한 fork)를 차례로 모두 돌린다. vitest 요약이 두 번 찍히므로, **게이트 총수는 마지막 `[m-mdm test 합계]` 줄의 값을 쓴다.**

### 2-2. dev 가 켜진 작업 트리에서는 라이브러리를 따로 빌드하지 않는다 (2026-09-30)

- `pnpm dev` 가 돌고 있는 작업 트리에서는 watch(`scripts/lib-dev.mjs`)가 저장 즉시 그 패키지의 JS 를 다시 빌드한다. `.d.ts` 는 저장이 20초 멈춘 뒤 한 번 만든다(`LIB_DEV_DTS_DELAY_MS`. shared 는 tsc incremental, m-* 는 `tsup --dts-only`).
- 같은 패키지를 `pnpm build`·`pnpm --filter … build` 로 또 빌드하지 않는다. 두 tsup 이 같은 dist 에 동시에 쓰고 CPU 를 두 배로 쓴다(2026-09-30 실측: watch 289% + 수동 build 107%, 부하 평균 24). shared 는 build 가 dist 를 비워(clean) 떠 있는 포털까지 흔든다.
  - 라이브러리의 `build` 스크립트(`lib-dev.mjs pkg-build`)가 이를 막는다: watch 가 감시 중인 패키지면 tsup 을 돌리지 않고 watch 에 `.d.ts` 까지 바로 만들게 한 뒤 그 결과(성공·타입 오류)로 끝난다. 게이트 명령은 그대로 두면 된다. 꼭 직접 빌드해야 하면 `LIB_DEV_FORCE_BUILD=1`.
  - watch 가 도는지 확인: `for p in $(pgrep -f "lib-dev.mjs watch"); do lsof -a -d cwd -p $p -Fn | grep '^n'; done` — 감시 중인 패키지 폴더가 나온다.
  - 반영 확인: `<패키지>/node_modules/.cache/lib-dev-stamp.json` 의 `builtAt`, `dts`(true 면 `.d.ts` 까지 최신). 다른 패키지의 타입을 읽는 lint 는 `dts: true` 가 된 뒤 돌린다.
- 테스트·빌드 프로세스를 끝낼 때 `pkill -f vitest` 처럼 이름으로 모두 죽이지 않는다. 같은 PC 의 다른 세션 테스트까지 죽는다. 자기가 띄운 PID 만 끝낸다.

## 3. 최초 체크아웃 후 실행

아래 순서는 최초 1회만 필요하다. 이후 실행부터는 `pnpm dev`만 실행한다.

```bash
cd src/frontend
pnpm install

cd shared
cp .env.example .env
cd ..

cd m-mcm
cp .env.example .env
cd ..

cd m-mpn
pnpm build
cd ..

pnpm dev
```

`shared` 또는 `m-mcm`의 `.env` 파일은 `.env.example`을 복사 후 환경에 맞게 수정한다. `pnpm dev`(또는 `./fe-run.sh`·`./local-run.sh`)가 떠 있는 동안에는 `shared`·`m-*` 라이브러리를 `scripts/lib-dev.mjs` 감시가 저장한 패키지만 다시 빌드하고 포털(Next dev)이 받아 가므로 재실행할 필요가 없다(수 초, 필요하면 탭 새로고침). 뜰 때도 지난 빌드 이후 소스가 바뀐 패키지만 빌드하므로(지문: `<pkg>/node_modules/.cache/lib-dev-stamp.json`), dev 를 띄우지 않은 상태에서 고쳤어도 따로 `pnpm build` 할 필요가 없다. 빌드 결과가 의심스러우면 그 지문 파일을 지우고 다시 띄운다. 포털은 shared `page-layout.css` 가 아니라 `m-mcm/app/page-layout.css` 사본을 쓰므로 shared CSS 를 고치면 사본도 같이 고친다.

## 4. UI 검증 원칙

- UI 수정 후 기본 검증은 각 모듈 가이드가 정한 빌드/정적 검증 중심으로 수행한다.
- Playwright / playwright-cli 등 브라우저 기반 UI 레벨 테스트(E2E 포함)는 사용자가 명시적으로 요청했거나, 별도 필요성을 설명하고 승인받은 경우에만 수행한다.
- 승인 없이 관례적 UI 확인 목적으로 브라우저 기반 테스트를 실행하지 않는다.

## 5. 구현계획서 작성

- 구현계획서는 Phase별로 정리한다.
- 각 Phase에는 타이틀을 부여하고, 세부 항목은 `Phase번호-세부번호` 형식으로 작성한다. 예: `1-1`, `1-2`, `2-1`.
- 모든 항목 앞에 체크박스를 두어 진행 완료된 내용은 체크 처리한다.

```md
## Phase 1: lib 공통함수 옮기기
- [ ] 1-1. 공통 유틸 함수 파일 이관
- [ ] 1-2. import 경로 수정 및 검증
- [x] 1-3. 완료된 항목 예시

## Phase 2: common 컴포넌트 이관
- [ ] 2-1. 공통 컴포넌트 파일 복사
- [ ] 2-2. 의존성 확인 및 수정
```

## 6. Portal 프레임과 버튼 권한

- Portal UI 표준 명칭과 작업 명령 형식은 [portal-frame-names.md](../../../src/frontend/m-mcm/design/portal-frame-names.md)가 정본이다.
- `PageLayout` 의 `buttons[*].action` 코드는 반드시 소문자로 작성한다.
- 표준 코드: `search`, `save`, `delete`, `export`, `import`, `print`, `approve`, `reject`, `confirm`, `cancel`, `copy`
- 표준 코드 정본은 [permission-actions.ts](../../../src/frontend/m-mcm/page-components/access-management/permission-actions.ts)의 `STANDARD_ACTIONS`다.
- 커스텀 액션(`search1`, `recalc` 등)도 소문자 자유 입력은 허용하지만, 권한관리 화면에서 등록한 코드와 글자 단위로 같아야 한다.

## 7. FormGroup 도움말

- `<FormGroup label="..." tip={...}>` 형식으로 라벨과 tip을 함께 제공한다. MDM 컬럼 사전에 있는 입력은 `name` 을 주고 `label`·`tip` 을 생략해 MDM 캡션·카드 툴팁을 받을 수 있다(§27).
- tip 문자열은 inline으로 직접 쓰지 않고 모듈별 `<module>/src/_shared/field-tips.ts`의 도메인별 `{DOMAIN}_TIPS` 객체에서 참조한다.
- 같은 도메인 필드는 같은 TIPS 키를 재사용한다.
- 도메인 의미가 다르면 별도 TIPS 객체를 만든다. 라벨이 같아도 의미가 다른 경우 같은 키를 공유하지 않는다.
- 그리드 제목 도움말은 `GridPanel`의 `help={{ title, summary?, columns }}` prop으로 제공한다. 화면별 도움말 버튼을 직접 만들지 않는다.

## 8. UI 안티디자인

상단·좌측·우측·하단 등 카드/박스의 한 변에 색상 바를 붙여 상태나 유형을 구분하는 디자인은 안티디자인으로 본다.

- 금지: `border-left: 3px solid ...`, `border-top: 3px solid ...` 처럼 박스 한 변을 컬러 바처럼 쓰는 패턴.
- 금지: KPI 카드, 원인 그룹 카드, 예외 카드, 요약 카드에서 좌측/상단 컬러 바를 반복해 구분하는 패턴.
- 허용: 라벨 앞 작은 점, 아이콘, 숫자 색상, 배지, 얇은 전체 테두리, 배경 톤 차이, 텍스트 굵기 등으로 상태를 구분한다.
- 선택/활성 상태는 한쪽 바가 아니라 전체 테두리, 배경 톤, 체크/상태 아이콘 등으로 표현한다.
- 그리드 선택 행, 사이드바 선택 탭, 로그인 카드, 토스트에도 같은 규칙을 적용한다(2px 밑줄·한 변 inset 그림자 포함). 공통 적용 위치는 [UI-Visual-Standard.md](UI-Visual-Standard.md) §9.

## 9. 중요 액션 UX

사용자가 확정, 취소, 삭제, 전송, 마감, 발행, 상태 변경처럼 업무 상태나 하위 데이터에 중요한 변화를 일으키는 액션을 수행할 때는 단순 alert로 끝내지 않는다.

- 액션 전후의 영향 범위를 보여준다. 어떤 대상이 처리되는지, 함께 변경되는 하위·연관 데이터가 무엇인지 명확히 표시한다.
- 실패하거나 일부만 가능한 경우 건별로 설명한다. 무엇이 안 되는지, 왜 안 되는지, 어떤 업무 규칙·상태·연관 데이터가 막고 있는지 구분해 보여준다.
- 사용자가 다음 행동을 할 수 있게 한다. 차단 원인을 해소하려면 어디로 가야 하는지, 어떤 오더·요청·스케줄을 확인해야 하는지 링크 또는 즉시 검색 가능한 진입점을 제공한다.
- 일괄 액션은 전체 실패 메시지 하나로 처리하지 않는다. 가능한 건, 불가능한 건, 상위 선택에 포함되어 별도 처리할 필요가 없는 건을 분리해 표시한다.
- 백엔드는 프론트가 rich UX를 만들 수 있도록 구조화된 검토·검증 응답을 우선 제공한다. 프론트에서 문자열을 파싱해 사유를 추정하지 않는다.

## 10. OASIS LoV BPMN service 미구축 시점

LoV service가 아직 없을 때는 화면에서 임의 Phase 7 LoV 라우트를 호출하지 않는다. 모듈별 Phase 7 허용 조건은 [standard-v2/frontend-standard/01-rules-decisions-files.md](standard-v2/frontend-standard/01-rules-decisions-files.md) §2-2-1-A가 정본이다.

- `mpp`, `mqc`, `mls`, `mcm`처럼 SqlSession 미등록 모듈에서는 `apiLovMaster`, `apiLovQuery`, `apiLovService` 호출을 금지한다.
- LoV가 업무상 필요하면 별도 OASIS BPMN service를 신설하고 `/api/{moduleId}/oasis/{lovServiceId}/{action}` 형태로 호출한다.
- service 미구축 상태에서 화면 진행이 필요하면 정적 옵션, 비활성 상태, 빈 결과 stub 중 하나로 명시 처리하고, Decision Log나 설계서 이슈에 후속 작업을 남긴다.

## 11. 목록·상세 선택 전환 — 깜빡임 금지 (2026-09-29)

목록(그리드·트리)에서 다른 항목을 고를 때 상세 영역을 비웠다 다시 그리지 않는다. 상세 전체가 사라졌다 생기며 깜빡인다.

- 새 상세가 올 때까지 이전 상세를 **잠근 채**(쓰기·입력·하위 선택 불가) 두고, 도착하면 같은 DOM 위에 바꿔 그린다. 흐림 표시는 300ms 쯤 늦게 걸어 짧은 조회에서는 보이지 않게 한다.
- 조회·검사 응답은 요청 순번으로 확인해 늦게 온 이전 선택의 응답을 버린다.
- 목록 그리드의 `loading` 은 목록 조회 전용 상태로 켠다. 화면 공용 `busy` 를 넘기면 행을 눌러 상세를 부를 때마다 목록에 로딩 오버레이가 떴다 사라진다(예: `m-mdm/pages/dma/columnMng` 의 `listLoading`, 테스트 `columnMng/list-loading`).
- 처음 고를 때(비교할 이전 상세 없음)·[신규]·삭제·조회 실패는 전처럼 비운다.
- 분할 크기(`ContentBody resizable`)는 shared 가 첫 렌더부터 저장값으로 그린다 — 화면에서 따로 처리하지 않는다.
- 예시: `m-mdm/pages/dmc/codeMng`·`codeConfirm` 과 그 테스트(`code-mng-guard`·`code-confirm-page`).

## 12. 그리드 안 입력 — 칸 렌더러에 입력 요소를 두지 않는다 (2026-09-29)

`AgDataGrid` 의 `GridColumn.render` 안에 `Input` 같은 글자 입력 요소를 두지 않는다. 행을 누르면 그리드가 포커스를 그리드 틀로 가져가 글자가 들어가지 않고, 그리드는 값이 바뀐 칸만 다시 그리므로 다른 칸 값에 기대는 표시(비활성 등)가 갱신되지 않는다.

- 값 입력은 `editable`(행별 함수 가능)·`singleClickEdit`·`onCellValueChanged` 로 한다. 표시는 `render` 로 꾸민다(빈 값 "NULL" 등).
- 같은 행의 다른 칸 값에 따라 표시·편집 가능 여부가 바뀌면 `rowClassRefreshToken` 에 그 값을 실어 행을 다시 그린다.
- 확인란·버튼은 `render` 에 두어도 된다(클릭만 받으므로 포커스를 뺏겨도 동작한다).
- 예시: `m-mdm/pages/dme/ruleEdit/cards/ValueTestCard.tsx` 의 입력 표와 테스트(`value-test-cards`)의 `setVtValue`.

## 13. 오류 메시지 — 엔진·예외 원문을 본문에 싣지 않는다 (2026-09-29)

판정·검증 오류를 보일 때 본문은 현업이 읽는 한국어 문장(무엇이 · 왜 · 어떻게 고치나)으로 쓴다. `ROW_SELECT · EVALUATION_ERROR`, `NullPointerException: ...` 같은 단계·코드·예외 원문은 본문에 싣지 않는다.

- 문장은 백엔드가 만들어 `message` 로 주고, 원문은 `detail` 로 따로 준다. 화면이 원문을 파싱해 문장을 만들지 않는다(§9).
- 단계·코드·이름은 `title` 툴팁, 원문(`detail`)은 접힌 `<details>` 에 둔다. 표 칸처럼 자리가 좁으면 문장만 싣는다.
- 예시: `mdm` 의 `common/rule/RuleErrorText.java`(엔진 판정 오류 → 문장), `m-mdm/pages/dme/ruleEdit/cards/TestResultCard.tsx` 의 오류 목록과 테스트(`value-test-cards`).

## 14. 검색해서 하나 고르기 — 결과를 버튼 줄로 늘어놓지 않는다 (2026-09-29)

상단 바에서 검색어로 대상 하나를 고르는 칸(룰·코드 고르기 등)은 찾은 결과를 본문에 버튼으로 줄지어 그리지 않는다. 조작 버튼처럼 보이고, 결과가 많으면 여러 줄로 늘어 본문을 밀어내며, 닫을 방법이 없다.

- 결과는 검색 칸 바로 아래 드롭다운(`position: absolute`, `zIndex: 1000`, `--shadow-dropdown`)으로 띄워 본문 위에 겹친다.
- 한 줄에 하나씩 두고 ID 칸 폭을 고정해 줄을 맞춘다. 고를 때 필요한 속성(종류·상태 배지 등)을 함께 보인다.
- ↑↓ 로 옮기고 Enter 로 고르며, Esc·바깥 누름·검색어 변경으로 닫는다. 서버가 건수를 자르면 꽉 찼을 때 좁혀 검색하라고 안내한다.
- 검색 칸과 현재 대상 표시 사이에는 세로 구분선을 둔다.
- 예시: `m-mdm/pages/dme/ruleEdit/RulePicker.tsx` 와 테스트(`rule-edit-page`).

## 15. 화면 간 인계(handoff) 받는 쪽 — 고르기 칸 목록도 같이 새로 읽는다 (2026-09-29)

`useMdmPageParams` 로 다른 화면에서 대상(마루 데이터 등)을 넘겨받는 화면은, 상단 고르기 칸(Select)의 목록을 마운트 때 한 번만 읽고 끝내지 않는다. 이미 열린 탭이 방금 등록된 대상을 넘겨받으면 목록에 그 값이 없어, NativeSelect 가 첫 항목 이름을 보이고 그리드는 새 대상을 그리는 어긋남이 생긴다. 이름을 바꾼 뒤에도 옛 라벨이 남는다.

- 대상을 고를 때 부르는 조회 응답에 목록이 함께 오면 그 목록으로 고르기 칸을 갱신한다. 안 오면 넘겨받은 값이 목록에 없을 때 목록을 다시 조회한다.
- 마운트 때의 목록 응답이 선택 응답보다 늦게 와서 새 목록을 옛 목록으로 덮지 않게 막는다(§11 요청 순번과 같은 뜻).
- 쓰기 응답 뒤 재조회(이력·트리 등)는 시작할 때의 대상·선택 순번을 잡아 두고, 응답 때 대상이 바뀌었으면 건너뛴다.
- 같은 대상을 다시 불러오는 사이 사용자가 폼을 고쳤으면, 늦게 온 조회 응답은 잠금 값(`auditVer` 등)·요약만 바꾸고 고친 폼은 덮지 않는다. 그리드 행 클릭은 잠금 렌더가 반영되기 전 몇 ms 사이에 입력이 들어갈 수 있어 잠금만으로는 막지 못한다. 다른 대상으로 옮길 때는 전처럼 폼을 새 값으로 바꾼다.
- 예시: `m-mdm/pages/dmd/dataItemMng/page.tsx` 의 `selectMaruData`·`WriteOrigin` 과 테스트(`data-item-page`). 폼 보호는 `m-mdm/pages/dmd/dataMng/page.tsx` 의 `editSeq` 와 테스트(`data-mng-page`).

## 16. 큰 편집 그리드 — 행 고르기가 무거운 계산·전체 다시 그리기를 부르지 않게 (2026-09-29)

편집 상태 하나(reducer state)에 행 내용과 고른 행(`selectedRowId`)이 함께 있으면, `useMemo(..., [state])` 로 묶은 검사·직렬화·dirty 비교가 행 번호를 누를 때마다 다시 돈다. 417행 의사결정표에서 행 하나 고르는 데 1.3초가 걸렸고, 그중 검사(`analyzeRule`)가 0.4초였다.

- 무거운 계산(검사·직렬화·dirty 비교)은 그 계산이 실제로 읽는 필드(행·변수·적중 정책 등)만 의존성으로 둔다. `state` 통째로 두지 않는다.
- 결과를 보이지 않는 상태(예: 변경이 없어 서버 검사를 보일 때)에는 계산하지 않는다. 불러온 배열과 같으면(`rows === loadedRows`) 직렬화 비교를 건너뛴다.
- 고른 행은 표시 행(data)·다시 그리기 토큰(`rowClassRefreshToken`)에 싣지 않는다. `highlightedRowKey` 가 이전 행과 새 행만 다시 그린다(편집 중인 행은 편집이 끝난 뒤). 이렇게 바꾼 뒤 417행 표에서 행 고르기가 1.3초에서 약 25ms 가 됐다.
  - 고른 행에 따라 칸 모양이 바뀌면(선택 행 조건 칸 테두리 `cell-emphasis` 등) 그 판정도 표시 행에서 빼되 지우지는 않는다. 열 정의에 `isSelectedRow` 같은 함수를 넘기고, 함수는 **렌더 중에** 대입한 ref 를 읽게 한다. 그리드가 이전·새 행을 다시 그릴 때 `cellClassRules` 가 새 값으로 다시 판정한다. 부모 `useEffect` 에서 ref 를 고치면 자식 그리드의 다시 그리기가 먼저 돌아 옛 값을 읽는다. 2026-09-30 성능 수정 때 이 규칙을 통째로 지워 선택 행 강조가 사라졌다(e2e ruleEdit S7, 2026-10-03 복구).
- 행 고르기는 행 번호만이 아니라 어느 칸을 눌러도, ↑/↓ 로 포커스를 옮겨도 되게 한다(`onRowClick` + `onFocusedRowChange`). 편집 표는 `editArrowNavigation` 으로 편집 중 ↑/↓ 가 같은 열 윗행·아랫행 편집으로 이어진다.
- 편집마다 도는 무거운 검사는 Worker 로 보낸다. 편집이 멈추고 잠깐(300ms) 뒤에 보내고, Worker 가 일하는 동안 들어온 입력은 가장 최근 것 하나만 남긴다. 늦게 온 옛 결과는 버리고, 기다리는 동안 앞 결과와 "검사 중" 을 보인다. 417행 표에서 메인 스레드 멈춤이 225ms 에서 0 이 됐다.
  - Worker 는 `inline-worker:./x.worker.ts` 로 가져와 Blob URL 로 띄운다(`m-mdm/scripts/inline-worker.ts`). dist 를 포털 번들러가 다시 묶는 구조라 `new Worker(new URL(…, import.meta.url))` 경로는 청크 위치에 따라 깨질 수 있다.
  - 단위 테스트(vitest)는 소스가 빈 문자열이라 전처럼 렌더 중 동기 검사로 돈다. 저장 때 서버 검사와 견주는 기준은 검사 중이면 그 자리에서 동기로 다시 검사한다.
  - 늦게 온 결과가 표시 토큰을 바꿔도 편집 중인 행은 편집이 끝난 뒤 다시 그린다(`AgDataGrid` `rowClassRefreshToken`). 통째로 건너뛰면 표시가 빠지고, 통째로 그리면 열린 편집기가 닫힌다.
- 예시: `m-mdm/pages/dme/ruleEdit/decision-table/DecisionTableCard.tsx` 의 `dirty`·`analysisInput`·`markToken`, `use-rule-analysis.ts`.

## 17. m-* 모듈 화면 스타일 — 로컬 `.css` import 를 쓰지 않는다 (2026-09-30)

m-* 모듈 페이지의 로컬 `.css` import 는 tsup 이 dist 의 `pages/<영역>/<화면>/page.css` 로 따로 뽑지만, 포털 호스트(m-mcm)는 그 파일을 불러오지 않는다(`m-mcm/app/portal/module-config.ts` 에 m-analog 만 예외 등록). 그래서 스타일이 통째로 빠진다 — 룰 세트 편집 캔버스가 높이 0 의 빈 칸이 됐다.

- 화면 스타일은 인라인 `style`·shared 토큰·제공 클래스로 둔다. 화면 전용 규칙이 많으면 TS 문자열로 두고 페이지 루트에서 React 19 `<style href="…" precedence="default">` 로 한 번만 넣는다.
- 외부 패키지 CSS(`@xyflow/react/dist/style.css` 등)는 호스트가 번들하므로 import 해도 된다.
- 예시: `m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts`·`page.tsx` 와 테스트(`rule-set-edit-page` 의 style 한 번 주입).
- 개발 서버(next dev)에서 이 TS 문자열을 고치면, 이미 열린 탭은 같은 href 의 `<style>` 을 처음 넣은 내용 그대로 둔다(React 가 href 로 한 번만 넣는다). 새 규칙이 안 먹은 것처럼 보이면 코드를 고치기 전에 화면을 새로 고쳐 본다(2026-10-03, 홈 [PDF] 단추가 옛 스타일로 두 줄이 됨).

## 18. 팝업 위에 뜬 오류창 — Escape 한 번에 아래 팝업까지 닫힌다 (2026-09-30)

shared `Modal`(Mantine)은 열린 창마다 window 의 Escape 를 받는다. 등록 팝업 위에 `ErrorModal` 이 떠 있을 때 Escape 를 한 번 누르면 두 창이 함께 닫혀 사용자가 입력한 값이 사라진다(ruleMng 룰 등록 팝업 실측).

- 오류가 나도 입력을 고쳐 다시 보내야 하는 팝업은, 오류창이 떠 있는 동안 자기 `onClose` 를 무시한다: `onClose={() => { if (!errorMessage) setOpen(false); }}`.
- 예시: `m-mdm/pages/dme/ruleMng/page.tsx` 의 룰 등록 팝업.

## 19. React Flow 캔버스 — 누름·초점·memo 함정 (2026-10-01)

룰 세트 흐름 캔버스(`m-mdm/pages/dme/ruleSetEdit/canvas/`)에서 실측한 함정이다.

- **memo 의존성 누락은 새 객체 prop 테스트가 가린다.** 테스트가 다시 그릴 때마다 `rules`·`checks: []`·`new Set()` 을 새로 만들면 memo 가 늘 다시 돌아 빠진 의존성이 드러나지 않는다(룰 노드 제목이 토글을 안 따르던 결함). 바꾸려는 prop 하나만 바꾸고 나머지는 같은 참조로 둔 테스트를 하나 둔다.
- **`EdgeLabelRenderer` 층은 `pointer-events: none` 이다.** 안에 둔 칩·라벨은 이를 물려받아 hover 를 못 받으므로 `title` 툴팁이 뜨지 않는다. 누름·hover 가 필요한 요소만 `pointer-events: auto` 로 다시 켠다.
- **영역 선택 뒤 선택 상자(`.react-flow__nodesselection-rect`)가 상자 안 누름·우클릭을 가로챈다.** 고른 노드 우클릭 메뉴·손잡이·링크가 막힌다. 상자에 `pointer-events: none` 을 준다(여러 개 끌기는 고른 노드를 끌어서 된다).
- **툴바 단추가 초점을 쥐고 있으면 스페이스+끌기(화면 이동) 때 그 단추가 다시 눌린다.** 캔버스 툴바 단추는 mousedown 기본 동작(초점 이동)을 막는다(키보드 Tab·Enter 는 그대로).
- **노드·선 배열을 memo 로 통째로 새로 만들면 노드 하나를 끌거나 선택만 바꿔도 모든 노드·선이 다시 그려진다.** React Flow v12 는 사용자 노드·선 객체의 참조가 바뀌면 그 항목을 다시 그린다. 내용이 같은 항목은 이전 참조를 그대로 넘기고(`canvas/reuse.ts` 의 `useStableById`), `onNodeClick`·`onNodeContextMenu`·`onEdgeClick`·`onEdgeContextMenu` 는 `useCallback` 으로 고정한다. 이 콜백들은 모든 NodeWrapper·EdgeWrapper 의 prop 이므로 인라인 함수 하나만 있어도 전체가 다시 그려진다. 362노드에서 선택 한 번에 드는 노드 렌더가 1086회에서 4회로 줄었다. 자동 배치(dagre)는 배치가 읽는 칸으로 키를 만든 캐시(`flow-layout.ts` 의 `autoLayout`)를 거치므로, 위치·경로·이름표만 바꾼 편집에는 다시 돌지 않는다. 노드 다시 그리기 범위(선택·편집·끌기 프레임)는 `flow-canvas-reuse` 테스트가, dagre 캐시는 `layout-cache` 테스트가 지킨다.
- **초점을 가진 요소를 지우면 초점이 body 로 빠져 캔버스 단축키가 끊긴다**(선 Delete 뒤 Ctrl+Z 무반응). 단축키 디스패처가 처리한 뒤 `document.activeElement` 가 body 면 캔버스 host 로 돌린다.
- 예시: `canvas/FlowCanvas.tsx`, `canvas/FlowToolbar.tsx`, `styles/collapse.ts`(칩)·`styles/space.ts`(선택 상자), `page.tsx` 의 `onCanvasKeyDown`.
- **룰 세트 IF 의 끝내는 갈래(D-136, implicit-join spec J-D19)** — 흐름을 이어 갈 갈래는 「그 외」로 두고, 끝낼 갈래는 조건 갈래로 두어 끝 노드로 잇는다. 모든 갈래가 따로 END 로 가면 실행 순서 마지막 갈래(END 직행 제외)가 이어지는 갈래로 정해지므로, 안쪽 IF 에서 반대로 그리면(조건 갈래가 바깥 모이는 자리로, 「그 외」 에 몸을 두고 END 로) 구조 오류(S5·S6)로 거부된다. 화면은 IF 패널 갈래 목록 아래 안내(`flow-prop-if-ending-help`)로 같은 규칙을 보인다.
- **디버그·실행 도구 막대에서 ■(정지, `IconPlayerStop`) 아이콘은 세션을 끝내는 [중지]에만 쓴다.** 「마지막으로 이동」 같은 동작에는 쓰지 않는다(건너뛰기 ⏭ `IconPlayerSkipForward` 를 쓴다). 2026-10-02 룰 세트 편집에서 ■ 가 [끝내기](마지막 단계로 이동)에 붙어 사용자가 중지로 오인했다 — 지금은 [중지](`dbg-stop`)가 ■, [끝까지](`dbg-finish`)가 ⏭ 이다.

## 20. AgDataGrid 화면 — 입력 한 글자·셀 편집 한 번이 그리드 전체를 다시 그리지 않게 (2026-10-01)

MDM 화면들(dataItemMng·codeItemEdit·codeMng·layoutMng·domainMng)에서 실측한 낭비다. `AgDataGrid` 는 `columns` 참조가 바뀌면 보이는 모든 셀 렌더러를 다시 돌리고, `data` 참조가 바뀌면 행 단위 갱신(auto 너비면 열 너비 맞춤까지)을 한다.

- **`columns`·`data` 는 `useMemo` 로 만들고, deps 에 그 값이 실제로 읽는 것만 둔다.** `versionColumns(view.me)`·`rows.map(...)` 을 JSX 에서 바로 넘기면 검색 칸 한 글자마다 그리드가 다시 그려진다.
- **훅이 여러 값을 돌려줄 때는 반환 객체를 `useMemo` 로 감싼다.** 렌더마다 새 객체를 돌려주면 그 객체를 deps 로 둔 열 정의가 다른 칸 입력에도 다시 만들어진다(카테고리 탭 `cate` 객체, 셀 렌더러 55호출 → 0). 열 정의 deps 에는 고정된 함수(`close`·`reopen`)와 셀이 그리는 값만 둔다.
- **빈 결과를 새 빈 객체로 갈아끼우지 않는다.** 검증 응답이 비었고 이전도 비었으면 `setIssues` 를 건너뛴다(편집마다 열 정의 재생성 + 렌더러 140호출 → 5).
- **행 복제는 바뀐 행만 새로 만든다. 단, 원본 상태 객체를 그대로 넘기지 않는다.** ag-grid 는 확정한 편집 값을 넘겨받은 행 객체에 직접 쓴다. 상태 원본을 넘기면 취소해도 값이 돌아오지 않는다. 원본 행 하나당 복제본 하나를 `WeakMap` 으로 재사용하고, 편집해도 원본이 바뀌지 않는 행(닫힌 행 등)은 재사용하지 않는다.
- **행마다 달라지는 버튼 상태(draft·busy)는 열 정의 deps 에 넣지 않는다.** 작업 열을 셀 컴포넌트로 빼고 작은 저장소를 구독하게 한다. 저장소 갱신은 `useLayoutEffect` 로 그리기 전에 한다(dataItemMng `ItemActionCell`).
- **입력마다 서버를 부르는 미리보기는 디바운스(300ms)하고, 결과를 쓰는 탭·패널이 보일 때만 부른다.** 편집 패널이 닫히면 대기 중인 마지막 값은 버리지 말고 바로 보낸다(예전 결과와 같게). 같은 조회 기준이면 탭을 오가도 다시 부르지 않는다.
- 측정은 렌더러 호출 수·columns 재생성 수·새 행 객체 수·요청 수처럼 결정적인 값으로 테스트에 남긴다(`tests/dmd/dataItemMng/data-item-perf.test.ts`, `tests/dmc/codeItemEdit/code-item-edit-perf.test.ts`). ms 는 이 PC 에서 2배 흔들려 쓰지 않는다.

## 21. className 조건부 클래스 — 템플릿 문자열 안 앞 공백은 Prettier 가 지운다 (2026-10-01)

shared·m-mcm 의 Prettier 는 `prettier-plugin-tailwindcss` 를 쓴다. 이 플러그인은 className 문자열을 정리하면서 `` `a${on ? " b" : ""}` `` 의 `" b"` 앞 공백을 지워 `ab` 라는 한 단어 클래스를 만든다. 포털 탭 전체 화면이 이 때문에 `portal-shellportal-shell--tab-fullscreen` 이 되어 CSS 가 하나도 먹지 않았다(타입 검사·단위 테스트는 통과).

- 조건부 클래스는 통째 문자열 두 개 중 하나를 고른다: `className={on ? "a b" : "a"}`. 또는 `` `a ${on ? "b" : ""}` `` 처럼 공백을 템플릿 리터럴 쪽(고정 부분)에 둔다.
- 예시: `shared/src/portal-shell/portal-shell.tsx` 의 AppShell className.

## 22. 목록 기호 — 포털은 `ul`·`ol` 기호를 지운다 (2026-10-02)

포털(m-mcm `app/globals.css`)이 싣는 Tailwind v4 preflight 가 `ol, ul, menu { list-style: none }`(layer base)을 건다. 화면에 글머리 점·번호가 필요하면 그 요소의 CSS 에 `list-style: disc`(중첩 `circle`)·`decimal` 과 왼쪽 들여쓰기를 직접 준다. 레이어 밖 규칙이라 preflight 를 이긴다. 단위 테스트(happy-dom)에는 preflight 가 없어 이 문제가 보이지 않는다.

- 마크다운 글(메모·설명)은 `@dk-oasis/shared/markdown-editor` 가 이미 명시한다 — 화면에서 다시 그리지 않는다.
- 읽기 화면(`MarkdownView`·`MarkdownDocViewer`·공지 본문 등)은 ```` ```mermaid ```` 코드 블록을 도식으로 그린다(기본 켬, `mermaid={false}` 로 끔, 구문 오류면 코드 블록 유지, 편집 화면은 코드 블록 그대로). 화면에서 따로 그리지 않는다.

## 23. 편집기 칸 — 남는 높이를 채우게 한다 (2026-10-02)

`MarkdownField`(`@dk-oasis/shared/markdown-editor`)와 `Textarea` 는 기본 높이가 내용만큼(또는 `rows`)이라, 아래 빈 공간이 있어도 짧게 남는다. 공지 관리 상세에서 본문 편집기가 짧게 남고 아래가 비었다.

- 상세 패널을 세로 flex(`display: flex; flex-direction: column`)로 두고, 위 입력표는 `flex: none`, 편집기를 담는 구역은 `flex: 1 1 0` 으로 남은 높이를 채운다. 편집기까지 이어지는 칸은 모두 `flex: 1 1 0; min-height: 0` 이어야 하고, `MarkdownField` 에는 `fill` 을 준다. 고정 높이(`clamp(...)` 등)를 따로 정하지 않는다.
- 좁은 화면에서 편집기가 0 으로 찌그러지지 않게 편집 구역에 `min-height`(예: 320px)를 두고, 그보다 작으면 상세 패널이 스크롤하게 둔다.
- `Textarea`(shared)는 `.mantine-Textarea-root`·`.mantine-Input-wrapper` 를 `flex: 1 1 0`, `textarea` 를 `height: 100%; resize: none` 으로 둔다.
- 미리보기는 편집기 옆에 칸으로 두지 말고, 필요하면 버튼으로 여는 팝업에 둔다(편집 폭을 줄이지 않는다).
- 예시: `m-mls/pages/lsh/noticeMgmt/notice-styles.ts` 의 `.nm-detail`·`.nm-body*`·`.nm-editor*`.

## 24. MDM 버전 버튼 규약 — 코드·룰 화면이 같은 이름·순서·모양을 쓴다 (2026-10-02)

마스터코드(codeMng)와 룰(ruleMng)의 버전 상태 전이 버튼은 `m-mdm/src/shell` 의 `VersionActionBar` 로 그린다. 화면은 활성 조건만 계산해 넘기고, 라벨·순서·모양·확인창은 이 컴포넌트가 정한다.

- 라벨: `새 버전(major)`·`새 버전(minor)`·`삭제`·`확정`·`확정취소`·`선점`·`해제`·`넘기기`. `확정` 은 확정 화면으로 이동하고, `확정취소` 는 붙여 쓴다.
- 순서: 새 버전 → 삭제 → 확정 → 확정취소 → 선점 → 해제 → 넘기기. 화면 고유 버튼(`코드 편집` 등)은 맨 뒤에 둔다.
- 모양: `확정` 은 primary, `삭제`·`확정취소` 는 danger, 나머지는 default.
- 노출: 버튼은 늘 보이고, 해당하지 않으면 비활성으로 둔다(조건부로 숨기지 않는다).
- 확인창: `삭제`(제목 `확인`)와 `확정취소`(제목 `확정취소`)는 누르면 확인창을 거친 뒤 실행한다.
- 룰도 마스터코드처럼 `새 버전(major)`·`새 버전(minor)` 두 버튼을 쓴다. 룰 세트·레이아웃·헤더 화면도 같은 두 버튼을 쓴다(D-144, [ADR-0006](../../mdm/adr/0006-object-versioning-major-minor.md)). minor 가 999 이면 minor 버튼만 비활성이다.
- 레이아웃·헤더(layoutMng·headerMng): 저장은 버전을 만들지 않고 내 DRAFT 를 덮어쓰며, 확정은 [확정] 으로 `dmb/layoutConfirm`(전문·헤더 공용, D-144·D-148)에서 한다. DMB 확정은 담당자만, DRAFT 는 소유자만 확정한다.
- 활성 조건은 서버 판정값(`cancelConfirmable` 등)을 화면에서 다시 계산하지 않는다. 권한 action 이름은 화면별로 유지한다.

## 25. 모달 안 그리드 — flex 칸만으로는 높이가 0 이 된다 (2026-10-02)

shared `Modal` 의 `lg`·`xl` 은 최소 높이(70·80vh)만 있고 고정 높이는 없다. 그래서 내용이 짧으면 표·footer 아래가 크게 빈다. 이 빈 곳을 그리드로 채우려고 `flex: 1` 칸 안에 `AgDataGrid`(height 를 주지 않으면 부모 높이 100%)를 두면, 그 100% 가 기준 높이를 얻지 못해 **그리드가 0px 로 접힌다**. 단위 테스트(happy-dom)는 레이아웃을 계산하지 않아 이 문제가 보이지 않는다.

- 표 칸은 `flex: 1; min-height: 200px; position: relative` 로 두고, 그 안에 `position: absolute; inset: 0` 칸을 하나 더 두어 그리드를 넣는다. 절대 위치 칸은 표 칸의 실제 높이를 기준으로 삼는다.
- 모달 본문 div 는 `flex: 1; min-height: 0; display: flex; flex-direction: column` 이고, 위아래 안내 줄은 `flex: none` 이다.
- 빈 곳을 없애려고 크기를 `md`(600px)로 낮추지 않는다. 다섯 열 이상의 표는 글자가 잘리고 가로 스크롤이 생긴다.
- 예시: `m-mdm/pages/dme/ruleEdit/cards/BoundaryCaseModal.tsx` 의 `gridBox`·`gridFill`.

## 26. 포털 FormGroup 값 칸은 26px 고정 — 여러 줄 내용은 넘쳐서 위아래 줄을 덮는다 (2026-10-03)

포털 `m-mcm/app/page-layout.css` 는 `.page-layout .form-group-field` 를 `height: 26px` 로 고정하고, 그 안의 `.form-input`·`.form-select` 테두리를 지운다(한 칸 = 입력 하나 전제). 그래서 FormGroup 안에 체크박스 목록·여러 행·textarea·편집기를 넣으면 내용이 칸 밖으로 넘쳐 **위아래 줄을 덮는다**. 단위 테스트(happy-dom)는 레이아웃을 계산하지 않아 이 문제가 보이지 않는다(위젯 편집기 환율·날씨·글·html 에서 실제로 났다).

- 여러 줄 내용은 FormGroup 에 높이 고정을 푸는 클래스를 주고, 그 클래스에서 `height: auto; min-height: 26px`, 라벨 `height: auto`, 칸 안 입력칸 테두리 복원을 함께 정한다. 예시: `m-mcm/widget-types/_ext/styles.ts` 의 `.mcm-fg-block`.
- 칸 안 그리드·목록은 `flex: 1 1 auto; min-width: 0` 를 줘야 폭을 얻는다. 주지 않으면 `auto-fill` 그리드가 한 열로 접힌다.
- 확인은 브라우저에서 한다: 값 칸의 `scrollHeight > clientHeight` 이면 넘친 것이다.

## 27. MDM 캡션·툴팁·값 검증 — 컬럼 사전을 화면이 따른다 (2026-10-03)

포털 탭이 `MdmMetaProvider` 를 자동으로 씌운다. 화면이 MDM 컬럼 사전(표준 용어)을 따르게 하는 방법이다. 컴포넌트 사용법·props 정본은 `mantine-aggrid-ui` 스킬의 [mdm-meta](../../../.claude/skills/mantine-aggrid-ui/references/components/mdm-meta.md), 설계 정본은 `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` 이다.

**캡션·툴팁**

- 그리드 열 `key` 가 MDM 물리명과 같으면(`TITLE`, `codeNm` → `CODE_NM`) 머리글을 MDM 캡션으로 바꿀 수 있고, 마우스를 올리면 컬럼·도메인 카드(툴팁)가 뜬다. `header` 를 적으면 기본(`explicit`)에서는 적은 값이 이긴다.
- **기존 화면을 표준 캡션으로 바꿀 때는 `header` 를 지우지 말고 `captionPriority="mdm"` 을 쓴다(대체 캡션 유지).** 화면을 `<MdmMetaProvider captionPriority="mdm">` 으로 감싸고 `module` 은 지정하지 않는다(바깥 포털 공급자를 따른다). 그러면 MDM 이 있으면 표준 캡션, 없거나 받지 못하면(장애·사전에서 지워짐·포털 밖) 적어 둔 `header` 가 보인다. `header` 를 지우면 MDM 을 받지 못할 때 열 `key`(`TITLE`)가 머리글로 보이고 상세 라벨과 어긋난다. 새 화면은 `header` 를 생략해도 된다(D-146 명시 우선 — 생략하면 MDM 캡션을 따른다).
- 표시용 파생 열(`CATEGORY_LABEL` 등)처럼 물리명과 맞지 않는 열은 `header` 를 적고, `captionPriority="mdm"` 화면에서는 `meta: false` 로 연결을 끈다(사전에 우연히 같은 이름이 생겨도 머리글이 바뀌지 않게, 묻는 이름도 줄인다). 다른 물리명이 맞으면 `meta="물리명"`, 엉뚱하게 맞으면 `meta: false`. 엑셀 내보내기 등에서 `header` 를 읽을 때는 `useResolvedGridColumns(COLUMNS)` 결과를 쓴다.
- `FormGroup` 을 쓰는 입력은 `name`(화면 필드 이름)을 주고 `label` 을 생략하면 MDM 폼 캡션·툴팁이 붙는다(§7 의 `tip` 은 적으면 이긴다).
- **th/td 상세 표 라벨은 `MdmFieldLabel`**: 상세 표(`DETAIL_*`)는 `FormGroup` 을 쓰지 않으므로 th 안에 `<MdmFieldLabel name="TITLE" label="제목" required />` 을 둔다(캡션 우선순위는 `FormGroup` 과 같고, 사전에 있으면 라벨에 올릴 때 MDM 컬럼·도메인 카드 툴팁이 뜬다. 사전에 없거나 포털 밖이면 `label` 글자 그대로). th 에 `{caption} *` 를 손으로 그리거나 `resolveCaption` 으로 라벨만 만들지 않는다.
- **조회 영역 `SearchField` 도 `name`(+필요하면 `meta`)을 주면 라벨에 MDM 카드 툴팁이 뜬다**(`MdmFieldLabel` 과 같은 규칙, 없으면 예전과 같음). 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으므로 업무 키(`name="title"`)를 적는다. 라벨 글자는 기본(explicit)에서 `label` 그대로다.
- **그리드 머리글 툴팁은 MDM 메타가 없는 열도 표시 머리글 이름을 기본으로 띄운다**(빈 이름·화면이 `headerTooltip`·`headerComponent` 를 준 열·메타 카드 열 제외, 끄려면 열에 `headerTooltip: ""`). 머리글·셀 값·MDM 카드 툴팁 지연은 `AgDataGrid tooltipShowDelay` 로 기본 500ms(예전 ag-grid 기본 2000ms)이고 셀 값 툴팁은 잘림과 상관없이 모든 셀 값에 뜨므로 열에서 끄려면 `tooltip: false`, 폼 라벨 지연은 그대로다.
- **mdm 탭도 MDM 메타를 받는다**: 포털이 `mdm` 탭 메타를 `mcm` 모듈로 부른다(`/api/mdm/mdmMeta` 는 404, `/api/mcm/mdmMeta` 가 같은 사전). `analog` 탭만 끈다(표 `MDM_META_TAB_MODULES`).
- **컬럼 설명이 HTML(`descriptionHtml`)이면 화면이 직접 그리지 않는다** — 카드(`MdmMetaCard`)가 브라우저에서 한 번 더 소독해 그리고, 그 카드만 마우스가 들어갈 수 있는 넓은 포털 툴팁(640px·설명 60vh 스크롤·150ms 유예·Escape 닫기)이 된다. 그리드는 HTML 열 머리글의 캡션 글자(안쪽 라벨)에서 같은 포털 카드를 띄우고 ag-grid `tooltipInteraction` 은 쓰지 않는다(화면이 켜지 않는다). 상세: [mdm-meta](../../../.claude/skills/mantine-aggrid-ui/references/components/mdm-meta.md) §HTML 설명·상호작용 툴팁.

**값 검증**

- 표준 문구와 판정은 서버 저장 검증(`MdmValidator`, [백엔드 가이드 §11.2](../BackEnd/Backend-Implementation-Guide.md#112-저장-검증mdmvalidator))과 같다. 화면 검사는 편의이고 서버가 기준이다. 비즈니스식은 화면에서 검사하지 않는다.
- 상세 표·폼: `useMdmValidation().validateValue(name, value)` 결과를 `Input error` 에 준다(입력 중 즉시). 같은 컴포넌트가 `useMdmColumn(name)` 을 이미 부르면 그 `column` 으로 `validateMdmValue(column, value)` 를 불러도 같다. 저장 직전에는 `validateRow(row, names)` 로 한 번 더 막는다. 훅은 받아 둔 메타만 쓰고 요청하지 않으므로 검사할 칸은 그리드 열·`FormGroup name`·`useMdmColumn(s)` 로 등록해 둔다(렌더마다 요청하면 MDM 장애 중 글자마다 POST 가 나간다). 이 화면이 검사하는 칸은 **서버 `MdmValidator.columns(...)` 와 같은 칸**이어야 한다 — 서버는 MDM 정의가 DB 칸보다 엄격하지 않은 칸만 검사한다.
- 편집 그리드: `mdmValidate`(편집 가능하고 MDM 에 연결된 열만, 바뀐 칸 즉시 표시), 저장 전 전체는 `validateRows`.
- **서버 저장 오류 → 칸 오류**: OASIS 서비스는 `BusinessException` 을 HTTP 200 + `meta.success=false` 봉투로 돌려주므로 `apiRequest` 가 던지지 않는다. 화면의 봉투 해제 함수가 거부를 판정해 던지는 오류에 봉투의 `errors` 를 실어야 `toFieldErrors(e, grid)` 가 읽는다(`noticeMgmt/api.ts` 의 `NoticeApiError.errors`). 이 결과를 그리드는 `fieldErrors`, 상세 표는 칸별 `error` 로 준다.
- `rowIndex` 는 **요청 목록의 자리**다. 바뀐 행만 보내는 화면이 그 결과를 그리드 `fieldErrors` 에 그대로 넘기면 엉뚱한 행이 표시된다 — 요청 행에 `rowKey` 를 실어 보내 그 값으로 맞추거나 data 자리로 바꿔 넘긴다. 한 행만 보내는 상세 저장은 `rowIndex` 를 보지 않고 `field` 로만 칸을 찾는다.
- 서버 오류 칸은 그 칸을 고치거나 다른 행을 열거나 새로 쓰면 지운다(낡은 판정을 남기지 않는다).

**시험**

- 화면 시험(happy-dom)은 진짜 shared(dist)에 가짜 `fetch` 를 꽂는다: `/api/{module}/mdmMeta/columns`·`domains` 응답, `apiRequest` 를 쓰는 화면이면 Node 의 `localStorage` 전역(파일 미지정이라 접근 시 예외)을 스텁하고, `PageLayout` 버튼이 필요하면 `/api/auth/me`·`myButtonEndpoints`(`{objId:"*",action:"*"}`)에 답한다. 실제 MDM 정의는 입력 제한에 먼저 걸릴 수 있으니 시험용은 더 엄격한 가짜 정의(짧은 길이·필수)를 쓴다. 예: `m-mls/tests/lsh/noticeMgmt/notice-page-mdm.test.ts`. 사용자 확인·RBAC 결과는 globalThis 세션 캐시라 같은 파일의 다음 시험까지 남는다 — 시험마다 사용자를 바꾸거나 `/api/auth/me` 호출 수를 세면 `beforeEach` 에서 `clearCurrentUserCache()`(`@dk-oasis/shared/portal-shell`)를 부른다(shared 는 `tests/setup.ts` 가 비운다).
- 예시 화면: `m-mls/pages/lsh/noticeMgmt/`(`notice-columns.tsx` 의 `TITLE` 열 대체 header + 파생 열 `meta: false`, `page.tsx` 의 `captionPriority="mdm"` 공급자와 저장 흐름, `NoticeTitleRow.tsx`).

## 28. 계속 늘어나는 마스터 고르기 — 콤보 대신 검색형 선택 (2026-10-03)

도메인처럼 종류와 개수가 늘어나는 마스터는 입력 칸에서 전체 목록을 콤보(`Select`)로 보이지 않는다. 목록을 한꺼번에 받아야 하고, 많아지면 고르기도 어렵다.

- m-mdm 의 `src/domain`(`@/domain`, m-mdm 안에서만 쓰는 별칭)에 있는 `DomainField` 가 검색형 칸이다. 칸에 이름을 넣고 Enter 를 누르거나 칸을 벗어나면(blur) 서버 검색으로 하나를 정하고, 정하지 못하면 그 글자로 찾기 팝업을 연다. 칸을 비우면 해제한다.
- 화면을 열 때 전체 목록을 조회하지 않는다. 검색할 때만 서버를 부른다. 화면마다 자기 엔드포인트 권한이 다르므로 검색 함수는 그 화면 자기 `search` 를 꽂는다.
- 고를 수 없는 후보(자기·하위 등)를 뺄 때는 이름이 같은 다른 후보가 저절로 적용되지 않도록 `autoPick={matchExactDomain}` 을 준다(기본 `matchDomain` 은 결과가 한 건이면 그것을 적용한다).
- 후보 규칙이 부모 연결을 따라 하위를 찾으면, 규칙을 `MATCHED` 로 줄이기 전 검색 결과 전체에 적용한다. 이 순서는 domainMng `search` 가 일치 행과 그 조상 체인을 함께 준다는 계약을 전제로 한다.
- 화면 목록에 없는 도메인도 검색으로 고를 수 있으므로, 고른 도메인의 원본 행을 화면이 보관해 이름·안내에 쓴다.
- 예시: `m-mdm/pages/dma/domainMng/parent-search.ts` 와 `DomainBasicForm`·`ParentLinkModal`.

## 29. HTML 소독 시험(happy-dom) — 지운 요소 뒤는 소독되지 않는다 (2026-10-03)

happy-dom 20.11 의 `NodeIterator` 는 지금 노드를 지우면 그 뒤 노드를 하나도 돌지 않는다(DOM 표준은 이어서 돈다). DOMPurify 가 이 반복자로 노드를 지우므로, 시험에서 `sanitizeNoticeHtml('<script>…</script><a href="javascript:x">')` 는 `<script>` 만 지우고 뒤 링크의 `javascript:` 주소를 그대로 남긴다. 브라우저에서는 생기지 않는 일이라 시험만 틀린 결과를 낸다.

- 소독 시험은 지워질 요소(`script`·`iframe` 등)를 검사할 내용 **뒤**에 두거나, 지울 요소와 검사할 속성을 다른 시험으로 나눈다. 예: `shared/tests/unit/html-editor.unit.test.ts` 의 미리보기 시험.
- 지울 요소 뒤의 속성이 남았다고 소독 코드를 고치지 않는다. 먼저 순서를 바꿔 다시 돌려 본다.

## 30. 좁은 칸의 fit 그리드 — 열 최소 폭 합을 칸 폭보다 작게 둔다 (2026-10-03)

`AgDataGrid columnSizing="fit"` 은 `width` 를 비율로 나누지만, 칸이 좁으면 각 열이 `minWidth`(없으면 `width`)까지만 줄고 그 합이 칸보다 넓으면 가로 스크롤이 생긴다. 항목 편집의 카테고리 이력(오른쪽 열 34%)은 1280 폭에서 칸이 약 325px 인데 최소 폭 합이 326px 이라 1px 가로 스크롤이 났다. 단위 테스트(happy-dom)는 레이아웃을 계산하지 않아 이 문제가 보이지 않는다.

- 가로 스크롤 없이 보여야 하는 좁은 칸의 그리드는 최소 폭 합을 **1280 폭에서 잰 칸 폭 − 세로 스크롤바 몫(Windows 고정 약 17px)** 이하로 둔다. 행이 늘어 세로 스크롤바가 생기면 그만큼 다시 좁아진다. 열 가중치·`minWidth` 정하는 법은 `mantine-aggrid-ui` 스킬 `references/screen-patterns.md` 의 fit 열 폭 규칙을 따르고, 이 절은 스크롤바 몫과 시험 방법만 더한다.
- 줄일 열은 말줄임과 제목(title)으로 값을 다 볼 수 있는 열이다. 날짜·배지처럼 잘리면 뜻이 바뀌는 열은 줄이지 않는다.
- 열 정의를 순수 함수로 두고 최소 폭 합을 시험으로 고정한다. 실제 폭은 e2e 가 `scrollWidth - clientWidth` 로 본다.
- 예시: `m-mdm/pages/dmd/dataItemMng/history/DataHistoryTimeline.tsx` 의 `timelineColumns` 와 `tests/dmd/dataItemMng/history/data-history-timeline.test.ts`.

## 31. 열 그룹 그리드 — 내용이 같은 열 정의를 다시 넣지 않는다 (2026-10-03)

ag-grid 33 은 열 정의를 다시 받으면 머리 그룹 칸 ctrl 을 새로 만들고 옛 ctrl 을 파기한다(`column = null`). 머리 그룹 칸이 처음 붙는 커밋과 열 정의 교체가 겹치면, React 개발 모드(StrictMode)가 그 칸의 ref 를 다시 붙일 때 파기된 ctrl 을 불러 `Cannot read properties of null (reading 'getProvidedColumnGroup')` 로 탭 화면 전체가 오류 화면이 된다. 운영 빌드에서는 나지 않지만 dev 서버(로컬·e2e)는 막힌다. ruleEdit 에서 열 없는 룰에 첫 열을 적용할 때 실측했다.

- `AgDataGrid` 의 열 정의는 **그리는 값이 바뀔 때만** 새로 만든다. 그리드 안 MDM 옵션(`useGridMdm`)은 칸 메타의 `loading` 만 바뀐 경우(404·꺼진 모듈·사전에 없는 칸)에는 앞 값을 그대로 둔다. 화면 쪽 규칙은 §20(`columns` 를 `useMemo` 로 만들고 deps 를 좁힌다)과 같다.
- 그룹 구조(묶음·변수 수)가 바뀌면 화면이 그리드를 `key` 로 새로 마운트한다(`DecisionTableCard` 의 `gridKey`). 마운트된 그룹 그리드에 다른 그룹 구조를 그대로 넘기지 않는다.
- 시험은 StrictMode·`MdmMetaProvider`(fetch 404) 아래에서 그룹 머리까지 그린다. 공급자가 없으면 이 경로가 돌지 않아 시험이 통과해 버린다. 예: `shared/tests/unit/grid-mdm-group-strict.unit.test.ts`, `m-mdm/tests/dme/ruleEdit/decision-table-card.test.ts` 의 「포털 탭」 묶음.

## 32. 목록+상세 화면·등록 팝업 — 다시 읽기와 거부 처리 (2026-10-03)

ruleMng 는 상세를 `useEffect([selectedId])` 로만 읽어, 같은 행을 다시 누르거나 [조회] 해도 상세를 다시 읽지 않았다. 그래서 다른 창에서 바뀐 상태(선점 해제·확정)가 보이지 않았다. 카테고리 추가 팝업(dmd dataItemMng)은 `onAdd` 의 결과와 상관없이 닫혀, 서버가 거부하면 입력이 사라졌다. mdm-user 여정 e2e 에서 찾았다.

- 목록+상세 화면의 상세는 고르는 곳(행 클릭·첫 줄 자동 선택·등록 뒤·[조회])에서 **직접** 부른다. 같은 행이어도 다시 읽는다. 선택 상태 effect 에 맡기면 값이 같을 때 돌지 않는다.
  - [조회] 때 고른 상세까지 다시 읽는 화면은 지금 ruleMng 뿐이다. dmc `codeMng`·dmd `dataMng` 의 [조회]는 목록만 다시 읽는다(후속).
  - ruleMng 의 [조회] 결과에 고른 룰이 없으면 새 목록 첫 줄을 고르고, 목록이 비면 선택과 상세를 비운다. 쪽 넘기기는 선택을 그대로 둔다. [조회]는 새 검색이라 늘 첫 쪽을 읽는다. 그래서 다른 쪽에서 고른 룰은 새 첫 쪽에 없으면 첫 줄로 바뀐다(의도, 2026-10-03 결정).
  - 쓰기(저장·선점·폐기 등) 동안에는 헤더 입력·쓰기 단추를 잠그고 목록 행 클릭도 받지 않는다. 저장 중에 또 고친 입력이 옛 잠금 값으로 남거나, 이중 클릭으로 두 번째 저장이 같은 잠금 값으로 나가 거짓 충돌이 나기 때문이다. 예: ruleMng `RuleDetailPanel` 의 `writing`·`onWriting`, dmc `codeMng` 의 `writing`.
  - 쓰기 뒤 다시 읽기는 누른 시점이 아니라 **지금 선택**(ref)을 본다. 쓰기를 기다리는 사이 다른 행을 골랐으면 옛 대상을 다시 읽지 않는다. 예: ruleMng `reload`.
- 비동기로 반영되는 쓰기(다음 폴링에 반영)는 반영 순번을 기다린 뒤 다시 조회하고, 다시 받기까지 필요한 경우 결과 키로 완료를 판정한다. 예: mcm `mdmCacheMng` 의 `forceWait.ts`(한도 약 25초, 넘으면 [조회]로 확인하라고 안내)·`utils.ts` 의 `decideForceWait`.
- 상세 응답은 요청 순번으로 가드한다. 순번이 지금 것과 다르면 성공·실패 모두 버리고, busy 도 지금 요청이 끝날 때만 푼다. 예: `m-mdm/pages/dme/ruleMng/page.tsx` 의 `detailSeq`, dmc `codeMng`.
- 다시 읽어도 저장하지 않은 입력은 말없이 지우지 않는다. 같은 대상이고 입력이 이전 서버 값·새 서버 값과 모두 다르면 입력을 남기고, 저장에는 입력을 시작할 때의 낙관적 잠금 값을 보낸다. 입력을 버리는 길은 [다시 불러오기]·충돌 오류창 닫기처럼 사용자가 누르는 것만 둔다. 예: `RuleDetailPanel` 의 `formAuditVer`, dmc `codeMng`·dmd `dataMng` 의 `apply`(`serverForm`·`formAuditVer`, 충돌 뒤 다시 읽기는 `discard`).
  - 서버는 저장할 때 값을 trim·정규화한다. 그래서 헤더 저장에 성공한 다시 읽기는 유지 판정을 거치지 않는다. 보낸 폼을 기억해 두고, 입력이 보낸 그대로면 서버 값·새 잠금 값으로 맞춘다. 저장하는 사이 또 고친 입력만 남긴다(`savedForm`·`sent`).
  - 입력을 남기더라도 새 서버 헤더 값이 입력을 시작할 때의 값(`formBase`)과 칸마다 같으면, 다른 창이 고치지 않고 VER 만 오른 것이다. 이때는 잠금 값을 새 값으로 올린다. 헤더 칸이 바뀐 진짜 충돌만 옛 잠금 값으로 드러난다.
- 상세를 서버에서 다시 읽지 않고 목록 행 값으로 채우는 화면은 같은 행을 다시 누를 때 폼을 다시 채우지 않는다. 목록을 새로 받을 때 선택도 비우므로 다시 채우면 입력만 사라진다. 예: dma `termMng`·`unitMng` 의 `handleRowClick`.
- 다른 행으로 옮길 때 입력을 버리는 동작은 모든 화면이 같고 확인 창을 두지 않는다(2026-10-03 결정).
- 팝업이 서버 등록을 부르면 `onAdd`·`onSubmit` 은 성공 여부(`boolean`)를 돌려주고, 팝업은 성공일 때만 칸을 비우고 닫는다. 로컬 diff 에만 얹는 팝업은 이미 있는 ID(서버 행·로컬 새 행)를 팝업 안에서 막고 서버와 같은 문구를 보인다(예: dmc `codeItemEdit` `CategoryAddModal` 의 `existingIds`). 닫기 표시한 행의 ID 도 막는다. 서버는 같은 저장에서 닫기를 먼저 적용하므로 받아들일 수 있지만, 로컬 행은 ID 를 키로 쓰기 때문이다. 대신 그 행의 [취소]로 닫기를 풀어 쓰라고 안내한다(`closedIds`). 팝업 컴포넌트가 닫혔을 때 `return null` 하려면 훅을 모두 부른 뒤에 하고, 다시 열 때 칸을 비우는 일은 열리는 렌더에서 상태를 맞춰 한다(`wasOpen`). 거부는 오류창으로 알리고 입력을 남긴다. 오류창이 떠 있는 동안 팝업 닫기를 무시하는 것은 §18 을 따른다. 예: `dmd/dataItemMng/cate/components/CategoryAddModal.tsx`, `useDataCategories.ts` 의 `write`.
- 시험은 같은 행 다시 누르기·[조회]·늦게 온 옛 응답·미저장 입력·끝 공백 저장 뒤 trim 응답·VER 만 오른 다시 읽기·쓰기 중 다른 행 클릭, 그리고 등록 거부 뒤 오류창을 닫거나 Escape 를 눌러도 입력이 남는지를 본다. 성공 토스트는 Mantine 전역 저장소(limit 3)에 쌓여 뒤 시험의 알림을 밀어내므로, 시험 뒤 `tests/helpers/toasts.ts` 의 `clearToasts` 로 비운다. 예: `tests/dme/ruleMng/rule-mng-page.test.ts`, `tests/dmd/dataItemMng/data-item-page.test.ts`.

## 33. React Flow 화면 맞춤 — `rf.fitView` 는 다음 노드 갱신까지 미뤄진다 (2026-10-03)

React Flow 12 의 `useReactFlow().fitView()` 는 곧바로 화면을 옮기지 않는다. 저장소에 `fitViewQueued` 를 세우고 다음 `setNodes`(노드가 다 잰 상태) 때 실행한다. 제어형 캔버스(`nodes` prop 을 화면이 만든다)에서 키·단추 처리기가 상태를 바꾸지 않고 `fitView` 만 부르면 다시 그리기가 없어 대부분 아무 일도 없고, 나중에 다른 일로 노드가 갱신될 때 엉뚱하게 실행된다. 룰 세트 편집 캔버스의 Shift+2(고른 것으로 이동)·[흐름도로 돌아가기] 에서 실측했다. happy-dom 시험은 다른 갱신이 끼어 통과해 버리므로 브라우저로 확인한다.

- 곧바로 옮겨야 하는 동작은 경계 상자로 화면을 계산해 넣는다: `getViewportForBounds(rf.getNodesBounds(ids), width, height, minZoom, maxZoom, padding)` → `rf.setViewport(vp, { duration })`. `width`·`height`·`minZoom`·`maxZoom` 은 `useStoreApi().getState()` 에서 읽는다. 예: `m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx` 의 `fitNodes`.
- 상태를 바꿔 다시 그리는 경로(툴바 [화면 맞춤] 의 신호 값, 세트를 바꿀 때)는 `rf.fitView` 를 써도 된다. 새 노드를 다 잴 때까지 기다렸다 맞추는 성질이 오히려 필요하다.
- `translateExtent` 같은 이동 한계는 휠·끌기·`scaleBy`·`setViewportConstrained` 에만 걸리고 `fitView`·`setCenter`·`setViewport` 는 거치지 않는다. 한계를 바꿔도 지금 화면을 다시 맞추지 않으므로, 한계가 줄 수 있으면 움직임이 멈춘 뒤 `panZoom.setViewportConstrained` 로 한 번 맞춘다(같은 캔버스의 `ViewportGuard`).

## 34. 검색 칸의 요청 순번 — 무르기는 사용자 조작으로만 한다 (2026-10-03)

§11·§15 의 요청 순번으로 늦게 온 검색 응답을 버릴 때, 순번을 올리는 계기는 **사용자 조작**(글자 바꿈·다시 찾기·[찾기]·바깥 누름)으로 한정한다. 화면 인계로 연 ID 가 바뀌는 것처럼 사용자가 하지 않은 변화로 순번을 올리면, 인계가 [찾기] 응답보다 늦게 왔을 때 사용자가 누른 찾기가 아무 일도 없던 것처럼 사라진다(IdPicker, e2e TC-DMC-ITM-01). 반대로 사용자가 [찾기]를 눌렀으면, 그 전에 칸을 떠날 때(blur) 시작된 자동 확정 검색은 무른다. 무르지 않으면 늦게 온 한 건 응답이 막 연 찾기 팝업을 닫는다(DomainField).

- 범위: 사용자가 친 검색어의 후보 목록(IdPicker·DomainField 등)에 한한다. 대상 상세·폼을 채우는 조회(§11·§15)는 인계 때도 순번을 올린다.
- 찾기 목록은 고르기 전까지 어느 대상에도 쓰이지 않으므로, 연 ID 가 바뀌어도 아직 오지 않은 사용자 찾기의 결과는 보인다. 칸 글자는 새 ID 로 맞추고, 이미 열려 있던 목록은 닫는다(칸에 새 ID 가 보이는데 Enter 가 옛 목록에서 고르지 않게).
- 시험은 지연 응답(직접 resolve 하는 Promise)으로 순서를 고정한다. 예: `m-mdm/tests/shell/id-picker.test.ts`, `m-mdm/tests/domain/domain-field.test.ts`.

## 35. 그리드 칸 표시가 다른 필드에 기대면 — 미리 계산한 필드를 칸으로 둔다 (2026-10-03)

`AgDataGrid` 는 행 키(`rowKey`)가 같은 행을 다시 받으면 **그 칸 필드 값이 바뀐 셀만** 다시 그린다. `render: (v, row) => …row.other…` 처럼 칸 필드(`key`)가 아닌 다른 필드로 문구를 정하면, 다른 필드만 바뀐 행은 [조회] 뒤에도 옛 문구가 남는다(mdmCacheMng "구분" 칸: `part` 는 그대로 BODY 인데 `current` 만 true→false). 새로고침하면 맞게 나와 놓치기 쉽다.

- 표시 문구를 행 데이터에 미리 계산해 넣고(`rows.map(r => ({ ...r, kind: label(r.part, r.current) }))`, `useMemo`) 그 필드를 칸 `key` 로 쓴다.
- 꾸밈만 하는 `render`(배지·서식)는 칸 필드 값만 읽게 한다.

## 36. 탭마다 편집기를 마운트해 두는 화면 — 숨은 탭이 보이는 탭을 건드리지 않게 (2026-10-06)

룰 세트 편집의 세트 탭(shared `closable-tabs`, 탭마다 `RuleSetEditor`)에서 실측한 함정이다. 숨은 탭도 마운트를 유지하므로 효과·리스너·포털이 그대로 살아 있다.

- **숨은 패널은 `display:none` + 효과 유지로 둔다.** Mantine `Tabs` 의 `keepMounted` 기본 모드 `'activity'` 는 숨은 패널의 효과를 내린다(자동 저장·`beforeunload` 가 멎는다). `closable-tabs` 는 패널을 늘 그리고 `hidden` 으로만 숨긴다.
- **`document`·`window` 리스너는 자기 패널이 보일 때만 처리한다.** 캔버스 host 가 `isShown` 이 아니면 ⌘Z·Delete·Esc 같은 단축키를 무시한다(숨은 패널 안에 초점이 남을 수 있다).
- **캡처 단계 Esc 리스너의 `stopPropagation` 은 보이는 탭의 Esc 를 삼킨다.** 숨은 탭에 열려 있던 도움말이 Esc 를 가로채므로 `isShown` 판정을 건다.
- **포털 대화 상자는 활성 탭일 때만 그린다.** 오류 창·케이스 편집 창처럼 body 로 포털하는 창은 `display:none` 을 따르지 않으므로 편집기가 `active`(`EditorActiveContext`)를 보고 그리지 않는다. 작성 중 상태는 부품에 남아 탭을 다시 고르면 이어진다. shared 안에서 포털하는 창(전역 메시지 창 등)은 편집기가 닫을 수 없다.
- **React Flow 는 숨은 컨테이너(0 크기)를 500×500 으로 잰다.** 화면 한계 재맞춤을 그 크기로 하면 화면이 엉뚱하게 옮겨지므로 캔버스 DOM 이 보이지 않으면 건너뛴다(다시 보이면 크기가 바뀌어 다시 본다).
- 시험: 두 번째 탭을 열어 숨은 탭에서 단축키·Esc·대화 상자·자동 저장 요청이 나가지 않는지 고정한다. 예: `m-mdm/tests/dme/ruleSetEdit/set-tabs.test.ts`·`set-tabs-dialog.test.ts`. 기록: `docs/rule-set-subset/progress-ui.md` ui:7.

## 37. 보조 조회 응답 — 불러오기 세대 번호로 늦은 응답을 버린다 (2026-10-06)

세트를 열 때마다 따로 묻는 보조 조회(룰 세트 편집의 `CALL_IO` 겉모양)는 응답이 늦게 올 수 있다. 「지금 세트 ID 와 같은가」로 버리면, **같은 세트를 다시 불러온 경우**(다시 불러오기·자기 쓰기 뒤) 떠나 있던 옛 응답이 새로 받은 서버 값을 덮는다.

- 불러오기가 성공할 때마다 오르는 세대 번호(`callEpoch`)를 두고 응답이 돌아왔을 때 세대가 같을 때만 쓴다. 불러올 때 물은 ID 집합·요청 번호 맵도 새 객체로 바꿔 옛 요청이 새 세대를 건드리지 않게 한다.
- 시험은 지연 응답(직접 resolve 하는 Promise)으로 「같은 세트를 다시 불러온 뒤 늦게 도착한 응답」을 고정한다. 예: `m-mdm/tests/dme/ruleSetEdit/set-calls-state.test.ts`. §11·§15·§34 의 요청 순번과 같은 갈래다.

## 38. 툴바 줄에 길이가 바뀌는 상태 글을 두지 않는다 — 메시지 줄로 (2026-10-06)

툴바 줄(단추 묶음)에 「자동 저장 보류」·「자동 저장 실패」 같은 상태 글을 붙이면, 글이 생기고 사라질 때마다 오른쪽 정렬된 끝 묶음(`rsf-toolbar-end`)의 단추 위치가 흔들린다. 눌러야 할 단추가 눈앞에서 움직여 잘못 누르게 된다.

- 길이가 바뀌는 상태 글은 툴바 줄 안에 두지 않고 툴바 아래 메시지 줄(`rsf-toolbar-message`, `set-message` 와 같은 자리)에 그린다. 메시지(`state.message`)와 상태 글이 함께 있으면 둘 다 보이게 한다. `data-testid`·`role="status"`·색 토큰은 그대로 쓴다.
- 줄에 길이를 고정해 놓고 말줄임으로 버티지 않는다. 그러면 글이 잘려 알아볼 수 없다.
- 시험은 상태 글이 `.rsf-toolbar-end` 와 툴바 줄 밖에 있는지 고정한다. 예: `m-mdm/tests/dme/ruleSetEdit/auto-save-page.test.ts` 9번.

## 39. AgDataGrid 컬럼 개인화 — gridId·서버 페이징 정렬·hideable 를 화면이 정한다 (2026-10-06)

AgDataGrid 는 사용자별로 컬럼 순서·너비·표시·고정·정렬을 localStorage 에 저장한다. 저장 키는 `dmes:grid:v1:{userId}:{화면 pageId 또는 경로}:{gridId}` 이고, `gridId` 를 주지 않으면 `main` 이다. 같은 키의 그리드가 이미 떠 있으면 나중에 뜬 그리드는 개인화가 꺼지므로, 화면이 다음을 정해 준다.

- **gridId**: 한 화면에 그리드가 둘 이상 뜨면(탭·접이식 포함) 그리드마다 화면 안에서 유일하고 뜻 있는 영문 camelCase 이름을 준다(`master`, `detail`, `roleUser`). 모달·팝업 안 그리드는 호스트 화면과 키가 겹칠 수 있으므로 `modal-` 접두어를 붙인다(`modal-columnPick`). 같은 부품이 여러 곳에서 재사용되면 `gridId` 를 props 로 받게 하고 호출처가 구분 값을 넘긴다. `GridPanel` 로 감싸도 `gridId` 는 안쪽 `AgDataGrid` 에 준다.
- **세트 탭처럼 같은 편집기가 여러 개 마운트되는 경우**: 모든 편집기에 같은 `gridId` 를 주고 노드·세트 ID 접미어는 붙이지 않는다(노드마다 설정이 쌓이고 매번 기본값에서 시작한다). 보이는(활성) 탭의 편집기만 `personalize={active ? undefined : false}` 로 켠다.
- **서버 페이징 그리드**: 정렬을 저장하면 현재 페이지만 정렬된 것처럼 보이므로 `personalize={{ sort: false }}` 로 정렬 저장을 끈다. `limit` 행 수 상한만 있는 목록은 서버 페이징이 아니다.
- **같은 유형이 한 화면에 여러 개 뜨는 그리드**(위젯 렌더러 등): 정적 `gridId` 를 정할 수 없으므로 `personalize={false}` 로 끈다.
- **hideable**: 편집 가능한 컬럼은 기본적으로 숨길 수 없다(필수 입력이 잠기게 하려는 기본값). 숨겨도 저장 검증·의미에 영향이 없는 선택 입력 컬럼(비고·설명·약칭)만 `hideable: true` 로 푼다. 반대로 편집 불가여도 사용자가 보고 판단해야 하는 컬럼(행 키·상태 배지·검사 오류·행 단위 버튼 컬럼)은 `hideable: false` 로 잠근다. 애매하면 붙이지 않는다.
- 새 그리드를 만들 때 위 항목을 처음부터 지정한다. 감사 기준은 `grep -rn "<AgDataGrid" src/frontend/m-*` 로 `gridId` 없는 곳을 찾는 것이다.
