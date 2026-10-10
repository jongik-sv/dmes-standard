# DB 설계 도구(ERD) 설계 — 기반 + P1 + P2

- 작성일: 2026-10-10
- 상태: 설계 확정(사용자 승인). 다음 단계는 구현 계획(writing-plans)이다.
- 앞선 문서: [구상](2026-10-09-erd-tool-concept.md), [연구 보고서](../../erd-tool/2026-10-09-erd-tool-research.md)
- 미룬 기능: [docs/erd-tool/deferred.md](../../erd-tool/deferred.md). 이 스펙 범위 밖의 기능은 모두 그 문서에 있다.
- 화면 시안: [docs/erd-tool/mockup/erd-designer-mockup.html](../../erd-tool/mockup/erd-designer-mockup.html) (브라우저로 열면 동작한다. MCM 메뉴·권한 표를 예시로 쓴다)

## 0. 목표와 범위

### 0.1 목표

- MDM 의 단어 사전·도메인·컬럼 사전을 쓰는 ERD 도구를 만든다. 편집 사용성은 exERD 를 따른다.
- 표준 위반을 나중에 검사하는 데서 그치지 않고, 입력하는 순간 경고한다.
- 여러 사람과 여러 LLM 세션(Claude Code, MCP 를 지원하는 다른 도구)이 같은 모델을 동시에 고친다. 사람은 화면으로, LLM 은 MCP·CLI 로 고친다.
- 열려 있는 화면에는 다른 사람과 LLM 의 변경이 바로 보인다. LLM 은 사용자가 화면에서 보고 있는 곳을 알 수 있다.

### 0.2 이 스펙의 범위

| 단계 | 내용 |
|---|---|
| 기반 | 저장 표, MDM 버전 객체 연결, 명령 엔진, 명령 기록, 실시간 채널 |
| P1 가져오기·뷰어 | DB 가져오기, 관계 추정과 검토, 표준 검사, 캔버스·그리드 보기, MCP 읽기 도구, 화면 선택 상태 공유 |
| P2 편집·동시 편집 | exERD 방식 편집, 공동 편집, MCP·CLI 쓰기, 되돌리기, 다시 가져오기 차이, 확정 요청 |

범위 밖: Flyway V 초안 생성(P3), drift 검사, 파일 가져오기, 글자 단위 동시 편집(CRDT), 운영 인증 등. 목록과 미룬 이유는 deferred.md 에 있다.

## 1. 결정 기록

2026-10-10 브레인스토밍에서 정했다.

| # | 주제 | 결정 | 근거·대안 |
|---|---|---|---|
| D1 | 정본 | 중간안. 모델은 설계 정본, Flyway V 파일은 적용 정본이다. 모델 변경은 V 초안(P3)으로 나오고 사람이 확정한다 | 연구 7.3절·10.1절 |
| D2 | MDM 버전 객체 | 모듈(스키마) 하나 = `ERD_MODEL` 버전 객체 하나 | 버전 엔진이 객체 ID 하나를 키로 쓴다. 모듈 사이 FK 금지(ADR 0003)와 경계가 맞는다 |
| D3 | exERD 동작 | 4묶음 모두: 논리·물리 전환과 보기 프리셋, 관계 긋기로 FK 자동 생성, 키보드 편집과 찾기, 큰 모델 처리와 삭제 구분 | 연구 2.3절. 나머지는 deferred 11~14번 |
| D4 | 저장 위치 | DB 를 작업 정본으로 둔다. V 초안을 만들 때(P3) 모델의 텍스트 스냅샷을 함께 커밋한다 | 연구 10.2절 4번 |
| D5 | 버전 안 저장 형식 | `_VER` 표의 JSON 문서 하나(`MODEL_JSON`) | 사용자 선택. 정규화 자식 표 안은 채택하지 않았다 |
| D6 | 다이어그램 위치·구성 | 버전 밖에 둔다. 표를 옮기는 데 DRAFT 가 필요 없다 | exERD 도 시각 변경과 모델 변경을 나눈다 |
| D7 | DB FK | 관계마다 `dbFk` 로 정한다. 모듈 사이 관계는 항상 논리 관계다 | ADR 0003 |
| D8 | 모듈 사이 관계 | 자식 표가 있는 모델이 관계를 가진다. 부모는 (모델, 표 UUID, 컬럼 UUID)로 가리키고, 캔버스에는 회색 참조 노드로 그린다 | |
| D9 | 추정 관계 | P1 에서 추정해 점선으로 그린다. 상태는 DB / 추정 / 사람 확정 / 기각 | MCM 은 FK 가 0개다(연구 4절) |
| D10 | 다시 가져오기 | DB 와 모델의 차이를 목록으로 보여 주고, 사람이 고른 항목만 DRAFT 에 넣는다. 관계의 확정·기각은 유지한다 | |
| D11 | 가져오기 원천 | DB 역공학만 한다 | 사내에 가져올 설계 파일이 거의 없다(deferred 7번) |
| D12 | CLI·MCP 인증 | 로컬 전용. X-Client-Key 와 사용자 헤더를 쓴다 | 개발 기간 보안 정비 보류 방침(deferred 19번) |
| D13 | 화면 위치 | m-mdm 새 메뉴. 백엔드는 MDM 서버 | 사전·버전 엔진·캔버스 의존성이 모두 MDM 에 있다 |
| D14 | 화면 선택 상태 공유 | 범위에 넣는다. 화면이 보고 있는 다이어그램과 선택한 표를 서버에 알리고, MCP `getCurrentView` 로 읽는다 | |
| D15 | 동시 편집 | 범위에 넣는다. DRAFT 에 공동 편집자를 둔다. 확정 요청은 소유자만 한다 | |
| D16 | 동시 편집 방식 | 서버가 판정하는 명령 + 화면 먼저 반영 + 속성 단위 충돌 거절. CRDT 는 쓰지 않는다 | CRDT 는 서버의 표준 판정과 맞지 않는다(deferred 22번) |
| D17 | 여러 LLM | 세션별 이름, `getChangesSince(rev)`, 표 단위 작업 중 표시(권고용, 만료 있음) | |
| D18 | 되돌리기 | 변경 기록에서 명령을 골라 역명령을 새 명령으로 보낸다. Ctrl+Z 는 내 마지막 명령. 뒤에 같은 속성이 바뀌었으면 충돌로 거절한다 | 시점 되돌리기는 deferred 23번 |
| D19 | 확정 검사 | 직전 RELEASED 와 비교해 이번 DRAFT 에서 추가·변경한 컬럼에 표준 위반이 있으면 확정을 막는다. 가져온 기존 위반은 경고만 한다 | 기존 표에는 위반이 많아서 모두 막으면 확정할 수 없다 |
| D20 | 범위 | 기반 + P1 + P2 를 스펙 하나로 쓴다. 구현 계획은 단계 0·1·2 로 나눈다 | 사용자 선택 |

## 2. 전체 구조

```
[m-mdm ERD 화면] ──명령(HTTP)──┐            ┌─ SSE: rev 변경·접속자·선택 상태·작업 중 표시 ─→ 모든 화면
[erd-mcp.mjs]  ──명령(HTTP)──┼─→ ERD 명령 서비스 ─┤
[erd-cli.mjs]  ──명령(HTTP)──┘     │        └─ 명령 기록(rev, 사용자, 세션, 출처, 역명령)
                                    ├─ 표준 검사기 (묶음 판정, 사전 캐시)
                                    ├─ DB 가져오기 + 관계 추정기 + 다시 가져오기 차이
                                    └─ 버전 엔진 (ERD_MODEL 대상, 공동 편집자)
```

화면, MCP, CLI 는 같은 명령 API 를 쓴다. 화면에만 있는 편집 로직을 만들지 않는다. 그래야 LLM 의 편집도 표준 검사, 권한, 충돌 판정을 똑같이 거친다.

### 2.1 백엔드 (MDM 서버)

1. **저장 표:** 3절에 정의한다.
2. **명령 서비스:**
   1. 모델 버전 행을 잠가서 모델 단위로 명령을 하나씩 처리한다.
   2. 권한을 확인한다(소유자 또는 공동 편집자).
   3. 속성 단위 충돌을 검사한다(4.3절).
   4. 구조를 검증하고 표준을 검사한다.
   5. 명령을 적용하고, rev 를 1 올리고, 명령 기록에 역명령과 함께 남기고, SSE 로 알린다.

   모든 명령에는 사용자 ID, 세션 이름, 출처(화면 / MCP / CLI)가 붙는다. 권한은 사용자 ID 로 판정한다.
3. **표준 검사기:** `ColumnNameComposer`·`DomainSuggester` 를 사전 캐시와 함께 감싸서, 컬럼 수백 개를 한 번에 판정한다. 지금 `columnMng/compare` 는 요청마다 사전을 새로 읽으므로 그대로 쓰지 않는다. 판정 결과는 표준 / 별칭 / 타입 불일치 / 도메인 / 사전 없음이다.
4. **가져오기:**
   - analog DB 뷰어(`DbViewerController`)의 메타 조회를 바탕으로 코멘트, 복합 FK 의 컬럼 짝, 인덱스, 기본값까지 읽는 ERD 전용 메타 조회를 만든다. 이 조회는 딕셔너리 뷰(`ALL_TABLES`·`ALL_TAB_COLUMNS`·`ALL_CONSTRAINTS` 등)만 읽고 행 데이터는 읽지 않는다. 그래서 뷰어의 200건 제한과 민감 칼럼 차단을 적용하지 않는다. 기존 뷰어의 동작은 바꾸지 않는다.
   - 관계 추정 순서: DB FK → 리포의 dbml 문서 → SQL 조인(Java 문자열·mapper XML) → 칼럼명 규칙(다른 표의 PK·UK 와 같은 이름, 감사 칼럼 제외).
   - 허브 칼럼(`USER_ID` 처럼 부모 후보가 여럿)은 이름이 가장 가까운 부모 하나만 점선으로 그리고, 나머지는 "다른 후보 n개" 로 접는다.
   - 논리명은 컬럼 사전과 시스템별 별칭(`TB_MDM_COLUMN_SYSTEM`)을 대조해 채운다. 사전에 없는 토막은 `***` 로 둔다.
   - 다시 가져오기는 DB 와 모델의 차이 목록(표·컬럼 추가, 사라짐, 타입 변경)을 돌려준다.
5. **실시간 채널(SSE):** rev 변경, 접속자(사람과 LLM 세션), 각 세션이 보는 다이어그램과 선택한 표, 작업 중 표시를 보낸다.
6. **버전 엔진 연결:**
   - `VersionTarget` 에 `ERD_MODEL` 을 추가한다.
   - 확정 검사 SPI(D19), DRAFT 삭제 SPI, 확정 취소 검사를 구현한다. 구현이 없으면 엔진이 fail-closed 로 막는다.
   - DRAFT 쓰기 때 `VersionWriteGuard.beginDraftWrite` 의 소유자 검사(MDM003)를, `ERD_MODEL` 대상에 한해 "소유자 또는 공동 편집자" 로 넓힌다. 다른 대상(MASTER_CODE, BUSINESS_RULE, RULE_SET, LAYOUT)의 동작은 바꾸지 않는다.
   - 새 DRAFT 를 만들 때 직전 RELEASED 의 `MODEL_JSON` 을 그대로 복사한다. 요소 UUID 는 바뀌지 않는다.
   - 화면은 기존 `VersionActionBar` 를 다시 쓴다.

### 2.2 프론트엔드 (m-mdm 새 메뉴)

- 화면은 위 막대, 왼쪽 업무영역·다이어그램 목록, 가운데 캔버스, 오른쪽 컬럼 그리드, 아래 검토 패널로 이루어진다(시안 참조).
- 새로 만드는 부품: 컬럼 목록을 보여 주는 표 노드, 컬럼 행끼리 잇는 관계선과 끝 모양(1, 0..N), 접속자 이름표.
- 룰 세트 편집기의 캔버스 부품 가운데 업무와 무관한 것(`react-flow.ts`, `route-path.ts`, `snap.ts`, `viewport-guard.ts`, `ContextMenu.tsx`, 손본 `shortcuts.ts`·`FindWidget.tsx`·`ViewportGuard.tsx`)은 `@dk-oasis/shared` 로 **복사**해 쓴다. 룰 세트 편집기는 건드리지 않는다(정리는 deferred 15번).
- 새 메뉴로 등록한다. 기존 메뉴를 고치지 않는다.

### 2.3 Claude 연동 (`scripts/erd/`, node `.mjs`)

- `erd-cli.mjs`: 기본이 dry-run 이고 `--apply` 를 줄 때만 저장한다(`scripts/mdm-meta/register-columns.mjs` 선례). 윈도우에서도 돈다.
- `erd-mcp.mjs`: stdio MCP 서버. 명령 API 를 감싸기만 한다. 실행할 때 사용자 ID 와 세션 이름을 받는다.

| 구분 | MCP 도구 |
|---|---|
| 읽기 | `getModelText(diagram?)`, `getCurrentView`, `getChangesSince(rev)`, `listViolations`, `listInferredRelations`, `getDbDiff` |
| 쓰기 | `apply(baseRev, commands)`, `confirmRelation`, `rejectRelation`, `undo(rev)` |
| 세션 | `claimTable`, `releaseTable` |

`getModelText` 는 DBML 비슷한 간결한 텍스트를 돌려준다.

```
TB_MCM_SEC_MENU 메뉴 {
  MENU_ID 메뉴아이디 VARCHAR2(30) PK [아이디]
  START_ACTIVE_DATE 유효시작일자 VARCHAR2(255) [일자] !도메인
}
```

## 3. 데이터

### 3.1 버전 안: `MODEL_JSON`

모델 버전 표(`_VER`)의 CLOB 열 하나에 모듈 하나의 모델 전체를 둔다. `IS JSON STRICT` 검사를 건다(룰 세트 `FLOW_JSON` 과 같은 방식).

```json
{
  "schemaVersion": 1,
  "model": { "module": "mcm", "schema": "MCMAPUSER" },
  "tables": {
    "t-6f1c…": { "phys": "TB_MCM_SEC_MENU", "logical": "메뉴", "comment": "",
                 "columnOrder": ["c-a1…", "c-b2…"],
                 "_rev": { "logical": [213, "claude-erd-a"] } }
  },
  "columns": {
    "c-a1…": { "table": "t-6f1c…", "phys": "MENU_ID", "logical": "메뉴아이디",
               "domainId": 12, "dataType": "VARCHAR2", "length": 30, "scale": null,
               "notNull": true, "default": null, "comment": "", "_rev": {} }
  },
  "keys": {
    "k-…": { "table": "t-6f1c…", "kind": "PK", "name": "PK_TB_MCM_SEC_MENU", "columns": ["c-a1…"] }
  },
  "relations": {
    "r-…": { "child": "t-6f1c…", "parent": "t-90ab…", "pairs": [["c-b2…", "c-77…"]],
             "identifying": false, "cardinality": { "parent": "ONE", "child": "ZERO_OR_MORE" },
             "state": "INFERRED", "dbFk": false,
             "evidence": [{ "kind": "DOC", "ref": "docs/mcm/erd/csa-menu.dbml:494" },
                          { "kind": "NAME_RULE", "ref": "PK 이름 일치" }],
             "parentRef": null }
  }
}
```

- 모든 요소의 키는 UUID 다. 이름을 바꿔도 UUID 는 그대로이므로, P3 에서 변경을 RENAME 으로 알아볼 수 있다.
- `_rev` 는 속성마다 마지막으로 바뀐 [rev, 세션 이름] 을 가진다. 속성 단위 충돌 판정(4.3절)에 쓴다.
- `kind` 는 PK / UK / IX 다.
- 관계 `state` 는 `DB` / `INFERRED` / `CONFIRMED` / `REJECTED` 다. 기각한 관계도 지우지 않는다. 그래야 다시 가져와도 같은 추정이 되살아나지 않는다.
- `evidence.kind` 는 `DB_FK` / `DOC` / `SQL_JOIN` / `NAME_RULE` 이다.
- 모듈 사이 관계는 `parentRef: { "model": …, "table": …, "columns": [...] }` 로 가리키고 `dbFk` 는 항상 false 다.
- **표준 상태는 저장하지 않는다.** 읽을 때 계산하고 (버전, rev) 를 키로 메모리에 캐시한다. 사전이 바뀌어도 저장된 값이 낡지 않게 하기 위해서다.
- 크기는 MCM(표 55개) 기준 수백 KB 로 예상한다. 명령을 하나씩 처리하므로 명령마다 CLOB 을 다시 써도 된다.

### 3.2 새 표

이름은 ADR 0001(`TB_MDM_*`, `PK_`·`FK_`·`UX_`·`IX_`·`CK_`, 감사 9칼럼)을 따른다. Flyway 번호는 `flyway-migration-add` 스킬로 채번한다. 아래 이름은 안이며, 구현 계획에서 확정한다.

| 표(안) | 버전 | 내용 |
|---|---|---|
| `TB_MDM_ERD_MODEL` | — | 모델(모듈당 1행): 모델 ID, 모듈, 스키마, 이름 |
| `TB_MDM_ERD_MODEL_VER` | 안 | 버전 번호, 상태, 소유자, `MODEL_JSON`, `REV`, `ROW_VERSION`, 적용 기간 등(룰 세트 `_VER` 과 같은 골격) |
| `TB_MDM_ERD_EDITOR` | 안 | 공동 편집자: 모델, 버전, 사용자 |
| `TB_MDM_ERD_CMD_LOG` | 밖 | 명령 기록: 모델, 버전, rev, 사용자, 세션 이름, 출처, 명령 JSON, 역명령 JSON, 결과, 시각 |
| `TB_MDM_ERD_DIAGRAM` | 밖 | 다이어그램: 모델, 다이어그램 ID, 업무영역 이름, 다이어그램 이름, 정렬 순서 |
| `TB_MDM_ERD_DIAGRAM_NODE` | 밖 | 다이어그램 위 표: 다이어그램, 표 UUID, x, y, 접기(없음 / PK·FK 만 / 이름만) |
| `TB_MDM_ERD_CLAIM` | 밖 | 작업 중 표시: 모델, 표 UUID, 세션, 만료 시각 |

- 지금 보는 버전에 없는 표의 노드는 그리지 않는다. 그래서 RELEASED 버전과 DRAFT 가 같은 다이어그램을 쓴다.
- 접속자와 선택 상태는 서버 메모리에만 두고 일정 시간이 지나면 지운다. MDM 서버를 여러 대로 띄우는 경우는 이 스펙에서 다루지 않는다(5절 확인 항목).

## 4. 명령과 동작

### 4.1 명령

모든 쓰기는 `apply({ baseRev, commands: [...] })` 하나로 들어온다. 묶음은 전부 성공하거나 전부 실패하고, 한 번에 200건까지 받는다.

| 분류 | 명령 |
|---|---|
| 표 | `addTable`, `updateTable`(phys·logical·comment), `deleteTable` |
| 컬럼 | `addColumn`, `updateColumn`(속성 일부만), `moveColumn`, `deleteColumn`, `applyDomain` |
| 키 | `setPrimaryKey`, `addKey`, `updateKey`, `deleteKey` |
| 관계 | `addRelation`, `updateRelation`, `confirmRelation`, `rejectRelation`, `deleteRelation` |
| 다이어그램 | `addDiagram`, `updateDiagram`, `deleteDiagram`, `placeTables`, `moveNodes`, `setFold`, `removeFromDiagram` |
| 가져오기 | `importFromDb`(모델을 처음 만들 때), `applyDbDiff`(고른 항목만). 서버 안에서 위 명령으로 풀어서 처리한다 |
| 세션(기록하지 않음) | `setView`, `claimTable`, `releaseTable` |

- `addColumn` 에 논리명만 주면, 서버가 표준 검사기 결과로 물리명과 도메인을 채운다. 단, 후보가 하나일 때만 채우고, 여럿이면 응답에 후보 목록을 담는다.
- `addRelation` 은 부모 PK 컬럼을 자식에 복사한다. 식별 관계면 복사한 컬럼을 자식 PK 에 넣는다. 자식에 같은 이름의 컬럼이 있으면 응답으로 선택을 요구한다(화면은 선택 창을 띄운다).
- 다이어그램 명령은 버전 밖 표를 고친다. 그래도 명령 기록과 SSE 는 똑같이 거친다.
- 삭제는 둘로 나눈다. `removeFromDiagram`(Delete 키)은 다이어그램에서만 빼고, `deleteTable`(Alt+Delete)은 모델에서 지운다.

### 4.2 판정

| 단계 | 조건 | 결과 |
|---|---|---|
| 거절 | 같은 표 안 물리명 중복, Oracle 식별자 규칙 위반, 없는 요소 참조, 모듈 사이 관계에 `dbFk=true`, 묶음 200건 초과 | `INVALID`. 반영하지 않는다 |
| 충돌 거절 | 4.3절 | `CONFLICT` 또는 `NOT_FOUND` |
| 권한 | 소유자·공동 편집자가 아님, DRAFT 가 아님 | `NOT_EDITOR` |
| 경고 | 표준 위반(사전 없음, 도메인 다름, 타입 불일치), 다른 세션이 작업 중인 표 | 반영하고 응답의 `warnings` 에 담는다 |

### 4.3 충돌 판정

- 명령은 보낸 쪽이 마지막으로 본 `baseRev` 를 가진다.
- 명령이 고치는 속성의 `_rev` 가 `baseRev` 보다 크고, 그 값을 바꾼 세션이 이 명령의 세션과 다르면 `CONFLICT` 로 거절한다. 같은 세션이 고친 값이면 통과한다.
- 같은 요소라도 다른 속성을 고치면 둘 다 반영한다.
- 고치려는 요소가 이미 지워졌으면 `NOT_FOUND` 다.
- 되돌리기(역명령)도 같은 판정을 거친다.

### 4.4 화면이 서버와 맞추는 방식

- 화면의 모델은 두 층이다. 아래층은 서버가 확인한 상태(마지막 rev)이고, 위층은 아직 응답을 받지 못한 내 명령이다.
- 다른 세션의 변경이 SSE 로 오면 아래층에 적용하고 위층을 다시 얹는다. 서버가 내 명령을 받아들이면 위층에서 빼고, 거절하면 빼고 이유를 보여 준다.
- 명령을 보내는 시점:
  - 그리드 칸: Enter, Tab, 다른 칸으로 이동할 때 한 번 보낸다.
  - 논리명 입력 중: 300ms 디바운스로 표준 검사 미리보기만 부른다.
  - 표 끌기: 놓을 때 `moveNodes` 를 한 번 보낸다. 끄는 도중의 움직임은 다른 사람에게 보내지 않는다.
  - 선택 변경: `setView` 를 1초에 한 번 이하로 보낸다.
- SSE 가 끊기면 편집을 멈추고 "연결 끊김" 띠를 띄운다. 다시 연결되면 마지막 rev 이후의 변경을 받는다. 빠진 변경이 500건을 넘으면 모델 전체를 다시 읽는다.
- (단계 0 구현) 처음 구독하면(`sinceRev` 없음) 서버가 먼저 `hello{rev}` 를 보낸다. 화면은 이 rev 를 아래층 기준으로 삼는다.
- (단계 0 구현) DRAFT 를 지우거나 새 DRAFT 를 만들면 서버가 rev 를 올리고 `reload{rev}` 를 보낸다. `changesSince` 도 이 지점을 넘으면 `reload` 를 돌려준다. 화면은 대기 명령을 버리고 모델 전체를 다시 읽는다. 이 지점보다 앞선 명령은 되돌릴 수 없다.
- 공동 편집자가 아니거나 RELEASED 버전을 볼 때는 읽기 전용이다. 위쪽 띠에 이유를 적는다.
- 되돌리기: 변경 기록에서 명령을 골라 되돌린다. Ctrl+Z 는 같은 세션의 마지막 명령을 되돌린다.

### 4.5 오류 메시지

오류에는 다음에 할 일까지 적는다. LLM 이 메시지만 읽고 다시 시도할 수 있어야 한다.

| 코드 | 화면 | MCP·CLI 응답에 담는 것 |
|---|---|---|
| `CONFLICT` | 알림("41000207 이 rev 215 에서 '역할설명' 으로 바꿨습니다"), 해당 칸 강조, 내 값 복사 단추 | 바꾼 세션, rev, 현재 값, `getChangesSince` 로 읽을 rev |
| `NOT_FOUND` | 알림, 위층에서 제거 | 지운 세션과 rev |
| `INVALID` | 칸 아래 빨간 문구 | 어긋난 규칙과 고치는 방법 |
| `NOT_EDITOR` | 읽기 전용 띠 | 소유자, 공동 편집자로 등록하는 방법 |
| 경고 | 칸 표시, 검토 패널 숫자, 작업 중 표의 이름표 강조 | `warnings` 배열(`claimedBy`, 만료 시각 포함) |

### 4.6 LLM 이 쓰는 순서

MCP 도구 설명에 아래 순서를 적어 둔다.

1. `getCurrentView` 로 사용자가 보는 곳을 확인하거나, `getModelText` 로 모델을 읽는다.
2. `claimTable` 로 작업할 표를 선언한다.
3. `apply` 로 명령을 묶어 보낸다.
4. `CONFLICT` 를 받으면 `getChangesSince(rev)` 로 최신 상태를 확인하고 다시 보낸다.
5. 끝나면 `releaseTable` 로 선언을 푼다. 선언은 만료 시간이 지나면 저절로 풀린다.

### 4.7 확정 요청

- 소유자만 확정을 요청할 수 있다.
- 확정 검사(D19): 직전 RELEASED 와 비교해 추가·변경한 컬럼에 표준 위반이 있으면 막는다. 기존 위반은 확정 화면에 경고로 보여 준다.
- 추정(`INFERRED`) 관계가 남아 있어도 확정을 막지 않는다. 확정 화면에 남은 수를 보여 준다.

## 5. 확인 항목 (구현 중에 확인)

| 항목 | 확인 방법 | 안 될 때 | 단계 0 결과 | 단계 1 결과 |
|---|---|---|---|---|
| 포털(Next.js BFF)을 거쳐 SSE 를 넘겨줄 수 있는가 | 단계 0 의 시험 6. 2026-10-10 에 코드를 읽어 확인했다. | 짧은 주기의 폴링(`getChangesSince`)으로 대신한다 | 스트림은 통과한다. m-mcm `lib/http/be-proxy.ts` 가 `res.body` 를 조각 단위로 넘기고, `content-type`·`cache-control` 은 유지하며 `x-accel-buffering` 은 버리고, 클라이언트가 끊으면 백엔드 요청도 끊는다. 다만 GET 에 고정 120초 프록시 제한(`backendTimeoutMs`·`DEFAULT_TIMEOUT_MS`)이 걸려 2분마다 스트림이 끊긴다. 허브는 `sinceRev` 재연결을 받으므로 데이터는 잃지 않는다. 단계 1 에서 `/erd/stream/` 을 이 제한에서 빼고, `next start` 의 gzip 버퍼링과 함께 브라우저로 확인한다. | 단계 1 에서 `be-proxy.ts` 의 GET `/erd/stream/` 제한을 24시간으로 늘렸다(S15). 2026-10-11 에 로컬에서 포털 경로로 프로브 연결을 열어 125초씩 확인했다. dev 서버: `content-encoding` 이 없다. 재접속 0회, 오류 0건, change 지연 787ms, ping 8개. `next start`(포트 5101, 같은 빌드): `content-encoding` 이 없다. 재접속 0회, 오류 0건, change 지연 901ms, ping 8개가 15.0초 간격으로 고르게 왔다. gzip 버퍼링 지연은 없다. change 지연 0.8~0.9초는 기준 1000ms 안이지만 관찰로 남겼다(deferred 48). |
| 다른 스키마를 읽을 권한(운영) | 로컬은 `SELECT ANY TABLE`. 운영은 deferred 17번 | 로컬에서만 가져오기를 한다 | 아직 확인하지 않았다. | 로컬에서만 확인했다. MDM 서버(MDMAPUSER)가 `ALL_*` 뷰로 MCMAPUSER 의 표 57개와 FK 0개를 읽었다(로컬 권한 `SELECT ANY TABLE`). 운영 권한은 확인하지 않았다. deferred 17번에 남는다. |
| 표준 검사기의 일괄 판정 시간 | 시험 2 에서 MCM 전체를 잰다. | 판정을 표 단위로 나눠 비동기로 채운다 | 재지 못했다. 시험용 PDB 의 사전이 비어 있다. 단계 1 에서 L_MAIN 으로 가져온 뒤 잰다. | L_ERD12(TPL_DATA 복제, L_MAIN 아님)에서 `view kind=STATUS` 의 `elapsedMs`(사전 적재 + 판정)를 쟀다. 사전 규모는 컬럼 사전 7951행, 별칭 11250행이다. 도메인 타입 대응을 고친 뒤(계획 README "마감-표준 타입 대응") MCM: 첫 670ms, 가운데 648ms, 최대 743ms. MDM: 첫 774ms, 가운데 617ms, 최대 774ms. 고치기 전 가운데 값은 MCM 511ms, MDM 510ms 였다. 가운데 값이 3000ms 보다 작아 요청마다 사전을 읽는 지금 방식을 유지한다(deferred 33). 판정 결과(고친 뒤) MCM: OK 7, ALIAS 82, NEW 65, TYPE 27, DOMAIN 550, MISS 160. MDM: OK 13, ALIAS 171, NEW 14, TYPE 0, DOMAIN 634, MISS 23. 고치기 전 DOMAIN 은 MCM 629개, MDM 799개였다. 남은 DOMAIN 은 사전 표준과 스키마의 실제 차이다(deferred 41). |
| MDM 서버를 여러 대로 띄우는 경우의 접속자·선택 상태 | 이 스펙은 서버 1대를 가정한다 | 접속자 상태를 DB 나 공유 저장소로 옮긴다 | 아직 확인하지 않았다. | 확인하지 않았다. 단계 1 도 서버 1대로만 확인했다. 접속자·선택 상태는 서버 메모리의 `ErdEventHub` 에 있다. |
| `getModelText` 형식의 정확도 | 시험 10 | 형식을 고친다(DDL·DBML 비교) | 아직 확인하지 않았다. | MCM 에 대한 질문 10개에 10/10 으로 답했다. 조건: `getModelText`·`getCurrentView` 만 허용, `Read` 와 나머지 erd 도구 금지, `--permission-mode default`, `--max-turns 6`. 첫 실행은 2/10 이었다. 원인은 형식이 아니라 결과 크기였다. mcm 전체 글(51.6KB)이 Claude Code 도구 결과 상한(약 50,000자)을 넘어 파일로 빠졌다. `getModelText` 에 40,000자 상한, 개요, `tables` 필터를 넣어 고쳤다(계획 README "마감-MCP 크기"). 고친 뒤 가장 큰 출력은 mcm `tables=[*]` 36,292자이고 파일로 빠지지 않았다. 화면 선택 상태(`getCurrentView`, Q10): 맞음. 엄격 재시험의 선택은 브라우저 대신 백엔드(SSE 구독 + `view kind=SET_VIEW`)로 만들었다. 브라우저에서 고른 선택은 고치기 전 조건(결과 파일 Read 허용)에서 확인했다. 이때 `selectedTables` 가 TB_MCM_SEC_USER 를 가리켰고, 선택을 지운 뒤에는 "선택 0개라 답할 수 없음" 으로 답했다. 결론: 형식은 고치지 않는다(크기만 고쳤다). |

## 6. 시험

시험 시간 예산에 따라 바뀐 범위만 시험하고, 항목마다 15분을 넘기지 않는다. DB 시험은 레인 전용 Oracle 시험 PDB(`L_<레인>`)에서 하고, 끝나면 지운다.

| # | 대상 | 방법 | 핵심 사례 |
|---|---|---|---|
| 1 | 명령 엔진 | DB 없는 Java 단위 시험 | 같은 속성을 두 세션이 고치면 `CONFLICT`, 다른 속성이면 둘 다 반영, 같은 세션이면 통과, 남이 뒤에 고친 속성의 되돌리기는 `CONFLICT`, 식별 관계는 부모 PK 를 자식 PK 로 복사, 묶음은 전부 성공 또는 전부 실패 |
| 2 | 표준 검사기 | 단위 시험 + 골든 | 캐시 판정이 기존 `columnMng/compare` 결과와 같다(연구 실측 4건: 고객주문일자, 사용자아이디, 작업지시번호, 설비가동시작일시). MCM 전체 일괄 판정 시간을 잰다 |
| 3 | 관계 추정기 | MDM FK 53개를 정답으로 회귀 시험 | 칼럼명 규칙이 연구 수치(정밀도 0.57, 재현율 0.78)보다 나빠지지 않는다. MCM 후보 수(약 104쌍)를 기록한다 |
| 4 | 저장·버전 | Oracle 시험 PDB 통합 시험 | DRAFT 를 만들 때 JSON 복사와 UUID 유지, 공동 편집자는 쓰기 가능·다른 사람은 MDM003, 확정 검사(D19), DRAFT 삭제, **기존 버전 계약 시험(`VersionContractTest` 등) 통과** |
| 5 | 동시성 | 통합 시험(스레드 여러 개) | 같은 모델에 명령을 동시에 보내도 rev 가 빠짐없이 이어지고 잃는 명령이 없다 |
| 6 | 실시간 채널 | 통합 시험(SSE 구독자 2개) | 둘 다 같은 rev 를 받는다. 끊긴 뒤 따라잡는다. BFF 경유 가능 여부 |
| 7 | MCP·CLI | node 시험 + 로컬 서버 스모크 | CLI 기본 dry-run, `--apply` 저장, `CONFLICT` 뒤 다시 읽고 다시 보내기 |
| 8 | 화면 로직 | vitest 단위 시험 | 두 층 모델: 반영, 거절 시 되돌림, 다른 세션 변경 위에 내 명령 다시 얹기 |
| 9 | 화면 실제 확인 | ego-browser | 브라우저 창 두 개와 Claude MCP 세션이 함께 편집한다. 서로의 변경과 이름표가 보인다. 끝나면 브라우저 작업 공간을 닫는다 |
| 10 | LLM 읽기 형식 | 수동 시험 1회 | `getModelText` 로 MCM 에 대한 질문 10개에 답하게 하고 정답률을 기록한다 |

## 7. 단계와 완료 기준

구현 계획은 세 단계로 나누고, 단계마다 dev 에 머지한다.

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0. 기반 | 3.2절 표의 Flyway V 파일, `ERD_MODEL` 버전 연결(공동 편집자 포함), 명령 엔진과 명령 기록, SSE 골격 | 시험 1·4·5·6 통과 |
| 1. 가져오기·뷰어 (P1) | DB 가져오기(MCM·MDM), 관계 추정과 검토 패널, 표준 검사기, 캔버스·그리드 보기(논리·물리 전환, 보기 프리셋, 접기, 축소 시 이름만), MCP 읽기 도구, `getCurrentView` | MCM 표 55개를 가져와 추정 관계를 점선으로 그린다. MDM FK 는 `DB` 상태로 들어온다. 컬럼마다 표준 상태가 보인다. Claude 가 화면에서 선택한 표를 알아보고 질문에 답한다. 시험 2·3·10 통과 |
| 2. 편집·동시 편집 (P2) | exERD 동작 4묶음, 자동 채움, 화면 먼저 반영, 공동 편집자·접속자·작업 중 표시, 되돌리기, 다시 가져오기 차이, MCP·CLI 쓰기, 확정 요청 | 사람 2명과 Claude 세션 2개가 한 모델을 함께 고치고, 충돌 알림과 되돌리기가 동작한다. 확정 요청까지 마친다. 시험 7·8·9 통과 |

단계마다 함께 할 일:

- 새 shared 부품은 `mantine-aggrid-ui` 스킬의 컴포넌트 문서와 색인을 같은 작업에서 갱신한다(CLAUDE.md 공통 컴포넌트 규칙).
- 다시 생길 수 있는 화면 문제는 가이드(Local-Rules·Screen-Performance-Guide)에 남긴다.
- deferred.md 에서 처리한 항목은 "처리" 칸에 커밋을 적는다.

## 8. exERD 동작 대응표 (D3)

| exERD 동작 | 이 스펙에서 |
|---|---|
| F3 논리·물리 전환, 모드별 배경색 | 위 막대 전환 단추와 F3. 캔버스 배경색(논리 푸른색, 물리 붉은색) |
| 보기 프리셋 | 기본 / E-R 개요(표 이름만) / 논리+물리 동시 |
| 비식별(4)·식별(5) 도구로 FK 자동 생성 | `addRelation`. 이름 충돌 시 선택 창 |
| 그리드 키보드 입력 | Ctrl+Enter 컬럼 추가, Ctrl+Shift+Enter PK 컬럼 추가, F2·더블클릭 편집 |
| 찾기·이동 | Ctrl+T 표 찾기(물리명·논리명·주석), Ctrl+O 컬럼 점프, Ctrl+↑/↓ 부모·자식 표 |
| 큰 모델 처리 | 표 접기(PK·FK 만 / 이름만), 확대율 50% 미만이면 이름만, 자동 배치(dagre), 다이어그램 생성 마법사 |
| 삭제 구분 | Delete 는 다이어그램에서 빼기, Alt+Delete 는 모델에서 삭제 |
| 논리명 → 물리명, 도메인 → 타입 | 표준 검사기. 후보가 하나일 때만 자동으로 채운다 |

- 단계 0 에서 스펙과 다르게 정한 점(P1~P10)은 [계획 README 의 "스펙과 다르게 정한 점"](../plans/2026-10-10-erd-tool-stage0/README.md#스펙과-다르게-정한-점)에 있다.
- 단계 0 구현 중 정한 결정은 계획 README 의 "단계 0 구현 결정" 절에 있다.
