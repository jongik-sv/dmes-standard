# erd-editor / ChartDB / drawDB 소스 조사 메모 (2026-10-09)

받은 커밋: erd-editor 0a80028 (2026-10-09, 패키지 3.10.0, MIT), chartdb c24936a (2026-04-11, AGPL), drawdb d9c0d39 (2026-10-08, AGPL).
위치: .../scratchpad/erd/src/{erd-editor,chartdb,drawdb}. 읽기만 함(설치·빌드·실행 안 함).
경로 약어: ES = erd-editor/packages/erd-editor-schema/src, EE = erd-editor/packages/erd-editor/src, MCP = erd-editor/packages/mcp-server/src.

## 0. 저장소 구조 (erd-editor)
- 모노레포 packages: erd-editor(에디터 본체), erd-editor-schema(저장 스키마·파서·질의), mcp-server, agent-hub / agent-hub-host(MCP-IDE 연결 프로토콜), vscode-extension, intellij-plugin, obsidian-plugin, schema-sql-parser(DDL 파서), r-html(자체 UI 프레임워크), replication-store-worker 등.
- 에디터는 React 가 아니다. 자체 `@dineug/r-html`(웹 컴포넌트 + JSX 유사) 위에 Konva(캔버스 2D) 로 그린다 (EE/konva/, package.json 의 konva ^10.3.2, elkjs ^0.12.0, d3-force, fuse.js, rxjs). 따라서 "포크해서 React+xyflow 에 이식"은 불가능하고 UI 는 재사용 불가.
- 재사용 가능성이 있는 부분은 엔진·스키마·MCP 쪽(Node 에서 DOM 없이 돌도록 설계: EE/peer/index.ts, AGENTS.md "peer graph runs in Node with no DOM").

## 1. 저장 스키마 v3
파일: ES/v3/schema/index.ts:53-66 (최상위), 개별 엔티티는 ES/v3/schema/*.entity.ts.

```ts
export interface ERDEditorSchemaV3 {
  $schema: 'https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json';
  version: '3.0.0';
  settings: Settings;
  doc: Doc;
  collections: {
    tableEntities: Record<string, Table>;
    tableColumnEntities: Record<string, Column>;
    relationshipEntities: Record<string, Relationship>;
    indexEntities: Record<string, Index>;
    indexColumnEntities: Record<string, IndexColumn>;
    memoEntities: Record<string, Memo>;
  };
}
```
- 정규화 구조: 엔티티를 id->객체 맵(collections)에 평평하게 두고, 순서와 소속은 id 배열로 표현.
  - doc (ES/v3/schema/doc.ts): `{ tableIds, relationshipIds, indexIds, memoIds }` = 문서에 "살아있는" 엔티티와 그 표시 순서. collections 에는 고아 엔티티가 남을 수 있고 로드 시 schema-gc(EE/services/schema-gc/)가 정리.
  - Table.columnIds / seqColumnIds (table.entity.ts): columnIds = 컬럼 순서, seqColumnIds = 생성 순서(추정, 이름만 확인). Index.indexColumnIds / seqIndexColumnIds 동일 패턴.
  - 엔티티마다 `meta` 필드(EntityType<...> 래퍼, ES/internal-types/index.ts, getDefaultEntityMeta) 가 붙음. LWW 용 메타로 보이나 meta 의 정확한 필드는 확인 안 됨.
- Table: `{ id, name, comment, columnIds, seqColumnIds, ui:{ x, y, zIndex, widthName, widthComment, color } }`
- Column: `{ id, tableId, name, comment, dataType:string, default:string, options:number(bit), ui:{ keys:number(bit), widthName, widthComment, widthDataType, widthDefault } }`
  - 컬럼 옵션 비트 (tableColumn.entity.ts:22-27): `autoIncrement:1, primaryKey:2, unique:4, notNull:8`. 검사는 `bHas(bit, value)` = `(bit & value) === value` (ES/utils/bit.ts).
  - ui.keys 비트: `primaryKey:1, foreignKey:2` (표시용 파생값. hook 이 관계에서 계산: EE/engine/modules/relationship/hooks.ts).
  - dataType 은 자유 문자열 ("VARCHAR2(20)" 같은 길이 포함 문자열 그대로). precision/scale/length 분리 필드 없음.
- 논리명/도메인: **전용 칸 없음**. table.comment, column.comment 가 있을 뿐이고(Oracle COMMENT ON 으로 출력), logical name / domain / 용어 id 필드는 스키마 어디에도 없음. 표시 토글 Show.tableComment / columnComment 로 comment 를 열로 보여 줌 (settings.ts Show 비트).
- Relationship (relationship.entity.ts:3-20):
  ```ts
  { id, identification:boolean, relationshipType:number, startRelationshipType:number,
    onDelete:number, onUpdate:number, start:RelationshipPoint, end:RelationshipPoint }
  RelationshipPoint = { tableId, columnIds:string[], x, y, direction:number }
  ```
  - start = 부모(참조되는 쪽), end = 자식(FK 가진 쪽). Oracle DDL 에서 `ALTER TABLE end REFERENCES start` (EE/utils/schema-sql/Oracle.ts:276-295). 컬럼 단위 복합 키 지원: start.columnIds[i] <-> end.columnIds[i] 짝(utils.ts toForeignKeyPairs:96-).
  - 시작/끝 점 = 표 + 컬럼 id 목록. x,y,direction 은 선 앵커 캐시(좌표·방향 비트 left1/right2/top4/bottom8)로 hook 이 재계산.
  - relationshipType 비트: `ZeroOne:2, ZeroN:4, OneOnly:8, OneN:16` (주석 처리된 값 있음). 즉 자식(end) 쪽 카디널리티만 한 값으로 표현하고 부모 쪽은 startRelationshipType 비트 `ring:1(선택적, 원), dash:2(필수, 대시)` 로 표현.
  - 식별/비식별: `identification:boolean`. 사용자가 고르는 값이 아니라 hook 이 컬럼에서 계산(hooks.ts:132 `relationship.identification = value`; 주석: "read off the columns as the identification is" — FK 컬럼이 자식의 PK 면 식별).
  - 참조 동작: `onDelete/onUpdate` 비트 `none:1, noAction:2, cascade:4, setNull:8, setDefault:16, restrict:32` ("Append only" 주석, 저장된 숫자를 바꾸지 말 것).
- Index: `{ id, name, tableId, indexColumnIds, seqIndexColumnIds, unique:boolean }`; IndexColumn: `{ id, indexId, columnId, orderType: ASC1|DESC2 }`. 함수 기반 인덱스·부분 인덱스·인덱스 유형 없음.
- Memo: `{ id, value, ui:{ x,y,width,height,zIndex,color } }`.
- settings (settings.ts 1-208): width/height(구형), scrollTop/Left(구형), originX/originY/zoomLevel, show(비트), database(비트: MariaDB1 MSSQL2 MySQL4 **Oracle8** PostgreSQL16 SQLite32 Databricks64 Snowflake128), databaseName, canvasType, language(코드 생성 언어 비트), tableNameCase, columnNameCase, bracketType(none1 doubleQuote2 singleQuote4 backtick8), relationshipDataTypeSync, relationshipOptimization, columnOrder, maxWidthComment, lockSettings(비트), ddlScripts{before,after}.
- 위치/크기/색: 표 ui.{x,y,zIndex,color, widthName/widthComment}; 높이는 저장하지 않고 컬럼 수로 계산(MCP erd_list 설명: "width approximate, height exact"). 메모만 width/height 저장.
- 이름은 비트 상수 모두 "Append only" — 저장된 숫자 호환이 설계 원칙.
- 버전 마이그레이션: ES/parser.ts:13-22 `parser(source)` 가 `version === '3.0.0'` 이면 v3 파서, 아니면 v2 로 보고 `v2ToV3(schemaV2Parser(json))` (ES/convert/v2ToV3.ts) 후 `resetPreLockView`. 반대 `v3ToV2`, `parserV2` 도 있음(양방향). v3 파서는 DeepPartial 입력을 받아 필드별 `assign(isString, target, value)('name')` 식으로 기본값 위에 얹어 병합(ES/v3/parser/*.ts) — 누락 필드는 기본값, 잘못된 형은 무시, id 없는 엔티티는 버림. v3 내부 하위 호환도 이 방식(예: scrollTop/Left -> originX/Y 이전 migrateScroll.ts, ignoreSaveSettings -> lockSettings). 버전 번호 올리는 방식이 아니라 "관대한 파서 + 추가 전용 필드".
- 직렬화: `toJson(schemaV3)` (parser.ts:29-64) 가 락된 설정을 되돌려 쓰고 `JSON.stringify(.., null, 2)`.
- 질의 헬퍼: ES/query/index.ts `query(collections).collection('tableColumnEntities').selectById / selectByIds`.

## 2. 편집 명령 체계
### 2.1 액션 (EE/engine/modules/*/actions.ts, EE/engine/actions.ts)
`ChangeActionTypes` (actions.ts:62-142) = 문서 변경 액션 전체 목록:
- table: table.add / move / moveTo / remove / changeName / changeComment / changeColor / sort (+ changeZIndex)
- column: column.add / remove / changeName / changeComment / changeDataType / changeDefault / changeAutoIncrement / changePrimaryKey / changeUnique / changeNotNull / move
- relationship: relationship.add / remove / changeType / changeOnDelete / changeOnUpdate / changeColumns
- index: index.add / remove / changeName / changeUnique; indexColumn: add / remove / move / changeOrderType
- memo: memo.add / move / moveTo / remove / changeValue / changeColor / resize
- settings: changeDatabaseName / ZoomLevel / scrollTo / changeShow / changeDatabase / changeCanvasType / changeLanguage / changeTableNameCase / changeColumnNameCase / changeBracketType / changeRelationshipDataTypeSync / changeRelationshipOptimization / changeColumnOrder / changeMaxWidthComment / changeLockSettings / changeDDLScript
- editor: editor.loadJson / editor.clear
- 기타 비변경: 포커스·선택·마우스 추적(editor.shared*Tracker), editor.getLWW / mergeLWW.
- 두 층: **atom action**(단일 reducer, 예 `addColumnAction({id, tableId})`)과 **generator action**(`*Action$`, 여러 atom 을 yield. 예 addColumnAction$ 는 uuid25() 로 id 만들고 column.add 후 focusColumn; removeColumnAction$ 는 column.remove + 연관 relationship.remove + index.remove; addRelationshipAction$ 는 자식에 FK 컬럼을 복사 생성). 액션 페이로드 예: `column.add {id, tableId}`, `column.changeName {tableId, id, value}`, `relationship.add {id, relationshipType, onDelete?, onUpdate?, start:{tableId,columnIds}, end:{tableId,columnIds}}`.
- 클라이언트가 id(uuid25) 를 생성해 add 액션에 싣는다(서버 채번 없음).
- 파생값 유지는 hook (EE/engine/modules/relationship/hooks.ts 등): 식별 관계, FK 키 비트, 데이터타입 동기화(relationshipDataTypeSync), 앵커 재계산. 액션 reducer 가 아니라 구독형 후처리.

### 2.2 undo/redo = 역액션 커맨드 (스냅샷 아님)
- EE/engine/history.ts: `Command = { undo(dispatch, getNextVersion), redo(...) }` 선형 스택(cursor, limit).
- EE/engine/history.actions.ts:42-: 액션이 디스패치될 때 `pushUndoHistoryMap[action.type](undoActions, action, state)` 가 **적용 전 상태를 읽어** 역액션을 만든다 (예: modules/table-column/history.ts: `addColumn -> removeColumn`, `changeColumnName -> 이전 column.name 으로 changeColumnName`). redo 는 원 액션의 cloneDeep. 한 번의 디스패치(배치)가 undo 1건.
- 드래그 같은 스트림 액션은 `pushStreamHistoryMap` 으로 묶어 1건 처리(table.move / memo.move / zoom·scroll).
- 모든 액션이 undo 가능한 건 아님: MCP README "erd_set_database, erd_set_database_name, erd_resize_memo make no undo entry".

### 2.3 협업 = 액션 로그 + LWW 레지스터 (CRDT 라이브러리 아님)
- 모든 액션에 `version`(Lamport 식 Clock: EE/engine/clock.ts, merge 시 max) 부여. EE/engine/shared-store.ts 가 SharedActionTypes 를 피어에게 전달(전송은 호스트가: BroadcastChannel/IDE 훅 등, 전송 계층 세부는 확인 안 됨), 접속 시 `editor.getLWW` / `editor.mergeLWW` 로 레지스터 교환.
- ES/query/lww.ts: LWW 튜플 `[tag, addVersion, removeVersion, Record<path, version>]` 를 id 별로 보관. `addOperator`(removeVersion 보다 새 버전일 때만 적용), `removeOperator`(addVersion <= version 이면 삭제 적용), `replaceOperator(path)`(필드 경로별 마지막 쓰기 우선). 즉 엔티티 단위 add/remove 와 필드 단위 replace 를 version 으로 수렴. 순서 배열(columnIds)의 동시 편집 병합 방식은 확인 안 됨.
- EE/engine/peer-store.ts: 헤드리스 피어(Node)용. MCP 서버가 이것으로 문서를 로드해 액션을 디스패치. replication-store.ts: 변경 감지(`change {value, changed}`)로 파일 저장 트리거.
- 에이전트 허브(packages/agent-hub): 에디터 창이 로컬 소켓(`~/.erd-editor/ide/<pid>.json` 락 파일 + `<pid>.sock`)을 열고, MCP 서버가 락을 읽어 해당 문서의 협업 스트림에 "피어 하나"로 합류. 프로토콜 요청: hello / listDocuments / openDocument / join / applyActions / leave / save, 통지: actions / documentClosed. JSON 라인 프레이밍(최대 64MiB), Effect Schema 로 정의.

## 3. MCP 패키지 (packages/mcp-server, npm `@dineug/erd-editor-mcp`)
- 단일 파일 번들, 런타임 의존성 없음, Node 22.12+. stdio 서버. 설치: `claude mcp add --transport stdio erd-editor -- npx -y @dineug/erd-editor-mcp`.
- 구현: effect `Toolkit` / `McpSchema` (MCP/tools/toolkit.ts, handlers.ts). 레지스트리 정의: MCP/tools/registry/{table,column,relationship,indexes,memo,settings,import}.ts, 인자 종류 타입 `ToolArgKind`(registry/index.ts:20-30): string / number / integer / boolean / enum(이름->값) / entityId(entity, parentArg) / entityIdList / tablePositions.
- 저장소: **두 모드**. (a) live: VS Code / Obsidian / IntelliJ 창이 해당 문서를 열고 있으면 허브에 피어로 합류해 편집(화면에 즉시 보임, VS Code 는 미저장 상태라 erd_save 필요). (b) headless: 에디터 없으면 파일(.erd.json)을 읽어 피어 스토어에 로드, 적용 후 원자적 교체(MCP/io/disk.ts 계열). (c) blocked: 허브 꺼진 창이 파일을 쥐고 있으면 쓰기 거부, 읽기만.
- tool 목록(README Tools 표, 총 56개 (README 표 합산)):
  - Session(8): erd_list_documents, erd_open_document{path, create?}, erd_list, erd_get, erd_read, erd_save{path}, erd_undo{path}, erd_redo{path}
  - Tables(8): erd_add_table(인자 없음, path 제외), erd_remove_table{tableId}, erd_change_table_name{tableId,value}, erd_change_table_comment{tableId,value}, erd_change_table_color{tableId,color}, erd_move_table{tableId,x,y}, erd_move_tables{positions:[{tableId,x,y}]}, erd_sort_tables
  - Columns(11): erd_add_column{tableId}(빈 컬럼만 생성; 이름 등은 이후 호출), erd_remove_columns{tableId,columnIds[]}, erd_change_column_name / _data_type / _default / _comment {tableId,columnId,value:string}, erd_set_column_primary_key / _unique / _not_null / _auto_increment {tableId,columnId,value:boolean}(토글이 아니라 값 지정, 이미 같으면 no-op), erd_move_column{tableId,columnId,targetColumnId}
  - Relationships(6): erd_add_relationship{startTableId,endTableId,relationshipType(enum 이름),onDelete?,onUpdate?}(자식에 FK 컬럼 자동 생성), erd_link_columns{startTableId,startColumnIds[],endTableId,endColumnIds[],relationshipType,...}(기존 컬럼 연결, refine: 짝 수 일치), erd_remove_relationship{relationshipId}, erd_change_relationship_type / _on_delete / _on_update
  - Indexes(8): erd_add_index{tableId}, erd_remove_index{indexId}, erd_change_index_name, erd_set_index_unique, erd_add_index_column{indexId,columnId}, erd_remove_index_column, erd_move_index_column, erd_set_index_column_order{orderType enum}
  - Memos(6): add/remove/change_value/change_color/move/resize
  - Settings(3): erd_set_database{value:enum Database}, erd_set_database_name{value}, erd_set_ddl_script{position:before|after, sql}(10,000자 제한)
  - Import(5): erd_import_sql / _graphql / _dbml / _aml / _json {value, mode?: replace|append}
  - Batch(1): erd_batch{path, operations[최대 100, {tool, args, as?}]} — 사본에 먼저 리허설해 하나라도 거부되면 아무것도 적용 안 함(전부 또는 전무), `$name` / `$name.1` / `$name.last` 로 앞 연산이 만든 id 참조, undo 한 번에 전체 되돌림 (MCP/tools/batch.ts).
  - 읽기: erd_list{path, query?, offset?, limit?, namesOnly?}(표 100개씩 페이지, 이름만 2000개), erd_get{ids / tableNames, kinds}, erd_read{path, format: snapshot|sql|json|scripts, vendor?, statements?(ifNotExists|recreate), header?(use|createAndUse), tableIds?, tableNames?}. 한 번 응답 최대 40,000자(Claude Code 의 결과 파일 분리 임계 아래), 초과하면 좁히는 법과 함께 거부.
- 출력 형식: 편집 결과는 JSON 텍스트 한 블록(MCP/tools/result.ts `toolRunResult`): `{ tool, mode:'live'|'headless'|'blocked', createdIds:[], batches, historyEntries, undoable?, undoNote?, mismatch?, notes? }`. 읽기는 텍스트 그대로 + notes 는 두 번째 블록. 생성된 id 는 `createdIds` 로 반환(add_table -> createdIds[0]).
- 검증 오류: 호출 전에 레지스트리가 검증하고 아무것도 디스패치하지 않는다.
  - `ToolError` 코드 4종 (MCP/tools/errors.ts): unknownTool / invalidArgs / notFound / tooLarge. 메시지에 문제 인자명 + 해법("... names no live table; read the document for current ids", validate.ts:205-241). invalidArgs 예: "columnId must be ..." / "targetColumnId must name a different column than columnId" (refine).
  - 오류 결과 형식: `isError:true`, 본문 `{"error":{"code":"...","message":"..."}}` (result.ts `errorResult`, `Refusal`). 에디터·세션 계열 코드: notFound / readonly / invalidDocument / protocol 계열 / internal.
  - 선언하지 않은 인자나 틀린 타입은 JSON-RPC invalid params(-32602) 로 거부 (오타 인자 무시 방지).
  - 의미 검증(PK 중복, 이름 중복, 예약어, Oracle 30바이트 등)은 **없음**. 존재하는 id 인지·형이 맞는지만 확인. 부모 인자 검증(column 이 그 table 소속인지)은 함(parentArg).
  - 실행 후 `expectedBatches/expectedHistory` 와 실제가 다르면 `mismatch` 필드로 알림.
- 파괴적 도구 판별: `isDestructive(name)` = erd_batch / erd_remove_* / erd_import_* (toolkit.ts:26-31) — MCP annotations 용으로 보임.
- 설명 문구는 MCP/tools/copy.ts(367줄)에 분리 (describeTool / describeArg).
- 한계/관찰: 컬럼 생성 후 이름·타입·nullable 을 각각 호출해야 해서 표 하나에 호출 수십 번 → erd_batch 또는 erd_import_sql(DDL 텍스트) 사용이 현실적 경로. 도메인·용어 개념 없음.

## 4. DDL 생성기
- 위치: EE/utils/schema-sql/{Oracle,MySQL,MariaDB,MSSQL,PostgreSQL,SQLite,Snowflake,Databricks}.ts + index.ts(디스패치) + utils.ts(공용, 666줄) + options.ts(옵션).
- Oracle 방언 = EE/utils/schema-sql/Oracle.ts (421줄). 구조:
  - `createSchema(state, tableIds?, {written})`: 표마다 CREATE TABLE -> UNIQUE(ALTER TABLE ADD CONSTRAINT UQ_<표>_<컬럼> UNIQUE) -> AI 컬럼이면 `CREATE SEQUENCE SEQ_<표> START WITH 1 INCREMENT BY 1;` + `CREATE OR REPLACE TRIGGER SEQ_TRG_<표> BEFORE INSERT ... SELECT seq.NEXTVAL INTO :NEW.col FROM DUAL; END; /` (IDENTITY 아님) -> COMMENT ON TABLE/COLUMN. 그 다음 관계(FK ALTER) 전부, 그 다음 인덱스 전부.
  - PK: 표 안 `CONSTRAINT PK_<표> PRIMARY KEY (...)` (Oracle.ts:178-185). 컬럼: `이름 타입 [DEFAULT x] [NOT NULL]` 로 정렬 공백.
  - FK (formatRelation, 264-302): `ALTER TABLE <end> ADD CONSTRAINT FK_<start>_TO_<end> FOREIGN KEY (...) REFERENCES <start> (...)` + 참조 동작 절 `formatReferentialActions(relationship, ACTION_SUPPORT)` (Oracle 은 ON DELETE CASCADE/SET NULL 만 지원 -> `referentialActionSupport(Database.Oracle)` 로 필터). FK 이름 충돌은 autoNameIgnoreCase 로 접미사 부여.
  - 코멘트: `COMMENT ON TABLE "T" IS '...'` / `COMMENT ON COLUMN "T"."C" IS '...'` (239-262), 따옴표 두 배 처리 `toStringLiteral`. comment 만 있고 별도 논리명 구분 없음.
  - 인덱스: `CREATE [UNIQUE] INDEX schema.name ON t (col ASC|DESC);` 이름 비면 IDX_<표> 자동.
  - 부가: `oracleLongNames(state)` (362-371) = 30바이트 초과 식별자 목록 반환(12.1 이하 제약 경고용), `formatHeader`(ALTER SESSION SET CURRENT_SCHEMA), `formatDropBlock`(PL/SQL 블록으로 DROP TABLE ... CASCADE CONSTRAINTS, ORA-00942 / ORA-02289 무시, 23ai 이전 DROP IF EXISTS 부재 대응).
  - bracketType 설정으로 식별자 따옴표 결정(Oracle 에서 double quote 를 켜면 대소문자 고정, 끄면 raw). 스키마.표 이름은 table.name 에 "SCHEMA.TABLE" 로 넣고 splitTableName 이 분리.
  - 없는 것: 파티션, 테이블스페이스, 가상 컬럼, IDENTITY, 체크 제약, 컬럼 단위 DEFAULT ON NULL, 시노님.
- diff -> ALTER: **없음**. erd-editor 는 CREATE / DROP 블록만 생성(옵션: ifNotExists / recreate). 스키마 diff 뷰는 있으나(EE/components/erd/diff-viewer, Time Travel) DDL 마이그레이션 생성은 아님. grep 에서 `ALTER TABLE ... ADD/DROP/MODIFY/RENAME` 생성 코드 없음(MSSQL DROP CONSTRAINT 한 건만).
- 파서(DDL->모델): packages/schema-sql-parser (Oracle 타입 목록은 EE/constants/sql/dataType/Oracle.ts, 파서 쪽 dataType 은 따로 관리 -> AGENTS.md 가 "둘을 같이 고쳐라" 명시).

## 5. 캔버스
- Konva Stage (EE/konva/, 컴포넌트 EE/components/erd/canvas/). 표 노드는 DOM 이 아닌 Konva Shape, 편집 시에만 입력창(EditOverlay.tsx)을 씬 위에 띄움.
- 컬링: EE/konva/scene/viewport.ts:109-128 `createCullingRect` — 화면 크기의 3배(좌우상하 한 화면 분 여유) 사각형과 교차하는 표/메모/관계만 렌더. `isTableVisible`, `isMemoVisible`, `isRelationshipVisible(경로 BBox)`. 
- 축소 단순화(LOD): `isHighLevelTable(zoom) = zoom <= 0.7` (EE/utils/validation.ts:67). 이때 `components/erd/canvas/high-level-table/HighLevelTable.tsx` 가 이름만 그리는 단순 표로 대체되고 컬럼 단축키·복사가 꺼진다 (useErdShortcut.ts 에서 `!showHighLevelTable` 가드). zoom 범위 0.1~1.5 (CANVAS_ZOOM_MIN/MAX), 캔버스 크기 2,000~20,000.
- 가상 스크롤/미니맵: EE/components/erd/virtual-scroll, minimap.
- 관계선: EE/utils/draw-relationship/ (index.ts 496줄, route.ts 348, pathFinding.ts 383, nudge.ts 738, sort.ts 642, incremental.ts 319, bezier.ts, chamfer.ts, stub.ts 등 약 8천 줄 — 테스트 포함). 직교 라우팅: 앵커(표 변의 left/right/top/bottom 슬롯)에서 stub 를 내고, 장애물(모든 표 상자, ROUTE_CLEARANCE 16, BEND_COST 36, BLOCK_COST 100000, MAX_CHANNELS 6) 을 피하는 채널 후보 점수 매기기(route.ts 상단 상수). 모서리는 chamfer 또는 bezier 로 둥글림. 같은 변에 몰린 선은 sort/nudge 로 간격 분산. 증분 갱신(incremental.ts)으로 표 이동 시 영향받는 선만 재계산.
- crow's foot: 카디널리티 장식은 draw.ts / 컴포넌트 EE/components/erd/canvas/relationship-group/relationship/ 에서 relationshipType 비트(ZeroOne/ZeroN/OneOnly/OneN)별 Konva 선으로 그림(세부 도형 코드는 읽지 않음, 확인 안 됨). StartRelationshipType ring/dash 는 부모 쪽 원/대시.
- 자동 배치: EE/constants/tablePlacement.ts — `force`(d3-force, 기본), `layeredHorizontal`, `layeredVertical`, `flow`(포트 포함) 은 ELK(elkjs layered), `viewLayered`(뷰 전용). ELK 는 웹 워커(shared worker, comlink)에서 실행 (EE/services/elk-layout/elkLayoutService.ts, elkWorkerRealm.ts). 옵션: nodeNode 80, layer 160, component 160, layered cycleBreaking DEPTH_FIRST 등(elkLayoutOptions.ts). 
- 수백 개 표 성능: 컬링 + LOD + Konva batchDraw(EE/konva/batchDraw.ts) + 워커 레이아웃 + 증분 라우팅. 수치 벤치는 e2e/bench 설정이 있으나(package.json e2e:bench) 결과값은 확인 안 됨.
- 부가: PNG/SVG 내보내기 전용 씬(EE/services/export-png), 스키마 GC, Time Travel, 시각화 탭(particles).

## 6. 키보드 UX
정의: EE/utils/keyboard-shortcut/index.ts:20-135 `KeyBindingName`, `createKeyBindingMap()`. `$mod` = Mac Cmd / Windows Ctrl. 핸들러 EE/components/erd/useErdShortcut.ts.
- 편집: edit = Enter(편집 시작/종료, 토글 컬럼이면 값 토글), stop = Escape(편집·관계 그리기 취소 -> 다음 Esc 선택 해제)
- addTable Alt+N, addColumn Alt+Enter, addMemo Alt+M
- removeTable $mod+Backspace / $mod+Delete, removeColumn Alt+Backspace / Alt+Delete, removeSelection Delete / Backspace (누르고 있어도 1회만: event.repeat 무시)
- primaryKey Alt+K (포커스 컬럼들의 PK 토글: changeColumnsPrimaryKeyAction$)
- selectAllTable $mod+A (또는 $mod+Alt+A), selectAllColumn Alt+A
- 관계 그리기 시작: $mod+Alt+1 (ZeroOne), +2 (ZeroN), +3 (OneOnly), +4 (OneN)
- tableProperties Alt+Space, focusView Alt+F, zenMode Alt+Z, handTool Space
- search $mod+K, findReplace $mod+F, undo $mod+Z, redo $mod+Shift+Z, zoomIn $mod+=, zoomOut $mod+-, zoomReset $mod+0
- 그리드 이동 (useErdShortcut.ts:115-152, engine editor/atom.actions.ts:330-352 `focusMoveTable`): 편집 중이 아닐 때 ArrowUp/Down/Left/Right = 포커스 셀 이동, Tab = 오른쪽(arrowRight), Shift+Tab = 왼쪽. Tab 으로 이동하면 1ms 뒤 자동으로 편집 모드 진입(`editTableAction`), 단 not null/unique/auto increment 토글 셀은 편집 안 하고 Enter 로 토글. 셀 순서는 settings.columnOrder (name, dataType, notNull, unique, autoIncrement, default, comment).
- 새 컬럼 후 즉시 입력: addColumnAction$ 가 새 컬럼의 columnName 셀로 포커스를 이동 -> Alt+Enter 후 바로 이름 입력, Tab 으로 타입 -> ... 연속 입력.
- 데이터 타입 자동완성 (EE/components/table-view/column/useColumnCell.ts): 입력값을 Fuse.js 퍼지 검색(`searchDataTypeHints`)으로 `DatabaseHintMap[settings.database]` 후보 표시. 후보 목록이 있을 때 ArrowUp/Down = 후보 이동, ArrowRight 또는 Tab = 선택 확정(Tab 은 preventDefault + stopPropagation 으로 다음 셀 이동 대신 확정), Enter = 확정 + 편집 종료, ArrowLeft = 선택 해제. `VARCHAR(255)` 처럼 타입 이름 뒤로 넘어가면 후보 숨김(isPastTypeName). IME 조합 중에는 모든 키 무시(isComposing).
- 복사/붙여넣기: 컬럼 선택 시 text/plain·text/html 표 형식, 엔티티 복사 payload (useErdShortcut handleCopy).
- 한계: 줄 위/아래 이동 Enter 동작은 "편집 종료"뿐 (엑셀식 Enter->아래 셀 이동 아님, 확인한 범위).

## 7. ChartDB / drawDB (둘 다 AGPL, 구조만)
### ChartDB (chartdb/src, React 19, @xyflow/react ^12.8.2, dexie ^4)
- 저장: IndexedDB(Dexie, context/storage-context). 모델 lib/domain/*.ts + zod:
  - Diagram {id, name, databaseType, databaseEdition?, tables?, relationships?, dependencies?, areas?, customTypes?, notes?, createdAt, updatedAt}
  - DBTable {id, name, schema?, x, y, fields[], indexes[], checkConstraints?, color, isView, isMaterializedView?, createdAt, width?, comments?, order?, expanded?, parentAreaId?} — 표/컬럼이 중첩 배열(정규화 안 함).
  - DBField {id, name, type:DataType, primaryKey, unique, nullable, increment?, isArray?, createdAt, characterMaximumLength?, precision?, scale?, default?, collation?, comments?, check?} — 길이·정밀도·스케일 분리 필드.
  - DBRelationship {id, name, sourceSchema?, sourceTableId, targetSchema?, targetTableId, sourceFieldId, targetFieldId, sourceCardinality:'one'|'many', targetCardinality:'one'|'many', createdAt} — **단일 컬럼 쌍**만(복합키 FK 는 관계 여러 개).
  - 논리명/도메인 칸 없음(comments 만).
- xyflow 사용 (pages/editor-page/canvas/canvas.tsx 70KB): `<ReactFlow onlyRenderVisibleElements minZoom={0.1} nodeTypes edgeTypes ...>` (canvas.tsx:1672-1691), nodes/edges 는 useNodesState/useEdgesState.
  - 표 노드 table-node.tsx: `NodeProps<TableNodeType>` + React.memo, `NodeResizer`, 표 헤더에 Handle 2개(Top, 표 단위 연결/의존용). 컬럼 행 table-node-field.tsx:372-: **컬럼마다 Handle 여러 개**: `RIGHT_HANDLE_ID_PREFIX+field.id`(source, Right), `LEFT_HANDLE_ID_PREFIX+field.id`(source, Left), 그리고 target 용 `TARGET_ID_PREFIX+index+'_'+field.id` 를 컬럼으로 들어오는 선 개수만큼 생성(선이 한 점에 겹치지 않게 index). handle id 문자열의 마지막 `_` 뒤가 field id (canvas.tsx:824 `split('_').pop()`). useUpdateNodeInternals 로 행 수/펼침 변경 시 핸들 위치 갱신. 연결 중(useConnection)에는 핸들 표시/숨김 제어.
  - 엣지 relationship-edge.tsx: `getSmoothStepPath` + SVG `<marker>` 로 카디널리티 기호(marker-definitions.tsx: one/many × left/right × selected), 즉 crow's foot 은 마커 정의. 그 외 노드: area-node, note-node, dependency-edge(뷰 의존), temp-floating-edge/create-relationship-node(드래그로 만들기).
  - 자동 배치는 xyflow 아님: lib/domain/db-table.ts adjustTablePositions (그리드 + 연결 컴포넌트, 자체 구현). dagre 사용 흔적 없음(패키지 목록에도 없음).
- DDL: lib/data/sql-export/export-sql-script.ts(42.9KB). 방언별 export-per-type/{mssql,mysql,postgresql,sqlite,common}.ts 는 **결정론적**, 그 외(Oracle 포함)는 `OPENAI_API_KEY` 를 쓰는 LLM 경로로 위임(파일 상단 import 와 주석 "These do not use LLM and provide consistent, predictable output"). 즉 Oracle 결정론 생성기 없음(확인한 범위). diff: lib/domain/diff/ 는 화면용(added/removed/changed) 이고 SQL 마이그레이션 아님.

### drawDB (drawdb/src, React 18, JS, dagre 있음, @xyflow 아님: 자체 SVG)
- 저장: IndexedDB(Dexie, data/db.js) / JSON 스키마 data/schemas.js:
  - table {id, name, x, y, width?, fields[], comment, locked?, hidden?, collapsed?, indices[{name, unique, fields:[이름]}], uniqueConstraints?, color(#rrggbb), inherits?[]}
  - field {id, name, type, default, check, primary, unique, notNull, increment, comment, size?, values?[]} (필수 키 목록에 default/check/comment 포함)
  - relationship {id, name, startTableId, startFieldId, endTableId, endFieldId, cardinality:'one_to_one'|'many_to_one'|..., updateConstraint, deleteConstraint} + 신버전은 `fields:[{startFieldId,endFieldId}]` 복합 키 쌍(utils/utils.js:176 getRelationshipFields 가 구/신 겸용)
  - areas, notes, types(custom type), enums.
- 레이아웃: utils/autoArrange.js 가 `@dagrejs/dagre` (nodeSep 60, rankSep 110, 고립 표 격자) 사용, locked 표는 제외.
- diff -> ALTER (utils/migrations/diffToSQL.js 948줄, utils/diff.js 100줄):
  - `deepDiff(original, modified, acc)` (diff.js): 객체 배열은 **id 로 짝짓기**(`modArr.find(x => x.id === o.id)`), 키 경로 `tables[id=..,name=..]#fields[id=..,name=..]#size` 형태, 값은 `{from, to}`. id 가 있으면 매칭하고 없으면 삭제(`to:null`), 새 id 면 추가(`from:null`).
  - `generateMigrationSQL(diff, database, diagrams)` (241-): `{up[], down[]}` 둘 다 생성. tables: from만->DROP TABLE(down 에 toTable 재생성), to만->CREATE(toTable). 컬럼 속성별 case: type/size/notNull/default/check/comment/name/unique/primary/increment...
  - **rename 처리**: id 가 같고 name 만 달라진 경우 `{from, to}` 의 "name" 변경이 되어 RENAME 으로 출력 — 컬럼 `ALTER TABLE t RENAME COLUMN a TO b` (MSSQL 은 `EXEC sp_rename 't.a','b','COLUMN'`), 표 `ALTER TABLE a RENAME TO b` (MySQL/MariaDB `RENAME TABLE`, MSSQL sp_rename), 인덱스 `ALTER INDEX a RENAME TO b`, 제약 `RENAME CONSTRAINT`. down 은 from/to 맞바꾼 역문. 즉 이름이 아니라 **안정 id 를 키로** 삼기 때문에 이름 변경이 DROP+ADD 로 오인되지 않음. (이 설계가 id 기반 rename 의 핵심 사례.)
  - 주의 가능성(미검증): 컬럼 변경문이 키에서 뽑은 `name=` (원래 표 이름)을 쓰므로 같은 diff 안에서 표 rename 과 컬럼 변경이 섞이면 순서에 따라 옛 이름으로 ALTER 될 수 있어 보임(코드 흐름만 보고 추정, 실행 안 함).
  - Oracle: DB.ORACLESQL 분기가 있음 (identity `GENERATED BY DEFAULT AS IDENTITY`, COMMENT ON, COMMENT 는 별도 문). MODIFY/ADD 문 세부는 Oracle 분기 줄 293-324, 539 에 있으나 정확성 검증은 안 함. 컬럼명은 항상 따옴표(`"name"`)로 감쌈 -> 대소문자 구분 식별자가 됨(Oracle 에선 주의).
- 단독 Oracle 내보내기: utils/exportSQL/oraclesql.js (87줄).

## 8. 라이선스/채택 판단 근거
- erd-editor: MIT (LICENSE 확인, Copyright 2022 SeungHwan-Lee). 코드 인용·포크 가능.
- ChartDB / drawDB: AGPL-3.0 (LICENSE 첫 줄 GNU AFFERO). 사내 서비스라도 네트워크 제공 시 소스 공개 의무 문제 -> 코드 차용 금지, 설계 아이디어만.
