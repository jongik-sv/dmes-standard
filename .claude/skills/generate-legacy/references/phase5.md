# Phase 5 - 통합 문서 생성

SampleErp 화면 분석의 마지막 단계로, Phase 1-4 의 모든 분석 결과를 통합하여 종합 마크다운 문서를 생성한다. 최종 분석 문서의 양식(`templates/legacy_analysis_report_template.md`) 을 정확하게 따라서 작성한다.

> 산출물 템플릿 헤딩 / placeholder 는 부산 시절 그대로 보존한다 — 산출물 동일성 우선. 본문 채울 때 어휘만 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) 의 Java→C# / PL/SQL→T-SQL 매핑을 적용한다.

❌ 현대화 방안 제언, 추가적인 개선 사항 작성을 금지한다.

## 실행 알고리즘

### Step 1: 분석 결과 로드

moduleId 추출: SCREEN-ID 의 앞 3글자

**파일 존재 여부는 Glob 또는 Read 로 확인**

1. **Phase 1 결과 (structure.json)**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_structure.json`
2. **Phase 2 결과 (java_analysis.json)**: `{SCREEN-ID}_java_analysis.json` (키 이름 보존, 의미는 C# partial class 분석)
3. **Phase 3 결과 (sql_analysis.json)**: `{SCREEN-ID}_sql_analysis.json` (의미는 MSSQL procedure 분석)
4. **Phase 4 결과 (ui_analysis.json)**: `{SCREEN-ID}_ui_analysis.json` (WinForms Designer.cs/.resx 분석)

5. **커스텀 클래스 상세 분석 보고서 확인** (java_analysis.json 의 customActivities 기반)
   - `java_analysis.json` 에서 custom partial class 클래스명 목록 추출
   - 각 클래스명에 대해 `docs/external/SampleErp/orgErpReport/{moduleId}/{SCREEN-ID}/_classes/{ClassName}_analysis.md` (V2) 존재 여부 확인
   - **존재하는 경우**:
     - 보고서에서 비즈니스 로직을 정확히 추출하여 정리:
       - 각 메서드별 처리 로직 (조건 분기, 계산 공식, 데이터 변환 등)
       - 핵심 비즈니스 규칙 및 검증 로직
       - 메서드 간 호출 흐름 및 데이터 전달 구조
     - 헤더 메타 테이블에서: 라인 수, 메서드 수
     - 해당 클래스의 "C# 컴포넌트 분석" 섹션(템플릿의 `Java 컴포넌트 분석` 헤딩 그대로 두고 본문은 C#)에 **비즈니스 로직 정리 + 상세 분석 링크** 삽입
     - 링크 경로: `./_classes/{ClassName}_analysis.md` (V2 — 화면 폴더 내 `_classes/` 격리)
   - **미존재하는 경우**: Phase 2 의 java_analysis.json 기반으로 기존 방식대로 분석 내용 작성

6. **서브화면 분석 보고서 로드** (structure.json 의 `subServices` 배열 기반)
   - structure.json 에서 `subServices` 배열 확인
   - `subServices` 가 비어있거나 없으면 서브화면 섹션 생략 (`hasSubServices = false`)
   - 존재하면 각 서브화면의 `{SUB-SCREEN-ID}_legacy_analysis.md` 존재 확인:
     - Glob 으로 `docs/external/SampleErp/orgErpReport/**/{SUB-SCREEN-ID}/{SUB-SCREEN-ID}_legacy_analysis.md` 검색 (V2 — 화면 폴더 안)
     - 존재하면 보고서에서 비즈니스 로직을 정확히 추출하여 정리:
       - 헤더 메타 테이블에서: 컴포넌트 수, SQL 호출 수
       - 서브화면의 핵심 비즈니스 로직 정리
       - 주요 핸들러별 수행 로직과 데이터 처리 내용
     - 미존재하면 "미분석" 표시
   - `hasSubServices = true` 로 설정

### Step 2: 통합 문서 생성

**(중요)** 최종 분석 문서의 양식을 정확하게 따라야 한다.

**출력 위치 (V2 표준)**: `docs/external/SampleErp/orgErpReport/{moduleId}/{SCREEN-ID}/{SCREEN-ID}_legacy_analysis.md`

> V1 → V2 변경: 화면 폴더 안에 `bpa.md`, `bpmn`, `legacy_analysis.md` 가 형제로 위치한다. `service/ui/`, `service/nui/` 분기는 더 이상 사용하지 않는다.
**문서 양식**: `mes-plugin/skills/generate-legacy/templates/legacy_analysis_report_template.md` (헤딩 그대로, 본문은 C#/MSSQL 어휘 매핑 적용)

**동적 챕터 처리**:
- 템플릿의 `<!-- CONDITIONAL: [조건] -->` 주석을 기반으로 동적 챕터 생성
- `HAS_CUSTOM_ACTIVITIES_DATA` 조건: `java_analysis.json` 내 customActivities 배열에 데이터 존재
- `HAS_SQL_DATA` 조건: `sql_analysis.json` 파일 존재 및 내용 있을 때 표시
- `HAS_UI_DATA` 조건: `ui_analysis.json` 파일 존재 및 내용 있을 때 표시
- `HAS_SUB_SERVICES` 조건: `structure.json` 의 `subServices` 배열이 비어있지 않을 때 표시

### Step 2.1: 조건부 챕터 처리 로직

1. **데이터 파일 검증**:
   ```javascript
   const hasCustomActivities = checkValueExists(javaAnalysis.customActivities) && isJsonNotEmpty(javaAnalysis.customActivities);
   const hasSqlData = checkFileExists(sqlAnalysisPath) && isJsonNotEmpty(sqlAnalysisPath);
   const hasUiData = checkFileExists(uiAnalysisPath) && isJsonNotEmpty(uiAnalysisPath);
   const hasSubServices = structureJson.subServices && structureJson.subServices.length > 0;
   ```

2. **템플릿 조건부 처리**:
   - `<!-- CONDITIONAL: HAS_CUSTOM_ACTIVITIES -->` 블록은 `hasCustomActivities` 가 true 일 때 포함
   - `<!-- CONDITIONAL: HAS_SQL_DATA -->` 블록은 `hasSqlData` 가 true 일 때 포함
   - `<!-- CONDITIONAL: HAS_UI_DATA -->` 블록은 `hasUiData` 가 true 일 때 포함
   - `<!-- CONDITIONAL: HAS_SUB_SERVICES -->` 블록은 `hasSubServices` 가 true 일 때 포함
   - `<!-- END_CONDITIONAL -->` 주석과 함께 영역을 정확히 닫음

3. **조건별 챕터 생성**:
   - **SQL 데이터 있음**: `## 💾 데이터 요구사항` 섹션 전체 포함
   - **SQL 데이터 없음**: 데이터 요구사항 섹션 전체 생략
   - **UI 데이터 있음**: `## 🖥️ 사용자 인터페이스 요구사항` 섹션 전체 포함 (WinForms Designer.cs 기반 본문)
   - **UI 데이터 없음**: UI 요구사항 섹션 전체 생략
   - **서브화면 있음**: `## 서브서비스` 섹션 포함 (요약 테이블 + 각 서브화면별 2-3줄 설명 + 링크)
   - **서브화면 없음**: 서브화면 섹션 전체 생략

4. **서브화면 링크 경로 규칙 (V2)**:
   - 동일 모듈: `../{SUB-SCREEN-ID}/{SUB-SCREEN-ID}_legacy_analysis.md`
   - 다른 모듈: `../../{otherModuleId}/{SUB-SCREEN-ID}/{SUB-SCREEN-ID}_legacy_analysis.md`

### Step 2.2: 본문 어휘 매핑 (vocabulary-mapping.md 적용)

템플릿 헤딩은 그대로 두고, 본문 작성 시 다음과 같이 매핑:

| 템플릿 헤딩 (보존) | 본문 채울 때 (SampleErp 매핑) |
|---|---|
| `## ⚙️ Java 컴포넌트 분석` | C# partial class 분석 — Activity/메서드 → C# 클래스/이벤트 핸들러 |
| `### Custom Activity 상세 분석` | Custom partial class 상세 분석 |
| `### [JAVA_ACTIVITY_CLASS_NAME] ([JAVA_ACTIVITY_NAME])` | C# 클래스명 + 핸들러/메서드명 |
| `#### Java 상수 및 의존성` | C# 상수 (`const`, `static readonly`) + using 의존성 |
| `## 🖥️ 사용자 인터페이스 요구사항` | WinForms 사용자 인터페이스 요구사항 (Designer.cs/.resx 기반) |
| `### Layout 구조` | WinForms 컨트롤 트리 (Dock/Anchor/SplitContainer 기반) |
| `### Form 컴포넌트` | WinForms Form 위 입력 컨트롤 (TextBox/ComboBox/DateTimePicker) |
| `### Grid 컴포넌트` | FpSpread / DataGridView / C1FlexGrid |
| `### JavaScript 모듈` | "해당 없음 (WinForms 데스크톱 — JS 미사용)" + 클라이언트 이벤트 핸들러 메서드 표 |
| `## PL/SQL 함수/프로시저` | MSSQL Stored Procedure / Function (헤딩 그대로 두되 본문은 MSSQL T-SQL 어휘) |

### Step 3: Mermaid 다이어그램 생성

#### ⚠️ 단순 화면 판별 및 워크플로우 생략 규칙

화면의 컴포넌트 구조가 **단순 조회 위주** 인 경우 워크플로우 다이어그램(핵심/상세 모두) 을 **생략**한다.

**생략 조건** (아래 조건을 모두 충족 시):
- Custom partial class 가 단순 조회 핸들러만 포함 (저장/삭제 핸들러 없음)
- 모든 procedure 호출이 SELECT 만 수행 (INSERT/UPDATE/DELETE 호출 없음)
- 컴포넌트 체인이 OnLoad → 단일 조회 procedure → Spread 갱신

**생략 시 처리**: "핵심 워크플로우 다이어그램" 및 "상세 워크플로우 다이어그램" 섹션을 제거하고, "시스템 목적" 섹션에서 비즈니스 맥락을 충분히 기술한다.

**⚠️ 단, SQL 에 특별한 계산/변환 로직이 포함된 경우**: 워크플로우 다이어그램은 생략하더라도 **"비즈니스 로직 상세" 섹션에 SQL 기반 비즈니스 로직을 반드시 기술**한다. SQL 기반 비즈니스 로직의 예:
- CASE WHEN 을 활용한 데이터 분류·변환 (예: 상태코드별 PIVOT, 거래처 내수/수출 분류)
- 수학적 계산 (적치일수 산출, 수율 계산, 배분비율 등)
- WITH(CTE) + UNION 을 활용한 집계/소계 패턴
- 스칼라 서브쿼리를 통한 코드값→의미명 변환 규칙
- 복잡한 조건 필터링

이러한 SQL 로직은 C# 없이도 핵심 비즈니스 규칙을 구현하고 있으므로, "비즈니스 로직 상세" 섹션에서 목적, 처리 케이스, 계산 공식 형태로 상세히 기술해야 한다.

#### 워크플로우 다이어그램 작성 (비단순 화면)

1. **핵심 워크플로우 (Flowchart)** — 비즈니스 관점
   - **기술적 컴포넌트 체인이 아닌, 비즈니스 프로세스 흐름** 을 표현한다
   - 업무 담당자가 이해할 수 있는 업무 단위로 노드를 구성한다
   - 예시: "Job 목록 조회 → 매칭 검증 → 거래처 분배 → 매칭 확정"
   - Form 로드, 콤보 로드, Spread 표시 등 기술적 단계는 포함하지 않는다
   - 분기는 비즈니스 판단 기준으로 표현 (예: "내수 / 수출 분기")

2. **상세 워크플로우 (Flowchart)** — 비즈니스 로직 상세
   - 핵심 워크플로우의 각 단계를 비즈니스 규칙, 데이터 변환, 검증 로직 중심으로 상세 전개
   - 데이터 흐름(어떤 테이블에서 조회 → 어떤 계산/변환 → 어떤 테이블에 저장) 을 포함

3. **데이터 플로우 (Graph)**
   - 핸들러/메서드 → procedure → Table 연결
   - 데이터 흐름 시각화

4. **공통 요구사항**
   - 대괄호([]) 사이의 문자열은 큰 따옴표("내용") 로 감쌀 것
   - 예: H["시간 설정 (등록시)"]

### Step 4: ER 다이어그램 생성

1. **ER 다이어그램**
   - **기본**: Mermaid erDiagram 코드블록으로 문서에 직접 포함 (SVG 파일 생성 안 함)
   - **SVG 생성은 사용자가 명시적으로 요청한 경우에만** 수행 (별도 SVG 파일 생성 + 이미지 링크)
   - 테이블 간 관계 표시 (1:N, N:1, N:M)
   - 각 테이블의 PK/FK 컬럼과 주요 비즈니스 컬럼을 erDiagram 내에 표기
   - **테이블 정의 보강**: `docs/external/SampleErp/tables/{tableName}.sql` 정적 파일에서 정확한 컬럼/타입/PK/FK 추출

### Step 5: 품질 검증 체크리스트

**⚠️ 날림 방지 — 상세도 기준 (반드시 준수)**:

1. **Spread/Grid 컬럼**: 모든 컬럼을 빠짐없이 나열하되, 각 컬럼에 `필드명: 타입 - 설명 (너비px, 정렬)` 포맷 적용. 숨김 컬럼도 `(숨김)` 표시하여 포함.
2. **Form 필드**: 모든 필드를 나열하고, 콤보/라디오/버튼 등 입력 유형과 연결 이벤트 명시.
3. **MSSQL 호출**: 단순 "조회" 한 줄로 끝내지 말 것. 각 procedure 호출의 목적, JOIN 관계, WHERE 조건의 비즈니스 의미, 바인드 변수(`@변수명`) 를 상세히 기술.
4. **비즈니스 로직**: SQL 에 CASE WHEN/CTE 등 변환/집계 로직이 있으면 반드시 별도 케이스로 기술.
5. **화면 동작 흐름**: 최소 2개 이상의 시나리오로 분화 (초기 로딩, 조회, 화면 이동/Dialog 등).
6. **클라이언트 이벤트 핸들러**: 실제 cs partial class 에서 확인한 핸들러만 나열. 베이스 클래스 가상 메서드 오버라이드(`OnSearch`, `OnSave`) 와 직접 정의 핸들러(`btnXxx_Click`) 구체적 명시.
7. **특이사항**: 최소 3건. 코드에서 발견한 하드코딩, 안티패턴, 버그 가능성, 비표준 패턴 등 실제 관찰 기반으로 작성.

**자동 검증 항목**:
- [ ] 모든 Custom partial class 분석 포함
- [ ] 주요 메서드의 역할이 명확히 기술됨
- [ ] 계산 공식이 수학 표기 또는 의사코드로 표현됨
- [ ] 모든 procedure 호출 설명 포함 (목적, 테이블 관계, 바인드 변수, 비즈니스 의미)
- [ ] 핵심 테이블을 표형식으로 표현했는지 확인 (DDL 사용금지)
- [ ] UI 컴포넌트 분석 포함 (단 비-UI partial class 면 생략)
- [ ] Spread 컬럼이 `필드명: 타입 - 설명 (너비px, 정렬)` 포맷으로 전수 나열됨
- [ ] 화면 동작 흐름이 2개 이상 시나리오로 분화 기술됨
- [ ] 이벤트 처리 흐름이 단계별로 상세 기술됨 (단 비-UI 면 생략)
- [ ] Mermaid 다이어그램 유효성
- [ ] Mermaid erDiagram 코드블록 포함 여부 및 유효성 (SVG 는 사용자 요청 시에만)
- [ ] 특이사항 최소 3건 이상 기술됨

### Step 6: 최종 문서 저장
1. **디렉토리 생성 (V2)**
   - 경로: `docs/external/SampleErp/orgErpReport/{moduleId}/{SCREEN-ID}/`
   - 없으면 자동 생성. `_classes/` 하위 폴더는 customClass 산출물이 있을 때만 생성.

2. **ERD 생성**
   - **기본**: Mermaid erDiagram 코드블록을 문서 내에 직접 포함
   - **SVG 요청 시에만**: SVG 파일을 별도 생성하여 `[문서 저장 경로]/ERD/` 에 저장 + 이미지 링크 첨부

3. **문서 파일 생성**
   - 파일명: `{SCREEN-ID}_legacy_analysis.md`
   - ERD 다이어그램: Mermaid 코드블록으로 직접 포함
   - Write 도구 사용

## 문서 품질 기준
1. **완전성**: 모든 Phase 결과 통합
2. **정확성**: JSON 데이터와 일치
3. **가독성**: 마크다운 형식 준수
4. **시각성**: Mermaid 다이어그램 포함
5. **추적성**: 원본 파일 경로 명시
6. **어휘 일관성**: vocabulary-mapping.md 의 매핑을 일관되게 적용

## 주의사항
- Phase 1-4 선행 필수 (모든 Phase 완료 후 실행)
- analysis 디렉토리 없으면 자동 생성
- 본문 채울 때 항상 vocabulary-mapping.md 적용

## 에러 처리
- Phase 결과 누락 → 누락 Phase 안내 후 종료
- 디렉토리 생성 실패 → 권한 확인
