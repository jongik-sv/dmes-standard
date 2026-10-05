# tooltip-refactor 구조 변경 기록

tooltip-screens 레인의 opus 리팩토링 리뷰가 남긴 제안 3건(지시 tooltip-refactor-1)을 처리한다. 동작 보존이 원칙이라 화면 글자·툴팁이 뜨는 칸·컬럼 사전(MDM meta) 연결 결과는 바뀌지 않는다.

## R1. 열 정의의 반복되는 `meta: false` 를 `uiCols` 로 묶는다 (D1)
- 커밋: 99801410(도우미) · ec7cd38c(m-mcm) · 609fa68d(m-mdm dma·dmb·dmc·dmd) · 7f87a1f3(m-mdm dme) · af9ec3da(리뷰 반영)
- 바뀌기 전: 열 정의마다 `meta: false` 를 적었다.
- 바뀐 뒤: `uiCols(열 배열, 사전 key 목록)` 가 meta 를 안 적은 열 중 사전 key 목록에 없는 열에 `meta: false` 를 채운다. 이미 `meta` 를 적은 열(문자열 포함)과 목록에 든 열은 그대로 두고, `children` 도 안쪽까지 푼다.
- 도우미 위치: 모듈 안에 둔다(`m-mdm/src/ui-meta.ts`, `m-mcm/lib/ui-meta.ts`). shared 에는 두지 않는다. 두 파일은 같은 사본이라 함께 고친다.
- 범위 기준: 지시에 이름이 나온 화면(mdmCacheMng·commSyncMng·layoutConfirm)과 `meta: false` 가 5곳 이상 있는 열 정의 파일. m-mls(noticeMgmt `notice-columns.tsx`, 파일 1개)는 도우미 사본을 늘리지 않으려고 제외했다. 남은 `meta: false` 는 `cell()` 호출 형태·SearchField·라벨·4곳 이하 파일이다.
- 사용 기준(리뷰 반영): 사전에 이어진 열이 대부분인 배열(예: 사전 7개·끔 2개)과 열 하나만 감싸는 경우는 `meta: false` 를 직접 적는다. `uiCols` 는 기본값이 「끔」 이라, 사전에 이어진 열이 많은 배열에서는 새 열이 조용히 사전과 끊긴다. 되돌린 곳: VersionPanel·codeConfirm·CategoryTab·ruleConfirm 의 해당 배열, `column-grid.tsx`·`dataItemMng/columns.tsx` 의 단일 열 push.
- 동작 보존 근거: `m-mdm/tests/ui-meta-lock.test.ts` 가 m-mcm·m-mdm·m-mls 소스의 열 정의·`cell()`·`MdmFieldLabel` 마다 효과 meta 를 정적으로 뽑아 변경 전 소스에서 만든 기록(`fixtures/ui-meta-lock.json`)과 견준다. 기록은 별도 커밋(7d7fa2ce)으로 먼저 두었고 리팩토링 커밋에서 바뀌지 않았다. 추출기는 `uiCols` 인자가 리터럴이 아니면 멈춘다. 기록 갱신은 `UPDATE_UI_META_LOCK=1`.
- 영향 범위: m-mcm 3개 화면, m-mdm dma·dmb·dmc·dmd·dme 화면 열 정의. `uiCols` 호출은 모듈 상수이거나 `useMemo` 안이라 렌더마다 새 열 배열이 생기지 않는다(리뷰 확인).
- 되돌리는 방법: 99801410 이후 ec7cd38c·609fa68d·7f87a1f3·af9ec3da 를 revert.

## R2. 위젯 유형 편집기 4개를 `MdmMetaProvider disabled` 로 감싼다 (D2)
- 커밋: 3d5e5396(변경 전 특성 시험) · 79697c00
- 바뀌기 전: `chat`·`query-chart`·`query-number`·`query-table` 편집기의 라벨 `meta={false}`·열 `meta: false` 를 칸마다 적었다.
- 바뀐 뒤: 편집기 최상위를 `<MdmMetaProvider disabled>` 로 감싸고 개별 meta 지정을 지운다.
- 동작 보존 근거: `useMdmColumns` 는 공급자가 `disabled` 이면 `meta=false` 와 같이 요청 없이 「연결 없음」을 돌려주고, 그리드 머리글·기본 headerTooltip 도 같다. 편집기 안 입력 부품·`EditableRowList`·`SqlEditor` 에는 사전을 조회하는 칸이 없었다. `m-mcm/widget-types/_query/editors-mdm-meta.test.ts`(mcm 공급자 안에서 렌더해 사전 요청 0회·라벨·머리글 글자·카드 툴팁 없음을 확인)가 변경 전 코드에서 통과했고 변경 뒤에도 통과한다. 공급자를 `disabled` 없이 두면 이 시험이 실패한다(변이 확인).
- 되돌리는 방법: 79697c00 revert.

## R3. `description`·`source` 라벨 복붙을 상수로 묶는다 (D3)
- 커밋: ec7cd38c(m-mcm) · 609fa68d · 7f87a1f3(m-mdm)
- 바뀌기 전: `<MdmFieldLabel name="description" label="설명" meta={false} />`(13곳), `name="source" label="원천"`(4곳)을 파일마다 적었다.
- 바뀐 뒤: `<MdmFieldLabel {...DESCRIPTION_LABEL} />`·`{...SOURCE_LABEL}`. 상수는 모듈 도우미 파일에 있다(m-mcm 은 설명 라벨 1곳뿐이라 `DESCRIPTION_LABEL` 만 둔다).
- 바꾸지 않은 곳: 글자가 다른 라벨(`DomainBasicForm` 의 「정의」 등).
- 동작 보존 근거: 고정 시험이 상수 펼침을 상수의 값(name·label·meta)으로 풀어 기록과 견준다. 원본과 글자까지 같은 곳만 바꿨다(리뷰 확인).
- 되돌리는 방법: 위 커밋 revert.

## 알려 둔 시험 상태
- `m-mdm/tests/dma/domainMng/page-render.test.ts` 「행이 있으면 들여쓴 이름이 보인다」 는 고정 20ms 대기에 기대어 흔들린다. 변경 전 코드(6e80a51e)에서도 6회 중 3회 실패했다(이번 변경과 무관).
