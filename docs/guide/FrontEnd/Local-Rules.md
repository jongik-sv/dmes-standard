# Frontend Local Rules

이 문서는 DMES {CLIENT} 저장소의 Frontend 로컬 운영 규칙만 둔다. 공통 Frontend 개발 표준은 [FrontEnd 표준 통합 개발가이드 v2](FrontEnd_표준_통합_개발가이드_v2.md)가 정본이다.

## 1. 정본 관계

- Frontend 화면 구현 표준: [FrontEnd_표준_통합_개발가이드_v2.md](FrontEnd_표준_통합_개발가이드_v2.md)
- BFF URL, OASIS/REST, Phase 7, 모듈별 Phase 7 허용 조건: [standard-v2/frontend-standard/01-rules-decisions-files.md](standard-v2/frontend-standard/01-rules-decisions-files.md)
- 외부 도메인 / 인프라 미구축 처리와 Decision Log: [standard-v2/frontend-standard/03-cases-checklist-menu.md](standard-v2/frontend-standard/03-cases-checklist-menu.md)
- Portal 화면/메뉴/BFF 개발: [Portal-Development-Guide.md](Portal-Development-Guide.md)
- Portal 메뉴 역할 정책: [Portal-Menu-Role-Policy.md](Portal-Menu-Role-Policy.md)
- 화면 시각 표준(톤·토큰·셸·그리드·토스트): [UI-Visual-Standard.md](UI-Visual-Standard.md)

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
  lint(`tsc --noEmit`)는 의존 패키지의 `.d.ts`(shared 는 `dist/types/**/*.d.ts`, m-* 는 `dist/*.d.ts`)로 타입을 읽으므로, **lint 가 들어간 게이트에서는 `TSUP_DTS=0` 을 쓰지 않는다.** 기본값(환경 변수 없음)은 지금처럼 `.d.ts` 를 만든다.
- shared 의 `.d.ts` 는 tsup 이 아니라 tsc 가 만든다(2026-10-02): tsup 은 JS 만 묶고(`dts: false`), `scripts/lib-dev.mjs` 가 뒤이어 `tsc -p tsconfig.build.json` 으로 `dist/types/` 에 파일별 선언을 만든다. package.json exports 의 `types` 가 그쪽을 가리키며, 진입점을 추가하면 exports 의 `types` 를 `./dist/types/<src 기준 경로>.d.ts` 로 적는다(`tests/unit/package-exports.unit.test.ts` 가 tsup 진입점과 대조한다). 실측: tsup 의 dts(rollup-plugin-dts)는 RSS 3.1GB·13.5초에 4GB 힙에서 OOM, tsc 는 RSS 약 0.6GB·1.9초(dev incremental 0.9초).
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

- `<FormGroup label="..." tip={...}>` 형식으로 라벨과 tip을 함께 제공한다.
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
- 활성 조건은 서버 판정값(`cancelConfirmable` 등)을 화면에서 다시 계산하지 않는다. 권한 action 이름은 화면별로 유지한다.

## 25. 모달 안 그리드 — flex 칸만으로는 높이가 0 이 된다 (2026-10-02)

shared `Modal` 의 `lg`·`xl` 은 최소 높이(70·80vh)만 있고 고정 높이는 없다. 그래서 내용이 짧으면 표·footer 아래가 크게 빈다. 이 빈 곳을 그리드로 채우려고 `flex: 1` 칸 안에 `AgDataGrid`(height 를 주지 않으면 부모 높이 100%)를 두면, 그 100% 가 기준 높이를 얻지 못해 **그리드가 0px 로 접힌다**. 단위 테스트(happy-dom)는 레이아웃을 계산하지 않아 이 문제가 보이지 않는다.

- 표 칸은 `flex: 1; min-height: 200px; position: relative` 로 두고, 그 안에 `position: absolute; inset: 0` 칸을 하나 더 두어 그리드를 넣는다. 절대 위치 칸은 표 칸의 실제 높이를 기준으로 삼는다.
- 모달 본문 div 는 `flex: 1; min-height: 0; display: flex; flex-direction: column` 이고, 위아래 안내 줄은 `flex: none` 이다.
- 빈 곳을 없애려고 크기를 `md`(600px)로 낮추지 않는다. 다섯 열 이상의 표는 글자가 잘리고 가로 스크롤이 생긴다.
- 예시: `m-mdm/pages/dme/ruleEdit/cards/BoundaryCaseModal.tsx` 의 `gridBox`·`gridFill`.
