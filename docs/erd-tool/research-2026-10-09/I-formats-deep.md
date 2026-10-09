# I. ERD 도구 파일 포맷 — 1차 자료 확인 (2026-10-09)

받은 파일 위치: /private/tmp/claude-501/-Users-jji-project-dmes-standard/9e6c2a83-94bd-41e7-8530-d751dd7fb9ea/scratchpad/erd/formats/
(읽기만 함. 실행·설치 없음. 표기: 확인 안 됨 = 이번에 근거를 못 얻음)

---
## 1. DBML  (formats/dbml/repo = holistics/dbml 34108bb, v10.3.1 2026-10-09)
출처 원문: dbml-homepage/docs/docs.md (핵심 문법), docs/syntax/enrichment-visualization.md (시각화 요소), docs/syntax/module-system.md (파일 분할)
파서: packages/dbml-parse (수제 TS 파서. PEG/EBNF 문법 파일은 없음 — 스냅샷 시험 .in.dbml 이 사실상 명세)

### Table / 컬럼 settings
```
Table core.users as U [headercolor: #3498DB, note: 'x'] {      // schema.name, alias(as), 표 settings
  id integer [pk, increment, not null, unique, default: 123, note: 'Number']
  email varchar(255) [unique, not null, default: `now()`, check: `email <> ''`]
  user_id int [ref: > users.id]                                    // inline ref (settings/이름 불가)
  Note: 'table note'                                               // 또는 Note { '...' }
  indexes { (id, country) [pk]  created_at [name: 'idx', type: hash, note: 'Date'] }
}
```
- 컬럼 settings 목록(원문): primary key|pk, null|not null, unique, default, increment, check(백틱), note. 자유형 속성 `[classification: "confidential"]` 허용.
- 표 settings: headerColor/headercolor, note, 자유형 속성(`Table users [owner: "data-team"]`).
- 타입에 공백이 있으면 큰따옴표 `"double precision"`. 지원 안 되는 setting 은 타입명에 붙이는 우회(`id "bigint unsigned" [pk]`)를 원문이 권장.
### Ref
```
Ref name_opt: schema1.table1.column1 < schema2.table2.column2          // 단문
Ref { products.merchant_id > merchants.id [delete: cascade, update: no action, color: #79AD51] }
Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)   // 복합키
```
- 연산자 `<` 1:N, `>` N:1, `-` 1:1, `<>` N:M. 최신판은 `?` 로 선택(optional) 쪽 표시: `>?`, `?>` (이전 조사 메모의 `>?` 확인됨).
- delete/update: cascade | restrict | set null | set default | no action. inline ref 에는 이름·settings 불가.
- 식별/비식별 구분 문법은 없음(원문에 없음).
### Enum / TablePartial / Records
```
enum job_status { created [note: 'Waiting to be processed']  running  done }
TablePartial base_template [headerColor: #ff0000] { id int [pk, not null]  created_at timestamp [default: `now()`] }
Table users { ~base_template  name varchar }            // ~ 로 주입, 충돌은 로컬>마지막 주입 순
records users(id, name) { 1, 'Alice' ; 2, 'Bob' }       // 표당 1개. 표 안에서는 열목록 생략 가능
```
### 시각화 계열 (enrichment-visualization.md — "SQL 대응이 없고 dbdiagram/dbdocs 시각화용" 이라고 원문이 명시)
```
TableGroup e_commerce [note: '...', color: #3498DB] { merchants  countries }     // 주제 영역 비슷, 표는 여러 그룹 가능 여부 확인 안 됨
Note single_line_note { 'This is a sticky note' }                                // 캔버스 스티키 노트
Project project_name { database_type: 'PostgreSQL'  Note: 'desc' }
Metadata Table users { owner: 'scott' }  /  Metadata Column users.id { pii: 'true' }   // 외부 속성 블록(최신)
DiagramView sales_view { Tables { users orders }  Notes { reminder_note }  TableGroups { group_2 }  Schemas { core } }
DiagramView full_view { Tables { * }  Notes { * }  TableGroups { * }  Schemas { * } }   // * = 전체, 빈 블록 = 아무것도 안 보임
```
- **DiagramView 가 있다**: 이름 붙은 보기 여러 개. 선택 단위는 표/노트/표그룹/스키마 이름(필터). 좌표·크기는 담지 않음.
- 위치(좌표) 정보: 문법·docs 어디에도 없음(docs 전체에서 position/coordinate/layout grep 결과 없음 — 확인됨). dbdiagram 이 좌표를 어디 저장하는지는 확인 안 됨(DBML 파일에는 없음).
### 파일 분할 (module-system.md) — 6번 항목 근거
```
use * from './base'
use { table auth.users as u  tablegroup auth_core  schema auth  enum e  note n  tablepartial p } from './auth'
// reuse 로 재수출(Re-Exporting with `reuse`)
```
- 표 하나에 파일 하나로 쪼갤 수 있는 공식 기능. 표는 `schema.table` 이름으로 식별(고정 ID 없음).
### 논리명/물리명·도메인
- 논리명 전용 키 없음. alias(as)·note·자유형 속성/Metadata 로 흉내. 도메인(타입 재사용) 개념 없음(Enum, TablePartial 만). 자유 속성으로 `[domain: "..."]` 같이 달 수는 있음(문법상 허용, 의미는 도구 몫).
- 고정 ID: 없음, 이름 기반.

---
## 2. Oracle SQL Developer Data Modeler (.dmd + 폴더)
받은 곳: formats/dmd/
- pep/ = jmlondon/PEP-Telemetry-Data-Model 전체 클론(oracle/pep_telemetry.dmd + 폴더, 144 파일, 엔티티 15·관계 12·표 15·FK 12)
- puazhi/ = PuaZhiXian/Advance-Database (p-plus 설계, 도메인 파일 포함) 일부
- alberto/ = Alberto-Frigatto/DriveLink (dl_settings, .dmd)
- skill/ = kemal-faza/oracle-datamodeler-skill (2026-10 기준 제3자 스킬. 폴더 구조·좌표 재작성 설명이 있어 교차 확인용. fixture 는 합성이라 실물 근거로 쓰지 않음)
- 같은 구조 커밋 저장소 확인: nefertitidamnjanovic/Database-Language-School, magdalena-reljin/BazePodataka2, nathanvdev/GymPlus, tigranbs/virtualbox(VirtualBox TestManagerDatabase, svn 사본), GiancarloJung/disrupt_2021 등. 이들은 gh api 트리 목록으로만 구조 확인(내려받지 않음).

### 최상위: .dmd 는 439바이트 스텁
```xml
<OSDM_Design class="oracle.dbtools.crest.model.design.Design" name="pep_telemetry" id="B02F8FDA-9EE8-B2A9-FD3B-A329A12BE3DC" version="3.5">
<createdBy>Josh.London@afsc.noaa.gov</createdBy><createdTime>2013-03-27 16:58:22 UTC</createdTime>
<ownerDesignName>pep_telemetry</ownerDesignName><capitalNames>false</capitalNames><designId>B02F8FDA-...</designId>
</OSDM_Design>
```
### 폴더 트리 (pep 실측, 파일 수)
```
<이름>.dmd                                   # 스텁
<이름>/dl_settings.xml                       # 설정(글꼴·색, 분류 타입 Fact/Dimension 등)
<이름>/logical/Logical.xml                   # 논리 모델 루트(mainViewID)
<이름>/logical/entity/seg_0/<GUID>.xml       # 엔티티 1개당 파일 1개 (15)
<이름>/logical/relation/seg_0/<GUID>.xml     # 논리 관계 1개당 파일 1개 (12)
<이름>/logical/arc|inheritance/seg_0/*.xml   # 배타 아크·상속(다른 저장소에서 확인)
<이름>/logical/subviews/<GUID>.xml           # 다이어그램(=서브뷰) 1개당 파일 1개: 좌표+연결선
<이름>/logical/Objects.local, Diagrams.local # 색인/캐시 (*.local = 엔진이 다시 씀)
<이름>/domains/<파일명>.xml                  # 도메인 파일(puazhi 저장소에서 확인; pep 에는 없음)
<이름>/datatypes/..., businessinfo/, pm/, rdbms/<이름>_RDBMSSites.xml
<이름>/rel/<관계형모델ID>.xml                # 관계형 모델 루트
<이름>/rel/<ID>/table/seg_0/<GUID>.xml       # 표 1개당 파일 1개 (15)
<이름>/rel/<ID>/foreignkey/seg_0/<GUID>.xml  # FK 1개당 파일 1개 (12)
<이름>/rel/<ID>/subviews/<GUID>.xml          # 관계형 다이어그램(좌표)
<이름>/rel/<ID>/phys/<RDBMS사이트ID>/{Table,Sequence,Trigger,View,User,TSpace,...}/seg_0/*.xml  # 물리(Oracle 전용) 객체
<이름>/mapping/ExtendedMap_RM<관계형모델ID>.xml   # 논리↔관계형 매핑표
```
- `seg_0` = directorySegmentName. 한 폴더에 파일이 많아지면 seg_1.. 로 나뉘는 분할 폴더(이 이상은 확인 안 됨, 이름과 속성 `directorySegmentName="seg_0"` 으로만 추정).
### 엔티티 (logical/entity/seg_0/0053EB34-….xml)
```xml
<Entity class="oracle.dbtools.crest.model.design.logical.Entity" id="0053EB34-B95E-F854-9C47-DEE72E30BF3A" directorySegmentName="seg_0" name="STATUS">
<createdBy>…</createdBy><createdTime>2013-03-27 17:14:00 UTC</createdTime>
<generatorID>94E61DD5-E98C-53A6-D5F0-7419ACF6DFCC</generatorID>        <!-- 엔지니어링으로 생긴 관계형 표의 ID -->
<engineerTo><item key="D4A43586-65BC-3A8A-BC2E-3943E7A994D4" value="true"/></engineerTo>   <!-- 대상 관계형 모델 ID -->
<pkName>STATUS_PK</pkName> … <fonts><FontObject>…(글꼴 8개 반복)…</fonts>
<attributes>
 <Attribute class="…logical.Attribute" name="STATUSID" id="3B29BCCB-3596-EABA-98D1-2C7309E707FA">
   <createdBy/><createdTime/><generatorID>5C9168E4-…</generatorID> <engineerTo>…</engineerTo>
   <referedAttribute>0E953581-…</referedAttribute>   <!-- FK 로 들어온 속성이 원본 속성을 가리킴 -->
   <nullsAllowed>true</nullsAllowed><useDomainConstraints>false</useDomainConstraints>
   <use>1</use><logicalDatatype>LOGDT019</logicalDatatype><dataTypeSize>22</dataTypeSize>
   <domain>C060DD19-FE00-2138-A571-F7E98F7965DB</domain>     <!-- 도메인 참조는 GUID (puazhi 실물) -->
 </Attribute> …
</attributes>
<identifiers><identifier class="…CandidateKey" id="86C0D67A-…" name="STATUS_PK"><pk>true</pk>
  <usedAttributes><attributeRef>3B29BCCB-…</attributeRef></usedAttributes></identifier></identifiers>
</Entity>
```
- 속성은 `<attributes>` 안에 같은 파일. 순서는 모델 순서(정렬 강제 없음). 엔티티 `name` 은 논리명(puazhi 실물: 엔티티 "department", 속성 "department id" — 공백 포함 가능).
### 논리 관계 (logical/relation/seg_0/087A1040-….xml)
```xml
<Relation class="…logical.Relation" name="PEPMORPHS_PEPCAPTUREDATA_FK" id="087A1040-…" directorySegmentName="seg_0">
 <dominantRole>07247577-…</dominantRole><identifying>true</identifying>
 <optionalSource>true</optionalSource><optionalTarget>false</optionalTarget>
 <sourceCardinality>1</sourceCardinality><sourceEntity>07247577-…</sourceEntity>
 <targetCardinalityString>1</targetCardinalityString><targetEntity>9CCC9DBF-…</targetEntity><transferable>true</transferable>
</Relation>
```
→ 식별/비식별(`identifying`), 선택성, 카디널리티 모두 표현.
### 관계형 표 (rel/<ID>/table/seg_0/15572D34-….xml) — 컬럼·인덱스·FK 연결
```xml
<Table class="…relational.Table" id="15572D34-…" directorySegmentName="seg_0" name="PEPDEPLOYMENTS">
 <sourceConnName>test_peptel</sourceConnName> …   <!-- DB 역공학 출처(이 샘플은 역공학) -->
 <pkName>PEPDEPLOYMENTS_PK</pkName>
 <columns><Column class="…relational.Column" name="SPENO" id="235397D2-…">
   <logicalDatatype>LOGDT024</logicalDatatype><dataTypeSize>11 BYTE</dataTypeSize><delegate>E124AF59-…</delegate>
   <associations><colAssociation fkAssociation="D7481F9A-…" referredColumn="E124AF59-…"/></associations></Column>…</columns>
 <indexes><ind_PK_UK … name="PEPDEPLOYMENTS_PK"><pk>true</pk><indexState>Primary Constraint</indexState>
   <indexColumnUsage><colUsage columnID="857A0D12-…"/></indexColumnUsage></ind_PK_UK> …</indexes>
</Table>
```
- FK 파일(rel/<ID>/foreignkey/seg_0/*.xml): `<FKIndexAssociation name="STATUS_PEPCAPTUREDATA_FK"><containerWithKeyObject>부모표ID</containerWithKeyObject><deleteRule>NO ACTION</deleteRule><localFKIndex>…</localFKIndex><keyObject>…</keyObject><mandatory>true</mandatory>`
### 논리 ↔ 관계형 매핑
- 엔티티/속성 `generatorID` = 엔지니어링으로 생긴 관계형 표/컬럼 ID (pep 에서 STATUS 엔티티 generatorID 94E61DD5… = 관계형 표 ID).
- 엔티티 `engineerTo` = 대상 관계형 모델 ID 목록.
- 명시 매핑표 mapping/ExtendedMap_RM<ID>.xml:
```xml
<CM class="…xtdmapping.ContainerMapping" id="0053EB34-…" lID="0053EB34-B95E-…(엔티티)" lT="0" rID="94E61DD5-…(표)" rT="4">
 <containedMappings><Mg class="…RelMapping" id="037601BA-…" lID="037601BA-5EEB-…(속성)" rID="DDD89D39-…(컬럼)"/>…
```
  puazhi 저장소에서는 표 파일 id 와 엔티티 generatorID 가 일치하지 않는 경우가 있어(수동 생성 표 등) 매핑표(lID/rID)가 정본으로 보임.
- 논리명/물리명: 논리 엔티티·속성은 `name`(논리), 관계형 표·컬럼은 `name`(물리). 별도 "물리명" 필드는 없고 모델이 두 벌. 변환 규칙은 Naming Standards(용어집)가 담당하며 이 샘플엔 없음 → 한 개체에 논리명+물리명을 한 줄로 담는 구조는 아님.
### 도메인
- 설계 폴더의 domains/DDL_Domains.xml (puazhi 실물):
```xml
<DomainFile class="oracle.dbtools.crest.model.design.DomainFileWrapper" fileName="DDL_Domains"><domains>
<Domain class="oracle.dbtools.crest.model.design.Domain" name="VARCHAR_0_0_255" id="5BE2972A-80E5-5796-B8E4-53E39850110D">
 <dataTypePrecision>0</dataTypePrecision><dataTypeScale>0</dataTypeScale><dataTypeSize>255</dataTypeSize>
 <fileName>DDL_Domains</fileName><logicalDatatype>LOGDT024</logicalDatatype></Domain>…
```
- 속성/컬럼은 `<domain>GUID</domain>` + `<useDomainConstraints>` 로 참조. 설치 폴더에 전역 기본 도메인 파일(types/defaultdomains.xml, freebsd-ports pkg-plist 로 존재 확인)도 있음. 도메인 값 목록·제약은 이 샘플 파일에 없어 확인 안 됨.
- 이 샘플의 pep/dl_settings.xml 의 `<domains>` 는 빈 구분자 설정뿐.
### 서브뷰(주제 영역)·좌표
- logical/subviews/<GUID>.xml, rel/<ID>/subviews/<GUID>.xml 한 파일이 다이어그램 하나(`<Diagram class="…swingui.logical.DPVLogical" name="Logical" id=…>`).
```xml
<objectViews><OView class="oracle.dbtools.crest.swingui.logical.TVEntity" oid="0053EB34-…(엔티티ID)" otype="Entity" vid="98BA991F-…(뷰 ID)">
  <bounds x="1416" y="732" width="299" height="764"/></OView>…
<connectors><Connector class="…TVRelation" oid="087A1040-…(관계ID)" otype="Relation" vid_source="…" vid_target="…">
  <lineWidth>1</lineWidth><points><point x="996" y="959"/><point x="996" y="1027"/></points></Connector>…
```
- 좌표는 엔티티 파일과 분리, 다이어그램 파일에만 있음. 관계선 꺾임점도 `<points>`. 한 객체를 여러 서브뷰에 올릴 수 있는 구조(OView.oid 로 참조). 실물 샘플에서 메인 뷰 말고 추가 서브뷰(주제 영역)가 여러 개인 저장소는 직접 열어보지 못함 → "다이어그램 여러 개" 구조는 파일 구조상 가능하나 실측은 확인 안 됨.
### GUID 방식
- 모든 객체 `id`=대문자 GUID(8-4-4-4-12). 파일 이름 = id. 관계형 모델 폴더만 짧은 ID(`D4A43586-3943E7A994D4`, GUID 앞뒤 일부 결합). 이름을 바꿔도 id 불변 → 고정 ID.
- 모든 객체에 `createdBy`, `createdTime`(UTC 문자열) 포함. 수정시각은 안 넣음(그래서 수정해도 시각 노이즈는 적음).
### git diff 친화성 (실측 관찰)
- 장점: 객체 1개=파일 1개(엔티티·관계·표·FK), 이름이 GUID 라 이름 바꿔도 파일이 이동하지 않음, 좌표는 subviews 파일로 분리 → 모델 변경과 레이아웃 변경이 다른 파일. 병합 충돌이 객체 단위로 격리.
- 단점: 파일명이 GUID 라 사람이 읽기 어려움; 한 표 편집 시 논리 엔티티·관계형 표·ExtendedMap(72KB 단일 파일)·FK 파일 여러 곳이 같이 바뀜; 엔티티마다 FontObject 8개 보일러플레이트; `*.local`·dmd_open.local 같은 캐시 파일도 같이 커밋되는 저장소가 대부분(제3자 스킬도 "*.local 은 캐시" 라고 명시); DeletedMap_RM*.xml 이 수십~수백KB 로 커짐(BazePodataka2 146KB, GymPlus 264KB); 저장 시 Data Modeler 가 전체를 다시 쓰므로 순서가 달라질 수 있음(확인 안 됨).
- 한 곳에서 보이는 단점: 이전 조사에서 "표 하나 파일 하나" 의 실제 예 = 바로 이 구조.

---
## 3. Azimutt AML  (formats/aml/repo = azimuttapp/azimutt 3f79c29; docs HTML = formats/aml/doc-*.html/.txt, azimutt.app/docs/aml)
### 문법 (libs/aml/resources/full.aml 원문)
```
users # 가장 단순한 엔티티
  id uid pk
  first_name varchar unique=name              # =name 은 제약 이름(같은 이름이면 복합)
  email varchar unique check
  is_admin bool=false                          # =기본값
cms.posts as p {color: red, tags: [pii]} | 설명(문서)          # 스키마 접두, 별칭, {속성}, | 문서
  id int pk {autoIncrement, tags: [id]}
  status post_status                          # 타입
  settings json nullable
    slug string unique                         # 들여쓰기 = 중첩 속성(JSON)
  created_by int -> users(id)                  # 인라인 관계
post_members
  post_id uuid pk=post_members_pk -> cms.posts(id)
rel comments(item_id) -item_kind=User> users(id)   # 다형 관계
rel events(created_by) -> users(id) {onDelete: cascade, onUpdate: "no action"}
organizations
  id int pk <> users                          # N:M ;  `--` 은 1:1 ;  `->` N:1
admins {view}                                  # 뷰
type cms.post_status (draft, published, archived)    # enum / `type uid int` 별칭 / `type position {x int, y int}` 구조체
namespace social.                              # 이후 기본 네임스페이스
# 한 줄 주석은 # ; 문서는 | 한 줄 또는 ||| 여러 줄 |||
```
- 속성 `{key: value}` 의 표준 키(원문 docs/properties): 엔티티 view, color, tags / 속성 autoIncrement, hidden, tags / 관계 onUpdate, onDelete. "고려 중이나 미구현": icon, **position: [left, top]**("라이브러리가 기본 위치로 쓸 예정, 아직 처리 안 함"), notes, deprecated.
- 논리명/물리명 분리 없음(별칭 as 만). 도메인 = `type` 별칭/enum. 식별/비식별 구분 없음.
### 레이아웃 저장
- AML 문서 안에는 좌표·다이어그램 구분 없음. AML 은 구조(엔티티·관계·문서)만.
- 프로젝트 JSON 의 레이아웃(원문 libs/models/src/legacy/legacyProject.ts):
```ts
LegacyLayout = { canvas?: {position,zoom}, tables: LegacyTableProps[], tableRows?, groups?, memos?, links?, createdAt, updatedAt }
LegacyTableProps = { id: LegacyTableId, position: {left,top}, size: {width,height}, color, columns: ColumnName[], selected?, collapsed?, hiddenColumns? }
LegacyMemo = { id, position, size, content,… }   Project.layouts: Record<LayoutName, Layout>   // 다이어그램 여러 개 = layouts 맵
```
- 신판 모델(libs/models/src/project.ts)은 "FIXME: Work In Progress", `LayoutItem = z.object({})`(비어 있음)로 아직 정의 안 됨. EntityDoc(alias/doc/tags/color/props/attrs)가 metadata 로 별도.
- 고정 ID: 없음(이름 기반 EntityId). git 친화: 텍스트 한 파일, 줄 단위 diff 매우 좋음.

---
## 4. 그 밖의 포맷
### 4-1. MySQL Workbench .mwb  (formats/other/sakila.mwb = dungdm93/bookshelf 의 Git LFS 파일을 media.githubusercontent.com 으로 받음, mwb-x/document.mwb.xml 669KB)
- .mwb = zip. 안에 document.mwb.xml, `@db/`, `lock`. XML 은 GRT 직렬화:
```xml
<data grt_format="2.0" document_type="MySQL Workbench Model" version="1.4.4">
 <value type="object" struct-name="workbench.Document" id="C158C6B6-…" struct-checksum="0x7131bf99">
  <value _ptr_="0x600003ae2ee0" type="list" content-type="object" content-struct-name="workbench.logical.Diagram" key="diagrams"/>
  <value type="object" struct-name="db.mysql.Table" id="18243273-…"> … <value type="string" key="comment"></value> …
  <value type="object" struct-name="db.mysql.Column" id="F43EBDD7-…"> <value type="int" key="autoIncrement">0</value> <value type="string" key="defaultValue">''</value> …
  <value type="object" struct-name="workbench.physical.TableFigure" id="4892C789-…">     <!-- 다이어그램 위 표 도형 -->
     <link type="object" struct-name="db.Table" key="table">18243273-…</link>
     <value type="real" key="left">62</value> <value type="real" key="top">897</value> <value type="real" key="width">105</value> <value type="real" key="height">130</value>
     <value type="string" key="color">#98BFDA</value> <link … key="layer">377D59F5-…</link> <link … struct-name="model.Diagram" key="owner">A16012B8-…</link>
```
- struct 수: db.mysql.Table 50, db.mysql.Column 143, db.mysql.ForeignKey 46, workbench.physical.Connection 25(관계선), model.Diagram 57 등.
- 논리/물리: 개념상 "논리 모델"(workbench.logical.Model) 은 비어 있고 물리 모델만 실사용. 논리명 별도 필드 없음(`comment` 로 대체). 도메인: UserDatatype 1건 정도, 사실상 없음.
- 좌표: TableFigure 의 left/top/width/height(다이어그램 `owner` 로 소속). 다이어그램 여러 개 가능(model.Diagram), layer(model.Layer) 도 있음. ID: 대문자 GUID. 
- git: 바이너리 zip, XML 에 `_ptr_="0x…"` 메모리 주소·`struct-checksum` 이 저장마다 달라져 diff 소음. 부적합.
### 4-2. pgModeler .dbm  (formats/other/pg-demo.dbm, pg-example.dbm, pg-northwind.dbm = pgmodeler/pgmodeler assets/samples)
```xml
<dbmodel pgmodeler-ver="1.1.0-beta" last-position="0,0" last-zoom="0.7" max-obj-count="9" default-schema="public" layers="Default layer" active-layers="0" layer-name-colors="#000000" layer-rect-colors="#ce266e" show-layer-rects="false">
<schema name="schema_a" layers="0" rect-visible="true" fill-color="#df83eb" name-color="#000000"/>
<tag name="red_tables"><style id="table-title" colors="#ff0000,#aa0000,#710000"/>…</tag>
<table name="table_a" layers="0" collapse-mode="2" max-obj-count="2" z-value="0">
  <schema name="public"/><role name="postgres"/><position x="120" y="720"/>
  <column name="id_a" not-null="true"><type name="serial" length="1"/></column>
  <constraint name="table_a_pk" type="pk-constr" table="public.table_a"><columns names="id_a" ref-type="src-columns"/></constraint>
</table>
<domain name="email" not-null="true"><schema name="public"/><role name="postgres"/><type name="varchar" length="256"/></domain>
<relationship name="table_a_has_many_table_d" type="rel1n" src-table="public.table_a" dst-table="schema_a.table_d" src-required="true" dst-required="false" identifier="true">
  <label ref-type="src-label"><position x="15.01" y="-12.2"/></label></relationship>
<textbox name="…" …><position x="20" y="20"/><comment><![CDATA[…]]></comment></textbox>
```
- 이름 기반(고정 ID 없음; 객체는 name + 스키마). 표 좌표는 `<position>` 이 표 요소 안에(모델과 좌표가 같은 요소). 레이어(layers) 로 다이어그램 뷰 분리 비슷하게 지원. 도메인은 PostgreSQL DOMAIN. 논리명 필드 없음. 한 파일 전체. git: 요소마다 줄이 나뉘어 diff 는 괜찮으나 좌표 변경이 표 정의와 섞임.
### 4-3. PowerDesigner .pdm  (formats/other/slickflow.pdm = besley/Slickflow, 252KB, 버전 16.5, SQL Server)
```xml
<?PowerDesigner … Target="Microsoft SQL Server 2008" Type="{CDE44E21-…}" signature="PDM_DATA_MODEL_XML" version="16.5.0.3982"?>
<o:Table Id="o22"><a:ObjectID>E93A7AA7-4D9D-439F-8B6F-1E1BC10B6FB9</a:ObjectID><a:Name>业务流程记录日志表</a:Name><a:Code>BizAppFlow</a:Code>…
 <c:Columns><o:Column Id="o48"><a:ObjectID>412515FC-…</a:ObjectID><a:Name>ID</a:Name><a:Code>ID</a:Code><a:DataType>int</a:DataType><a:Identity>1</a:Identity><a:Column.Mandatory>1</a:Column.Mandatory>…
<o:Reference Id="o11"><a:Name>FK_WfActivityInstance_ProcessInstanceID</a:Name><a:Cardinality>0..*</a:Cardinality>
 <c:ParentTable><o:Table Ref="o27"/></c:ParentTable><c:ChildTable><o:Table Ref="o12"/></c:ChildTable><c:ParentKey><o:Key Ref="o207"/></c:ParentKey>
 <c:Joins><o:ReferenceJoin Id="o351"><c:Object1><o:Column Ref="o179"/>…
<o:TableSymbol Id="o7"><a:Rect>((-37778,1125), (-19138,37599))</a:Rect><a:LineColor>…</a:LineColor><a:FillColor>…</a:FillColor>…
```
- Name = 논리명, Code = 물리명(한 요소 안에 둘 다) — 한 객체에 논리/물리 병기 구조의 실물. 로컬 Id(`o22`)와 전역 ObjectID(GUID) 둘 다. 좌표는 TableSymbol/ReferenceSymbol 의 Rect(디자이너 안 별도 심볼 객체; PhysicalDiagram 다이어그램 2개 `<o:PhysicalDiagram>`). 도메인은 `<o:PhysicalDomain>` 이 표준이나 이 샘플엔 0개 → 확인 안 됨. 헤더에 "do not edit this file" 주석, CreationDate/ModificationDate 가 객체마다 있어 diff 소음 큼. 한 파일.
### 4-4. ERwin XML (formats/other/erwin/)
- 실물 ERwin 내보내기 샘플은 GitHub 검색으로 못 찾음(확인 안 됨).
- 대신 제3자 구현 OsamaAdeel/Erwin-Data-Modeller-Lite 의 emitter.ts/sample-erwin.xml 로 구조 단서만:
  네임스페이스 `http://www.erwin.com/dm`(루트 `<erwin FileVersion="9.98.29174" Format="erwin_Repository">`), `EMX=…/dm/data`, `UDP=…/dm/metadata`, `EM2=…/dm/EM2data`. 요소 `EMX:Entity/EMX:EntityProps(Name, Long_Id, Physical_Name, Type, Attributes_Order_Ref_Array…)`, `EMX:Attribute/AttributeProps(Physical_Name, Logical_Data_Type, Parent_Domain_Ref)`, `EMX:Domain_Groups`, `EMX:Key_Group`, id 형식 `{GUID}+00000000`. 즉 Name(논리)·Physical_Name(물리) 두 필드, 도메인 참조 있음. 좌표·주제 영역은 이 자료에서 확인 안 됨. (구현체가 실물을 모사한 것이라 증거 등급 낮음)

---
## 5. exERD  (formats/exerd/)
**받은 실물 샘플: 있음.** (GitHub 코드 검색 인덱스에 .exerd 1건, .erdx 7건, .xdmn 3건. 전부 MySQL/CUBRID/DB2 — Oracle productId 샘플은 못 찾음. 따라서 Oracle 전용 속성 `oracle:` 네임스페이스 요소는 확인 안 됨)
| 파일 | 출처 | 비고 |
|---|---|---|
| jblog-mysql.exerd (16KB) | Jiyoongrace/jblog database/jblog.exerd | MySQL, version 2.5.17.20220110-1118, 표 4개 |
| library.erdx | aa9390/library | MySQL, 2.4.6 (2016) |
| s1~s8.erdx | s2 tasty13/mystudy(66KB, 표 18), s3 cotmdgns(CUBRID), s4~s8 cotmdgns/Parkseongchul97/jjang1129(DB2, 표 26·25 FK) | s5 가 가장 풍부 |
| basic_domain.xdmn, KMIG_Domain.xdmn | subeomi/class, repproject/rep | 도메인만 담은 별도 파일 |
- **확장자**: `.exerd`(Eclipse 플러그인) 와 `.erdx`(다른 이름으로 저장된 같은 형식)는 내용이 같은 XMI/XML(`<e:Document xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:e="http://exerd.tomato.com/model" xmlns:mysql="http://exerd.tomato.com/mysql/model">`, 선언 `<?xml version="1.1" encoding="utf-8"?>`). `.xrd` 는 샘플 못 찾음. 최상위 `productId="com.tomato.db.mysql|db2|cubrid|..."`, `version/modelVersion`.
- **파일 구조**: 한 파일에 전부(표·컬럼·FK·도메인·업무영역·다이어그램 좌표). 줄바꿈 없이 한 줄(jblog) 또는 이어쓰기(library)로 저장된 경우 있음 → git diff 비친화.
- 요소 이름(s5.erdx 집계; 숫자=개수):
```
Document[UUID,activeBusinessArea,activeSchema,modelVersion,openedDiagrams,productId,version]
 relationManager > relation[key] > value[foreignKeyColumnGroup, childCardinalityType, identifying="true"]     # 관계 목록: 식별 여부·카디널리티
 configuration > domainDefinition > domain[UUID,name,suggestedDataType] (중첩 계층 가능: 문자 > 주소/이름…)
              > viewSettingsPreset[name, showAltTableName,…] > cellsToShow(name|domain|dataType|nullable|oppositeModeName)
 businessAreas[UUID, logicalName, physicalName, tables="Table_… Table_…"]       # 업무영역(=주제 영역) : 포함 표 UUID 공백 나열
   > diagrams[UUID,logicalName,physicalName]                                     # 영역마다 다이어그램 여러 개 가능
       > diagramEntry xsi:type="e:TableDiagram" [UUID, location="Point(618.0, 299.0)", table="Table_ID", theme]   # 표 좌표
       > diagramEntry xsi:type="e:Note" [location, text, backgroundColor, baloonPoint, manualSize]               # 메모
       > viewSettings, printSettings
 databaseModel[logicalName,physicalName] > schema[…] > tables[UUID, logicalName, physicalName]
    > physicalProperties xsi:type="mysql:TableProperties"                          # DB 종류별 확장
    > columns[UUID, logicalName, physicalName, dataType="VARCHAR(100)", domain="Domain_…", notNull="TRUE", derivedLogicalName/PhysicalName]
        > memberships[key=PKCGroup_…|FKCGroup_…] > value xsi:type="e:PrimaryKeyMembership"[group,entryIndex] | "e:ColumnReference"[group,parentColumn]
    > columnGroups xsi:type="e:PrimaryKeyColumnGroup" / "e:ForeignKeyColumnGroup"[parentColumnGroup] > primaryKeyConstraint | foreignKeyConstraint
```
- 대표 조각(jblog):
```xml
<tables UUID="Table_ouyybSlIEe-gApyrl76ICg" logicalName="카테고리" physicalName="category">
 <columns UUID="Column_ouyybilIEe-gApyrl76ICg" logicalName="번호" physicalName="no" dataType="INT"> … <memberships key="PKCGroup_…"><value xsi:type="e:PrimaryKeyMembership" … entryIndex="0"/></memberships></columns>
 <columnGroups xsi:type="e:ForeignKeyColumnGroup" UUID="FKCGroup_…" logicalName="블로그 -> 카테고리" physicalName="FK_blog_TO_category" parentColumnGroup="PKCGroup_…"/>
<businessAreas UUID="BArea_…" logicalName="기본 업무영역" physicalName="DEFAULT_AREA" tables="Table_… Table_…"><diagrams UUID="Diagram_…" logicalName="다이어그램" physicalName="diagram">
  <diagramEntry xsi:type="e:TableDiagram" UUID="TDiagram_…" location="Point(618.0, 299.0)" table="Table_ouyybSlIEe-gApyrl76ICg"/>
<domain UUID="Domain_m3c2QilIEe-gApyrl76ICg" name="문자" suggestedDataType="VARCHAR(255)"><domain UUID="…" name="주민등록번호" suggestedDataType="VARCHAR(13)"/>
```
- exERD 의 핵심 특징(이 도구가 흡수하면 좋을 점): 모든 객체에 논리명+물리명 속성 병기(logicalName/physicalName), 도메인 계층(domainDefinition, 상속형 중첩) + 컬럼 `domain=` 참조, 업무영역(businessAreas) 안 다이어그램 여러 개, 좌표는 표 크기 없이 `location` 한 점(표 폭·높이는 저장 안 함, 메모만 manualSize), 관계선 별도 도형 없음(FK 그룹이 정본), UUID 접두 `Table_`/`Column_`… + Eclipse EMF 식 22자 base64, `derivedLogicalName` 플래그(이름을 부모에서 파생).
- 가져오기 시 주의: 컬럼 설명(comment)·표 설명 속성명은 샘플이 모두 비어 있어 확인 안 됨. 다른 DB 종류별 `physicalProperties` 서브타입(Oracle: 확인 안 됨).
- 도메인 별도 파일 `.xdmn`: `<e:DomainDefinition … productId="com.tomato.db.mysql" version="2.5.17…"><domain UUID name suggestedDataType>…` (중첩).

---
## 6. git 에 여러 파일로 모델을 두는 실제 사례
1. Oracle SQL Developer Data Modeler(2번 항목): 엔티티·관계·표·FK 각각 `seg_0/<GUID>.xml` 한 파일. 서브뷰(다이어그램)는 별 파일. 위 실물 다수가 GitHub 에 커밋됨. "표 하나에 파일 하나·GUID 파일명 정렬 고정" — 정렬은 파일명(GUID)이 이름과 무관하게 고정이라 이름 변경에도 파일 위치 불변.
2. DBML 모듈 시스템(`use`): 공식 문법으로 파일 분할 가능(1번). 표 단위 분할은 사용자 몫.
3. Hasura 메타데이터(참고 사례): `metadata/databases/default/tables/public_users.yaml`(표 1개=파일 1개) + `tables.yaml` 에 `- "!include public_users.yaml"` 목록. 실물: nextauthjs/next-auth packages/adapter-hasura/hasura/metadata/databases/default/tables/ (formats/other/multi/ 에 받음). 이름 기반 파일명(`<schema>_<table>.yaml`)이라 사람이 읽기 쉬우나 표 이름 변경 = 파일 이름 변경.
4. 비교용: pgModeler/PowerDesigner/exERD/mwb 모두 단일 파일(또는 zip 한 개).
- 이 도구가 택할 만한 설계 근거: "객체=파일(안정 ID 또는 안정 이름), 좌표/다이어그램은 별도 파일, 도메인은 별도 파일, 매핑표는 객체 파일 안에" — Oracle DM 은 매핑표(ExtendedMap)가 단일 대형 파일이라 diff 병목이며 이 부분은 피할 것.

## 확인 못 한 것
- dbdiagram.io 의 좌표 저장 위치·형식.
- Oracle DM 에서 추가 서브뷰(주제 영역) 여러 개인 실물 파일, seg_1 이상 분할 임계값, Naming Standards 파일 위치·형식, 도메인 값 목록/제약 표현.
- exERD Oracle 샘플(Oracle 전용 확장 요소), 표/컬럼 설명 속성명, 로직 '.xrd'.
- 실물 ERwin XML 내보내기, pgModeler/mwb 한글 논리명 사례.
- Azimutt 신판 레이아웃(LayoutItem 미정의).
