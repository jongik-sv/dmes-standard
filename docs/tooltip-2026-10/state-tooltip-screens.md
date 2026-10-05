# tooltip-screens 레인 정본 메모

- 브랜치: `fix/tooltip-screens` / 워크트리: `/Users/jji/project/dmes-standard-wt/tooltip-screens` / 기준 dev `e00a3c7c`
- 지시: tooltip-screens-1(B1~B4), tooltip-screens-2(B4 때 주석 수정)

## 진도

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| B1 상세 `<th>` → `MdmFieldLabel` | 구현·리뷰 끝 | 1cec20f2(m-mcm) · dedcac91(m-mls) · 20e26693(m-mdm) · 위젯 실행 모듈 meta 끔 | 리뷰 결함 0, 권고 4건 중 1건 반영 |
| B2 SearchField `name` 31곳 | 대기 | | tooltip-shared A2 가 dev 에 들어간 뒤 |
| B3 그리드 열·FormGroup 범용 키 정리 | 대기 | | tooltip-shared A1 과 mdm-column-dict C1 확정 뒤 |
| B4 마감 | 대기 | | 아래 B4 목록 참고 |

## B1 결정 기록

- 라벨 글자·`*` 필수 표시·th 스타일은 그대로 두고 `required` 로 옮겼다(캡션 우선순위 explicit).
- 범용 키(description·status·title·ID 등)와 UI 전용 값, 한 라벨에 키가 둘 이상 묶인 칸은 `meta={false}`.
- 일부러 바꾸지 않은 th: `m-mdm/src/column-info/ColumnInfoPopover.tsx`(카드 안 카드), `TraceDetail.tsx`·`TestResultCard.tsx` 의 값 표시 행 머리글.
- 포털 탭 공급자가 mdm·analog 모듈의 mdmMeta 를 꺼 둔 상태(`MDM_META_UNSUPPORTED_MODULES`)라, tooltip-shared A1 이 dev 에 들어가기 전에는 m-mdm 라벨이 맨 글자로 그려진다. 동작 보존에는 문제가 없다.
- 리뷰 권고 중 남긴 것: `ROLE_ID`(로컬 mdm.db 에서는 레거시 컬럼 뜻이지만 화면은 mcm 사전을 받는다), `layoutId`(라벨이 ID/버전 두 값이라 meta 를 끔).

## B4 마감 목록

- 지시 tooltip-screens-2: `m-mdm/tests/dme/ruleEdit/decision-table-card.test.ts` 737행 주석 "mdm 모듈은 mdmMeta 가 404 라 꺼지지만" 을 tooltip-shared A1(MDM_META_MODULE_ALIASES mdm→mcm) 뒤의 동작에 맞게 고친다. 시험 동작은 바꾸지 않고 docs 커밋으로 둔다. 기본 headerTooltip(표시 이름)은 `headerTooltip: ""` 로 끈다.
- 중복된 라벨 패턴을 화면 안 작은 상수·도우미로 묶을 곳, 불필요한 meta 지정을 opus/high 리팩토링 리뷰로 점검한다.

## B4 먼저 끝낸 것

- B1 머지: dev `dffe0f95`(트리 5af6b880). 머지 뒤 dev 를 브랜치에 합쳤다(fast-forward).
- 바뀐 화면 audit: `M audit`·`A audit` 38개 파일 의심 0건 통과(B1 범위). B2·B3 뒤 바뀐 파일로 다시 돌린다.
- decision-table-card 주석은 A1 이 dev 에 들어간 뒤 실제 동작을 확인하고 고친다(지금 고치면 코드보다 앞선 문장이 된다).

## 환경 메모

- 새 워크트리라 `deps.sh` 로 의존성을 설치하고 `pnpm --filter "@dk-oasis/m-mdm^..." build` 를 한 번 돌렸다.
- m-mdm 전체 vitest 는 메인 체크아웃에서도 82건이 실패한다(워크트리와 같은 수). 이번 변경과 무관한 기존 실패다.
- m-mcm tsc 는 형제 패키지(`@dk-oasis/m-mdm/pages/*`, `m-analog`) TS2307 만 낸다(기존).
