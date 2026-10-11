# exERD 의 ERD 모델링 편의 패턴과 우리 ERD 도구 대조 (A)

- 조사일: 2026-10-11. 이 파일만 썼고 저장소는 고치지 않았다.
- 조사 대상: eXERD3 (3.3.56, 2026-08-20) 일반판과 SAM Edition (1.0.37, 협업판).

## 0. 읽는 법

### 0.1 근거

| 표기 | 근거 | 위치 |
|---|---|---|
| H:경로 | eXERD3 공식 도움말 원문(한국어) | `http://exerd.com:8081/help/topic/com.tomato.exerd.help/html/<경로>.html` (평문 HTTP, `Accept-Language: ko` 로 한국어 본문) |
| S:경로 | SAM Edition 공식 도움말 | `http://exerd.com:8081/help/topic/com.tomato.exerdsam.help/html/<경로>.html` |
| RN x.y.z | 공식 릴리스 노트 | H:releaseNotes/releaseNotes, https://exerd.com/release.do |
| 홈 | 공식 홈페이지 기능 소개 | https://exerd.com/en/ |
| A2 | 앞선 심층 조사(제품 번들 .ecore·plugin.xml 판독 포함) | `docs/erd-tool/research-2026-10-09/A2-exerd-deep.md` |

- 도움말 원문은 2026-10-09 에 크롤한 본문을 이번에 다시 읽었다.
- 웹 검색으로는 한국어 블로그·튜토리얼을 거의 찾지 못했다(A 메모 §8 과 같은 결과). 쓸모 있는 2차 자료는 velog 글 하나다(정의서 CSV 추출 절차, §6.4).
- 원문에서 찾지 못한 내용은 "확인 안 됨" 으로 적었다. 추측으로 채우지 않았다.

### 0.2 우리 도구 판정

- 기준: 실제 구현을 적은 사용자 도움말 `docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`(dev `b69169829` 기준, 감사 컬럼 4.11절 포함)와 화면 코드 `src/frontend/m-mdm/pages/dma/erdEdit/` 다. 스펙(`docs/superpowers/specs/2026-10-10-erd-tool-design.md`)은 의도를 적은 문서다. 둘이 다르면 도움말과 코드를 따랐다.
- 판정 값:
  - **YES**: 화면에서 같은 일을 할 수 있다.
  - **PARTIAL**: 일부만 되거나, 다른 방식이거나, CLI·MCP 로만 된다.
  - **NO**: 없다.
- 근거 표기: `도움말 §x` 는 사용자 도움말 절, `def #n` 은 `docs/erd-tool/deferred.md` 의 번호, `코드:파일` 은 erdEdit 아래 파일이다.

### 0.3 "AI" 표현 주의

exERD 홈페이지와 도움말의 "놀라운 인공지능" 은 LLM 기능이 아니다. 최단 경로 탐색으로 관계선을 놓고, 위상 기반으로 표 배치를 유지하고, 최근에 쓴 대상을 먼저 나열하는 기능이다(H:products/features). LLM 연동은 우리 도구에만 있다.

---

## 1. 시작하기

| # | exERD 동작 (사용자가 누르는 것 → 보이는 것) | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 1.1 | 파일 > 새로 작성 > eXERD File 을 누른다. 프로젝트(폴더)를 고르고 대상 DBMS 를 고른다(Oracle 9i~21c 등 7종). 빈 다이어그램 편집기가 열린다. | H:gettingstarted/newErdFile/newfile | PARTIAL | [모델 등록]에 모델 ID·모듈·스키마·이름을 넣으면 첫 DRAFT 가 생긴다. Oracle 만 되고, 모듈 하나에 모델 하나이며, 등록한 모델은 지울 수 없다(도움말 §4.10, def #40) |
| 1.2 | 리버스 엔지니어링을 3단계 위저드로 한다. ① 파일 이름과 DBMS ② 연결 정보와 [연결 테스트] ③ 객체 종류(스키마·표·뷰·함수·프로시저·트리거·도메인)와 소유자 옵션. 진행 기록은 Console 뷰에 남는다. 끝나면 다이어그램 생성 마법사가 이어서 뜬다. | H:gettingstarted/reverseEngineer/reverseEngineer | PARTIAL | [DB 가져오기] 한 번으로 `기본 / 전체` 다이어그램에 모든 표를 놓는다. 관계 추정(문서·SQL 조인·이름 규칙)도 함께 한다. 객체 종류는 고를 수 없고, 연결 설정 화면도 없다(서버 설정을 쓴다)(도움말 §2.2·§4.10) |
| 1.3 | 리버스 옵션 "주석 전체를 논리이름으로 사용" 으로 DB COMMENT 를 논리명으로 가져온다(ERwin 이전 FAQ). | H:faq/faq2 | PARTIAL | 논리명은 컬럼 사전과 시스템별 별칭에서 채운다. 사전에 없는 토막은 `***` 로 둔다(스펙 §2.1-4, 도움말 §10.1) |
| 1.4 | 첫 화면: Welcome 페이지에서 샘플 ERD 를 연다. eXERD > 샘플 메뉴로 study.exerd·pos.exerd 를 연다. 행정 표준 용어사전 샘플(약 14,000개)을 다이어그램에 바로 연결할 수 있다. | RN 1.1.7·1.3.0 | PARTIAL | 샘플 모델 mcm·mdm 과 도움말의 "5분 둘러보기" 11단계가 있다(도움말 §2.3). 화면 안에는 안내가 없다 |
| 1.5 | 표 도구로 새 표를 만들면 명명 규칙에 따라 이름이 붙는다. 이름 편집 상태로 바로 들어간다(기본 ON). | H:gettingstarted/diagramEditing, H:features/preferences/preferences | PARTIAL | 도구 `2` 를 누르고 빈 곳을 누르면 [새 표] 창이 뜬다. 물리명과 논리명을 넣고 [만들기] 를 누른다. 창을 한 번 거친다(도움말 §4.2) |
| 1.6 | 모델 템플릿(시작용 표 묶음): 원문에서 찾지 못했다(확인 안 됨). 명명 규칙과 새 표 기본 테마만 있다. | H:features/preferences/preferences | — | 해당 없음 |
| 1.7 | ERwin 7.2/7.3 XML 을 가져온다. 다른 eXERD 파일을 병합해 가져온다(표 이름이 겹치면 직접 바꾸고, 도메인이 겹치면 3가지 처리 중 고르고, 다이어그램 이름 중복은 자동 해결). | H:features/import/erwin, H:features/sharing/erdImport | NO | 설계 파일 가져오기는 의도적으로 뺐다(def #7) |

## 2. 표·컬럼 입력 속도

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 2.1 | 표를 고른 상태에서 `Ctrl+Enter` 를 누르면 새 컬럼, `Ctrl+Shift+Enter` 를 누르면 새 PK 컬럼이 생긴다. **이름을 편집하는 중에도** 눌러 이어서 만든다. | H:gettingstarted/diagramEditing | YES | 그리드 입력 칸에서 `Enter`·`Ctrl+Enter`·`Ctrl+Shift+Enter` 가 된다. 한글 조합 중이거나 그리드 칸을 편집하는 중에는 받지 않는다. exERD 처럼 이름을 편집하다 이어서 만드는 동작은 아래 입력 칸에서 `Enter` 로 한다(도움말 §4.2·§5) |
| 2.2 | 캔버스 위 표·컬럼에서 F2 를 누르거나 두 번 눌러 그 자리에서 고친다. 보기 설정으로 띄운 칸(도메인·타입 등)도 그 자리에서 고친다. | H:gettingstarted/diagramEditing, H:features/diagramViewSettings | PARTIAL | 편집은 오른쪽 그리드에서만 한다(논리명·물리명·타입·NN). 캔버스 노드는 고칠 수 없다. 표 이름 변경은 CLI·MCP 로만 된다(도움말 §4.2·§10.1) |
| 2.3 | `` ` `` 키(또는 팝업 > 이름 변경)를 누르면 작은 창이 뜬다. 논리명·물리명·주석을 한 번에 고친다. | H:features/userConvenience/shortcut | NO | def #11 |
| 2.4 | 용어사전을 연결하면 논리명 입력 즉시 물리명이 채워진다(예: "학생이름" → STUD + NM = STUD_NM). 후보가 하나일 때만 자동이고, 여럿이면 물리명을 편집할 때 목록이 뜬다. | H:features/terms/terms | YES | 0.3초 뒤 미리보기 줄에 물리명·토막별 약어·추천 도메인이 보인다. 후보가 여럿이면 [토막 고르기] 가 뜬다(도움말 §4.2). 토막 단위로 보여 주므로 exERD 보다 자세하다 |
| 2.5 | 접두·접미 패턴을 설정하면 그 부분을 빼고 물리명을 만든다(예: "학과코드[CD]" 의 `[CD]`). 물리명 대문자 자동 변환은 기본 OFF 다. | H:features/preferences/preferences | PARTIAL | 대문자 변환은 늘 켜져 있다. 접두·접미 패턴은 없다(도움말 §4.2) |
| 2.6 | 컨텐트 어시스트 `Ctrl+Space`. 도메인 칸은 입력하는 대로 도메인 목록을 거르고, 고르면 타입이 채워진다. 데이터 타입은 인자 형태별 목록에서 고르면 괄호 안에 커서가 놓인다. 물리명 칸에는 합성어를 제안한다. | H:features/userConvenience/contentAssist | PARTIAL | [도메인] 칸의 찾기·고르기와 [추천] 이 있다. 타입은 `VARCHAR2(50)` 처럼 손으로 친다. 타입 목록 보조는 없다(도움말 §4.2) |
| 2.7 | 도메인은 트리다. 하위 도메인은 상속하고, 상속된 타입은 파랗게, 재정의한 타입은 ▲ 로 보인다. 컬럼에 도메인을 지정하면 타입이 파랗게, 타입을 직접 바꾸면 빨갛게 보인다. 도메인을 바꾸면 쓰는 모든 컬럼에 반영된다. | H:gettingstarted/editorAndView/domainview | PARTIAL | 도메인은 MDM 사전에서 고른다. 타입이 맞지 않으면 DOMAIN 상태(노랑)로 보인다. 도메인 변경이 컬럼에 자동 전파되지는 않고, 표준 상태만 다시 계산한다(도움말 §6) |
| 2.8 | 도메인 뷰에서 도메인을 컬럼으로 끌어다 놓아 지정한다. | H:gettingstarted/editorAndView/domainview | NO | — |
| 2.9 | 없는 도메인 이름을 치면 솔루션 대화상자가 떠서 도메인을 새로 만든다(기본 ON). | H:features/userConvenience/solutionDialog | NO | 의도한 차이다. 도메인은 MDM 이 관리한다 |
| 2.10 | 표·컬럼을 복사해 붙여 넣는다. 다른 파일에도 붙는다. 관계가 있는 표들을 함께 복사하면 관계도 따라온다. 도메인은 붙여 넣는 파일의 같은 이름 도메인을 쓴다. | RN 1.3.5 (2011-03-09), RN 3.x(관계 차수 초기화 수정) | NO | 이 화면에서 `Ctrl+C`·`Ctrl+V` 는 동작하지 않는다(도움말 §5) |
| 2.11 | 여러 개를 한 번에 고친다. 컬럼 여러 개를 골라 색상 태그를 붙인다. `Space` 속성 창에서 표의 모든 컬럼·제약·인덱스·관계를 한곳에서 고친다. 모델 검색 결과에 일괄 스크립트(XScript)를 돌린다(예: 도메인 일괄 지정). | H:features/themaAndTag, H:gettingstarted/properties, H:features/script/script, RN 2.x | PARTIAL | 캔버스에서는 표를 여러 개 골라 접기·빼기·삭제를 한다. 그리드에서는 여러 컬럼을 함께 고치지 못한다. 일괄 수정은 CLI·MCP `apply`(명령 200개, dryRun)로 한다(도움말 §7·§8) |
| 2.12 | 공통·기본 컬럼(감사 컬럼 등)을 자동으로 넣는 기능: 원문에서 찾지 못했다(확인 안 됨). | — | YES (우리가 앞섬) | 새 표에 감사 컬럼 8개가 끝에 붙는다. 처음에는 숨기고 `감사 n` 배지를 단다. [감사 컬럼 보기] 로 펼친다(도움말 §4.11) |
| 2.13 | `Space`(또는 팝업 > 속성)를 누르면 속성 대화상자가 뜬다. 표·컬럼·관계 공통이고, 컬럼·제약·관계·인덱스·DBMS 물리 속성을 한곳에서 고친다. 표 속성 창에서 DDL 도 미리 본다. | H:gettingstarted/properties, RN 2.x | PARTIAL | 그리드에서 고칠 수 있는 칸은 4개다. 컬럼 삭제·키·인덱스·관계 속성은 화면에 없고 CLI·MCP 로만 된다(도움말 §10.1) |
| 2.14 | 컬럼 순서 바꾸기: 원문에 별도 설명이 없다(확인 안 됨). | — | YES | 키 칸 손잡이를 끌어 옮긴다(도움말 §4.2) |

## 3. 관계 그리기

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 3.1 | `4`(비식별)나 `5`(식별)를 누르고 부모 표를 누른다. 마우스를 따라 선이 그려지고, 자식 표를 누르면 자식 표에 참조 컬럼이 자동으로 생긴다. | H:gettingstarted/diagramEditing | YES | 같은 키 `4`·`5` 를 쓴다. 누르거나 끌어서 긋는다. 부모 PK 를 복사하고, 식별이면 자식 PK 에도 넣는다. 그은 뒤 선택 도구로 돌아온다(도움말 §4.3) |
| 3.2 | 같은 표를 다시 누르면 자기 참조 관계가 생긴다. | H:gettingstarted/diagramEditing | NO (화면) | CLI·MCP `addRelation` 으로만 된다(도움말 §10.1) |
| 3.3 | 자식 표에 같은 이름 컬럼이 있으면 솔루션 대화상자가 뜬다. 상황을 그림으로, 처리 방식을 아이콘으로 보여 준다. 환경설정 "사용자에게 묻기" 에서 기본 처리를 정해 다시 묻지 않게 할 수 있다. 이미 다른 표를 참조하는 컬럼은 재사용하지 않는다. | H:features/userConvenience/solutionDialog, H:faq/faq1 | PARTIAL | "같은 이름의 컬럼" 창에서 [있는 컬럼 쓰기]·[새 컬럼 만들기] 를 고른다. 그림 설명과 "다시 묻지 않기" 는 없다(도움말 §4.3) |
| 3.4 | 관계선을 고르면 아이콘으로 부모·자식 표를 표시하고, 연결된 컬럼을 강조한다. | H:gettingstarted/diagramEditing | NO | 도움말에 없다 |
| 3.5 | 관계 속성 창에서 자식(FK) 컬럼을 바꾼다. 한 컬럼이 여러 부모를 참조하게 할 수 있다. | H:gettingstarted/properties, H:faq/faq1 | NO (화면) | CLI·MCP `updateRelation` 으로만 된다 |
| 3.6 | 식별·비식별 전환 | 도구 분리(4/5), A2 §1 | NO (화면) | 화면에서는 바꿀 수 없고 CLI·MCP 로만 된다(도움말 §10.1). 엔진은 자식 PK 를 따라 바꾼다(커밋 9299ed5db) |
| 3.7 | 표기법을 IE 와 Barker 중에서 고른다. Barker 식별 관계는 UID 막대를 그린다. 차수는 4종(EXACTLY_ONE·ZERO_OR_ONE·ZERO_OR_MORE·ONE_OR_MORE)이다. 관계선 굵기와 색을 정할 수 있다. 비식별 관계는 점선이다. | H:gettingstarted/editorAndView/diagrameditor, RN 1.3.0, H:features/export/model | PARTIAL | 까마귀발, 0 원, 이중 막대로 그리는 IE 표기 한 가지다. 차수는 CLI 로만 바꾼다. Barker 표기와 선 스타일 설정은 없다(코드:canvas/ErdRelationEdge.tsx) |
| 3.8 | "자동 관계선": 최단 경로 알고리즘으로 선을 놓는다. | 홈, H:products/features | PARTIAL | 직교 꺾은선(smoothStep + 둥근 모서리)이다. 다른 표를 피해 가지는 않는다(코드:canvas/ErdRelationEdge.tsx) |
| 3.9 | 관계 이름 라벨: 관계에 논리명·물리명이 있고(내보내기 열에 있음), 캔버스 표시 여부는 확인 안 됨. | H:features/export/model | NO | 선 위 글은 "다른 후보 n개" 뿐이다 |
| 3.10 | PK 컬럼 삭제·관계 삭제·FK 일부 삭제 때 솔루션 대화상자로 FK 처리 방식(같이 지움/관계만 무효 등)을 고른다. | H:features/userConvenience/solutionDialog | NO | 화면에는 관계 삭제와 컬럼 삭제가 없다 |
| 3.11 | 부모 컬럼 이름을 바꾸면 자식 컬럼 이름도 바뀐다(기본 ON). 부모 도메인·타입 변경도 FK 자식에 반영된다. | H:features/preferences/preferences, A2 §4.4 | NO | `updateColumn` 은 그 컬럼만 바꾼다. FK 자식으로 전파하지 않는다(코드:backend `ErdCommandEngine.updateColumn`) |
| 3.12 | `Ctrl+R` 로 표에 연결된 관계를 모두 고른다. | H:features/userConvenience/shortcut | NO | — |
| 3.13 | 관계 추정(FK 가 없는 DB) | exERD 에 없음 | YES (우리가 앞섬) | 추정 관계를 노란 파선으로 그린다. 근거(DOC·SQL_JOIN·NAME_RULE)와 후보 순위를 보여 주고, 사람이 확정·기각한다(도움말 §4.1) |

## 4. 탐색

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 4.1 | 업무영역 > 다이어그램 > 표 계층. 같은 표를 여러 다이어그램에 놓을 수 있지만, 한 다이어그램에는 한 번만 놓는다. | H:gettingstarted/editorAndView/modelview | YES | 왼쪽 패널에 업무영역별 다이어그램 목록을 보여 준다(표 수, 위반 수)(도움말 §3·§11) |
| 4.2 | 활성 업무영역·스키마를 정하면 새 표가 그곳에 들어간다. 팝업 "다른 업무영역으로 보내기" 로 옮긴다. | H:gettingstarted/editorAndView/modelview | PARTIAL | 업무영역은 다이어그램을 묶는 이름일 뿐이다 |
| 4.3 | 다이어그램 생성 마법사: 모델 뷰에서 Document·스키마·표를 고르고 시작한다. 자동·수동 구성을 고르고, 이름을 정하고, 표를 넣고 뺀다. | H:gettingstarted/editorAndView/modelview | YES | [새 다이어그램] 3단계 마법사(업무영역·이름 → 거르기·[보이는 표 모두 고르기] → 자동 배치·격자)(도움말 §4.4) |
| 4.4 | 모델 뷰(트리): 모든 표가 나온다. 지금 다이어그램에 놓인 표는 굵게 보이고, 두 번 누르면 캔버스에서 선택된다. 트리에서 캔버스로 끌어 놓는다. 관계는 들어오는 것과 나가는 것으로 나눠 보인다. 정렬 단추가 있다. | H:gettingstarted/editorAndView/modelview, RN 3.x | PARTIAL | 다이어그램 목록과 "다이어그램에 없는 표 수" 만 보인다. 표 트리와 끌어 놓기는 없다(도움말 §3) |
| 4.5 | 편집기 아래에 다이어그램 탭이 있다. `Ctrl+D` 로 전환하고, 탭 순서를 바꾸거나 정렬한다. | H:gettingstarted/editorAndView/diagrameditor | PARTIAL | 왼쪽 목록에서 고른다. 탭과 단축키는 없다 |
| 4.6 | `Ctrl+T` 빠른 표 찾기. 물리명과 주석으로도 찾는다. | H:features/userConvenience/find | YES | `Ctrl+K` 로 찾는다(`Ctrl+T` 는 브라우저가 가져갈 수 있다). 물리명·논리명·주석을 찾고 정규식도 된다(도움말 §5·§10.2) |
| 4.7 | `Ctrl+O` 표 개요: 컬럼을 거른다. 한 번 더 누르면 부모 표 컬럼까지 넓힌다. 부모·자식 표로 바로 간다. | H:features/userConvenience/find | PARTIAL | `Alt+O` 컬럼 점프. 고른 표가 없으면 모든 표를 찾는다. 부모 표로 넓히기는 없다(도움말 §5) |
| 4.8 | `Ctrl+F` 모델 검색: 대상(표·컬럼·인덱스·제약)과 조건(예: 논리명이 "교과" 로 시작하고 도메인이 "교과")을 고른다. 결과는 검색 뷰에 나오고, 두 번 누르면 캔버스에서 선택된다. | H:features/userConvenience/search | NO | `Ctrl+F` 는 표 찾기 칸을 연다. 조건 검색은 없다 |
| 4.9 | 팝업 "다른 곳에서 보기": 모델 뷰나 그 표가 놓인 다른 다이어그램으로 간다. | H:features/userConvenience/find | NO | — |
| 4.10 | `Ctrl+↑`·`Ctrl+↓` 로 부모 표들·자식 표들을 고른다. | H:features/userConvenience/shortcut | YES | `Ctrl`/`Alt+↑↓`(도움말 §5) |
| 4.11 | 줌 컨트롤: 비율을 누르면 100%, 오른쪽 단추로 비율을 고르고, 슬라이더 옆을 누르면 10%씩 바뀐다. `Ctrl+휠`·`Ctrl+±`·`Ctrl+0` 을 쓴다. | H:gettingstarted/editorAndView/diagrameditor | PARTIAL | 확대·축소·[화면 맞춤] 단추와 휠이 있다(코드:ErdViewer.tsx Controls) |
| 4.12 | 50% 미만으로 줄이면 표 이름만 보인다. | 같은 곳 | YES | 도움말 §3.2 |
| 4.13 | 썸네일 뷰(미니맵): 전체 축소도에서 파란 사각형을 끌어 화면을 옮긴다. 표 색도 보인다. | H:gettingstarted/editorAndView/thumbnail, RN 3.x | NO | MiniMap 이 없다(코드:ErdViewer.tsx) |
| 4.14 | 보기 프리셋 4종: 기본(이름·도메인·타입), 엔티티 모드(이름·도메인, 초기 논리 모델링용), E-R 개요(표 이름·주석), 논리/물리 동시편집. 사용자 프리셋을 저장한다. 칸 머리를 끌어 순서를 바꾼다. 다이어그램마다 저장된다. | H:features/diagramViewSettings | PARTIAL | 3종(기본·E-R 개요·논리+물리 동시)이다. 엔티티 모드, 사용자 프리셋, 칸 순서 바꾸기는 없다(도움말 §3.2) |
| 4.15 | `F3` 은 논리·물리 토글, `F4` 는 논리, `F5` 는 물리다. 배경색은 논리가 파랑, 물리가 빨강이다. | H:gettingstarted/diagramEditing | YES | `F3` 과 [논리]·[물리] 단추, 같은 배경색(도움말 §2.3) |
| 4.16 | 표 접기(전체 / PK·FK 만 / 표만). 아래쪽 `....` 에 마우스를 올리면 숨긴 컬럼 수가 보이고, 누르면 펼쳐진다. | H:gettingstarted/diagramEditing | YES | 접기 3종과 "접힘 · 컬럼 n개 숨김" 표시(도움말 §3.1·§4.4) |

## 5. 표준화

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 5.1 | 용어사전(.xdic)은 별개 파일이다. 툴바 [용어 사전 설정] 으로 경로를 연결한다. 파일을 옮기면 다시 연결해야 한다. | H:features/terms/terms | YES (우리가 앞섬) | MDM 단어·컬럼 사전에 늘 연결되어 있다. 연결 작업이 없다 |
| 5.2 | 용어사전 편집기: `Ctrl+Enter` 로 새 용어, 칸 안 `,` 로 동의어, `Ctrl+T` 로 태그, `Ctrl+F` 로 검색. Excel(xls·xlsx) 가져오기·내보내기(열: 논리명·논리설명·논리동의어·물리명·물리설명·물리동의어·태그). | H:features/terms/terms, H:features/terms/excelImpEmp | PARTIAL | 사전 관리는 MDM 의 다른 화면이 맡는다. ERD 화면에서 바로 등록하는 기능은 없다(def #20) |
| 5.3 | 모델 검사: 툴바 버튼을 누르면 검토 뷰가 뜬다. 용어사전 일치, 이름 없음, 타입 누락, 예약어, 어떤 다이어그램에도 없는 표, DBMS 이름 길이, 도메인 타입을 본다. 항목을 두 번 누르면 선택되고, `F5` 로 다시 검사한다. 검사기는 환경설정에서 고른다. | H:features/modelValidator | PARTIAL | [표준 위반(n)] 탭이 있다. 이름 규칙(Oracle 식별자) 위반은 입력할 때 INVALID 로 막는다. 예약어·미배치 표 검사와 검사기 선택은 없다(도움말 §4.5·§9.2) |
| 5.4 | 검사는 사용자가 실행할 때만 한다. | 같은 곳 | YES (우리가 앞섬) | 입력하는 순간 판정한다. 행 색(빨강·노랑), 표 머리의 붉은 숫자, 다이어그램 목록의 위반 수로 보인다(도움말 §3.1·§6) |
| 5.5 | 검토 뷰에서 `Ctrl+1` 을 누르면 해결책 목록이 뜨고, 골라서 고친다(예: 용어 정책에 맞는 물리명 적용, 이름 길이 일괄 수정). | H:features/modelValidator, H:features/terms/terms, RN 2.x | NO | def #13. 도메인은 [추천] 단추 하나만 있다 |
| 5.6 | 용어 정책 일괄 적용 4단계: ① 계획 작성(옵션 3가지) ② 자동 적용 항목 검토(같은 논리명끼리 묶은 체크박스) ③ 후보가 여럿인 항목에서 고르기(노란 칸) ④ 실행. 처음에는 체크가 비어 있어 사람이 확인해야 반영된다. 물리명에서 논리명을 만드는 방향도 된다. | H:features/terms/terms, RN 3.x | NO | def #12 |
| 5.7 | 용어사전 역공학: 사전에 없는 논리명을 모아 한 번에 등록한다. | H:features/terms/terms | NO | def #20 |
| 5.8 | 확정 게이트 | exERD 일반판에 없음. SAM 은 제출 전 정합성 검사만 한다(S:features/repository) | YES (우리가 앞섬) | 이번 DRAFT 에서 바꾼 컬럼에 위반이 있으면 확정을 막는다(도움말 §4.8) |
| 5.9 | 명명 규칙: 표·컬럼·제약 등 새 객체의 이름 패턴을 정한다. 프로젝트마다 다르게 정할 수 있고, 규칙을 쓸 때도 `Ctrl+Space` 가 된다. | H:features/preferences/preferences | PARTIAL | PK 이름은 서버가 `PK_` + 표 물리명으로 붙인다(코드:backend `ErdCommandEngine` addKey). 사용자가 패턴을 정하는 설정은 없다 |

## 6. 모델 관리

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 6.1 | 모델 비교: 파일↔파일, 과거 이력(로컬 히스토리·SVN·Git), DB↔파일. UUID 와 이름 두 가지 방식으로 짝짓는다. 위치·테마 같은 "사소한 시각적 변경" 은 따로 표시한다. 색은 파랑=추가, 빨강=삭제, 노랑=변경이다. "밀치기" 로 방향을 정해 덮어쓰고 언두·리두한다. 정합성이 깨지면 실패하고 이유를 보인다. | H:features/compare/* | PARTIAL | [DB 차이] 탭에서 체크한 항목만 반영한다(DB → 모델 한 방향). 버전끼리 비교하는 기능은 없다(def #10)(도움말 §4.6) |
| 6.2 | HTML 비교 보고서: HTML 파일 하나로 공유한다. 컬럼 켜고 끄기, 인쇄 방향, 글꼴 크기를 바꾼다. | H:features/compare/compare-report | NO | — |
| 6.3 | 포워드 엔지니어링 5단계: 옵션(저장해 재사용) → 대상(모델 또는 다이어그램 기준) → DDL 미리보기·복사·파일 저장 → DB 접속 → 실행. 논리명을 주석으로 넣는 옵션이 있다. | H:gettingstarted/forwardEngineer, RN 1.3.5 | NO | P3 로 미뤘다(V 초안, def #1~#4) |
| 6.4 | ALTER(변경) 스크립트: 원문에서 찾지 못했다(확인 안 됨). DB 비교와 밀치기가 가장 가까운 기능이다. | — | NO | 모델 차이를 Flyway V 초안으로 만드는 일을 계획만 했다(def #1) |
| 6.5 | 정의서 템플릿 8종(HTML 표, XML, 스타일 HTML, 테이블·인덱스·관계 정의서 HTML, CSV 콤마·탭). 템플릿을 복사해 고치고, 변수는 `Ctrl+Space` 로 보조한다. 업무영역 단위로 만들고, 결과는 클립보드나 파일로 보낸다. 실무 예(velog): eXERD > 내보내기 > 템플릿 → "CSV 콤마구분" → [템플릿 복사] → 열 편집 → 클립보드 → Excel. | H:features/inOtherDocuments/modelExport, RN 3.x, https://velog.io/@dailylifecoding/exerd-column-info-to-excel | NO | def #9 |
| 6.6 | 표를 복사해 Excel 에 붙이면 표 형태로, Word·PowerPoint 에는 표로, 그림판에는 이미지로 들어간다. 표를 2개 이상 고르면 이미지에 관계선도 들어간다. | H:features/inOtherDocuments/copyAndPaste | NO | — |
| 6.7 | 이미지 내보내기(다이어그램 우클릭). 인쇄 설정(여백·용지·배율·머리글 매크로)과 미리보기. | H:features/printing, RN 3.x | NO | — |
| 6.8 | 모델을 SQLite 로 내보낸다(schemas·tables·columns·indexes·relations 등 표). | H:features/export/model | PARTIAL | 내보내기 파일은 없다. 대신 `getModelText`, CLI `text`·`--json` 으로 읽는다(도움말 §7·§8) |
| 6.9 | XScript(JavaScript) 일괄 작업: 미리 준비된 스크립트를 고르고 인자를 넣어 실행한다. 결과는 콘솔에 나오고, 링크를 누르면 대상이 선택된다. | H:features/script/script | YES (다른 방식) | CLI·MCP `apply` 명령 묶음. dryRun 이 기본이고, Claude 가 자연어로 대신 짠다(도움말 §7·§8) |

## 7. 협업

| # | exERD 동작 (SAM Edition) | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 7.1 | 저장소 서버를 둔다. 모델·용어(.xtd)·도메인(.xdd)을 등록하고 가져온다(체크아웃). 사용자·권한은 관리 콘솔에서 관리한다. | S:features/repository/* | PARTIAL | 버전마다 소유자와 공동 편집자를 두고, 화면 권한을 따로 둔다(도움말 §4.9) |
| 7.2 | "변경 제출"(커밋 메시지 포함, 문서 전체 또는 업무영역 단위). 제출 전에 정합성 검사를 하며 건너뛸 수 없다. | S:features/repository/repository_commit | PARTIAL | 명령마다 바로 반영되고 rev 가 쌓인다. 버전 단위로 확정한다. 커밋 메시지는 없다 |
| 7.3 | 최신 내용 가져오기: 마지막 동기화 기준 3-way 병합. 양쪽이 같은 곳을 바꾸면 내 변경이 이긴다. 병합 결과를 미리 본다. 업무영역 단위로 갱신한다. | S:features/repository/repository_pull·synchronize, A2 §4.8 | YES (다른 방식, 우리가 앞섬) | 실시간 공동 편집: SSE, 속성 단위 충돌 거절, [내 값 복사](도움말 §9). 사람 2명과 Claude 세션 2개의 브라우저 확인은 아직 하지 않았다(도움말 §9 "확인 예정"). 3-way 병합은 의도적으로 뺐다(def #14) |
| 7.4 | 잠금: 제출하는 동안만 Lock 이 걸리고, 남은 Lock 은 관리 콘솔에서 푼다. 체크인·체크아웃 배타 편집은 없다. | S:features/repository, A2 §4.8 | PARTIAL | 권고용 "작업 중 표시"(Claude·CLI, 600초)와 DRAFT 선점·해제가 있다(도움말 §4.9·§9.4) |
| 7.5 | 상태 표시 "수정됨"·"갱신가능". 문서 이력 보기(모든 사용자의 제출 기록). | S:features/repository/repository-version-management·history | YES | 위 막대에 rev 와 접속자 동그라미가 있고, [변경 기록] 탭(최근 100 rev, "나" 표시, 출처)에서 되돌리기를 한다(도움말 §4.7) |
| 7.6 | 표준(도메인·용어)을 저장소에서 공유한다. | S:features/repository | YES | MDM 사전 한 곳 |
| 7.7 | 누가 어디를 보고 있는지(접속자, 선택) | exERD 에 없음 | YES (우리가 앞섬) | 접속자 이름표, `getCurrentView` 로 LLM 이 사용자 선택을 읽는다 |

## 8. 작은 편의

| # | exERD 동작 | 근거 | 우리 | 우리 쪽 한 줄 |
|---|---|---|---|---|
| 8.1 | 거의 모든 기능에 `Ctrl+Z` 가 된다. 실행 취소 때 컬럼이 부서지는 애니메이션으로 무엇이 바뀌었는지 보여 준다. 리두는 기능 소개에 언급만 있고, 단축키 목록에는 없다(확인 안 됨). | H:gettingstarted/diagramEditing, H:products/features | PARTIAL | `Ctrl+Z` 는 이 탭에서 한 내 마지막 변경만 되돌린다. 리두는 없다. 변경 기록에서 rev 를 골라 되돌릴 수 있다(도움말 §4.7·§9.3) |
| 8.2 | 표 여러 개를 고르고 정렬 툴바(맞춤)를 쓴다. | RN 2.2.0 (2012-11-30) | NO | — |
| 8.3 | 표를 끌 때 스내핑 안내선이 나온다(켜고 끌 수 있다). | H:features/preferences/preferences | PARTIAL | 격자에 붙는다(`snapToGrid`). 안내선은 없다(코드:canvas/useCanvasEditing.ts) |
| 8.4 | `Ctrl+Shift+F` 자동 배치: 관계를 기준으로 겹치지 않게 놓는다. 다시 누를 때마다 다른 알고리즘(5~8가지)이 적용된다. 간격은 환경설정에서 정한다. | H:features/userConvenience/autoAlocation | PARTIAL | [자동 배치](dagre, 부모를 왼쪽에) 한 가지이고 `Ctrl+Z` 로 되돌린다. 단축키와 간격 설정은 없다(도움말 §4.4) |
| 8.5 | 노트: 도구 `6`. 메모형·말풍선형이고 색 테마가 있으며 표에 이어 붙인다. | H:gettingstarted/diagramEditing | NO | — |
| 8.6 | 표 테마(머리·외곽선 색), 컬럼 색상 태그(모든 다이어그램에 같이 보임), 표 아이콘(16x16 파일을 끌어 놓기), 글꼴 바꾸기. 새 표의 기본 테마도 정한다. | H:features/themaAndTag | NO | — |
| 8.7 | 우클릭(팝업) 메뉴에 편집 명령을 모았다. | H:gettingstarted/editorAndView/diagrameditor | YES | 빈 곳: [여기에 표 추가]·[자동 배치]. 표: [접기](도움말 §4.2·§4.4) |
| 8.8 | 툴바 단추에 마우스를 올리면 설명과 단축키가 보인다. | 같은 곳 | YES | 도구 단추 이름표에 키를 붙인다(예: "표 추가 (2)"). 고칠 수 없을 때는 그 이유를 보인다(코드:canvas/ErdToolbar.tsx) |
| 8.9 | 단축키 목록이 도움말에 있다(범위별: 다이어그램, 표, 도메인 뷰, 검토 뷰, 용어사전). `Ctrl+3` 명령 검색으로 모든 명령을 찾는다. | H:features/userConvenience/shortcut | PARTIAL | 도움말 §5 에 표가 있다. 화면 안 명령 검색은 없다 |
| 8.10 | 숫자 키로 도구를 바꾼다: 1 선택, 2 패닝, 3 표, 4 비식별, 5 식별, 6 노트. | 같은 곳 | PARTIAL | 1 선택, **2 표**, 4·5 관계. exERD 에서 표는 3 이므로, exERD 에 익숙한 사람은 손이 엇갈린다(도움말 §5) |
| 8.11 | `Delete` 는 다이어그램에서만 빼고, `Alt+Delete` 는 모델에서 지운다. | 같은 곳 | YES | 같은 키에 확인 창이 붙는다(도움말 §4.4) |
| 8.12 | 한글 처리: 자소 단위 검색('윕' 까지만 쳐도 '위반자' 를 찾음), 메시지 조사 자동("(은)는" 없이). | H:products/features, H:features/userConvenience/find | NO | 한글 조합 중에는 `Ctrl+Enter` 를 받지 않도록 막아 두기만 했다(도움말 §5) |
| 8.13 | 렌더링 품질 설정(저사양 PC 는 낮음). | H:gettingstarted/editorAndView/diagrameditor | 해당 없음 | 웹 화면이다 |

---

## 9. 갭 요약

### 9.1 우리가 이미 앞선 곳

- 입력하는 순간 표준을 판정하고 캔버스 전체에 색과 숫자로 보여 준다(5.4).
- 확정 게이트가 있다(5.8).
- FK 없는 DB 에서 관계를 추정한다(3.13).
- 실시간 공동 편집과 LLM·CLI 편집을 하고, 속성 단위로 충돌을 판정한다(7.3·7.7). 동시 편집의 브라우저 확인은 아직 하지 않았다(도움말 §9).
- 감사 컬럼을 자동으로 넣는다(2.12).
- 사전에 늘 연결되어 있다(5.1).

### 9.2 크게 빈 곳

- **화면 편집 범위.** 컬럼 삭제, 표 이름, 키, 관계 속성, 식별 전환, 자기 참조는 CLI 로만 된다.
- **대량 정비 도구가 없다.** 빠른 수정(`Ctrl+1`), 일괄 적용 마법사, 조건 검색이 없다.
- **출력이 없다.** 정의서, Excel·이미지 복사, DDL 을 만들지 못한다.
- **재사용 수단이 없다.** 복사·붙여넣기가 안 된다.
- **캔버스 꾸미기가 없다.** 노트, 색, 정렬, 미니맵이 없다.

## 10. 우리 사용자 경험을 가장 많이 개선할 exERD 패턴 10개 (순위)

순위는 exERD 기능 목록이 아니라 우리 사용자가 겪는 실제 불편으로 매겼다(도움말과 스펙 §5 의 수치 기준).

| 순위 | 패턴 | 근거 한 줄 |
|---|---|---|
| 1 | **`Space` 속성 창 하나에서 표·컬럼·키·관계를 모두 고치기** (2.13·3.5·3.6·3.2) | 컬럼 삭제, 표 이름, 키, 관계 속성, 식별 전환, 자기 참조가 지금은 CLI·MCP 전용이다(도움말 §10.1). CLI 를 쓰지 않는 설계자는 모델을 끝까지 다듬을 수 없다 |
| 2 | **검토 목록 `Ctrl+1` 빠른 수정 + 용어 정책 일괄 적용 4단계 마법사** (5.5·5.6) | 첫 확정 경고가 MCM 약 737건, MDM 약 657건이고 DOMAIN 만 550·634건이다(도움말 §4.8·§10.1). 하나씩 고치는 지금 방식으로는 정비가 끝나지 않는다 |
| 3 | **표·컬럼 복사·붙여넣기(관계·도메인 함께, 다른 모델로도)** (2.10) | 이력 표나 매핑 표처럼 비슷한 표를 반복해 만드는 일이 많은데 지금은 `Ctrl+C`·`Ctrl+V` 가 동작하지 않는다(도움말 §5) |
| 4 | **정의서 템플릿 출력 + Excel 로 표 복사** (6.5·6.6) | 테이블 정의서는 SI 산출물로 꼭 내야 한다. 지금은 화면 밖에서 따로 만들어야 한다(def #9) |
| 5 | **캔버스 인라인 편집(F2) + `` ` `` 빠른 논리·물리·주석 편집** (2.2·2.3) | 시선이 캔버스에 있는데 오른쪽 그리드로 옮겨 가야 한다. 이름 셋을 한 창에서 고치면 입력 왕복이 준다(def #11) |
| 6 | **`Ctrl+Space` 도메인·데이터 타입 입력 보조** (2.6) | 타입을 손으로 치면 INVALID·TYPE·DOMAIN 판정이 쉽게 나온다. 목록에서 고르면 표준 타입으로 입력된다 |
| 7 | **조건 모델 검색(도메인 = X, 논리명 시작 등) → 결과 목록 → 일괄 작업** (4.8·2.11) | 도메인 정비(2번)의 대상을 화면에서 모으는 수단이 없다. 지금 `Ctrl+F` 는 이름 찾기만 한다 |
| 8 | **솔루션 대화상자의 그림 설명 + "다시 묻지 않기" 기본값 + 삭제 영향 안내** (3.3·3.10) | 1번으로 삭제와 관계 편집을 화면에 넣을 때 FK 연쇄 처리를 묻는 창이 함께 있어야 한다. 반복해서 묻지 않게 하는 설정이 입력 속도를 지킨다 |
| 9 | **미니맵(썸네일) + 모델 트리(놓인 표 굵게, 끌어 놓기, "다른 곳에서 보기")** (4.13·4.4·4.9) | 표 57개 규모 모델에서 위치를 잃기 쉽다. 다이어그램에 없는 표는 지금 개수만 보인다 |
| 10 | **노트·컬럼 색상 태그·정렬 도구 + 엔티티 모드 프리셋** (8.5·8.6·8.2·4.14) | 리뷰와 설명용 다이어그램의 품질을 적은 비용으로 높인다. 엔티티 모드는 초기 논리 모델링에 맞는 보기다 |

덧붙임(작은 비용):

- 도구 숫자 키를 exERD 와 맞춘다(표 = 3, 2 = 패닝)(8.10).
- `F4`·`F5` 로 논리·물리를 바로 고르게 한다(4.15).
- 리두를 넣는다(8.1).

## 11. 출처

- 도움말 공통 앞부분: `http://exerd.com:8081/help/topic/com.tomato.exerd.help/html/`
  - gettingstarted/newErdFile/newfile.html, gettingstarted/diagramEditing/diagramEditing.html
  - gettingstarted/editorAndView/{diagrameditor, modelview, paletteview, thumbnail, domainview}.html
  - gettingstarted/properties/properties.html, gettingstarted/reverseEngineer/reverseEngineer.html, gettingstarted/forwardEngineer/forwardEngineer.html
  - features/userConvenience/{autoAlocation, contentAssist, find, search, shortcut, solutionDialog}.html
  - features/diagramViewSettings/diagramViewSettings.html, features/themaAndTag/themaAndTag.html
  - features/inOtherDocuments/{copyAndPaste, modelExport}.html, features/export/model.html
  - features/preferences/preferences.html, features/modelValidator/modelValidator.html
  - features/terms/{terms, excelImpEmp}.html, features/sharing/{erdImport, domainImport}.html, features/import/erwin.html
  - features/compare/{compare-viewer, compare-strategy, compare-db, compare-report, compare-revision}.html
  - features/script/script.html, features/printing/printing.html
  - products/features.html, faq/faq1.html, faq/faq2.html, releaseNotes/releaseNotes.html
- SAM 도움말: `http://exerd.com:8081/help/topic/com.tomato.exerdsam.help/html/features/repository/`
  - repository.html, repository_commit.html, repository_pull.html, repository_synchronize.html, repository-version-management.html, repository_history.html
- 공식 사이트: https://exerd.com/en/ (기능 소개), https://exerd.com/release.do (릴리스 노트)
- 2차: https://velog.io/@dailylifecoding/exerd-column-info-to-excel (템플릿 CSV 로 컬럼 명세를 뽑는 절차)
- 저장소 문서:
  - `docs/erd-tool/research-2026-10-09/A-exerd.md`, `A2-exerd-deep.md`
  - `docs/superpowers/specs/2026-10-10-erd-tool-design.md`
  - `docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md`
  - `docs/erd-tool/deferred.md`
  - `src/frontend/m-mdm/pages/dma/erdEdit/`
