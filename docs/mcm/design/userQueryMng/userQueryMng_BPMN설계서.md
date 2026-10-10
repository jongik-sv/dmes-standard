# userQueryMng BPMN설계서 (공용 쿼리 정의 관리)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

> **be 머지 뒤 대조 필요(미확인).** 이 문서는 스펙 §2, §3, §4.1, §5~§7 에서 썼다. 백엔드 BPMN과 서비스는 이 워크트리에 없다(userq-be 레인). 실제 `userQueryMng.bpmn` 내용은 확인하지 않았고 추측해 적지 않았다.

## 1. 식별

| 항목 | 값 |
|---|---|
| serviceId | `userQueryMng` |
| 경로 | `POST /api/mcm/oasis/userQueryMng/{action}` |
| 본문 | `{ meta: { menuId: "userQueryMng" }, params: { … } }`. params 는 평평한 글자 값만(숫자도 글자로 싣는다). 배열·객체는 `…Json` 글자 |
| BPMN 파일(스펙 기준) | `mcm/api/src/main/resources/services/csa/userQueryMng.bpmn` |
| 서비스 빈 | `userQueryMngService`, 패키지 `com.dongkuk.dmes.mcm.userq`(mcm-core) |
| API 패턴 | OASIS BPMN + `@Service`(스펙 D5) |
| 권한 | 메뉴 OBJECT 권한. 권한키 `userQueryMng/{action}`. AUTH_ONLY 아님. 기본 SYSADMIN × PERM_ALL |
| 표 | `TB_MCM_USRQ_DEF`, `TB_MCM_USRQ_ASSIGN`(`V13__user_query.sql`) |

## 2. 계약

| action | params | result(`data.result.{키}`) | 화면 호출 함수(`_userq/api.ts`) |
|---|---|---|---|
| `search` | `categoryCd?`, `keyword?`, `useYn?`, `ownerDept?`, `assignUser?` | `{ rows: [{ queryId, queryNm, categoryCd, ownerDeptCd, ownerDeptNm, useYn, maxRowCnt, assignCnt, uAt, uUsrId }] }` | `searchUserQueries` |
| `get` | `queryId` | `{ def: { queryId, queryNm, categoryCd, queryDesc, ownerDeptCd, ownerDeptNm, sqlText, paramsJson, columnsJson, maxRowCnt, useYn, ver, cAt, cUsrId, uAt, uUsrId } }` | `getUserQueryDef` |
| `save` | `queryId`, `queryNm`, `categoryCd?`, `queryDesc?`, `ownerDeptCd?`, `sqlText`, `paramsJson?`, `columnsJson?`, `maxRowCnt`, `useYn`, `ver?`(없으면 신규) | `{ queryId, ver }` | `saveUserQuery` |
| `delete` | `queryId`, `ver` | `{ deleted: 1, assignDeleted: n }` | `deleteUserQuery` |
| `previewQuery` | `sqlText`, `paramsJson?` | `{ columns: string[], rows: [{…}], truncated }`. 50행. DB 오류 문구를 그대로 | `previewUserQuery` |
| `validate` | `sqlText`, `paramsJson?` | `{ binds: string[] }`. 처음 나온 순서 | `validateUserQuery` |
| `searchAssign` | `queryId` | `{ rows: [{ userId, userNm, deptCd, deptNm, missingYn }] }` | `searchUserQueryAssigns` |
| `saveAssign` | `queryId`, `userIdsJson`(JSON 글자 배열, 전체 교체, 최대 2000) | `{ added, removed }` | `saveUserQueryAssigns` |
| `searchDepts` | `keyword` | `{ depts: [{ deptCd, deptNm, upperDeptCd }] }`. 코드·이름 앞부분 일치, 최대 50건 | `searchUserQueryDepts` |
| `searchUserList` | 없음 | `{ rows: [{ userId, userNm, deptCd, deptNm }], truncated }`. 사용 중 사용자, 최대 5000 | `searchUserQueryCandidates` |

- 화면은 빈 값(null, 빈 글자)을 params 에서 뺀다. 서버는 빠진 키를 null 로 읽어야 한다.
- `save` 의 `ver` 는 갱신 때만 싣는다. 화면은 `paramsJson`, `columnsJson` 이 빈 배열이면 싣지 않는다.
- 화면은 `get` 응답의 `paramsJson`, `columnsJson` 을 JSON 글자로 읽고 배열이어도 받는다.
- serviceTask 는 모두 `output="result"` 이고 Map 을 돌려준다. 응답 키는 camelCase, 날짜시각은 ISO 글자다.

## 3. 처리 흐름

### 3.1 search

1. 서비스가 `keyword`, `ownerDept`, `assignUser` 의 `%`, `_`, `\` 앞에 `\` 를 붙여 바인드한다. 담당 부서 원래 값은 `ownerDeptCd` 로 바인드한다. 빈 값은 null.
2. 스펙 §4.1 의 정적 SQL 을 실행한다(정의 + 부서 외부 조인 + 할당 수 서브쿼리, 할당 사용자 EXISTS). 정렬은 분류, 이름, ID 순이다.
3. rows 를 돌려준다.

### 3.2 get

1. `queryId` 로 정의를 읽는다. 없으면 거절한다.
2. 담당 부서 이름을 붙여 돌려준다. `ver` 를 포함한다.

### 3.3 save

1. `queryId` 형식 `^[A-Z][A-Z0-9_]{2,39}$` 을 검사한다(신규).
2. 신규(`ver` 없음)인데 같은 ID 가 있으면 거절한다. 갱신인데 `ver` 가 DB 와 다르면 거절한다(「다른 사람이 먼저 고쳤습니다. 다시 조회하세요」).
3. SQL 은 `validateSql(sql, 선언 이름)`, 입력 정의는 `QueryParams.parse`, 출력 정의는 스펙 §2.2 로 검사한다.
4. 저장하고 `{ queryId, ver }` 를 돌려준다. 쓰기 action 이므로 BPMN process 에 `tx=txBiz`.

### 3.4 delete

1. `ver` 를 확인한다.
2. 할당을 먼저 지우고 정의를 지운다. `{ deleted, assignDeleted }`. `tx=txBiz`.

### 3.5 previewQuery, validate

1. `sqlText`, `paramsJson` 을 `SqlGuard`, `QueryParams.parse` 로 검사한다.
2. `previewQuery` 는 `WidgetQueryRunner.run` 으로 50행까지 읽기 전용 실행한다. 입력 정의의 기본값으로 시험한다. DB 오류는 문구를 그대로 돌려준다(관리자 예외).
3. `validate` 는 SQL 의 사용자 바인드 이름을 처음 나온 순서로 돌려준다.

### 3.6 searchAssign, saveAssign, searchUserList

1. `searchAssign`: 할당 행에 사용자 표를 외부 조인해 이름·부서를 붙인다. 사용자 표에 없으면 `missingYn='Y'`.
2. `saveAssign`: `userIdsJson` 을 풀어 최대 2000 을 검사한다. 없는 사용자 ID 는 거절한다. 새 집합과 DB 집합의 차이만 INSERT, DELETE 한다. `tx=txBiz`.
3. `searchUserList`: 사용 중 사용자 최대 5000. 넘으면 `truncated=true`.

## 4. 트랜잭션

- 쓰기 action(`save`, `delete`, `saveAssign`)만 BPMN process 에 `tx=txBiz` 를 둔다.
- `@Service` 에 `@Transactional` 을 붙이지 않는다.
- 게이트웨이는 sequenceFlow `name` 으로만 가른다.

## 5. 오류와 문구

| 원인 | 문구 |
|---|---|
| 같은 ID 이미 있음(신규) | 서버 문구 |
| `ver` 불일치(갱신, 삭제) | 다른 사람이 먼저 고쳤습니다. 다시 조회하세요 |
| SQL, 입력 정의, 출력 정의 검사 실패 | 서버 문구(화면이 오류 창에 그대로 보인다) |
| 없는 사용자 ID 할당 | 서버 문구 |
| 미리보기 DB 오류 | DB 오류 문구 그대로 |

## 6. be 머지 뒤 대조 항목

| 항목 | 확인할 것 |
|---|---|
| BPMN 파일 경로와 process id | 스펙 경로와 같은지 |
| action 9종과 output | `output="result"`, 쓰기 3종만 `tx=txBiz` |
| 숫자 params | `ver`, `maxRowCnt` 가 글자 `"3"` 으로 와도 읽는지(화면이 모든 값을 글자로 싣는다) |
| 빠진 키 | `categoryCd`, `queryDesc`, `ownerDeptCd`, `paramsJson`, `columnsJson` 이 빠져도 null 로 읽는지 |
| `allActions` 선언 | `searchAssign`, `saveAssign`, `myList`, `getDef`, `run` 포함 |
| 권한 시드 | `userQueryMng` OBJECT 가 SYSADMIN × PERM_ALL. 버튼 action(`search`, `save`, `delete`, `saveAssign`)이 모두 허용 |
| `search` 응답 | `assignCnt`, `ownerDeptNm`, `uAt` 포함 |
| `get` 응답 | `paramsJson`, `columnsJson` 이 JSON 글자 |
| `searchDepts` | 담당 부서 팝업이 부른다(조정 2026-10-10, be 에 추가 요청). params `keyword`, result `{ depts: [{ deptCd, deptNm, upperDeptCd }] }` 최대 50건, `commWidgetMng/searchDepts` 와 같은 모양. `allActions` 선언 포함 확인 |
