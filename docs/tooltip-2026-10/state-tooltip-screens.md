# tooltip-screens 레인 정본 메모

**상태: 완료(2026-10-05).** B1 dev `dffe0f95`, B2·B3·B4 dev `2922c58a`(트리 4836dd71) 머지, 워크트리·브랜치 정리 끝.
남은 일: ① 제안 3건(열 반복 `meta: false` 도우미화·위젯 유형 편집기 `MdmMetaProvider disabled`·라벨 복붙 상수화) ② shared 몫 제안(범용 키 목록을 `resolveMdmPhysName` 이 자동으로 끄기) ③ 분류표 예외 4건(dataSrc·layoutId·labelLong·COLUMN_PHYS) mdm-column-dict 반영 확인. 브라우저 확인·mdmMeta 요청 수 측정은 조정자 몫.

- 브랜치: `fix/tooltip-screens` / 워크트리: `/Users/jji/project/dmes-standard-wt/tooltip-screens` / 기준 dev `e00a3c7c`
- 지시: tooltip-screens-1(B1~B4), tooltip-screens-2(B4 때 주석 수정)

## 진도

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| B1 상세 `<th>` → `MdmFieldLabel` | dev 머지 끝 | dffe0f95 | 리뷰 결함 0 |
| B3 범용·UI 전용 `meta: false`, 표시용 meta 연결 | dev 머지 끝 | dce036d6 · 623bbdb0 · 21392171(CD_V·COLUMN_ID) | 분류표 C1 + 지시 -4·-5 |
| B2 SearchField `name` | dev 머지 끝 | b2d5d4f9 · 85a0e171 | name 없이 둔 칸은 업무 키가 없는 칸 |
| B4 마감 | dev 머지 끝(2922c58a) | 37cfb3e4 · 016cf356 · 978b0180 · decision-table 주석 커밋 | opus/high 리뷰 15건 중 결함·권고 반영 |

## B1 결정 기록

- 라벨 글자·`*` 필수 표시·th 스타일은 그대로 두고 `required` 로 옮겼다(캡션 우선순위 explicit).
- 범용 키(description·status·title·ID 등)와 UI 전용 값, 한 라벨에 키가 둘 이상 묶인 칸은 `meta={false}`.
- 일부러 바꾸지 않은 th: `m-mdm/src/column-info/ColumnInfoPopover.tsx`(카드 안 카드), `TraceDetail.tsx`·`TestResultCard.tsx` 의 값 표시 행 머리글.
- 포털 탭 공급자가 mdm·analog 모듈의 mdmMeta 를 꺼 둔 상태(`MDM_META_UNSUPPORTED_MODULES`)라, tooltip-shared A1 이 dev 에 들어가기 전에는 m-mdm 라벨이 맨 글자로 그려진다. 동작 보존에는 문제가 없다.
- 리뷰 권고 중 남긴 것: `ROLE_ID`(로컬 mdm.db 에서는 레거시 컬럼 뜻이지만 화면은 mcm 사전을 받는다), `layoutId`(라벨이 ID/버전 두 값이라 meta 를 끔).

## B4 리뷰 결과와 남긴 것

- 반영: 정의·맥락·title 라벨 meta 해제(뜻이 고정된 단어), 범용 키 열 meta 누락 채움(m-mdm·m-mcm, 약 90곳), SearchField name==meta 군더더기 제거, PropertyPanel ruleId meta, grp_result 무효 meta 제거, 공지 화면 캡션 우선순위 범위(S1).
- 남김(제안): 열마다 반복되는 `meta: false`(mdmCacheMng·commSyncMng·layoutConfirm 등)를 화면 안 `uiCols()` 도우미로 묶기, 위젯 유형 편집기 4개를 `<MdmMetaProvider disabled>` 로 감싸고 개별 meta 지우기, `description`·`source` 라벨 복붙 13·4곳 상수화. shared 몫 제안: 범용 키 목록을 `resolveMdmPhysName` 이 자동으로 끄면 화면의 `meta: false` 약 250곳이 사라진다.
- 분류표 예외(조정이 mdm-column-dict 에 요청): DATA_SRC 실행 모듈(dataSrc), layoutId, labelLong, COLUMN_PHYS 는 화면이 meta={false} 유지.
- 시험: m-mcm 58 파일·1248, m-mls 5 파일·61, m-mdm 3594(고부하 load 6~11 에서 3건 타이밍 실패, 단독 재실행 통과). 바뀐 112개 파일 M·A audit 의심 0건.

## 이전 B4 목록(처리됨)

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
