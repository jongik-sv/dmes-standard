# exERD 조사 메모 (A)

조사일: 2026-10-09. 웹 검색·페이지 조회 기반. 공식 매뉴얼 본문 대부분은 접근하지 못했다(아래 "확인 안 됨" 표기).
WebFetch 결과는 요약기를 거친 내용이므로, 원문 인용이 필요하면 해당 URL을 직접 열어 확인한다.

## 1. 6가지 가정 판정

| # | 가정 | 판정 | 근거 |
|---|---|---|---|
| 1 | 논리명/물리명을 버튼 하나로 전환 | 부분 | 도움말 Features: 「Whenever you want, you can change from logical mode to physical mode (and vice versa)」 — 모드 전환은 확인. 홈페이지: 「Standard data dictionary: Defines standard and physical names for model elements」 — 표준명·물리명 구분은 확인. 「버튼 하나로 이름 표시 전환」이라는 UI 세부는 확인 안 됨. |
| 2 | 부모→자식 관계선 긋기 시 FK 생성, PK 컬럼 자식으로 이동 | 확인 안 됨 | 직접 근거 없음. 간접: 도움말 「deleting one of some PK columns, your program can delete all related FKs or just invalidate the relations」 — PK·FK 연결이 모델 안에서 관리된다는 뜻만 확인. |
| 3 | 식별/비식별 관계 구분, 식별이면 옮겨진 컬럼이 자식 PK | 확인 안 됨 | 검색·조회한 어떤 페이지에도 식별/비식별 설명 없음. |
| 4 | 표 선택 후 옆 그리드에서 키보드로 컬럼 연속 입력 | 부분 | 홈페이지 Features 목록에 「WYSIWYG spreadsheet-style editing」(스프레드시트식 편집) 항목. 키보드 전용 연속 입력은 확인 안 됨. |
| 5 | 모델 하나에 주제영역 다이어그램 여러 개, 같은 표가 여러 다이어그램에 나옴 | 부분 | 릴리스 노트 1.0.34: 「최신 문서/업무영역 내려받기 시」 — 업무영역(주제영역) 개념과 저장소 병합 기능 존재(SAM/저장소 라이선스 계열). 같은 표를 여러 다이어그램에 배치하는 방식은 확인 안 됨. |
| 6 | 논리명 입력 → 단어사전으로 물리명 생성, 도메인 선택 → 타입·길이 결정 | 부분 | 홈페이지: 「Domain types: Abstracts and reuses column roles」, 인라인 편집 항목에 「Domain」·「Naming Rules」·「Data Dictionary」 나열. 단어사전 기반 물리명 자동 생성, 도메인이 타입·길이를 정하는 동작은 확인 안 됨. |

## 2. exERD 주요 기능 정리 (확인된 것 위주)

- 제품 성격: Eclipse 기반 E-R 모델러. 제작사 Tomato System Co., Ltd. (토마토시스템). 도움말 Overview: 「eXERD is an E-R modeling tool based on Eclipse.」 (근거: https://exerd.com/ , http://exerd.com:8081/help/topic/com.tomato.exerd.help/html/products/whatsexerd.html)
- 리버스 엔지니어링: 확인. 메뉴 Reverse Engineering → 마법사에서 파일명·프로젝트명 입력, DB 연결 테스트, 변환 대상 선택(스키마·테이블·뷰·함수·프로시저·트리거·도메인), 완료 후 다이어그램 생성 마법사. (근거: https://www.cubrid.org/3827358 , 2020-07-23 글)
- 포워드 엔지니어링(DDL 생성): 확인. 홈페이지 「Creates tables in the DBMS from the E-R model via DDL」. 릴리스 1.0.31에 다중 스키마에서 포워드 옵션 수정 기록. (근거: https://exerd.com/en/ , https://exerd.com/release.do)
- 모델-DB 비교/병합(Compare/Sync): 부분 확인. 1.0.34 「xrd 파일 간 비교 기능」, 「라이브 DB와 파일 비교 후 선택 변경분만 반영」, 「병합 결과 미리 보기」. 홈페이지는 「Visual Feedback: compares or merges file versions」. 기능 이름이 Compare/Sync 인지는 확인 안 됨. (근거: https://exerd.com/release.do)
- 표준화(사전): 부분. 「Standard data dictionary」「Domain」「Naming Rules」 언급. 단어 사전 자체의 구조·화면은 확인 안 됨.
- 협업: 확인. 1.0.34 「저장소 라이선스 보유 시 저장소 설치·관리 기능」, 1.0.33 「저장소 관리 콘솔의 모델·사용자·표준 관리 영역」. 공식 가격표는 SAM Edition을 협업 중심으로 설명: 「repository user and permission management, integrated model management (version history, collaboration)」. 잠금(lock) 방식은 확인 안 됨(릴리스 노트에 lock 항목 없음).
- 버전 이력: SAM Edition 설명에 version history 있음(위 가격 페이지). 
- 노트·메모: 릴리스 1.0.32에 「다이어그램 에디터의 테이블/노트에 적용된 테마」 — 노트 객체 존재 확인. 노트 내용 기능 상세는 확인 안 됨.
- 출력: 이미지 출력, 엑셀 정의서 출력 — 릴리스 노트·홈페이지에서 확인 안 됨. 2012 기사에 「다양한 포맷으로 내보내기」 언급은 있으나 구체 포맷 확인 안 됨. (근거: https://www.etnews.com/201209030130 , 오래된 자료)
- 지원 DB: 확인. 3.x 가격 페이지: Oracle, SQL Server, DB2, MySQL, PostgreSQL, Tibero, MariaDB, Cubrid (ERWin 가져오기 포함). 릴리스 노트: PostgreSQL·Tibero·MySQL/MariaDB·Oracle·Cubrid 수정 이력. 
- 최신 버전: 3.3.56 (2026-08-20 릴리스 노트), 1.0.x 시리즈 별도 존재(1.0.34 2026-08-20). 두 계열의 관계는 명확하지 않음(1.0.x는 SAM 계열로 추정, 확인 안 됨).
- AI 기능: 홈페이지에 「AI」 항목 있으나 상세 확인 안 됨. 릴리스 노트에 AI 항목 없음.
- 라이선스·가격 (확인):
  - 3.x 1개 기준 소비자가 1,000,000원, 5개 4,750,000원(공급가 기준 표), 10개 9,000,000원, 30개 25,500,000원, 50개 40,000,000원, 100개 70,000,000원 (공급가). 부가세 별도 명시. 
  - SAM Edition: 가격 미공개, 영업 문의.
  - 라이선스 형태: 평가판(30일 또는 30/60/90일 — 페이지 두 버전 불일치), 정품/기업용, 교육용(교육기관 한정). 상업 사용 허용 여부는 명시 안 됨. 영구 라이선스 명시 안 됨("지속적인 사용권"이라는 표현만). 
  - 업데이트 무상(3.x), 기술지원 포함 여부는 정품 설명에 포함 문구 있음. 
  - 설치 PC 수는 사용권 증서 기준(초과 설치 금지). 
- 플랫폼: Windows, Eclipse 플러그인 형태. (근거: https://alternativeto.net/software/exerd/about — 2차 사이트)
- 사용자 평: AlternativeTo 리뷰 1건뿐이라 평가 근거 부족. 한국어 블로그 후기는 검색에서 찾지 못함.

## 3. 사용자 불만·한계

- 공개 자료에서 체계적인 불만 사례는 찾지 못함(확인 안 됨).
- 일반 ERD 툴 불만(검색 인용, exERD 한정 아님): 테이블이 많아지면 다이어그램이 혼잡, DB 변경 후 재동기화 시 엔티티 배치가 뒤섞임. (근거: https://www.elancer.co.kr/blog/detail/961 — 일반론)
- 2012 기사 말 "3,000 downloads/월" 등 오래된 수치는 현재 상황과 무관할 수 있음.
- 가격: 3.x 1석 100만 원대는 개인 학습용 외에는 소규모 팀 기준 부담 가능성(판단이며 확인된 사실 아님).
- 공개 페이지 기준 협업은 SAM Edition(별도 저장소) 쪽에 있어 기본판에서는 협업 불가로 보임(가격 페이지 표 기준, 확인됨).

## 4. 추가로 따라 할 가치가 있을 기능 (근거 있는 것 우선)

- 논리/물리 모드 전환 (도움말 확인).
- 표준 명·물리명 이중 관리 + 도메인 재사용 (확인 부분).
- 자동 선 정렬(Shortest-path 기반 관계선 자동 배치), 테이블 배치 최적화 — 홈페이지 Features의 "Automated relationship lines" (확인). 단, 2026년 현재 기능인지 확인 필요.
- 실행 취소/재실행 시 시각 피드백, 삭제 시 연쇄 영향(FK 처리) 안내 — 도움말 「protect the user from unexpected mistakes」(확인).
- 모델 검토(Live validation, 논리·물리 오류 검사·자동 수정) — 홈페이지 확인.
- 파일 버전 비교·선택 병합 — 릴리스 1.0.34 확인.
- 리버스 엔지니어링의 객체 종류 선택(스키마·트리거·도메인 등) — 확인.

## 5. 비교 참고: DA# (엔코아, 데이터웨어 디에이샵)

- 2024-10-31 통합 패키지 출시 보도: DQ 에디션(모델 기반 품질진단), 컨텐츠 빌더(표준 데이터 패키지·자동 표준 분석기), AI 파워드팩(생성형 AI 자동화). (근거: https://byline.network/2024/10/241031_001/)
- 보도 기준 표준화 기능: LLM 기반 데이터 표준화, 모델 현행화, 비즈니스 분류 자동화, 표준 추출 자동화. 
- 표준 단어 사전 구조, 도메인(타입·길이) 정의 방식, 단어 조합 속성명 생성 — 확인 안 됨(검색 결과 없음). 공식 사이트 또는 제품 브로셔 확인 필요.

## 6. 확인하지 못한 항목 (추측 금지 목록)

- 식별/비식별 관계 자동 처리 방식 전부.
- 키보드 전용 그리드 입력 방식.
- 단어사전 → 물리명 자동 생성, 도메인 → 타입·길이 자동 결정.
- 같은 표의 다중 다이어그램 배치 방식.
- 노트 기능 세부, 이미지·엑셀 정의서 출력 형식.
- 잠금(lock) 방식.
- 가격: 라이선스 영구/구독, 상업 사용 허용 여부. 
- 도움말 목차 전체 (toc.xml 미제공, 개별 페이지는 조회됨).

## 7. 핵심 URL

- 공식 한국어: https://exerd.com/
- 공식 영문(리다이렉트 경로): https://exerd.com/en/
- 가격: https://exerd.com/purchase.do
- 라이선스: https://exerd.com/license.do
- 릴리스 노트: https://exerd.com/release.do
- 도움말 Overview: http://exerd.com:8081/help/topic/com.tomato.exerd.help/html/products/whatsexerd.html
- 도움말 Features: http://exerd.com:8081/help/topic/com.tomato.exerd.help/html/products/features.html
- 2020 리버스 엔지니어링 글 (CUBRID): https://www.cubrid.org/3827358
- 2012 기사 (etnews): https://www.etnews.com/201209030130
- 2차 정보 (AlternativeTo): https://alternativeto.net/software/exerd/about
- DA# 보도: https://byline.network/2024/10/241031_001/
- 일반 ERD 후기(참고): https://www.elancer.co.kr/blog/detail/961

## 8. 방법 주의

- 검색에서 "exERD 사용법/단어사전/도메인/주제영역/리버스/포워드" 류 한국어 검색은 대부분 무관한 결과만 나옴. 사용자 블로그 후기는 찾지 못함.
- 도움말 페이지는 http://exerd.com:8081 로 평문 HTTP 접근이 됨(HTTPS 승격 시 실패). 목차(toc.xml)는 미제공.
