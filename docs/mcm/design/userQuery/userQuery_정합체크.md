# userQuery 정합체크 (맞춤 레포트 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

판정: 일치 / 불일치 / 미확인(be 대기). 구현은 `src/frontend/m-mcm/page-components/cmq/userQuery/` 를 직접 읽어 확인했다. 백엔드는 2026-10-10 userq-be 레인(`feat/userq-be` @ `75a94dd95`, 아직 dev 에 없음)의 코드를 읽어 대조했다. 근거는 `src/backend/` 아래 파일:줄이다.

## 1. 식별자·권한

| 항목 | 스펙 | 구현 | 문서 | 판정 |
|---|---|---|---|---|
| screenId, objId | `userQuery` | `SCREEN_ID = "userQuery"`(page.tsx) | 기능 §1 | 일치 |
| serviceId | `userQuery` | `USER_QUERY_ID`(api.ts), `meta.menuId` 도 같다 | BPMN §1 | 일치 |
| componentPath | `cmq/userQuery` | 폴더 `page-components/cmq/userQuery` | 기능 §1 | 일치 |
| action | `myList`, `getDef`, `run` | 같은 3종만 호출 | BPMN §2 | 일치 |
| 버튼 action | `run`(권한 `PERM_USRQ_USE`) | `action: "run"` | 기능 §2 | 일치 |
| 권한 세트 시드 | `PERM_USRQ_USE`, `myList,getDef,run` | FE 범위 밖 | BPMN §8 | 일치(be 대조: `mcm/api/.../init/seed/CoreRbacSeeder.java:172-181` `PERMISSION_COMMON`·`PERMISSION_ACTION` 모두 `myList,getDef,run`. 3토큰은 `allActions` 에도 있다 `:149`) |
| BPMN 파일, 서비스 빈 | `userQuery.bpmn`, `userQueryService` | 없음 | BPMN §1 | 일치(be 대조: `mcm/api/src/main/resources/services/cmq/userQuery.bpmn:3` process id `userQuery`, serviceTask 3개 `camunda:class="userQueryService"`, `mcm-core/.../mcm/userq/service/UserQueryService.java:44` `@Service("userQueryService")`) |

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
| `paramsJson` 4000자 이하 | 서버 검사 | FE 는 길이를 검사하지 않는다 | 일치(be 대조: `run` 이 `QueryParams.parseValues(req.getParamsJson())` 를 부르고(`UserQueryService.java:113`), 이 메서드가 4000자(`QueryParams.java:48` `VALUES_JSON_MAX`) 초과를 「입력 조건 값이 너무 깁니다.」로 거절한다(`QueryParams.java:217`)) |
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
| 서버 오류 3종, 호출 빈도 | 스펙 §6 | FE 는 서버 문구를 그대로 보인다 | 일치(be 대조: 찾을 수 없음 `UserQueryService.java:150-152`, 정의 오류 「쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요」·DB 오류 「조회하지 못했습니다. 관리자에게 문의하세요」 `WidgetQueryRunException.java:22-23,45-47` 를 `run` 이 `:121` 에서, `getDef` 가 `:163-164` 에서 던진다. 호출 빈도 사용자당 1분 20회 `:47,109-111`, 시험 `UserQueryServiceOraTest.java:141-175`. 서버 로그에는 원인만 남기고 응답에 싣지 않는다 `:119`) |

## 5. testid

| 문서 §5 의 testid | 코드 | 판정 |
|---|---|---|
| `uq-list`, `uq-list-filter`, `uq-list-empty`, `uq-list-nomatch`, `uq-item-{id}` | QueryListPane.tsx | 일치(2026-10-10 이전 기록. 지금 testid 는 §7-1) |
| `uq-run`, `uq-run-idle`, `uq-run-loading`, `uq-run-error`, `uq-run-ready`, `uq-run-need-input`, `uq-empty`, `uq-excel` | RunPane.tsx | 일치 |

스펙에는 testid 규정이 없다. 이 문서가 코드를 기준으로 정한다.

## 6. 시험

`run-model.test.ts` 에 12개 케이스가 있다(필수 값, 조건 정의, 결과 열, 잘림, withoutRows, 목록). 2026-10-10 `vitest run page-components/cmq` 에서 12건 모두 통과했다. m-mcm 전체는 90파일·1740건 통과, tsc 의 cmq 오류는 0건, audit 은 8파일 의심 0건이다.

## 7. 참고 사항(불일치 아님)

- `run` 응답에 `maxRowCnt` 가 없으면 0 으로 읽고, `getDef` 에서는 1000 으로 읽는다. 화면은 `maxRowCnt` 를 표시하지 않는다.
- 정의 오류 상태는 다른 쿼리를 고르기 전까지 재시도 수단이 없다.
- `getDef` 의 `params[]` 는 FE 공용 파서(`paramsOf`)가 읽는 키 `default` 로 내려와야 한다. be 초기 구현은 `defaultValue` 였고(2026-10-10 대조에서 발견) be 가 스펙 모양으로 맞추기로 했다. be 머지 뒤 `params[].default` 단언 시험으로 닫는다. → 닫음(be 대조: `UserQueryService.java:179` 가 `default` 키를 내리고 `UserQueryBpmnTest.java:152-154` 가 `default`=`"3"` 단언과 `defaultValue` 부재 단언을 한다).

## 7-1. 2026-10-10 이름 변경·N3~N6 반영

옛 이름(공용 쿼리 조회, 쿼리 정의 관리, 공용 조회)은 이 문서 묶음에서 모두 「맞춤 레포트 조회」 계열로 바꿨다. 아래 항목은 코드(`page-components/cmq/userQuery/`, `UserQueryService.java`)를 다시 읽어 대조했다. 위 표의 옛 행은 그대로 둔다.

| 항목 | 코드 | 문서 | 판정 |
|---|---|---|---|
| N3 왼쪽 | 조회조건 Form(`SearchArea autoSearch`: 분류 select 전체 포함, 이름 text, [조회]·Enter) + 목록 Grid(`GridPanel` 「쿼리 목록」, 이름·분류·쿼리 ID). `myList` 결과를 client-side 로 거른다. 20% 폭에서 세로로 쌓는다 | 디자인 §1·§2·§5, 기능 §3·§5 | 일치 |
| N3 testid | `uq-list`, `uq-list-filter`, `uq-list-search`, `uq-list-empty`. 옛 `uq-item-{id}`, `uq-list-nomatch` 는 없다 | 디자인 §5 | 일치(위 §5 는 갱신 전 기록이다. 이 행이 우선한다) |
| N5 빈 그리드 | 쿼리를 고르면 `definedColumns(getDef.columns)` 로 0행 그리드를 바로 그린다. 열 정의 참조가 안정적이라 조회 때 행만 바뀐다. 출력 열이 없으면 조회 뒤 그린다. 빈 문구는 「조건을 확인하고 조회하세요」·「조건을 입력하고 조회하세요」. 쿼리를 바꾸면 이전 행을 비운다 | 디자인 §2~§4, 기능 §4·§5 | 일치 |
| N4 설정 메뉴 | 결과 그리드 `personalize={false}`, `resetColumnsMenu={false}`. 메뉴는 「칸별 필터 보기」와 「엑셀 출력」뿐. `resetColumnsMenu` 는 shared `AgDataGrid` 의 새 선택 prop(기본 `true`) | 디자인 §2, 기능 §2 | 일치 |
| N6 실행 로그 | 성공 때 INFO 두 줄(요약 + SQL 본문). 별도 표 없음. 실패는 WARN. 응답·예외 문구 불변 | 기능 §7 | 일치(`UserQueryService.java:145-147`) |
| 시험 | `run-model.test.ts` 케이스를 다시 세면 16개다(`definedColumns`, 목록 거르기 등 추가). 위 §6 의 12건은 당시 기록이다 | 정합체크 §6 | 미확인(이번에 시험을 돌리지 않았다) |

## 8. 판정

| 항목 | 결과 |
|---|---|
| FE 구현 | 완료. 스펙과의 불일치 없음 |
| BPMN, 서비스, 시드 | be 대조 완료(`75a94dd95`). `run` 의 호출 빈도 → 접근 확인 순서는 일치(문서 정정, BPMN설계서 §3.3, §8). 사용자에게 보이는 문구와 응답 키는 모두 일치 |
| 개발 착수 가능 여부 | 이미 구현 완료된 사후 작성 문서다. 착수 판정은 해당 없음. be 대조 대기 |

해소 조건: be 머지 뒤 BPMN설계서 §8 을 대조해 미확인 행을 닫는다. → 2026-10-10 `75a94dd95` 기준으로 닫았다. be 가 dev 에 머지될 때 커밋이 바뀌면 다시 대조한다.
