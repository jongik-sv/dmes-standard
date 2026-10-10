# userQuery BPMN설계서 (맞춤 레포트 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

> **be 대조 완료(2026-10-10, `feat/userq-be` @ `75a94dd95`, 아직 dev 에 없음).** 이 문서는 스펙 §4.2, §5~§7 에서 썼고, §8 의 대조 항목을 백엔드 코드로 닫았다. 남은 불일치는 없다(`run` 의 순서는 문서 정정으로 닫았다).

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
2. 호출 빈도를 확인한다(`WidgetUserQuota`, 20회/분). 넘으면 거절한다. 쿼터는 접근 확인보다 먼저 소모된다(미할당·없는 ID 호출도 센다). 존재 여부는 새지 않는다.
3. 접근 확인(§4)을 한다(존재, 사용, 할당). 실패하면 거절한다.
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

근거 경로는 `src/backend/` 아래다. BPMN = `mcm/api/src/main/resources/services/cmq/userQuery.bpmn`, 서비스 = `mcm-core/src/main/java/com/dongkuk/dmes/mcm/userq/service/UserQueryService.java`, 시드 = `mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/`.

| 항목 | 확인할 것 | 판정, 근거 |
|---|---|---|
| BPMN 파일 경로와 process id | 스펙 경로와 같은지 | 일치. 경로 `services/cmq/userQuery.bpmn`, process id `userQuery`(BPMN:3), 게이트웨이 `input=action`(BPMN:11), process 에 `tx` 속성 없음(§7 과 같다) |
| action 3종과 output | `output="result"` | 일치. sequenceFlow 이름 `myList`, `getDef`, `run`(BPMN:62-66), serviceTask 3개 모두 `camunda:class="userQueryService"`, `output="result"`, dto `UserQueryRequest` |
| 서비스 메서드 | 접근 확인 순서, 문구 동일 | 일치(문서 정정: §3.3 을 호출 빈도 → 접근 확인으로 고쳤다). `assignedDef`(`UserQueryService.java:140-148`)가 정의 없음, `USE_YN`, 할당 행을 한 문구 「쿼리를 찾을 수 없습니다」(`:150-152`)로 거절하고 `getDef`, `run` 마다 DB 에서 확인한다. 사용자 ID 는 `userResolver.current()` 에서만 얻고(`:133-135`) DTO 에 사용자·SQL 칸이 없다(`dto/UserQueryRequest.java:9-10`). **`run` 은 호출 빈도 확인(`:109-111`)을 접근 확인(`:112`)보다 먼저 한다.** (고친 §3.3 과 같은 순서다.) 미할당·없는 ID 호출도 사용자 쿼터 20회를 쓰고, 한도 초과 사용자는 쿼리 존재와 무관하게 「잠시 후 다시 조회하세요」를 받는다. 존재 여부가 새지는 않는다. |
| `allActions` 선언 | `myList`, `getDef`, `run` 포함 | 일치. `CoreRbacSeeder.java:149` |
| `PERM_USRQ_USE` 시드 | actions `myList,getDef,run` | 일치. `CoreRbacSeeder.java:172-181` `PERMISSION_COMMON`, `PERMISSION_ACTION` 모두 `myList,getDef,run`, insert-if-absent. 메뉴는 `ModuleMenuSeeder.java:149` 폴더 `cmq`(「맞춤 레포트」), `:161-163` leaf 「맞춤 레포트 조회」(FULL_SEQ 1070100), SYSADMIN × PERM_ALL 만 시드(일반 역할 매핑은 운영자 몫) |
| 응답 키 | 위 계약과 일치, `getDef` 에 SQL 없음 | 일치. `myList` 4키(`UserQueryService.java:76-82`), `getDef` 7키(`:93-99`, SQL 없음. `UserQueryBpmnTest.java:148` 가 `sqlText` 부재 단언), `run` 4키(`:124-127`). `params[]` 는 `{name,label,type(소문자),default,required,options[{value,label}]}`(`:172-192`, `UserQueryBpmnTest.java:149-154` 단언) |
