# userQuery 정합체크 (공용 쿼리 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

판정: 일치 / 불일치 / 미확인(be 대기). 구현은 `src/frontend/m-mcm/page-components/cmq/userQuery/` 를 직접 읽어 확인했다. 백엔드는 이 워크트리에 없어 **be 머지 뒤 대조 필요(미확인)** 이다.

## 1. 식별자·권한

| 항목 | 스펙 | 구현 | 문서 | 판정 |
|---|---|---|---|---|
| screenId, objId | `userQuery` | `SCREEN_ID = "userQuery"`(page.tsx) | 기능 §1 | 일치 |
| serviceId | `userQuery` | `USER_QUERY_ID`(api.ts), `meta.menuId` 도 같다 | BPMN §1 | 일치 |
| componentPath | `cmq/userQuery` | 폴더 `page-components/cmq/userQuery` | 기능 §1 | 일치 |
| action | `myList`, `getDef`, `run` | 같은 3종만 호출 | BPMN §2 | 일치 |
| 버튼 action | `run`(권한 `PERM_USRQ_USE`) | `action: "run"` | 기능 §2 | 일치 |
| 권한 세트 시드 | `PERM_USRQ_USE`, `myList,getDef,run` | FE 범위 밖 | BPMN §8 | 미확인(be 대기) |
| BPMN 파일, 서비스 빈 | `userQuery.bpmn`, `userQueryService` | 없음 | BPMN §1 | 미확인(be 대기) |

## 2. 요청·응답 키(api.ts 대 스펙 §4.2)

| 항목 | 스펙 | 구현 | 판정 |
|---|---|---|---|
| `myList` 요청 | 없음 | params 비어 있음 | 일치 |
| `myList` 응답 | `rows[{queryId,queryNm,categoryCd,queryDesc}]` | 같은 4키를 읽는다 | 일치 |
| `getDef` 요청 | `queryId` | `{ queryId }` | 일치 |
| `getDef` 응답 | `queryId,queryNm,categoryCd,queryDesc,params,columns,maxRowCnt` | 7키 모두 읽는다. `params`, `columns` 는 배열 또는 JSON 글자 둘 다 받는다 | 일치 |
| `run` 요청 | `queryId`, `paramsJson?` | 같다. 값이 없으면 `paramsJson` 을 싣지 않는다 | 일치 |
| `run` 응답 | `columns,rows,truncated,maxRowCnt` | `normalizeQueryResult` + `maxRowCnt`(없으면 0) | 일치 |
| 사용자 ID, SQL 전송 금지 | 보내지 않는다 | 보내지 않는다 | 일치 |
| `paramsJson` 4000자 이하 | 서버 검사 | FE 는 길이를 검사하지 않는다 | 미확인(be 대기) |
| 응답 해제 | `unwrapResult` | `_query/api` 의 `unwrapResult` | 일치 |
| 파일 위치 | `_userq/api.ts`, `_userq/types.ts`(스펙 §8.3) | `../../_userq/api`, `../../_userq/types`, `../../_userq/use-usrq-categories` 를 import 한다 | 일치(2026-10-10 `_userq` dev 반영 뒤 임시 사본을 지우고 import 를 교체했다) |

## 3. 화면 요소

| 항목 | 스펙 | 구현 | 판정 |
|---|---|---|---|
| 상단 버튼 | 스펙 §8.1 은 「조회 F8, 엑셀」 | 조회 버튼만 있다. 엑셀은 그리드 설정 메뉴 「엑셀 출력」 | 일치(2026-10-10 조정자가 스펙 §8.1 문구를 「조회 F8 action run, 엑셀 = 그리드 설정 메뉴」 로 갱신해 해소) |
| F8 | 조회 | `PageLayout` 이 primary 버튼에 F8 을 묶는다 | 일치 |
| 목록 폭 | 20%, 끌어서 조절 | `ContentPanel width="20%"`, `resizable` | 일치 |
| storageKey | `mcm.cmq.userQuery` | 같다 | 일치 |
| 마지막 queryId 키 | `mcm.cmq.userQuery.lastQueryId` | `LAST_QUERY_STORAGE_KEY` 같은 값, try/catch | 일치 |
| 조건 영역 | `SearchArea defaults={false}`, `ConditionField` | 같다 | 일치 |
| 그리드 | gridId `query-{queryId}`, `columnSizing="fit"`, `excelExport` | 같다 | 일치 |
| 엑셀 파일 이름 | `{쿼리 이름}_{yyyyMMdd}.xlsx` | `title` 과 `fallbackName` 전달. 날짜 붙임은 shared 가 한다(`AgDataGridExcel.tsx` 의 `excelFileName(title, today(), fallbackName)`, 주석 「{title}_{yyyyMMdd}.xlsx」) | 일치 |
| 자동 조회 | 하지 않는다 | 하지 않는다 | 일치 |

## 4. 문구

| 문구 | 스펙 | 구현 | 판정 |
|---|---|---|---|
| 목록 빔 | 할당된 쿼리가 없습니다. 관리자에게 요청하세요 | `NO_ASSIGNED_QUERY` | 일치 |
| 필수 값 | 조건을 입력하고 조회하세요 | `NEED_INPUT_MESSAGE` | 일치 |
| 잘림 | 상위 N행만 표시합니다 | `truncatedNote` | 일치 |
| 빈 결과 | 표시할 데이터가 없습니다 | `QUERY_EMPTY`(위젯 공용값) | 일치(`format.ts` 의 값을 대조했다) |
| 서버 오류 3종, 호출 빈도 | 스펙 §6 | FE 는 서버 문구를 그대로 보인다 | 미확인(be 대기) |

## 5. testid

| 문서 §5 의 testid | 코드 | 판정 |
|---|---|---|
| `uq-list`, `uq-list-filter`, `uq-list-empty`, `uq-list-nomatch`, `uq-item-{id}` | QueryListPane.tsx | 일치 |
| `uq-run`, `uq-run-idle`, `uq-run-loading`, `uq-run-error`, `uq-run-ready`, `uq-run-need-input`, `uq-empty`, `uq-excel` | RunPane.tsx | 일치 |

스펙에는 testid 규정이 없다. 이 문서가 코드를 기준으로 정한다.

## 6. 시험

`run-model.test.ts` 에 12개 케이스가 있다(필수 값, 조건 정의, 결과 열, 잘림, withoutRows, 목록). 2026-10-10 `vitest run page-components/cmq` 에서 12건 모두 통과했다. m-mcm 전체는 90파일·1740건 통과, tsc 의 cmq 오류는 0건, audit 은 8파일 의심 0건이다.

## 7. 참고 사항(불일치 아님)

- `run` 응답에 `maxRowCnt` 가 없으면 0 으로 읽고, `getDef` 에서는 1000 으로 읽는다. 화면은 `maxRowCnt` 를 표시하지 않는다.
- 정의 오류 상태는 다른 쿼리를 고르기 전까지 재시도 수단이 없다.
- `getDef` 의 `params[]` 는 FE 공용 파서(`paramsOf`)가 읽는 키 `default` 로 내려와야 한다. be 초기 구현은 `defaultValue` 였고(2026-10-10 대조에서 발견) be 가 스펙 모양으로 맞추기로 했다. be 머지 뒤 `params[].default` 단언 시험으로 닫는다.

## 8. 판정

| 항목 | 결과 |
|---|---|
| FE 구현 | 완료. 스펙과의 불일치 없음 |
| BPMN, 서비스, 시드 | be 머지 뒤 대조 필요(미확인) |
| 개발 착수 가능 여부 | 이미 구현 완료된 사후 작성 문서다. 착수 판정은 해당 없음. be 대조 대기 |

해소 조건: be 머지 뒤 BPMN설계서 §8 을 대조해 미확인 행을 닫는다.
