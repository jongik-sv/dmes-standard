# exERD 심층 조사 (A2)

조사일 2026-10-09. 1차 메모(A-exerd.md)의 "확인 안 됨" 항목을 원문·제품 파일로 다시 확인했다.
저장소 코드는 건드리지 않았고 제품을 실행/설치하지 않았다.

## 0. 수집한 자료와 위치 (모두 scratchpad/erd 아래)

| 자료 | 경로 | 비고 |
|---|---|---|
| 도움말 목차 (영/한) | exerd-help/raw/*.xml, raw-ko/*.xml | `/help/topic/com.tomato.exerd.help/toc/*.xml` 에서 받음. plugin.xml 이 가리키는 toc 9개 |
| 도움말 원문 HTML (영) | exerd-help/html/ (211개) | 태그 제거본 exerd-help/txt/ |
| 도움말 원문 HTML (한) | exerd-help/html-ko/ | 태그 제거본 exerd-help/txt-ko/ |
| SAM Edition 도움말 (한, 115토픽) | exerd-help/sam/{html,txt}/ | `com.tomato.exerdsam.help` 플러그인. 저장소·협업 설명이 여기 있음 |
| p2 저장소 색인 | exerd-dist/p2/x/{artifacts,content}.xml | `http://exerd.com/update/exerd/3.x/` (3.3.56.20260820-1610, 공개) |
| 제품 jar 8개 + 풀어낸 것 | exerd-dist/jars/, exerd-dist/x/<번들명>/ | model, term.model, core, model.ui, modelview, term.ui, diff, validator. 읽기만 함 |
| 스크립트 | erd/crawl.sh, erd/h2t.py, erd/ecore.py | 크롤·HTML→텍스트·ecore 요약 |

**크롤 요령**: 도움말 서버(`exerd.com:8081`, 평문 HTTP)는 `Accept-Language: ko` 헤더를 주면 같은 URL 에서 한국어 본문을 돌려준다. 목차 `toc.xml` 자체는 빈 응답이지만 `plugin.xml` → `toc/toc*.xml` 로 들어가면 받아진다. 영문 도움말에 없는 포워드/리버스 일부는 `nl/ko/html/...` 경로로만 있다.
**제품 파일**: 다운로드 페이지(https://exerd.com/down.do) 의 설치 파일은 이메일·회사명 입력(발송 링크) 방식이라 받지 않았다. Eclipse 플러그인용 업데이트 사이트 `http://exerd.com/update/exerd/3.x` 는 로그인 없이 열려 개별 jar 만 받았다(가장 큰 것도 core 9.9MB). 번들 내용은 `.class` 를 열어 보지 않았고 .ecore/.genmodel/plugin.xml/리소스 텍스트만 읽었다. 번들 META-INF 에 서명이 있고 도움말 license 도 있으므로, 우리 설계에는 "구조 참고"로만 쓰고 코드/파일 그대로 복제하지 않는다.

버전 관계: 도움말 제목 `eXERD3 E-R Modeler Guide`(3.3.56, 2026-08-20) 와 `eXERD SAM Edition`(1.0.37, 2026-08-31)은 별개 제품 계열이다. SAM 은 파일 확장자 `.xrd`, 일반판은 `.exerd`. 일반판 도움말에는 저장소/협업 기능이 없다.

## 1. 6가지 가정 새 판정

| # | 가정 | 판정 | 근거 (원문) |
|---|---|---|---|
| 1 | 논리/물리 모드 전환 | 확인 | 단축키 F3 토글, F4 논리, F5 물리. "논리모드에서는 푸른색 배경, 물리모드는 붉은색 배경"(diagramEditing). 모델 파일 `Configuration.interactionMode` 에 저장(LOGICAL/PHYSICAL). 뷰 프리셋 "논리/물리 동시편집"은 한 칸에 두 이름을 같이 보임(`OPPOSITE_MODE_NAME`). |
| 2 | 부모→자식 관계선을 그으면 FK 컬럼 자동 생성 | 확인 | "마우스로 부모 테이블을 선택... 자식 테이블을 선택합니다. 자동으로 자식테이블에 참조 컬럼이 생성됩니다." 같은 이름 컬럼이 이미 있으면 "처리 방식을 선택"하는 솔루션 대화상자가 뜸. 이미 다른 테이블을 참조하는 컬럼은 재사용하지 않고 새 FK 컬럼을 만듦(FAQ1). |
| 3 | 식별/비식별 관계, 식별이면 자식 PK | 확인(부분) | 도구가 둘로 분리: 단축키 `4`=비식별, `5`=식별. 모델 `Relation.identifying`. 식별 관계는 자식에 같은 이름 일반컬럼이 있어도 재사용해 PK 로 바꿔 FK 로 연결(릴리스 1.7.x). 비식별은 "일반컬럼만" 재사용. 식별 FK 가 자식 PK 가 된다는 문장 자체는 직접 없음(식별 재사용 문장으로 간접). 선택적/필수 구분은 NOT NULL 로 처리 추정(확인 안 됨). |
| 4 | 그리드 키보드 연속 입력 | 부분 | 표 안 셀을 그 자리에서 인라인 편집(F2/더블클릭), `Ctrl+Enter`=새 컬럼, `Ctrl+Shift+Enter`=새 PK 컬럼, "이름 편집중에도 해당 단축키를 입력하면 새 컬럼이 추가됩니다". 도움말에 Tab 이동 서술은 없음(확인 안 됨). 즉 스프레드시트식 그리드가 아니라 "표 모양 셀 + 단축키 행 추가". 속성 대화상자(Space)에서 컬럼 일괄 편집은 별도. |
| 5 | 주제영역 다중 배치, 같은 표가 여러 다이어그램 | 확인 | 모델 뷰에 업무영역(=주제영역)>다이어그램>표 계층. "한 다이어그램에 같은 모델(테이블)을 중복하여 배치할 수는 없지만 여러개의 다이어그램에 관심영역별로 테이블을 배치할 수 있습니다." 표 하나가 여러 `TableDiagram`(위치·테마·컬럼필터)을 가짐. 업무영역은 같은 스키마 표를 영역별로 분류(2.4.4, 2016). |
| 6 | 논리명 입력→단어사전→물리명 자동, 도메인→타입·길이 | 확인 | 용어사전(.xdic)을 다이어그램에 연결하면 "컬럼의 논리명을 입력 시 물리명이 자동으로 입력". "학번"→STUD_ID, "학생이름"→"학생"+"이름"=STUD_NM 합성. 후보가 여럿이면 목록 선택. 도메인: 도메인 선택 시 데이터 타입 자동 반영, 도메인 값 바꾸면 모든 컬럼 반영. 상세는 §3.4. |

## 2. 메타모델 (exerd.ecore, 3.3.56)

근거 파일: `exerd-dist/x/com.tomato.exerd.model/model/exerd.ecore` (71KB) + `exerd.genmodel`. `model/history/exerd_0.0.0 ~ 3.0.0.ecore` 에 과거 버전이 있어 파일 버전별 변환(스키마 마이그레이션)을 한다. 보조: `com.tomato.exerd.term.model/model/termModel.ecore`, `com.tomato.exerd.model.ui/model/{common,exerd_ddl,exerd_product,exerd_reverse}.ecore`(DB 제품별 물리 속성은 번들 분리).

### 2.1 공통 바탕 클래스
- `UUIDOwner{UUID}`: 모든 모델 요소의 뿌리. 이름 예 `Table_F0-3gFYeEeuIEYQE69F8ag` (접두어+EMF UUID).
- `NameOwner{name, oppositeModeName, logicalName, physicalName, derivedName*...}`: 논리명/물리명을 한 객체에 같이 보관. `name` 은 현재 모드의 이름이고 파생(derived)이다(model.txt: `getInteractionMode()` 가 PHYSICAL 이면 physicalName, 아니면 logicalName 을 name 으로 본다). 즉 모드 전환은 데이터 변환이 아니라 "어느 필드를 name 으로 보여줄지" 스위치다.
- `CommentOwner{comment}`, `IconOwner{icon}`, `PhysicalPropertyOwner{physicalProperties}`(DBMS별 물리 속성 확장 지점).

### 2.2 구조 (핵심 클래스 표)
| 클래스 | 주요 속성/참조 |
|---|---|
| Document | version, modelVersion, productId(DBMS), databaseVersion, modelType(LOGICAL/PHYSICAL/INTEGRATE), activeBusinessArea, activeSchema, openedDiagrams, configuration, businessAreas*, databaseModel, relationManager, sharedIcons |
| Configuration | interactionMode, domainDefinition(포함), viewSettingsPreset*, termFilePath(용어사전 파일 경로) |
| DatabaseModel > Schema | schema+ ; Schema 는 tables/views/functions/procedures 를 포함(containment) |
| BusinessArea | diagrams*(포함), tables/views/functions/procedures(비포함 참조: 소속만 표시) |
| Diagram | diagramEntry*(포함), viewSettings, printSettings, filteredRelations |
| DiagramEntry{location:Point} | 하위: TableDiagram{table 참조, theme, columnFilter}, Note{text, target, textColor, backgroundColor, baloonPoint, manualSize} |
| Table | columns*(포함), columnGroups*(포함), checkConstraints*, keyTable, sourceRelation/targetRelation, 위 바탕 상속 |
| Column | domain 참조, dataType(문자열), defaultValue, notNull(NONE/TRUE/FALSE), tagColor, indexed, memberships*(포함) |
| ColumnGroup 계열 | PrimaryKeyColumnGroup(+PrimaryKeyConstraint), AlternateKeyColumnGroup(+UniqueConstraint), ForeignKeyColumnGroup(+ForeignKeyConstraint, parentColumnGroup, useIndexing), InversionEntryColumnGroup(비유일 인덱스) |
| GroupMembership / IndexableMembership | group, owner(Column), entryIndex(순서), sortType(ASC/DESC/NONE). ColumnReference{childColumn, parentColumn} 는 FK 그룹 안의 컬럼 쌍 |
| Relation | foreignKeyColumnGroup, identifying(bool), parentCardinalityType(기본 EXACTLY_ONE), childCardinalityType(기본 ZERO_OR_MORE); 값: ZERO_OR_MORE/ONE_OR_MORE/ZERO_OR_ONE/EXACTLY_ONE |
| RelationManager > RelationEntry | key=FK 그룹 → value=Relation (관계는 Document 직속 별도 보관소) |
| Domain / DomainDefinition | Domain{name, suggestedDataType, suggestedDefaultValue, suggestedNotNull, 자식 domain*(트리)}; DomainDefinition{productId,version} |
| ViewSettings | cellsToShow(NAME/LOGICAL_NAME/PHYSICAL_NAME/NULLABLE/DOMAIN/DATA_TYPE/COMMENT/OPPOSITE_MODE_NAME), showColumnHeader, showTableComment, columnFilter(ALL/PK_FK_ONLY/TABLE_ONLY), name(프리셋명) |
| PrintSettings | 여백, paperKind, 방향, scale, header/footer 템플릿(`${FILE} ${DIAGRAM} ${PAGENUM}`) |
| View/Function/Procedure/Trigger | definition(SQL 본문 문자열) |
| Icon, SharedIcons | 표 아이콘(16x16 이미지 바이트), 파일 내 공유 |
| PropertyEntry | userDefinedProperty/extendedProperty (사용자 정의 키-값, DB 반영 안 됨, 스크립트용) |

설계 시사점(우리 모델에 가져올 만한 점):
1. FK 는 "컬럼 쌍"이 아니라 `ForeignKeyColumnGroup` 이라는 그룹 객체이고, 각 자식 컬럼은 그룹에 `membership` 으로 속한다. PK/UK/인덱스/FK 가 모두 같은 ColumnGroup 계열이라 컬럼 입장에서는 "여러 그룹의 멤버"일 뿐이다. 식별/비식별은 관계 객체의 플래그.
2. 관계(Relation)는 표 안이 아니라 Document 의 RelationManager 에 따로 있고, 표는 source/target 참조만 가진다. 관계 삭제·표 삭제 때 정합성을 한곳에서 검사하기 쉽다.
3. 표와 그 표의 다이어그램 표현(TableDiagram)을 분리: 같은 표가 여러 다이어그램에 위치·테마·컬럼필터를 각자 갖는다. 컬럼 색상 태그(tagColor)는 컬럼에 있어 모든 다이어그램에 동일하게 보인다(도움말 일치).
4. 업무영역은 소유가 아니라 소속(tables 비포함 참조)이다. 스키마가 표를 소유하고 업무영역은 분류 라벨.
5. 논리/물리 이름을 한 엔티티의 두 필드로 두고 현재 모드가 name 을 결정.
6. 도메인은 트리(부모→자식 도메인, 타입 상속). 상속된 타입은 파란색, 재정의하면 ▲ 표시. 컬럼이 타입을 재정의하면 빨강. 모델 검사에 `ColumnDomainOverridedValidator` 번들이 따로 있다.
7. 표시 설정(ViewSettings)은 다이어그램별 저장 + 프리셋을 Configuration 에 보관.
8. 비교는 UUID 방식(같은 파일 갈래)과 이름 방식(별개 파일·DB 비교)을 둘 다 지원: `com.tomato.exerd.diff/ExerdDiff.ecore` 존재.

### 2.3 용어사전 (termModel.ecore, 네임스페이스 `http://exerd.com/term-model`)
- `TermDictionary{version, term*, tag*}`, `Term{name(논리), description, synonyms*, physicalName, physicalDescription, physicalSynonyms*, tag*}`, `Tag{name, description}`, `TermDelimiter{logicalNameDelimiter, physicalNameDelimiter}`, `PropertyEntry`.
- 예제 `.xdic` (term.ui 번들 `oracle.xdic`):
  `<tm:TermDictionary xmlns:tm="http://exerd.com/term-model" version="1.1"><term name="테스트" physicalName="test"/>...`
- 환경설정: 논리명 접두/접미 패턴(예 "학과코드[CD]"의 `[CD]` 를 제외하고 합성), "입력된 물리명을 대문자로 자동 변환(기본 OFF)".

## 3. 저장 형식

- 파일 `.exerd`(구판 `.erdx`, XML 형식으로 "erdx 와 exerd 를 비교 불가, 한쪽을 다른 이름으로 저장 필요"라는 도움말), SAM 은 `.xrd`. 용어사전 `.xdic`(SAM `.xtd`), 도메인 정의 `.xdmn`(SAM `.xdd`) 및 Excel(.xls/.xlsx).
- 번들 예제 `com.tomato.exerd.term.ui/.../oracle.erdx` 는 **EMF XMI 2.0 XML**. 맨 위:
  `<e:Document xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:e="http://exerd.tomato.com/model" xmlns:o10g="http://exerd.tomato.com/oracle10g" UUID="Document_..." activeBusinessArea="BArea_..." activeSchema="Schema_..." version="3.3.8.qualifier" modelVersion="3.0.0.20190111-1604" productId="com.tomato.db.oracle_10g" openedDiagrams="Diagram_...">`
- 구조 조각(요지):
  - `<configuration termFilePath="/oracle/oracle.xdic"><domainDefinition>` → `<domain UUID name="문자" suggestedDataType="VARCHAR(255)"><domain ... name="이름" suggestedDataType="VARCHAR(50)"/>...` (도메인 중첩)
  - `<viewSettingsPreset name="eXERD 기본" showAltTableName="false"><cellsToShow>name</cellsToShow>...`
  - `<businessAreas UUID logicalName="기본 업무영역" physicalName="DEFAULT_AREA" tables="Table_...">` > `<diagrams ...><diagramEntry xsi:type="e:TableDiagram" UUID location="Point(88.0, 156.0)" table="Table_..."/><viewSettings .../><printSettings .../>`
  - `<databaseModel ... logicalName="새 데이터베이스"><physicalProperties xsi:type="o10g:DataDictionary">...(Oracle 테이블스페이스)</physicalProperties><schema UUID logicalName="내 스키마" physicalName="MY_SCHEMA"><tables UUID logicalName="새 테이블" physicalName="TABLE"><columns UUID logicalName="테스트" physicalName="test"/>`
- 참조는 UUID 문자열(XMI IDREF). 위치는 `Point(x, y)` 문자열. DBMS 물리 속성은 `xsi:type="o10g:..."` 처럼 제품별 네임스페이스 확장. 파일이 한 문서 안에 논리·물리·표시 전부 포함.
- 관계(FK) 샘플 XML 은 번들 예제에 없어 직렬화 모양은 확인 안 됨(스키마로는 RelationManager>RelationEntry{key,value}).
- 모델 내보내기(SQLite): `eXERD > 내보내기 > 모델` 로 schemas/tables/columns/indexes/index_columns/relations/relation_columns/routines/views 표(논리명·물리명·column_type PK/FK·identity_kind·child/parent_cardinality 등)를 담은 sqlite 파일을 만든다. 우리 "정의서 출력"의 열 목록 참고 가치가 있다.

## 4. 기능별 원문 정리

### 4.1 편집 (diagramEditing.txt, shortcut.txt)
- 표 만들기: 툴 `3` 후 캔버스 클릭. "새로 만들어지는 요소는 명명규칙(환경설정)에 따라 이름 부여". 새 표는 활성 스키마·활성 업무영역에 들어감. 옵션 "테이블을 새로 만들면 바로 이름 편집 [기본 ON]".
- 이름 편집 2종: 인라인(F2/더블클릭), 빠른 논리+물리+주석 동시 편집(`` ` `` 키 또는 팝업 > 이름 변경).
- 컬럼 추가: `Ctrl+Enter`, PK 는 `Ctrl+Shift+Enter`, 이름 편집 중에도 동작.
- 관계: 툴 4/5 로 부모 클릭→자식 클릭, 자기 자신 클릭=셀프참조. 관계선을 선택하면 부모/자식 아이콘 표시 + 연결 컬럼 강조.
- 속성 대화상자: `Space` (표/컬럼/관계 공통). 컬럼·제약·관계·인덱스·DBMS 물리 속성을 한 곳에서. 관계 속성에서 자식(FK) 컬럼 변경 가능(FAQ1: 한 컬럼이 서로 다른 부모 표를 참조하게 하려면 여기서).
- 표 접기: 컬럼 표시 설정(표만/PK·FK만/전체), 하단 `....` 에 마우스를 올리면 숨은 컬럼 수 툴팁, 클릭하면 펼침. 확대율 50% 미만이면 표 이름만 표시.
- 노트: 툴 `6`, 메모형/말풍선형, 색상 테마 (모델: Note.target 으로 표에 연결).
- 모델 뷰: 트리, 현재 다이어그램에 올라간 표는 굵게, 더블클릭하면 다이어그램에서 선택, 관계는 들어오는/나가는으로 분리 표시. 표를 모델 뷰에서 다이어그램으로 드래그. 다이어그램 생성 마법사(전체/스키마/선택 표 기준, 자동·수동).
- 선택 확장: `Ctrl+↑` 부모 표들, `Ctrl+↓` 자식 표들, `Ctrl+R` 연결된 관계 전부.
- 삭제 의미: `Delete`=다이어그램에서만 제거(모델 유지), `Alt+Delete`=모델에서 완전 삭제.
- 거의 모든 기능이 `Ctrl+Z` 실행 취소 지원.
- 솔루션 대화상자(6종): 참조 중인 컬럼 삭제, FK 컬럼 생성 시 동명 컬럼 존재, 관계 FK 컬럼 일부만 제거, 사용 중인 도메인 삭제, 새 도메인 정의, 관계 삭제. "상황을 이미지로 표현하고 처리 방식을 요약 아이콘으로 설명". 기본 처리 방식은 환경설정(사용자에게 묻기)에서 지정해 더 묻지 않게 할 수 있다.
- 편집 자동화 옵션(기본값): 용어 일치 시 논리/물리 컬럼명 자동 입력 ON, 물리명 대문자 변환 OFF, 부모 컬럼 이름 바뀌면 자식 컬럼 이름도 변경 ON, 존재하지 않는 도메인 입력 시 자동 생성 ON.
- 관계 표기: IE 또는 Barker 표기 선택. 식별 관계 Barker 에서 UID bar 표시.
- 표 이름 좌/중앙 정렬, 스내핑 안내선, 렌더링 품질(저사양 낮음), 다이어그램/표 테마, 컬럼 색상 태그, 표 아이콘(파일 끌어놓기).

### 4.2 자동 배치 (autoAlocation.txt)
- `Ctrl+Shift+F` 또는 팝업 > 자동 배치. 관계선 기준으로 겹침 없이 배치. "재실행하면 매번 다른 알고리즘이 적용되어 관계에 따라 5~8가지의 다른 모습". 간격은 환경설정. 번들에 JUNG(그래프 라이브러리) jar 가 포함 — 그래프 레이아웃에 JUNG 사용 추정(core/lib/jung-*.jar, 확인된 사실은 jar 존재까지).

### 4.3 보기 설정 (diagramViewSettings.txt)
- 프리셋: eXERD 기본(컬럼명·도메인·타입), 엔티티 모드(컬럼명·도메인 — 초기 논리모델링), E-R 개요 모드(표 이름·주석만), 논리/물리 동시편집. 표시 칸 헤더를 드래그해 순서 변경, 설정은 다이어그램별 저장, 새 프리셋 저장 가능. 표시된 칸은 그 자리에서 직접 편집.

### 4.4 용어사전·도메인·명명 (terms.txt, domainview.txt, contentAssist.txt, preferences.txt)
- 용어사전은 다이어그램과 별개 파일, 경로로 연결(`termFilePath`) — 이동하면 재연결 필요.
- 논리명 입력 시 용어사전에서 단어를 조사해 물리명 구성: 후보 1개면 자동 입력, 여러 개(동의어 포함)면 물리명 편집 때 선택 목록. 동의어는 논리/물리 칸에서 `,` 구분. 태그(`Ctrl+T`)로 용도별 분류.
- 컨텐트 어시스트 `Ctrl+Space`: 도메인 셀 → 도메인 뷰 항목, 데이터 타입 → 인자 형태별 목록, 물리명 → 합성어 제안.
- 모델 검사(용어 정책): 물리명이 용어사전 매핑과 일치하는지, `Ctrl+1` 로 정책에 맞게 자동 수정.
- 일괄 적용 4단계: 계획 작성(옵션 3종: 일치 제외/대체 가능 포함/전체) → 자동 적용 가능 항목 검토(동일 논리명 그룹, 체크박스) → 모호한 항목(후보 복수) 선택 → 실행. 초기에는 체크가 비어 있어 사용자가 확인해야 반영.
- 용어사전 역공학: 사전에 없는 논리명을 일괄 등록(한 논리명에 여러 물리명이면 대표 선택, 나머지는 물리 동의어).
- 용어사전 Excel 열: 논리명, 논리설명, 논리동의어, 물리명, 물리설명, 물리동의어, 태그. 도메인은 `.xdmn`/xls 가져오기·내보내기.
- 도메인: 트리(하위 도메인 드래그), 기본값 정의, 도메인 변경 시 컬럼 일괄 반영, 컬럼으로 도메인을 끌어 지정, 도메인 뷰 `F2`=이름, `Enter`=타입, `Ctrl+Enter`=추가, `Ctrl+Shift+Enter`=자식 추가.
- 부모 컬럼 도메인/타입 변경은 FK 자식에 반영, SERIAL 부모의 자식 컬럼은 INTEGER 로 자동 설정(릴리스).
- 명명 규칙: 환경설정에서 표/컬럼/제약 등 신규 객체 이름 패턴 지정(프로젝트별 규칙 가능). 이름 길이·예약어는 모델 검사.

### 4.5 모델 검사 (modelValidator.txt)
- 용어사전 일치, 이름 미지정, 데이터 타입 누락, 예약어 사용, 어떤 다이어그램에도 안 쓰인 표, DBMS 이름 길이 초과, 도메인 타입 재정의(별도 번들). 검토 뷰에서 항목 더블클릭=선택, `F5` 재검사, `Ctrl+1` 문제 수정. 포워드 전에 돌리라고 안내. SAM 은 도메인 누락·용어 정책 위반·컬럼명 중복 추가.

### 4.6 리버스·포워드 엔지니어링
- 리버스: 위저드(파일명+DBMS → 연결 → 객체 종류/소유자) → Console 로그 → 다이어그램 생성 마법사 자동 연결. 결과는 모델 뷰에 스키마와 표가 들어오고 다이어그램은 드래그로 구성. 논리명은 DB COMMENT 에서 가져오는 방식이 FAQ2(ERWin 이전) 에 설명됨.
- 포워드: 5단계(DDL 옵션 저장 재사용 / 모델 기준·다이어그램 기준 대상 선택 / DDL 미리보기·복사·파일 저장 / DBMS 접속 / 실행).
- 가져오기: ERwin 7.2/7.3 XML. 다른 eXERD 파일 병합 가져오기(구판, 현재 삭제된 기능이라고 주석에 적힘; 도메인 중복은 3가지 중 선택).

### 4.7 모델 비교 (compare/*.txt)
- 3 입력: 파일↔파일, 과거 이력(워크벤치 로컬 히스토리 또는 SVN/Git), DB↔파일.
- 정체성 식별: UUID 방식(같은 파일 갈래·과거 버전), 이름 방식(별개 파일·DB). 이름 방식은 이름이 바뀌면 삭제+추가로 인식. 논리명/물리명 중 무엇으로 짝지을지 선택(SAM).
- 비교 에디터: 상단 차이 목록, 하단 두 트리 그래프. 색 파랑=추가, 빨강=삭제, 노랑=변경. "사소한 시각적 변경"(위치·테마)은 비교 대상에서 구분 가능.
- "밀치기"(SAM 은 변경사항 받기): 차이를 방향 지정해 덮어씀, 언두/리두. 정합성이 깨지면 실패(삭제 대상 표를 자식이 참조 / 추가 표의 부모가 상대에 없음 → 관련 표를 함께 선택). SAM 은 경고 종류 6가지(병합 차단·정합성 손상·병합 제외·...) 와 버튼 문구 분기, 키 컬럼은 별도 창에서 순서 선택.
- HTML 비교 보고서 생성.

### 4.8 협업 (SAM Edition 도움말만, exerd-help/sam/txt/html_features_repository_*)
- 저장소 서버 설치/삭제/이전, 사용자 관리 콘솔(ID 30자, SHA-256 저장), 권한 목록, 모델/용어(.xtd)/도메인(.xdd) 등록·가져오기(체크아웃), 커밋 메시지가 있는 "문서 변경 제출"(문서 전체 또는 업무영역 단위), 문서 이력 보기(모든 사용자 이력 열람), 버전 상태 표시("수정됨"/"갱신가능").
- **병합 방식**: 마지막 동기화 시점을 기준으로 3-way. 저장소만 바뀐 곳은 반영, 내 쪽만 바뀐 곳은 유지, 양쪽이 같은 곳을 다르게 바꾸면 "묻지 않고 항상 내 변경을 유지, 저장소 쪽 값 버림". 결과는 "병합 결과 미리보기" 후 반영. 덮어쓰기(내 변경 모두 사라짐, Undo 불가), 마지막 가져온 상태로 되돌리기도 있음. 업무영역 단위 최신화 지원(상태: 최신화 가능/이미 최신/저장소에 문서 없음/영역 제거됨).
- **잠금**: 편집 중 잠금이 아니라 제출 과정에서 Lock 이 걸리고(오류 시 안 풀릴 수 있어) 관리 콘솔의 "Lock 목록 관리"에서 수동 해제. "Lock이 설정된 파일은 변경 제출할 수 없다." 체크아웃/체크인 배타 모델이 아니라 낙관적 병합 + 제출 순간 잠금.
- 제출 전 정합성 검사(끊어진 참조 등)는 "넘길 수 없는" 필수 검사이며 툴바 모델 검사와 별개. 모델 뷰 맨 위 "정합성이 손상된 목록".
- 표준(도메인·용어)은 저장소에서 별도 파일로 공유/동기화(병합).

### 4.9 출력
- 이미지: 다이어그램 우클릭 > 이미지로 내보내기(릴리스 근거). 클립보드: 표 복사→Excel 에 표 형태, Word/PPT 표, 그림판 이미지(2개 이상 선택하면 관계선 포함).
- 정의서: 템플릿(보고서) — HTML 표, XML, 스타일 HTML, 테이블 정의서 HTML, 인덱스 정의서 HTML, 관계 정의서 HTML, CSV(콤마/탭) 기본 제공, 복사 후 편집 가능, 업무영역 단위 정의서(키워드 "업무영역","다이어그램").
- 인쇄 설정(여백·용지·방향·배율·머리글/바닥글 매크로), 인쇄 미리보기.
- 일괄 작업/XScript: JavaScript(Rhino 계열 js.jar)로 모델 일괄 변경, 속성 이름은 모델의 kebab-case(`logical-name`, `data-type`, `is-primary-key`...). 모델 검색 결과에서 선택 후 일괄 스크립트(도메인 일괄 지정 등).

### 4.10 검색
- `Ctrl+T` 빠른 표 찾기(물리명·주석도 검색), `Ctrl+O` 표 개요(컬럼 검색, 한 번 더 누르면 부모 표 컬럼까지, 부모/자식 표 접근), `Ctrl+F` 모델 검색(범위: 표/컬럼/인덱스/제약, 컬럼 조건: 논리명 시작·도메인 등, 스키마/다이어그램 범위), 도메인 찾기는 한글 자소 검색, "다른 곳에서 보기"(모델 뷰 또는 해당 표가 놓인 다른 다이어그램).

### 4.11 대형 모델
- 전용 "대형 모델 모드"는 확인 안 됨. 관련 장치: 표 접기(표만/PK·FK만), 확대율 50% 미만이면 이름만, E-R 개요 프리셋, 업무영역·다중 다이어그램 분할, 렌더링 품질 낮춤, 다이어그램 닫아 두기(제거 없이 닫기), 모델 뷰 정렬·검색, 표 검색 `Ctrl+T`, 자동 배치, JVM 힙 튜닝(기본 `-Xmx512m`, 4GB PC 는 1024m). 릴리스: 대규모 모델 배치·편집 성능, 다이어그램 열기/탭 전환 속도, 붙여넣기·삭제 속도 개선.

## 5. 단축키 목록 (도움말 shortcut.txt ↔ core/plugin.xml 대조)

도움말과 번들 plugin.xml 의 `<key>` 가 일치함. (M1=Ctrl, M2=Shift, M3=Alt; 맥은 Cmd)

| 범위 | 키 | 동작 |
|---|---|---|
| 다이어그램 | F3 / F4 / F5 | 논리·물리 토글 / 논리 / 물리 |
| | 1 2 3 4 5 6 | 선택 / 패닝 / 표 / 비식별 / 식별 / 노트 |
| | Ctrl+A, Ctrl+D | 전체 선택, 다이어그램 전환 |
| | Ctrl+F, Ctrl+Shift+F | 모델 검색, 자동 배치 |
| | Ctrl+P | 인쇄 |
| | Ctrl+휠/±, Ctrl+0 | 확대·축소, 100% |
| 표 선택 시 | Ctrl+Enter, Ctrl+Shift+Enter | 컬럼 추가, PK 컬럼 추가 |
| | `` ` `` | 논리·물리·주석 동시 이름 편집 |
| | Ctrl+↑ / ↓ / R | 부모 표 / 자식 표 / 연결 관계 선택 |
| | Ctrl+O, Ctrl+T | 표 개요, 표 찾기 |
| | Space | 속성 대화상자 |
| | F2 / 더블클릭 | 인라인 이름 편집 |
| | Delete / Alt+Delete | 다이어그램에서 제거 / 모델에서 완전 삭제 |
| | Ctrl+C/X/V, Ctrl+Z | 복사·잘라내기·붙여넣기, 실행 취소 |
| 도메인 뷰 | F2, Enter, Ctrl+Enter, Ctrl+Shift+Enter, Delete, Ctrl+F | 이름, 타입, 추가, 자식 추가, 삭제, 검색 |
| 검토 뷰 | F5, Ctrl+1 | 검사, 문제 수정 |
| 용어사전 | Ctrl+Enter, Ctrl+T, Delete, Ctrl+F | 새 용어, 태그, 삭제, 검색 |
| 공통 | Ctrl+Space | 컨텐트 어시스트 |
| | Ctrl+3 | 명령 검색 (Eclipse 빠른 액세스) |

## 6. 따라 할 만한 편집 동작 (우선순위 순)

1. F3 한 번에 논리↔물리 전환, 배경색(파랑/빨강)으로 현재 모드를 상시 구분. 이름 데이터는 두 필드를 계속 보관.
2. 보기 프리셋 4종(기본 / 엔티티 / E-R 개요 / 논리·물리 동시편집).
3. 표 도구(3)→클릭, 관계 도구(4 비식별, 5 식별)→부모→자식 클릭으로 FK 자동 생성. 동명 컬럼 충돌은 솔루션 대화상자로 선택. 관계 삭제·PK 삭제·PK 일부 삭제 시 영향 확인창.
4. 컬럼 `Ctrl+Enter` / `Ctrl+Shift+Enter` 추가(이름 편집 중에도), 셀 인라인 편집, `` ` `` 로 논리명+물리명+주석 한 번에.
5. 논리명 입력 즉시 용어사전 합성 물리명 자동 채움(후보 1개일 때만), 여럿이면 목록. 도메인 선택하면 타입·기본값 자동, 부모 도메인 상속, 재정의 색 구분.
6. 표 개요(Ctrl+O)로 컬럼 점프, 표 찾기(Ctrl+T)에 물리명·주석 포함, 부모/자식 표 선택(Ctrl+↑/↓).
7. 표 접기(표만/PK·FK만), 줌 50% 미만 이름만, 다이어그램 생성 마법사, 자동 배치 + 간격 설정.
8. 업무영역>다이어그램>표 계층, 같은 표를 여러 다이어그램에(한 다이어그램 안 중복 금지), 컬럼 색상 태그는 표 단위로 모든 다이어그램에 동일.
9. 삭제 의미 이원화(다이어그램에서만 제거 vs 모델에서 삭제).
10. 모델 검사 + 문제 자동 수정(Ctrl+1), 포워드 전 검사 안내.
11. 모델 비교: UUID 식별 + 위치/테마 같은 시각 변경 제외 + 방향성 병합 + 정합성 경고.
12. 협업(필요 시): 마지막 동기화 기준 3-way 병합, 양쪽 충돌은 내 쪽 우선(단순), 제출 단위=문서/업무영역, 제출 시 필수 정합성 검사, 제출 순간 잠금.

## 7. 확인 안 됨 / 한계

- 컬럼 그리드의 Tab·방향키 이동 규칙: 도움말에 없음.
- 식별 관계의 "자식 PK 로 승격" 문장 직접 근거(재사용 문장만 있음), 선택적 관계 표시 방식.
- FK/관계의 XML 직렬화 샘플(번들 예제에 관계 없음).
- 대형 모델 전용 기능(가상화·지연 로딩 등).
- 잠금 동작 중 편집 단위 잠금(체크아웃)은 없음으로 보이나 SAM 제품 파일을 받지 않아 서버측 확인은 안 됨.
- 설치 파일(exe/dmg)은 이메일 입력이 필요해 받지 않음. 번들은 공개 업데이트 사이트의 3.x 개별 jar 중 8개만 받아 `.class` 는 열지 않음.
- 평가판 30일, 워터마크는 down.do 안내(30일, 인쇄물에 워터마크).
