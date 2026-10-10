# userQueryMng 정합체크 (공용 쿼리 정의 관리)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

판정: 일치 / 불일치 / 미확인(be 대기). 구현은 `src/frontend/m-mcm/page-components/csa/userQueryMng/`, `_userq/`, `widget-types/_query/ColumnsEditor.tsx` 를 직접 읽어 확인했다. 백엔드는 이 워크트리에 없어 **be 머지 뒤 대조 필요(미확인)** 이다.

## 1. 식별자·권한

| 항목 | 스펙 | 구현 | 문서 | 판정 |
|---|---|---|---|---|
| screenId, objId | `userQueryMng` | `SCREEN_ID = "userQueryMng"`(form-model.ts), `PageLayout screenId·objId` | 기능 §1 | 일치 |
| serviceId | `userQueryMng` | `USER_QUERY_MNG_ID`(api.ts), `meta.menuId` 도 같다 | BPMN §1 | 일치 |
| componentPath | `csa/userQueryMng` | 폴더 `page-components/csa/userQueryMng`, page-registry 등록 | 기능 §1 | 일치 |
| 메뉴, FULL_SEQ | 시스템관리 > 쿼리 정의 관리, 1020230 | FE 범위 밖 | 기능 §1 | 미확인(be 대기) |
| 버튼 action | `search`, `save`, `delete` | `btn_search`·`btn_new`·`btn_save`·`btn_delete` 의 action 이 `search`, `save`, `save`, `delete` | 기능 §2 | 일치 |
| 할당 저장 권한 | `saveAssign` | `canDoButton(rbac, "userQueryMng", "saveAssign")` | 기능 §2.2 | 일치(시드는 미확인) |
| 권한 시드, `allActions` 5토큰 | 스펙 §3 | FE 범위 밖 | BPMN §6 | 미확인(be 대기) |
| BPMN 파일, 서비스 빈 | `userQueryMng.bpmn`, `userQueryMngService` | 없음 | BPMN §1 | 미확인(be 대기) |

## 2. 요청·응답 키(api.ts 대 스펙 §4.1)

| action | 요청 | 응답 | 판정 |
|---|---|---|---|
| `search` | 5개 조건. 빈 값은 키를 뺀다 | `rows` 10키를 읽는다(`useYn` 은 `N` 만 N 으로, 그 밖은 Y 로 읽는다) | 일치 |
| `get` | `queryId` | `def` 의 `paramsJson`, `columnsJson` 을 풀어 `params`, `columns` 로 묶는다. `def` 가 없으면 Error | 일치 |
| `save` | 스펙 params 11개. 숫자는 글자로 싣는다. 빈 `paramsJson`·`columnsJson` 은 싣지 않는다 | `queryId`, `ver` | 일치 |
| `delete` | `queryId`, `ver` | `deleted`, `assignDeleted` 를 읽는다. 화면은 문구만 보인다 | 일치 |
| `previewQuery` | `sqlText`, `paramsJson?` (`previewUserQuery`) | `normalizeQueryResult` | 일치(S2 dev 반영 `cccd41927` 뒤 `DefTab` 이 `SqlEditor` 의 `runPreview` 로 `previewUserQuery` 를 넘긴다) |
| `validate` | `sqlText`, `paramsJson?` | `binds` 문자열 배열 | 일치 |
| `searchAssign` | `queryId` | 5키. `missingYn='Y'` → `missing` | 일치 |
| `saveAssign` | `queryId`, `userIdsJson` | `added`, `removed` | 일치 |
| `searchUserList` | 없음 | `rows`, `truncated` | 일치 |
| 응답 해제 | `unwrapResult` | `_query/api` 의 `unwrapResult` | 일치 |
| 서버가 글자 숫자를 읽는지 | `ver`, `maxRowCnt` | 글자 `"3"` 로 싣는다 | 미확인(be 대기) |
| 파일 위치 | `_userq/api.ts`, `_userq/types.ts` | 같은 위치. userq-user 가 같은 내용 사본을 쓰다가 먼저 머지된 쪽이 정본 | 일치 |

## 3. 화면 요소

| 항목 | 스펙 | 구현 | 판정 |
|---|---|---|---|
| 상단 버튼 | 조회 F8, 신규, 저장, 삭제 | 같다 | 일치 |
| 조회조건 5개 | 분류 select, 이름·ID text, 사용 여부 select, 담당 부서 text, 할당 사용자 text | 같다. 분류는 `USRQ_CTG` LoV | 일치 |
| 본문 | `ContentBody root resizable storageKey="mcm.csa.userQueryMng"`, 목록 40%, 오른쪽 탭 | 같다 | 일치 |
| 목록 열 | 쿼리 ID, 이름, 분류, 담당 부서, 사용, 최대 행, 할당 수, 수정일시 | 같은 8열 | 일치 |
| 정의 탭: 기본 정보 | 쿼리 ID(신규만), 이름, 분류, 담당 부서(`DeptPicker`), 설명, 최대 행, 사용 여부 | 같다 | 일치 |
| 정의 탭: SQL | `SqlEditor`(S2 이후 `SqlCodeEditor` 기반) + `runPreview` | `SqlEditor`(`SqlCodeEditor` 기반) + `runPreview` | 일치 |
| 입력 정의 | `ParamsEditor` 그대로. [SQL 검증] = `appendUndeclaredParams` 후 `validate` | 같다 | 일치 |
| 출력 정의 | 시험 성공 시 없는 열만 `appendMissingFields`. 열 표는 `query-table/editor.tsx` 에서 뽑아 함께 쓴다 | `ColumnsEditor` 추출(위젯 편집기도 import). 같은 규칙 | 일치 |
| 미리보기 그리드 | 50행을 출력 정의대로 | `PreviewGrid`(`toColumnDefs`, `toGridRows`) | 일치 |
| [할당] 탭 | `TransferList`, 후보 `searchUserList`, 값 `searchAssign`, `missingYn='Y'` 배지 「없는 사용자」 | 같다 | 일치 |
| 변경 있을 때 행 선택 | 확인 창 | 정의 또는 할당 변경이 있으면 「저장하지 않은 변경을 버릴까요?」 | 일치 |
| 시험 결과와 `save` 의 관계 | 스펙 무규정 | 시험 결과는 저장하지 않는 화면 값. 쿼리를 열 때 비운다 | 참고 |

## 4. 검증

| 항목 | 스펙 | 구현(`validateDef`) | 판정 |
|---|---|---|---|
| 쿼리 ID | `^[A-Z][A-Z0-9_]{2,39}$`, 저장 뒤 변경 불가 | 같은 정규식(신규만 검사), 저장 뒤 읽기 전용 | 일치 |
| 최대 행 | 1~5000 | 1~5000 정수 | 일치 |
| 입력 정의 | `QueryParams.parse` 규칙(최대 10개, 이름 형식, 시스템 변수 이름 금지) | `validateParams` 로 화면에서 먼저 검사 | 일치 |
| 출력 정의 | 서버: 배열·최대 100개·field 1~128·열거값 | 화면은 빈 필드만 검사. 나머지는 서버 | 일치(서버 대기) |
| SQL | `validateSql` | 화면은 빈 값만 검사 | 일치(서버 대기) |
| 충돌 문구 | 「다른 사람이 먼저 고쳤습니다. 다시 조회하세요」 | 서버 문구를 그대로 보인다 | 미확인(be 대기) |

## 5. 스펙과 다른 점(조정자 확인용 목록)

| 번호 | 내용 | 영향 |
|---|---|---|
| 1 | 스펙 §8.3 파일 목록에 없는 파일이 늘었다: `csa/userQueryMng/PreviewGrid.tsx`, `_userq/use-usrq-categories.ts`(분류 LoV 훅), `widget-types/_query/ColumnsEditor.tsx`(추출) | 스펙 §8.3 갱신 필요 |
| 2 | `ColumnsEditor` 추출로 `widget-types/query-table/editor.tsx` 가 바뀐다(DOM, testId 무변화, widget-types vitest 34파일 1118건 통과) | 머지 요청 「겹칠 수 있는 파일」 |
| 3 | 담당 부서 팝업(`DeptPicker`)이 `userQueryMng/searchDepts` 를 부른다(조정 결정: be 에 action 추가 요청, 응답 모양은 `commWidgetMng/searchDepts` 와 같다). be 머지 전에는 이 action 이 없어 팝업 조회가 실패한다 | 스펙 §4.1 action 표에 `searchDepts` 추가 필요. be 머지 뒤 대조 |
| 4 | `SearchArea` 에 `autoSearch` 를 달아 진입 때 한 번 조회한다. 스펙 무규정(화면 표준 골격 따름) | |
| 5 | [신규] 는 첫 조회가 끝나기 전에는 비활성이다. 스펙 무규정 | |
| 6 | 저장 직후 `get` 을 한 번 더 불러 새 `ver` 를 받는다. 이 재조회가 실패해도 저장 응답의 `ver` 로 폼을 연다 | |
| 7 | 목록에 첫 조회 상한이 없다(audit P-R1). 정의 표가 수백 행 규모라 오탐으로 둔다 | |
| 8 | 할당 후보가 5000명을 넘어 잘리면 안내 줄을 보인다. 스펙 무규정 | |
| 9 | 저장 뒤 같은 쿼리를 다시 열 때는 SQL 칸과 시험 결과를 유지한다(기준값과 `ver` 만 갱신). 다른 쿼리를 열면 시험 결과를 비운다 | 비운 뒤 출력 정의의 필드 칸은 글자 입력이다. 다시 시험하면 선택 목록이 돌아온다 |

## 6. 시험

| 파일 | 건수 | 내용 |
|---|---|---|
| `_userq/api.test.ts` | 12 | 9개 action 요청·응답 변환, 빈 값 제거, 업무 거절, 사용자 action 3종 |
| `csa/userQueryMng/form-model.test.ts` | 9 | 조회조건 변환, 목록 행 변환, `validateDef`, dirty, 할당 후보 합치기, 집합 비교 |
| `widget-types` 전체 | 1118(34파일; dev 합류 뒤 36파일 1144건) | `ColumnsEditor` 추출 뒤 위젯 동작 무변화 확인 |

2026-10-10 `vitest run` 통과, 내 파일의 tsc 오류 0건, audit 의심 0건(P-R1 1건 오탐). 브라우저 확인은 조정자가 be·이 레인 머지 뒤 메인 서버에서 한다(미실시).

## 7. 판정

| 항목 | 결과 |
|---|---|
| FE 구현 | 완료. 불일치 없음(S2 반영으로 `runPreview` 임시 차이 해소) |
| BPMN, 서비스, 시드 | be 머지 뒤 대조 필요(미확인) |
| 개발 착수 가능 여부 | 이미 구현 완료된 사후 작성 문서다. 착수 판정은 해당 없음. be 대조 대기 |

해소 조건: be 머지 뒤 BPMN설계서 §6 을 대조해 미확인 행을 닫는다.
