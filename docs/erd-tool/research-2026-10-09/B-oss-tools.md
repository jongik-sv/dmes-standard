# ERD 도구 조사 (오픈소스·상용) — 2026-10-09

조사 범위: 웹 조사만 수행(코드·저장소 변경 없음). 확인하지 못한 항목은 "확인 안 됨".
GitHub 수치(스타·마지막 push)는 api.github.com 응답 기준이며 대략값이다.

## 1. 오픈소스

### drawDB
- 저장소: https://github.com/drawdb-io/drawdb
- 라이선스: AGPL-3.0 (https://api.github.com/repos/drawdb-io/drawdb)
- 스타 약 39.9k, 마지막 push 2026-10-08
- 스택: React 18.2, Vite 8. @xyflow/react·konva·d3 없음. 렌더링은 SVG/DOM 추정(calcPath.js 존재), 확인 안 됨 (https://raw.githubusercontent.com/drawdb-io/drawdb/main/package.json)
- 큰 스키마 렌더링: 확인 안 됨 (arrangeTables.js, autoArrange.js 만 확인)
- 저장 JSON (src/data/schemas.js, https://raw.githubusercontent.com/drawdb-io/drawdb/main/src/data/schemas.js)
  - 최상위: `tables`, `relationships`, `notes`, `subjectAreas`(필수) / `types`, `enums`, `views`, `title`, `database`(선택)
  - table: `id, name, x, y, width, fields, comment, indices, color`
  - field: `id, name, type, default, check, primary, unique, notNull, increment, comment, size, values`
  - relationship: `startTableId, startFieldId, endTableId, endFieldId, name, cardinality, updateConstraint, deleteConstraint, id`
  - area(subjectArea): `id, name, x, y, width, height, color`
  - 위치는 테이블마다 평면 x, y (레이어 분리 없음)
- Oracle: DDL 생성 src/utils/exportSQL/oraclesql.js, import src/utils/importSQL/oraclesql.js 있음
- 논리명/물리명 구분: 없음 (name 하나)
- 도메인: types/enums 로 표현
- 식별/비식별: 플래그 없음, cardinality 만
- 다중 다이어그램: subjectAreas 는 영역 표시용이며 다이어그램 여러 개는 확인 안 됨
- 협업: CollabContext.jsx 의 emitDelta 가 빈 함수인 스캐폴드, 실동기화 없음 (https://raw.githubusercontent.com/drawdb-io/drawdb/main/src/context/CollabContext.jsx)
- 마이그레이션(diff→ALTER): 있음, src/utils/migrations/diffToSQL.js
- AI/MCP: MCP 없음. importAiDiagram.js 는 AI 응답 정규화만 하고 AI 를 호출하지 않음 (https://raw.githubusercontent.com/drawdb-io/drawdb/main/src/utils/importAiDiagram.js)
- 평: 일부 참고 (Oracle DDL 생성·import 와 diff→ALTER 기능 참고. AGPL 이라 코드 복사 불가)

### ChartDB
- 저장소: https://github.com/chartdb/chartdb
- 라이선스: AGPL-3.0 (https://api.github.com/repos/chartdb/chartdb)
- 스타 약 23.0k, 마지막 push 2026-09-13
- 스택: React 18.3, TypeScript, @xyflow/react ^12.8.2. 캔버스/SVG 세부 확인 안 됨 (https://raw.githubusercontent.com/chartdb/chartdb/main/package.json)
- 큰 스키마 렌더링: 확인 안 됨 (diagram-filter-context 존재만 확인)
- 모델
  - DBTable (src/lib/domain/db-table.ts): `id, name, schema?, x, y, fields, indexes, checkConstraints?, color, isView, createdAt, width?, comments?, order?, expanded?, parentAreaId?`
  - DBRelationship (src/lib/domain/db-relationship.ts): `id, name, sourceSchema?, sourceTableId, targetSchema?, targetTableId, sourceFieldId, targetFieldId, sourceCardinality, targetCardinality('one'|'many'), createdAt`
  - Diagram (src/lib/domain/diagram.ts): `id, name, databaseType, databaseEdition?, tables?, relationships?, dependencies?, areas?, customTypes?, notes?, createdAt, updatedAt`
  - DBField 정의 파일은 미확인
- Oracle: DatabaseType 에 ORACLE 있음. import 는 src/lib/data/sql-import/dialect-importers/oracle/ 에 있음. DDL 생성은 export-per-type 에 oracle 이 없어 미지원으로 보임
- 논리명/물리명: 확인 안 됨
- 식별/비식별: 플래그 없음
- 다중 다이어그램·협업: 확인 안 됨
- 마이그레이션: src/lib/domain/diff/ 에 table/field/relationship diff 있음. ALTER 생성 여부 확인 안 됨
- AI/MCP: ai, @ai-sdk/openai 로 OpenAI 키 또는 커스텀 엔드포인트 사용. MCP 없음 (package.json, README)
- 평: 모델 설계 참고 (DBTable/DBRelationship 분리가 깔끔함. Oracle 은 import 만. AGPL)

### Azimutt
- 저장소: https://github.com/azimuttapp/azimutt
- 라이선스: MIT (https://api.github.com/repos/azimuttapp/azimutt)
- 스타 약 2,191, 마지막 push 2026-08-25
- 스택: 백엔드 Elixir/Phoenix, 에디터 Elm. React·@xyflow 여부, 캔버스/SVG, 큰 스키마 렌더링 확인 안 됨
- 모델 (libs/models/src/database.ts): `Database{entities, relations, types}`, `Entity{name, schema, attrs, pk, indexes}`, `Attribute{name, type, null}`, `Relation{name, src, ref}`. 프로젝트 레이아웃은 libs/models/src/project.ts 의 `Layout{name, items}`
- Oracle: DatabaseKind 에 oracle 있음. DDL·ALTER 생성 확인 안 됨
- 논리명: Type.alias, EntityExtra.alias 정도. 식별/비식별 확인 안 됨
- 다이어그램: layouts 로 여러 뷰 지원. 협업은 팀 범위 문서화 수준
- diff: WIP, JSON diff 를 SQL 로 바꾼다고만 함 (https://github.com/azimuttapp/azimutt/tree/master/cli)
- AI/MCP: 확인 안 됨
- 평: 일부 참고 (DB 리버스 중심 탐색 도구. 스택이 달라 통째 사용은 어려움)

### ERD Editor (옛 vuerd)
- 저장소: https://github.com/dineug/erd-editor
- 라이선스: MIT
- 스타 약 1,723, 마지막 push 2026-10-09
- 스택: TypeScript 모노레포. 웹앱은 React PWA, 에디터 코어는 자체 r-html 기반 `<erd-editor>` 웹 컴포넌트. @xyflow 미사용, 캔버스/SVG 확인 안 됨
- 저장 JSON (packages/erd-editor-schema/src/v3/schema/index.ts)
  - 최상위: `$schema`, `version`("3.0.0"), `settings`, `doc`, `collections`
  - `collections`: `tableEntities`, `tableColumnEntities`, `relationshipEntities`, `indexEntities`, `indexColumnEntities`, `memoEntities`
  - Table: `id, name, comment, columnIds, seqColumnIds, ui{x, y, zIndex, widthName, widthComment, color}`
  - Column (tableColumn.entity.ts): `id, tableId, name, comment, dataType, default, options(비트: autoIncrement 1, PK 2, unique 4, notNull 8), ui{keys, ...}`
  - Relationship: `id, identification, relationshipType, onDelete, onUpdate, start/end{tableId, columnIds, x, y, direction}`
  - Memo: `id, value, ui{x, y, width, height, zIndex, color}`
  - 엔티티를 컬렉션으로 정규화하고 id 참조로 연결, 위치 등 UI 정보는 `ui` 로 분리
- Oracle: settings.database 에 Oracle 있음, DDL 내보내기 대상 포함. Oracle DDL 가져오기 확인 안 됨
- 논리명 구분: 확인 안 됨
- 협업: 실험 단계 WebRTC P2P
- 다이어그램 여러 개, ALTER 생성: 확인 안 됨
- AI/MCP: `@dineug/erd-editor-mcp` 패키지 있음 (https://github.com/dineug/erd-editor/tree/main/packages)
- 평: 모델 설계 참고 + 기반 후보 (MIT, Oracle DDL 출력, MCP 패키지 존재. 스택은 React+xyflow 와 다름)

### Liam ERD
- 저장소: https://github.com/liam-hq/liam
- 라이선스: Apache-2.0. 스타 약 5.1k. 마지막 커밋 확인 안 됨
- 스택: TypeScript, React 계열(react-flow 토픽 언급). @xyflow 사용·캔버스/SVG·큰 스키마 확인 안 됨
- 입력: PostgreSQL 중심. Oracle, 내부 스키마 JSON, 논리/물리명, 관계 표기, 다중 다이어그램, diff/마이그레이션 확인 안 됨
- MCP: 커뮤니티 MCP 서버만 확인(공식 아님, 스키마 JSON 조회용, diff 없음)
- CLI: `npx @liam-hq/cli init`
- 평: 일부 참고 (렌더링·리버스 UX 참고. Oracle 미확인)

### DBML (@dbml/core)
- 저장소: https://github.com/holistics/dbml, 문서 https://dbml.dbdiagram.io/docs/
- 라이선스: Apache-2.0. 스타 약 3.7k. 마지막 커밋 확인 안 됨
- 문법: Table, Ref(`<`, `>`, `-`, `<>`, `?` optional), Enum, Indexes, Note, Project, Table alias. TableGroup 확인 안 됨
- @dbml/core 상세(npm)는 403 으로 확인 안 됨. @dbml/connector 존재 확인
- Oracle, 내부 AST, 논리/물리 구분, 마이그레이션, MCP/AI 확인 안 됨
- 평: 일부 참고 (텍스트 DSL 문법 참고. Apache-2.0 이라 사내 사용 가능성 높음)

### Prisma ERD 류
- prisma-erd-generator: https://github.com/keonik/prisma-erd-generator. MIT, 스타 약 1.0k. 기본 Mermaid(svg/png/pdf/md/mmd), 선택 Graphviz(svg/dot). 크로우즈풋 미지원(Graphviz 경로). 마지막 커밋 확인 안 됨
- Prisma 자체가 Oracle 미지원이므로 Oracle 해당 없음
- Prisma Studio 공식 ERD 기능: 검색으로 확인 안 됨
- 대안: Atlas `schema inspect -w` (https://www.atlasgo.io/guides/orms/prisma/visualize)
- 평: 통째로 사용 불가. 생성 파이프라인 방식만 참고

### Mermaid erDiagram
- 문서: https://mermaid.js.org/syntax/entityRelationshipDiagram.html
- 속성 `type name PK/FK/UK "comment"`, 별칭 `[Alias]`, 방향 TB/BT/LR/RL, classDef/style, subgraph(v11.17+)
- 관계 `||--o{` 형태 카디널리티, `--` 식별 / `..` 비식별. 크로우즈풋 표기 가능
- 논리/물리 구분, 도메인, 다중 다이어그램, Oracle 특화 기능은 페이지에 없음
- 평: 통째로 사용 가능 (문서·간단 렌더링용. 모델은 얕음)

### SchemaSpy
- 저장소: https://github.com/schemaspy/schemaspy, 사이트 https://schemaspy.org/
- 라이선스 SPDX: 확인 안 됨. 최신 릴리스 v7.0.2 (게시 9월 20일, 연도 확인 안 됨). 스타 약 3.7k
- 스택: Java 17 이상, Graphviz 로 ER 다이어그램, HTML 출력. 대형 스키마 처리 확인 안 됨
- Oracle: README 에 "over a dozen" DB, JDBC 연결. Oracle 명시 없음. 리버스 전용, DDL 생성 없음
- 모델 포맷, 논리/물리명, 도메인, 식별/비식별, 다이어그램 분할, 협업, diff, AI/MCP: 확인 안 됨
- 평: 일부 참고 (리버스 결과 시각화·품질 점검용)

### pgModeler
- 저장소: https://github.com/pgmodeler/pgmodeler, 사이트 https://pgmodeler.io/
- 라이선스: 핵심 GPL-3.0, 상용 Plus 별도. 스타 약 3.6k, 커밋 약 6,989개
- 최신 안정 1.2.3 (2026-02-06), 베타 2.0.0-beta1 (2026-09-14)
- 스택: C++/Qt. 파일은 Git 친화적 분할 XML
- PostgreSQL 전용, Oracle 없음
- 기능: 객체 30여 종 시각 설계, DDL·SVG·PNG·HTML 내보내기, 관계 기반 컬럼 전파, 태그·색상·레이어. 주제 영역 언급 없음
- 리버스 엔지니어링과 diff&sync(ALTER/DROP/CREATE 생성)는 Plus 기능. 협업은 Git 기반(Plus)
- AI/MCP: 확인 안 됨
- 평: 모델 설계 참고 (Oracle 미지원. 설계 UI와 diff/ALTER 개념 참고)

### ERMaster / ERFlute
- ERMaster: 원본 SourceForge https://sourceforge.net/p/ermaster. Eclipse Marketplace Apache-2.0, 등록 2025-11-12 (https://marketplace.eclipse.org/content/ermaster)
- GitHub 포크 https://github.com/takahiro40264/ERMaster: 커밋 5개, 스타 0, Apache-2.0
- Oracle 지원: 포크 설명(Gitee https://gitee.com/tasfe/ermasterr)에 주장만 있고 원본 확인 안 됨
- ERFlute: 저장소 찾지 못함. 확인 안 됨
- 평: 일부 참고 (구식 Eclipse 도구)

## 2. 상용 참고

| 도구 | 가격 형태 | Oracle | 특징 | 근거 |
|---|---|---|---|---|
| dbdiagram.io | 무료 + Personal Pro (2023 공지 월 $14, 연간 $8/월, 현재가 확인 안 됨) | 확인 안 됨 | DBML 로 모델 작성, SaaS | https://docs.dbdiagram.io/release-notes/2023-11-personal-pro-pricing-update |
| DrawSQL | Free / Starter $19 / Growth $59 / Large $179 / Enterprise 별도 (월) | 확인 안 됨 | 웹 협업, 공유 링크. AI 크레딧, MCP 없음 | https://drawsql.app/pricing |
| Vertabelo (현 Redgate Data Modeler) | Standard $189 / Pro $303 (사용자·년, 경쟁사 블로그 인용, 공식 확인 안 됨) | 지원 | 2025-09 Redgate 인수, 실시간 협업·버전 기록, DDL·변경 스크립트, 논리 모델은 Pro. MCP 없음 | https://www.red-gate.com/products/redgate-data-modeler |
| erwin Data Modeler (Quest) | 구독, 공개 가격 없음 | 확인 안 됨 | Complete Compare 양방향 동기화·ALTER, 서브젝트 영역, 도메인 | https://origin.quest.com/documents/erwin-data-modeler-datasheet-147769.pdf |
| ER/Studio (IDERA) | 견적제 | 지원 | 재사용 도메인, 용어집, 저장소(Pro), AI 모델 빌더. MCP 확인 안 됨 | https://erstudio.com/ |
| Oracle SQL Developer Data Modeler | 무료 | 지원 (DDL 생성·역공학) | .dmd 내부 포맷 확인 안 됨. 공식 개요 페이지 403 | — |
| Navicat Data Modeler | 영구 상용, 무료 Lite | 지원 | 역공학·DDL 출력. 비교 후 동기화 스크립트 명시 안 됨. AI 테이블 생성 | https://www.navicat.com/en/products/navicat-data-modeler |
| DataGrip 다이어그램 | 상용 구독 (비상용 무료) | 확인 안 됨 | IDE 안 다이어그램, AI Assistant. MCP 페이지에 없음 | https://lp.jetbrains.com/features-overview/ |

상용 참고 포인트
- dbdiagram: 텍스트 DSL 을 버전 관리하기 쉬운 형식으로 저장
- DrawSQL: 웹 협업과 공유 링크 UX
- Redgate/Vertabelo: 논리·물리 모델 분리 구조
- erwin: 모델 비교 후 ALTER 스크립트 생성 흐름
- ER/Studio: 재사용 도메인과 용어집 연계
- SQL Developer DM: 무료 Oracle DDL 역공학 기준선
- Navicat: DDL 붙여넣기로 역공학 입력
- DataGrip: IDE 안에서 스키마와 다이어그램 동시 확인

상용 도구의 소스·포맷을 코드에 포함하면 라이선스 문제가 생긴다.

## 3. 결론

### 라이선스 주의
- AGPL-3.0: drawDB, ChartDB. 사내 전용이라도 수정본을 네트워크로 제공하면 소스 공개 의무가 생길 수 있다. 코드 복사 금지, 구조·아이디어만 참고. 법무 확인 필요.
- MIT: Azimutt, ERD Editor, prisma-erd-generator. 고지 조건만 지키면 사용 가능.
- Apache-2.0: Liam, DBML, ERMaster(Eclipse Marketplace). 사용 가능.
- GPL-3.0: pgModeler. 복사 시 GPL 전파 주의. Oracle 미지원이라 실익 낮음.

### (a) 통째로 가져다 쓸 만한 것
- 1순위 후보: ERD Editor (MIT). Oracle DDL 출력, v3 정규화 JSON, MCP 패키지가 갖춰져 있다. 다만 React+@xyflow 가 아니라 자체 웹 컴포넌트 기반이라 포크 시 UI 재작성 범위가 크다.
- 그 외 통째 채택 후보는 확인되지 않았다. 나머지는 PostgreSQL 전용, 상용, 또는 AGPL 이다.

### (b) 일부 코드·기법 참고 (라이선스 확인 후)
- Oracle DDL 생성·import, diff→ALTER: drawDB (AGPL, 아이디어만)
- 표 노드·관계선 끝 모양(crow's foot): Mermaid erDiagram 문법(MIT 문서)이 표기 기준으로 적합. 실제 구현 코드는 확인 안 됨
- 자동 배치: drawDB arrangeTables.js, autoArrange.js (AGPL, 아이디어만). 알고리즘은 dagre 로 직접 구현 가능
- 렌더링 참고: Liam (Apache-2.0), 구현 세부 확인 안 됨

### (c) 모델 JSON 설계 참고
- 1순위: ERD Editor v3 (collections 정규화, id 참조, ui 분리, 비트 플래그 옵션)
- 2순위: ChartDB DBTable/DBRelationship 분리, Diagram 구조
- 3순위: Azimutt Database/Entity/Relation/Layout 분리
- 텍스트 입력 형식: DBML 문법
- 주의: drawDB 는 위치가 테이블 안에 섞여 있어 참고 가치가 낮다

### 사내 요건 대비 공백
- 논리명/물리명 구분: 조사한 도구 대부분 확인 안 됨. 자체 설계 필요
- 도메인 개념(MDM 용어·도메인 사전 연동): 전 도구 확인 안 됨. ER/Studio 의 재사용 도메인 개념만 참고
- 식별/비식별: Mermaid 문법, ERD Editor identification 플래그
- 다중 주제 영역: drawDB subjectAreas, Azimutt layouts 정도
- MCP: ERD Editor 가 실제 패키지 보유. 나머지는 없거나 확인 안 됨

## 핵심 URL
- drawDB: https://github.com/drawdb-io/drawdb
- ChartDB: https://github.com/chartdb/chartdb
- Azimutt: https://github.com/azimuttapp/azimutt
- ERD Editor: https://github.com/dineug/erd-editor
- Liam: https://github.com/liam-hq/liam
- DBML: https://github.com/holistics/dbml
- Mermaid erDiagram: https://mermaid.js.org/syntax/entityRelationshipDiagram.html
- SchemaSpy: https://schemaspy.org/
- pgModeler: https://pgmodeler.io/
- ERMaster: https://marketplace.eclipse.org/content/ermaster
