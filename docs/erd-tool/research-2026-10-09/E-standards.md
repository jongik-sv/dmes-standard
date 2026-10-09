# ERD 도구 표준 조사 메모 (E 트랙)

조사일: 2026-10-09. 코드 수정 없음. 근거가 없는 내용은 "일반 지식(출처 없음)" 또는 "확인 안 됨"으로 표시.

## 1. 한국 데이터 표준화 체계

### 1-1. 공공데이터 공통표준 (행정안전부)
- 구성: 공통표준단어 / 공통표준용어 / 공통표준도메인 (검색 결과 기준). 표준코드는 공통표준 체계의 명확한 구성요소로 확인되지 않음 (AI-Ready 방안에서 주소·행정코드 등 식별값에 표준코드 적용 언급) — 확인 안 됨(구성 여부).
- 공통표준단어: 업무용어에 기반한 최소단위 명사형 단어. 한글명·영문명·영문약어명으로 구성.
- 공통표준용어: 공통표준단어를 조합한 용어. 도메인이 정한 데이터 형식을 반영.
- 공통표준도메인: 분류명·도메인명·데이터 타입 및 길이·저장/표현형식으로 구성.
- 제정 현황: 2020년 535개 최초 제정, 2021년 520개, 2022년 631개(추가 제정 기사), 2024년 3,641개 신규 제정, 누적 9,027개 (보도 기준, 기사마다 시점·수치 상이).
- 최신판: 공공데이터포털 메타데이터에 "공공데이터 공통표준 8차 제·개정(2025.11월) 기준"으로 기재. 2026년 현재 최신 여부는 확인 안 됨. 메타데이터 페이지 직접 조회는 시간 초과로 실패 → 확인 안 됨(레코드 수 포함).
- 7차 제정에서 명칭(한글·영문·영문약어)과 표현형식(타입·길이)을 함께 표준화한 것으로 보도됨.
- 이음동의어: 공통표준용어 중심으로 발굴·적용, 목록 별도 제공 (예: 과정명/과정이름/과정명칭 → 과정명 일원화).
- 출처: https://www.data.go.kr/dcat/metadata/15156442 , https://www.data.go.kr/dcat/metadata/15156439 , https://www.data.go.kr/dcat/metadata/15156379 (검색 결과 메타데이터 링크, 세부 내용은 확인 안 됨) ; https://newsseoul.co.kr/news/view/1065582025185608 (9,027개 보도) ; https://m.boannews.com/html/detail.html?idx=108792 (631개 보도) ; https://mois.go.kr/frt/sub/a06/b02/openData_3/screen.do (품질관리 안내)

### 1-2. 공공기관의 데이터베이스 표준화 지침 / 관리 매뉴얼
- 근거: 공공데이터법 제22조(품질관리) 등. 지침 제3조 적용 범위, 제11조~제13조가 공통표준단어·도메인 준용 기준으로 안내됨 (메타데이터 페이지 인용).
- 함께 참고: 『공공데이터베이스 표준화 관리 매뉴얼』.
- 분류어(class word)·금칙어 정의·목록·적용 기준: 확인 안 됨. 원문 PDF 직접 확인 필요.
- 품질관리 수준진단·평가: 3개 영역 8개 지표, '데이터 표준 관리'·'데이터 구조 관리' 항목 포함 (2024년 679개 기관 대상 보도).

### 1-3. 한국데이터산업진흥원 DAQ/DQC
- 검색으로 DQC 진단 항목 목록·표준용어 준수 기준은 확인 안 됨.
- 학술 자료에서 DQC/DQM 계열이 "한국데이터베이스진흥원" 명의로 언급됨. 이 기관이 현 한국데이터산업진흥원의 전신인지 확인 안 됨.
- 단어·용어·도메인·코드를 표준화 대상으로 나누는 틀이 학술 논문에 등장 (출처: https://koreascience.kr/article/CFKO202422572365857.pdf — 세부 확인 안 됨).

### 1-4. 관계 정리 (공공 표준 기준)
- 단어(word) → 용어(term) = 단어 조합 → 도메인(domain) = 용어에 붙는 타입·길이·표현형식.
- 컬럼 = 용어 1개 인스턴스. 물리명 = 용어의 영문약어 조합.

## 2. 논리명 → 물리명 변환 알고리즘

### 2-1. 도구 사례
- PowerDesigner: Name(논리) ↔ Code(물리). Tools > Model Options 에서 Code 탭 규칙(대소문자, 최대 길이, 유효 문자)과 "Enable name/code conversions" 옵션 → Name to Code 탭의 변환 스크립트·변환 테이블 적용. 변환 테이블 원천은 Glossary, Library 폴더의 CSV, 대상 폴더의 CSV. 약어 치환(단어·구를 약어로) 지원. 출처: https://infocenter-archive.sybase.com/help/topic/com.sybase.infocenter.dc38093.1510/doc/html/rad1232024676240.html , https://blogs.sap.com/2018/02/02/work-smarter-with-powerdesigner-choosing-your-conversion-table/
- ERwin: Convert names using naming standard abbreviations (Naming Standards 약어 사전으로 논리→물리 변환). 출처: https://bookshelf.erwin.com/bookshelf/public_html/12.5/Content/User Guides/erwin Help/Convert_names_using_naming_standard_abbreviations.html
- DA#(엔코아): 기능 상세 확인 안 됨. 공식 매뉴얼 확인 필요.
- exERD: 확인 안 됨 (이번 조사 미수행).
- mcp-variable (오픈소스): CSV 사전 기반 한글→물리명 변환, 공통표준용어 CSV 로 기본 데이터 구성, 미등록 용어는 미등록 표시, 애매하면 후보+경고 반환. 설계 참고용. 출처: https://www.remoteopenclaw.com/mcp/lahuman/mcp-variable

### 2-2. 권장 알고리즘 (일반 지식 기반 설계안, 출처 없음)
1. 정규화: 공백·특수문자 제거, 한글 자모 정규화, 영문 혼용 시 대문자 처리.
2. 사전 최장 일치(longest match) 분할: 표준단어 사전(한글명) 기준 왼쪽에서 가장 긴 매칭부터 소진. 예: "고객주문일자" → [고객][주문][일자] (사전에 "고객주문"이 용어로 있으면 우선 용어 매칭).
3. 용어 우선 매칭: 표준용어 사전에 통째로 있으면 그 물리명 사용(분할보다 우선).
4. 분할 후보 다중: 여러 분할이 가능하면 (a) 단어 수 최소, (b) 용어 사전 매칭 포함, (c) 최장 우선 순으로 점수화해 1순위 제시 + 나머지는 후보로 노출. 자동 확정 금지, 사용자 선택.
5. 미등록 단어: 분할 실패 구간은 "미등록" 표시 → 표준단어 신규 등록 요청 흐름으로 연결.
6. 분류어 확인: 마지막 단어가 분류어(일자·명·코드 등)인지 확인 (분류어 사전 필요, 아래 3절).
7. 물리명 조합: 영문약어를 `_` 로 연결, 대문자. 예: 고객(CUST)_주문(ORD)_일자(DT) → CUST_ORD_DT.
8. 길이 제한: Oracle 12.2 이상 식별자 한도 128바이트(검색 근거: https://docs.oracle.com/en/database/oracle/oracle-database/12.2/sqlrf/Changes-in-This-Release-for-Oracle-Database-SQL-Language-Reference.html , https://oracle-base.com/articles/12c/long-identifiers-12cr2). 12.1 이전은 30바이트. 관례상 30자 제한은 조직 규칙이며 Oracle 한도와 별개(일반 지식). 128바이트 한도 초과 시 ORA-00972 (https://docs.oracle.com/en/database/oracle/oracle-database/21/odpnt/EFCoreIdentifier.html). 한글 다바이트 문자가 식별자 길이에 어떻게 계산되는지는 확인 안 됨 — 물리명은 영문만 쓰는 것이 안전.
9. 약어 규칙: 표준단어의 영문약어명을 우선. 약어 없으면 사전 신규 등록 대상.

### 2-3. 실시간 입력 UX (일반 설계안)
- 논리명 입력 중 300ms 디바운스로 분할 미리보기, 미등록 구간 밑줄, 후보 2~3개 칩 노출, 128바이트 초과 경고 카운터 표시.

## 3. 도메인 기반 타입 결정

### 3-1. 공통표준도메인 근거
- 도메인은 타입·길이·표현형식을 정함 (공공 표준 구성 확인). 구체적 도메인 목록(일자·금액·코드·명·번호 등 그룹)과 값: 확인 안 됨 — 8차 제·개정본 CSV 원본 확인 필요.

### 3-2. Oracle 타입 매핑 관례 (일반 지식, 출처 없음)
- 일자 → DATE (시각 필요 시 TIMESTAMP). 
- 코드 → VARCHAR2(n BYTE/CHAR), 고정 길이면 CHAR 검토.
- 명(이름) → VARCHAR2(n CHAR) 권장 — 한글 포함 시 문자 단위가 직관적.
- 금액 → NUMBER(p,s) 예: NUMBER(18,0) 또는 NUMBER(18,2).
- 번호·ID → VARCHAR2 권장(선행 0 보존), 연산 대상이면 NUMBER.
- 여부 → CHAR(1) 'Y'/'N' 또는 VARCHAR2(1).
- VARCHAR2 BYTE/CHAR: NLS_LENGTH_SEMANTICS 기본 BYTE, 명시 CHAR 가 우선. 한글 혼합 데이터는 CHAR 의 지정이 안전. 혼합 사용은 지양(출처: https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/NLS_LENGTH_SEMANTICS.html , https://download.oracle.com/docs/cd/B28359_01/server.111/b28318/datatype.htm). 인스턴스 레벨 CHAR 설정은 비권장 (동일 출처).
- 식별자(이름) 길이는 NLS_LENGTH_SEMANTICS 영향 없음 (동일 출처 기재).

### 3-3. 분류어로 도메인 추론 규칙 (일반 설계안)
- 용어의 마지막 단어가 분류어이면 도메인 그룹 후보를 좁힘: 일자→날짜, 명→문자, 코드→코드, 여부→Y/N, 금액→숫자(소수 2), 번호→문자/숫자.
- 분류어가 없으면 도메인 미지정 경고.

## 4. 표준 준수 검사 항목 (위반 유형)

공개 자료로 상용 도구 목록을 확정하지 못함 (확인 안 됨). 아래는 일반 설계 목록:
1. 비표준 단어: 용어를 구성하는 단어가 표준단어 사전에 없음.
2. 분류어 누락: 용어 끝에 분류어 없음 (예: "고객주문" → 분류어 없음).
3. 분류어 불일치: 도메인 그룹과 분류어가 맞지 않음 (예: "일자"인데 VARCHAR2(8) 'Y'/'N').
4. 도메인 불일치: 컬럼 타입·길이가 표준도메인과 다름.
5. 동음이의어: 같은 한글명에 다른 영문약어 또는 다른 도메인.
6. 이음동의어 사용: 표준 용어가 아닌 동의어 사용 (표준 이음동의어 목록으로 치환 제안).
7. 금칙어: 사용 금지 단어 포함 — 금칙어 목록 확인 안 됨.
8. 물리명 길이 초과, 예약어 충돌(Oracle 예약어, 확인 안 됨 — 일반 지식), 대소문자·특수문자 위반.
9. 약어 불일치: 같은 단어에 두 약어.

## 5. 표준용어 신규 등록 요청 흐름

- 한국 공공 사례: 공개 절차 문서 확인 안 됨.
- 참고 구조 (해외·학술 사례):
  - 국내 의료 용어 표준화 위원회(TSC) 제안·검토·수정·확정 과정 (https://koreascience.kr/article/JAKO202110650792352.do ).
  - VetSCT 신규 개념 요청 / 기존 용어 수정 요청 분리, 근거·참고문헌 필수, 상태 모니터링 (https://vtsl.vetmed.vt.edu/Education/VTSDocs/VetSCT_Content_Request_System_User_Guide.pdf ).
  - NAACCR 변경 관리 절차 (https://narrative.naaccr.org/wp-content/uploads/2023/09/Illustrated-Change-Management-Process-1.pdf ).
- 일반 설계 흐름 (출처 없음): 신청(논리명·영문명·약어·정의·도메인·업무 근거) → 형식 검토 → 중복·유사(이음동의어) 검토 → 표준담당 심의 → 승인/반려/보완 → 표준 사전 반영 및 공지.
- ERD 도구 연동: 분할 실패(미등록) 구간을 바로 신청 양식으로 넘기는 흐름이 실무 효율에 맞음 (설계 제안).

## 6. 확인 안 됨 목록
- 공공데이터 공통표준 8차본 레코드 수, 최신(2026) 개정 여부 (메타데이터 페이지 조회 시간 초과).
- 분류어 목록·금칙어 정의와 적용 기준 (지침 원문 필요).
- 한국데이터산업진흥원 DQC 진단 항목·표준용어 준수 기준.
- DA#, exERD 의 변환 기능 상세.
- 상용 도구의 위반 유형 공식 목록.
- 한글 다바이트 문자가 식별자 길이에 계산되는 방식.
- 한국 공공 표준용어 신청·승인 절차 문서.

## 7. 핵심 URL
- https://www.data.go.kr/dcat/metadata/15156442 (공통표준 메타데이터, 8차 2025.11 기재)
- https://newsseoul.co.kr/news/view/1065582025185608 (9,027개 보도)
- https://m.boannews.com/html/detail.html?idx=108792 (631개 추가 보도)
- https://mois.go.kr/frt/sub/a06/b02/openData_3/screen.do (행안부 품질관리)
- https://oracle-base.com/articles/12c/long-identifiers-12cr2 (Oracle 128바이트 식별자)
- https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/NLS_LENGTH_SEMANTICS.html (BYTE/CHAR)
- https://infocenter-archive.sybase.com/help/topic/com.sybase.infocenter.dc38093.1510/doc/html/rad1232024676240.html (PowerDesigner Naming)
- https://bookshelf.erwin.com/bookshelf/public_html/12.5/Content/User Guides/erwin Help/Convert_names_using_naming_standard_abbreviations.html (ERwin 약어 변환)
- https://www.remoteopenclaw.com/mcp/lahuman/mcp-variable (CSV 사전 변환 사례)
