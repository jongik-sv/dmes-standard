# userQuery BPMN설계서 (공용 쿼리 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

> **be 머지 뒤 대조 필요(미확인).** 이 문서는 스펙 §4.2, §5~§7 에서 썼다. 백엔드 BPMN과 서비스는 이 워크트리에 없다(userq-be 레인). 실제 `userQuery.bpmn` 내용은 확인하지 않았고 추측해 적지 않았다.

## 1. 식별

| 항목 | 값 |
|---|---|
| serviceId | `userQuery` |
| 경로 | `POST /api/mcm/oasis/userQuery/{action}` |
| 본문 | `{ meta: { menuId: "userQuery" }, params: { … } }`. params 는 평평한 글자 값만 |
| BPMN 파일(스펙 기준) | `mcm/api/src/main/resources/services/cmq/userQuery.bpmn` |
| 서비스 빈 | `userQueryService`, 패키지 `com.dongkuk.dmes.mcm.userq`(mcm-core) |
| API 패턴 | OASIS BPMN + `@Service`(스펙 D5) |
| 권한 | 메뉴 OBJECT 권한. 권한키 `userQuery/{action}`. AUTH_ONLY 아님 |

## 2. 계약

| action | params | result(`data.result.{키}`) |
|---|---|---|
| `myList` | 없음 | `{ rows: [{ queryId, queryNm, categoryCd, queryDesc }] }` |
| `getDef` | `queryId` | `{ queryId, queryNm, categoryCd, queryDesc, params: QueryParam[], columns: TableColumnConfig[], maxRowCnt }`. SQL 은 싣지 않는다 |
| `run` | `queryId`, `paramsJson?`(`{"이름":"값"}` JSON 글자, 4000자 이하) | `{ columns: string[], rows: [{…}], truncated, maxRowCnt }` |

- serviceTask 는 모두 `output="result"` 이고 Map 을 돌려준다. 응답 키는 camelCase 이다.
- 사용자 ID 는 인증 컨텍스트(`WidgetUserContextResolver`)에서만 얻는다. 요청의 사용자 칸이나 `sql`, `sqlText` 칸은 읽지 않는다.

## 3. 처리 흐름

### 3.1 myList

1. 인증 컨텍스트에서 userId 를 얻는다.
2. 할당 표와 정의 표를 조인해 조회한다(`A.USER_ID = :userId`, `B.USE_YN = 'Y'`). 정렬은 분류, 이름, ID 순이다.
3. rows 를 돌려준다.

### 3.2 getDef

1. userId 를 얻는다.
2. 접근 확인(§4)을 한다. 실패하면 거절한다.
3. 정의에서 `PARAMS_JSON`, `COLUMNS_JSON` 을 읽어 배열로 풀어 돌려준다. `SQL_TEXT` 는 읽어도 싣지 않는다.

### 3.3 run

1. userId 를 얻는다.
2. 접근 확인(§4)을 한다. 실패하면 거절한다.
3. 호출 빈도를 확인한다(`WidgetUserQuota`). 넘으면 거절한다.
4. `paramsJson` 을 값 Map 으로 푼다.
5. `WidgetQueryRunner.run(sql, paramDefsJson, values, maxRows)` 를 부른다. SQL 은 DB 의 `SQL_TEXT` 만 쓴다.
6. 결과에 `maxRowCnt` 를 더해 돌려준다.

## 4. 접근 확인 순서

| 순서 | 확인 | 실패 문구 |
|---|---|---|
| 1 | userId 는 인증 컨텍스트에서 얻는다 | |
| 2 | 정의가 있다 | 「쿼리를 찾을 수 없습니다」 |
| 3 | `USE_YN = 'Y'` | 같은 문구 |
| 4 | 할당 행 `(queryId, userId)` 가 있다 | 같은 문구 |

세 실패를 같은 문구로 거절한다. 쿼리 존재 여부를 알리지 않기 위해서다. `getDef`, `run` 마다 DB 에서 다시 확인한다.

## 5. 실행 엔진 정책

| 항목 | 값 |
|---|---|
| 엔진 | `WidgetQueryRunner.run`(SqlGuard 검사, 입력 값 해석, 시스템 변수, `WidgetReadOnlyJdbc`) |
| 행 상한 | 정의의 `MAX_ROW_CNT`(기본 1000, 1~5000). 상한+1 행까지 읽고 넘으면 버리고 `truncated=true` |
| 시간 상한 | 10초(`QUERY_TIMEOUT_SEC`) |
| 호출 빈도 | 사용자당 1분 20회 |
| 캐시 | 사용하지 않는다 |
| 시스템 변수 | `:userId`, `:deptCd`, `:today`, `:bizDate` 등. 위젯과 같다 |

## 6. 오류 문구

| 원인 | 사용자 문구 | 서버 로그 |
|---|---|---|
| 정의 없음, 사용 중지, 미할당 | 쿼리를 찾을 수 없습니다 | queryId, userId |
| 입력 값 오류 | `BusinessException(INVALID_VALUE)` 문구 그대로 | |
| SQL, 입력 정의 오류 | 쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요 | 원인 |
| DB 오류, 시간 초과 | 조회하지 못했습니다. 관리자에게 문의하세요 | 원인 |
| 호출 빈도 초과 | 잠시 후 다시 조회하세요 | |

## 7. 트랜잭션

- 세 action 모두 읽기 전용이다.
- `@Service` 에 `@Transactional` 을 붙이지 않는다. BPMN process 에 `tx=txBiz` 를 두지 않는다.
- 실행은 `WidgetReadOnlyJdbc` 의 읽기 전용 트랜잭션이며 늘 롤백한다.
- 게이트웨이를 쓰면 sequenceFlow `name` 으로만 가른다.

## 8. be 머지 뒤 대조 항목

| 항목 | 확인할 것 |
|---|---|
| BPMN 파일 경로와 process id | 스펙 경로와 같은지 |
| action 3종과 output | `output="result"` |
| 서비스 메서드 | 접근 확인 순서, 문구 동일 |
| `allActions` 선언 | `myList`, `getDef`, `run` 포함 |
| `PERM_USRQ_USE` 시드 | actions `myList,getDef,run` |
| 응답 키 | 위 계약과 일치, `getDef` 에 SQL 없음 |
