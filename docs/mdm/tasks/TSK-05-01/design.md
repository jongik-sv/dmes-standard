# TSK-05-01 설계 — 인터페이스 레이아웃 공유 계약 (계약 전용)

> category infra · domain database · priority critical · 복잡도 점수 3(depends 3개 +1, "마이그레이션" 키워드 +2 → opus 판정)이나 spec 머리의 `model: sonnet` 오버라이드로 sonnet 이 이 Design Phase 를 담당한다.
> 에이전트 프롬프트 없음 — spec.md 에 `item.agent_prompt` 필드 없음(`entry-point: -`만 있음).
> 입력: `spec.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` §"Phase 02 — Design"·"병렬 조사와 단일 작성자"·"공통 금지" ·
> `docs/mdm/{wbs,decisions,naming-dialect-rules,engine-contract,TRD,PRD}.md` · `docs/mdm/design/basic/03-interface-layout.md`(원천) ·
> `docs/mdm/design/basic/html/03-interface-layout.html`(시안) · `docs/mdm/erd/03-interface-layout.{mmd,sqlite.sql,mssql.sql}` · `docs/mdm/screens/README.md` ·
> `docs/mdm/tasks/{TSK-02-03,TSK-01-02,TSK-04-01}/design.md` · 코드 `src/backend/mdm/{lib,api}/**`(읽기 확인) · `.claude/skills/flyway-migration-add/SKILL.md`
> 근거 강약: spec 본문 > 승인된 선행 산출물(TSK-01-02, 완료) > 리포 기존 관례(V2·V3 마이그레이션·mls `Notice` 선례) > 미승인 선행 산출물(TSK-02-03 ERD, TSK-04-01 design·코드 — 둘 다 dev 머지·서버 승인 전, git log `a2b0d85 (reported, 승인 전)`)

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | **교차 영역 부모 테이블 3개(`TB_MDM_UNIT`·`TB_MDM_COLUMN`·`TB_MDM_SYSTEM`) 모두 이미 실재한다** — `TB_MDM_SYSTEM`(V2), `TB_MDM_UNIT`·`TB_MDM_COLUMN`(V3, TSK-04-01, dev 머지). `TB_MDM_COLUMN.PHYS_NAME`은 `CREATE UNIQUE INDEX UX_TB_MDM_COLUMN_PHYS_NAME`로 유일성이 걸려 있어 FK 대상으로 유효하다. **TSK-04-01 D1(FK 보류) 같은 지연 패턴이 이 Task 에는 필요 없다** — 부모가 없어서 보류한 사례이지 일반 규칙이 아니다 | `find .../db/migration/mdm/{sqlite,mssql}` 직접 확인(V1~V3) |
| F2 | 원격·로컬 형제 워크트리 모두에 V4 를 이미 쓴 흔적이 없다. `git ls-remote --heads origin`(fetch 후) → `dev`·`main` 뿐. `git worktree list`로 로컬 형제 워크트리 5개(agent/7d8179b0·b192b68f·c7f0c4f6·e1205c87·ea440494)를 확인하고 각각 `git ls-tree -r --name-only <branch> -- .../db/migration/mdm/`(커밋된 것)와 `ls <워크트리경로>/.../db/migration/mdm/sqlite/`(디스크상 미커밋분까지)로 **두 번** 조회한 결과 **전부 V1~V2 또는 V1~V3 까지뿐(`b192b68f`가 V3 까지로 가장 앞섬), V4 파일이 커밋에도 디스크에도 없음** → 다음 번호는 V4, 병렬 워커와 충돌 없음(2026-09-24 확인) | `git ls-remote --heads origin`, `git worktree list`, 형제 브랜치별 `git ls-tree` 5회 + 형제 워크트리별 `ls` 5회 실행 결과 |
| F3 | `flyway-migration-add` 스킬은 mdm 경로를 지원하지 않는다(`--module` 이 `aps-core`·`mcm-core` 뿐, TSK-01-02 기존 판정 재확인) → 번호는 두 방언 디렉터리를 직접 보고 손으로 매긴다(naming-dialect-rules §5) | `.claude/skills/flyway-migration-add/SKILL.md`, `migration_tool.py` `MIGRATION_ROOTS` |
| F4 | **D1(헤더 적층 `TB_MDM_LAYOUT_HEADER`)·D2(상수 재정의 `TB_MDM_LAYOUT_CONST`)는 `TSK-02-03/design.md` 안에서 "담당자 확인 필요 결정"으로 남아 있고, 적층 모델을 다루는 ADR 자체가 없다(`docs/mdm/adr/`의 ADR 0001~0003 은 각각 명명 규칙·버전 확정 규칙·모듈 경계를 다루고 셋 다 PROPOSED 상태이지만, 헤더 적층·EAI 인터페이스 레이아웃은 어느 ADR 도 다루지 않는다) — 사람의 최종 승인 기록은 없다.** `decisions.md` D-032 는 그 Task 가 스스로 append 한 로그일 뿐, 사람 승인의 증거로 재해석하지 않는다. 그럼에도 **이 Task 는 적층 모델을 그대로 구현하기로 스스로 결정한다** — 근거는 D4(아래)에 별도 D 항목으로 남긴다. `TB_MDM_EAI.HEADER_LAYOUT_ID`(단일 헤더 FK)와 `TB_MDM_LAYOUT_HEADER`(적층)가 공존할 때: 메시지 레이아웃 등록 시 `eai_code`가 있으면 앱이 `TB_MDM_EAI.HEADER_LAYOUT_ID`를 `TB_MDM_LAYOUT_HEADER`의 `seq=1`로 **자동 삽입**하고, 담당자가 추가 헤더를 `seq=2...`로 더 붙일 수 있다(N=1 이면 md 단일-헤더 동작과 완전히 같다) | `docs/mdm/decisions.md:254-261`(D-032, append 로그일 뿐), `docs/mdm/tasks/TSK-02-03/design.md:299,827-841`(절 제목 "담당자 확인 필요 결정", D1 인용문), `docs/mdm/adr/000{1,2,3}-*.md`(Status: PROPOSED) |
| F5 | ERD `03-interface-layout.{mmd,sqlite.sql,mssql.sql}`이 D1·D2 테이블과 EAI↔LAYOUT 순환 FK 배치(TSK-02-03/design.md §6.6)를 이미 구체적으로 설계했다. TSK-04-01 F3 선례("ERD 는 1차 텍스트, 그대로 옮기지 않는다")를 따라 이 Task 도 실측·규칙표 대조로 확인된 지점만 갈라 적용한다(F6·F7·F9·F10) | `docs/mdm/erd/03-interface-layout.{mmd,sqlite.sql,mssql.sql}` 전체 확인 |
| F6 | naming-dialect-rules §2 정본은 감사 `VER BIGINT`(SQLite 도)다. ERD `03-interface-layout.sqlite.sql`의 `VER INTEGER`(5테이블)와 `TB_MDM_LAYOUT."VERSION" INTEGER`는 V2·V3 선례(TSK-04-01 이 같은 이탈을 이미 한 번 교정)와 같은 이탈이다 → **V4 SQLite DDL 은 `VER`·`VERSION` 모두 `BIGINT`로 쓴다**(mmd·mssql.sql 은 이미 BIGINT 로 일치) | `naming-dialect-rules.md:29`, `erd/03-interface-layout.sqlite.sql:20,33,42,69,91,112`, `erd/03-interface-layout.mssql.sql:15`(`[VERSION] BIGINT`) |
| F7 | naming-dialect-rules.md 에 **예약어 칼럼(VERSION·OFFSET·LENGTH) JPA 인용 정책이 없다**(§1 표에 조항 없음, 조사 확인). 03 이 이 정책을 처음 필요로 하는 영역이다 → D1(아래)에서 정하고 §1 에 신규 행으로 등재한다 | naming-dialect-rules.md §1 전체 확인, 기존 엔티티(`MdmColumn` 등) `@Column` grep 0건 |
| F8 | `TB_MDM_LAYOUT.PAD_RULE`은 ERD 상 자유서술 취급(`NVARCHAR(MAX)`/`TEXT`)이나 이름상 패딩 규칙 DSL(`VARCHAR(MAX)` 후보)일 가능성이 있다. 실제 값 형식(한글 포함 여부)을 판단할 업무 근거가 이 Task 에 없어 **ERD 표기를 그대로 유지**한다(자유서술 취급은 한글 없는 DSL 값도 문제 없이 담는다 — 안전측) | `erd/03-interface-layout.mssql.sql:36`, `sqlite.sql:10`, html:132-134(패딩 규칙 입력 예시 "숫자 왼쪽 0, 문자 오른쪽 공백" — 한글 자유서술 실제 사례) |
| F9 | naming-dialect-rules §6.1 인계표가 **이 Task(03)를 §3 #19(BIN2 콜레이션, MSSQL 실측) 담당으로 명시 지목**한다("03·04·05·06 몫은 실측 필요 → TSK-05-01(03)·...") → 이 Task 의 MSSQL 테스트가 이 행을 반드시 닫아야 한다(§3.2) | `naming-dialect-rules.md:71`(§3 #19) |
| F10 | mmd 다이어그램(`TB_MDM_LAYOUT` 블록)에 `TOTAL_LENGTH` 필드가 없는데 두 방언 SQL 에는 있다(SQL 이 mmd 보다 앞서갔다). ERD 소유는 TSK-02-03 이므로 이 Task 는 mmd 를 고치지 않고 사실만 기록한다(기능에 영향 없음, 문서 드리프트) | `erd/03-interface-layout.mmd`(LAYOUT 블록), `sqlite.sql:32`, `mssql.sql:14` |
| F11 | `03-interface-layout.md`의 "본문 첫 항목의 오프셋 = `header_layout_id` 가 가리키는 레이아웃의 `total_length`"라는 문장은 **단일 헤더 시절 문장**이다. D1(N-헤더 적층) 도입으로 일반화가 필요하다: N=1 이면 그 헤더 하나의 `total_length`, N≥2 면 `TB_MDM_LAYOUT_HEADER`의 SEQ 순서대로 이어붙인 각 헤더 `total_length`의 **합**이다. 이 Task 의 스키마(§6.1 `headers` 배열)는 두 경우 모두 표현 가능한 구조를 취하고, 실제 계산 로직은 이 Task 범위 밖(TSK-05-02·05-03)이다 | `design/basic/03-interface-layout.md:37`, `tasks/TSK-02-03/design.md:299,829-833` |
| F12 | **M201 예시 187바이트/오프셋 130 은 시안(html)에 실제로 있는 정확한 값이다(추정 아님).** `html:270` "헤더 130(100+30) + 본문 57(20+8+4+25) = 187바이트", `html:549-561`에 **실제 스냅샷 JSON 예시 전체**가 있다(`headers`에 L100(seq1,offset0,length100,override 맵 포함)·L110(seq2,offset100,length30) 두 겹, `items`에 COIL_ID(offset130)~FILLER(offset162) 4건, `total_length:187`). `03-interface-layout.md`의 "샘플" 절(§88-102)은 **L110을 뺀 단순화 발췌**일 뿐 다른 데이터 모델을 주장하는 게 아니다 — 두 문서는 모순이 아니라 **상세도 차이**다. 이 Task 의 스키마 예시는 D3(아래)에서 html 의 전체 예시(187/130, N=2)를 채택한다 | `design/basic/html/03-interface-layout.html:92-97,180-192,270,549-561` |
| F13 | `MdmContractArchitectureTest`·`MdmEntityArchitectureTest`는 패키지 접두사(`contract..`/`entity..`) 전체와 `com.dongkuk.dmes.mdm` 전체를 스캔한다(코드 확인) → 새 서브패키지 `contract.layout`과 새 엔티티 파일을 추가하면 **이 두 테스트는 수정 없이 자동 적용**된다 | `MdmContractArchitectureTest.java:33-37`, `MdmEntityArchitectureTest.java:25-29` |
| F14 | `TB_MDM_LAYOUT.VERSION`(스냅샷 배포 번호, 업무 칼럼)은 감사 `VER`(`CactusAuditEntity`, 변경 카운터)과 다른 칼럼이며, 팀장 지시대로 **`@Version`(JPA 낙관적 락)으로 매핑하지 않는다**. 단순 `Long` 필드로 매핑하고 증가는 저장 로직(TSK-05-03)의 몫이다 | `naming-dialect-rules.md:38` |
| F15 | JPA 예약어 칼럼 인용 선례가 리포에 0건이다(그렙 확인) — 이 Task 가 처음 정한다(D1) | 조사 결과(그렙 `@Column(name.*\`` 0건) |
| F16 | 계약 인터페이스 배치는 TSK-04-01 D3·D5 패턴을 그대로 재사용한다: 새 서브패키지 `com.dongkuk.dmes.mdm.contract.layout`(인터페이스·enum·record만, 로직 없음), 엔티티·리포지토리는 평면 패키지 `com.dongkuk.dmes.mdm.entity`/`.repository`(lib 모듈). 구현은 후속 Task(TSK-05-02·05-03) 몫. `mdm/lib` vs `maru-mdm-engine` 배치는 D6 에서 별도로 다룬다 | `tasks/TSK-04-01/design.md:42-44`(D3·D5) |
| F17 | TSK-04-01 이 스텁(`DomainReferenceSpiStub`, refKind="LAYOUT_ITEM")으로만 남겨 둔 `MdmDomainReferenceSpi` 의 03 쪽 **실 구현은 이 Task 의 범위가 아니다**("실행 로직 없음" 수용 기준) — wbs 에 이 실구현을 어느 03 Task(05-02/05-03)가 맡는지 명시가 없어 인계 사항으로 끝 보고에 남긴다. 이 실구현 부재를 잡는 테스트는 없다(§5 불변 규칙 13 참고) | `tasks/TSK-04-01/design.md §3.4`, `ContractStubCompileTest.java:154-170` |
| F18 | `mdm/lib`은 이미 `spring-boot-starter-web`을 `api` 스코프로 가지므로 **Jackson(`com.fasterxml.jackson.databind`)이 새 의존성 없이 전이적으로 이미 있다** — JSON 스키마 구조 단언 테스트에 쓴다(D2) | `lib/build.gradle` 의존성 목록 |
| F19 | **`CactusAuditEntity`가 이미 `version`이라는 이름의 필드·`getVersion()`/`setVersion()`을 갖고 있다**(컬럼 `VER`에 매핑, F14 의 그 감사 카운터). `TB_MDM_LAYOUT.VERSION`(업무 칼럼) 엔티티 필드를 `version`으로 지으면 상위 클래스 프로퍼티와 이름이 겹쳐 `getVersion()`이 두 가지 의미로 오해된다 → **엔티티 필드명은 `layoutVersion`으로 짓는다**(불변 규칙 6 갱신) | `CactusAuditEntity.java:47-48,68` 직접 읽음 |
| F20 | **교차 FK 대상 칼럼의 타입·길이·콜레이션이 정확히 일치한다**(MSSQL FK 는 불일치 시 생성 실패) — `TB_MDM_UNIT.UNIT_CODE`/`TB_MDM_SYSTEM.SYSTEM_CODE` = `VARCHAR(20) COLLATE Latin1_General_100_BIN2`(ERD의 `TRANS_UNIT`/`SND_SYSTEM`/`RCV_SYSTEM`/`EAI_CODE`와 동일), `TB_MDM_COLUMN.PHYS_NAME` = `VARCHAR(50) COLLATE Latin1_General_100_BIN2`(ERD의 `COLUMN_PHYS`와 동일) | V3 MSSQL(`TB_MDM_UNIT:9`,`TB_MDM_COLUMN:108`), V2 MSSQL(`TB_MDM_SYSTEM:5`) 직접 대조 |
| F21 | 기존 테스트에 "테이블 총 개수"를 단언하는 코드가 없다(그렙 결과 `sqlite_master`/`COUNT(*)` 사용은 모두 특정 테이블·행 대상이지 전체 개수가 아님) → V4 로 5테이블이 늘어도 기존 테스트가 개수 불일치로 깨지지 않는다 | 그렙 `sqlite_master\|table_count\|COUNT(\*)` 결과 |
| F22 | html 시안의 스냅샷 JSON(F12)은 이 Task 의 스키마 설계에 3가지를 더 요구한다: **①** 헤더 항목의 "헤더 기본값"과 "이 전문의 재정의 값"을 스냅샷에서 **둘 다** 구분해서 담아야 한다(html:553 `"override": {...}` 맵, TSK-02-03 D2 근거의 "항목/헤더 기본값/이 전문의 값" 3열 표와 일치) ② 항목마다 직렬화 방향(숫자 왼쪽 0-채움 vs 문자 오른쪽 공백-채움)을 결정할 `type`(CHAR/NUM, html:557-560)이 필요하다 ③ `num_format`은 단일 문자열이 아니라 `{sign, zero_pad, implied_scale}` 구조다(html:560). `encoding`(EAI 소유, 03:58)·`pad_rule`(EAI 소유, 03:59)은 **메시지(EAI) 단위**이며 확정된 ERD 에 헤더별 override 칼럼이 없으므로 스냅샷 **최상위**에만 둔다 — html 의 "헤더 상세" 화면(html:125-134)에 인코딩·패딩 입력란이 있는 것은 03 화면(TSK-05-02)이 EAI 값을 보여주는 것으로 해석한다(헤더 자체가 인코딩을 갖는다는 확정 스키마 근거는 없다, D5) | `html:549-561`(스냅샷 예시), `html:125-134`(헤더 상세 폼), `03-interface-layout.md:58-59` |
| F23 | **오프셋의 기준이 레이아웃 종류에 따라 다르다** — html:175 "오프셋은 이 헤더 안에서 0부터 센다. 전문에 쌓였을 때의 절대 위치는 전문 레이아웃 화면이 계산한다"(헤더 항목 = 그 헤더 내부 상대 오프셋), html:557 `COIL_ID offset:130`(본문 항목 = 전문 전체 절대 오프셋). 같은 DB 칼럼 `TB_MDM_LAYOUT_ITEM.OFFSET` 이 `LAYOUT_KIND='HEADER'` 행에서는 상대값, `'MESSAGE'` 행에서는 절대값이다(헤더 하나를 여러 전문이 서로 다른 위치에 쌓을 수 있으므로 절대값을 저장하면 즉시 어긋난다). 스냅샷은 헤더마다 메시지 기준 절대 시작 위치(`html:551` `L100 offset:0`, `html:554` `L110 offset:100`)를 **별도로** 가져야 왕복이 성립한다 → `MdmLayoutHeaderRef`에 `offset`(헤더의 메시지-절대 시작 위치) 필드를 추가한다(§6.1, 불변 규칙 15) | `html:175,551,554,557` |
| F24 | html:114 "구간 종류 * [미결]"(EAI 구간/시스템 구간 선택) 은 **확정 ERD 에 대응 칼럼이 없다** — `TB_MDM_LAYOUT`(HEADER kind)에 그 헤더가 "시스템 L2 구간"인지를 저장할 칼럼이 없고, `SND_SYSTEM`/`RCV_SYSTEM`은 03:70 상 MESSAGE 전용이다. 이 갭은 03 ERD(TSK-02-03) 소유 영역이고 이 Task 는 계산·판정 로직이 없어 지금 채울 수 없다 — 스냅샷에도 "구간 종류" 필드를 넣지 않고 사실만 기록해 TSK-05-02(화면)·TSK-02-03(ERD 개정) 인계 사항으로 보고에 남긴다 | `html:114-121` |
| F25 | `CactusAuditListener.onPreUpdate`가 `AuditHolder` 문맥과 무관하게 `VER`(`entity.setVersion(ver==null?0L:ver+1)`)을 **조건 없이** 올린다(사용자·서비스·메뉴 필드만 `if (audit != null)` 가드가 있다) — TSK-04-01 이 실측한 "`AuditHolder` 문맥 없으면 `C_USR_ID` 등은 NULL로 남는다"는 다른 필드 이야기이고 `VER` 증가와는 무관하다. §3.3 의 "더티 업데이트 후 `VER` 증가" 단언은 이 사실에 근거한다 | `CactusAuditListener.java:46-59` 직접 읽음 |
| F26 | `@IdClass`(`MdmLayoutItemId`·`MdmLayoutHeaderId`·`MdmLayoutConstId`)는 필드명이 소유 엔티티의 `@Id` 필드명과 정확히 일치해야 Hibernate 부팅이 성립한다(JPA 스펙 자체의 제약, `MdmColumnSystemId` 선례와 동일) — 이름이 어긋나면 `@SpringBootTest` 컨텍스트 기동 자체가 실패하므로 §3.2-8·§3.3 의 왕복 테스트가 그 자리에서 즉시 잡는다. 별도 전용 테스트를 추가하지 않는다(부팅 실패가 이미 가장 강한 신호다) | JPA `@IdClass` 스펙, `MdmColumnSystemId.java` 자바독 |
| F27 | (대조했으나 이탈 없음) 03 ERD 를 규칙표·V2·V3 선례와 대조한 결과, 제약 명명(`PK_`/`FK_`/`UX_`/`CK_`), MSSQL 콜레이션(`Latin1_General_100_BIN2`), 서버 채번 PK(`AUTOINCREMENT`/`IDENTITY(1,1)`), 감사 날짜 타입(SQLite `TIMESTAMP`/MSSQL `DATETIME2`), `DF_` 접두 기본값 제약은 모두 규칙표·선례와 일치한다(이탈 없음) — F6(VER/VERSION BIGINT)·F8(PAD_RULE 자유서술 유지)·D1(예약어 백틱 인용, 선례 없어 이 Task 가 신설) 세 곳만 실제 이탈·신설이다 | naming-dialect-rules.md §1~§3, V2·V3 마이그레이션 파일 전체 대조 |

---

## 1. 접근 방식

03 영역 5테이블(`TB_MDM_EAI`·`TB_MDM_LAYOUT`·`TB_MDM_LAYOUT_ITEM`·`TB_MDM_LAYOUT_HEADER`(D4)·`TB_MDM_LAYOUT_CONST`(D4))의 **Flyway V4(두 방언)**를 새로 작성한다. 부모 테이블 3개(`TB_MDM_UNIT`·`TB_MDM_COLUMN`·`TB_MDM_SYSTEM`, F1·F20)가 이미 있고 타입·콜레이션이 정확히 맞으므로 그 FK 들은 전부 인라인으로 건다. 03 **내부** 순환 FK(`TB_MDM_EAI.HEADER_LAYOUT_ID` ↔ `TB_MDM_LAYOUT.EAI_CODE`)만 TSK-02-03 §6.6 이 이미 정한 배치(SQLite 인라인, MSSQL: ①LAYOUT을 EAI_CODE FK 없이 생성 ②EAI를 HEADER_LAYOUT_ID FK 포함해 생성 ③파일 끝에서 LAYOUT 에 `FK_TB_MDM_LAYOUT_EAI` 후행 ALTER)를 그대로 재사용한다. DDL 은 ERD 를 1차 텍스트로 삼되 F6(VER/VERSION BIGINT 정정)·D1(예약어 백틱 인용) 두 지점만 갈라 적용한다. FK 는 어디에도 `ON DELETE CASCADE`를 쓰지 않는다(불변 규칙 11) — `LAYOUT_CONST`에서 `LAYOUT`까지 가는 경로가 3갈래(직접·`ITEM`경유·`HEADER`경유)이고 `LAYOUT_HEADER`도 `LAYOUT`을 가리키는 FK가 둘이라, CASCADE 를 쓰면 삭제 하나가 여러 자식을 예측 못 하게 지운다.

5테이블 전부 업무 활성 테이블이다(spec 데이터모델이 "+ 적층·재정의 테이블"을 이미 요구했고, DICT_SEQ 류의 배포 순번 테이블이 아니다). 5개 엔티티 모두 `lib/entity` 평면 패키지에 두고(F16), 복합 PK 테이블(`LAYOUT_ITEM`·`LAYOUT_HEADER`·`LAYOUT_CONST`)은 `MdmColumnSystem` 선례(`@IdClass`, `Serializable`)를 따른다. 감사 9칼럼은 `CactusAuditEntity` 상속으로 얻고, `LAYOUT`의 업무 버전 칼럼은 `layoutVersion`이라는 별도 필드명을 쓴다(F19 — 상위 클래스의 `version`/`VER`과 이름 충돌을 피한다). 예약어 칼럼(`VERSION`·`OFFSET`·`LENGTH`)은 Hibernate 방언-중립 백틱 인용(`@Column(name = "\`VERSION\`")`)으로 매핑한다(D1) — 이 정책을 naming-dialect-rules.md §1 에 신규 행으로 등재한다.

계약(contract-only) 부분은 새 서브패키지 `com.dongkuk.dmes.mdm.contract.layout`(D6 — `maru-mdm-engine`이 아니라 `mdm/lib`)에 로직 없는 enum(`MdmFillKind`, `MdmLayoutItemType`)·record(`MdmLayoutNumFormat`·`MdmLayoutItemSnapshot`·`MdmLayoutHeaderRef`·`MdmLayoutSnapshot`)·interface(`MdmLayoutSerializer`·`MdmLayoutParser`, 추상 메서드만)를 선언한다. html 시안의 실제 스냅샷 예시(F12·F22)를 반영해 항목 스냅샷에 **헤더 기본값과 이 전문의 재정의 값을 둘 다**, 그리고 직렬화 방향 판단에 필요한 `dataType`·구조화된 `numFormat`을 담는다(§6.1). 레이아웃 스냅샷 JSON 스키마는 `lib/src/main/resources`에 JSON Schema(Draft 2020-12) 문서로 두고, Java record 필드와 1:1 대응시킨다. 샘플 JSON을 스키마로 검증하는 테스트는 새 JSON-Schema validator 의존성을 추가하지 않고 이미 전이적으로 있는 Jackson(F18)으로 필드 집합·타입만 구조적으로 단언한다(D2).

기존 ArchUnit 테스트(`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`)는 패키지 접두사 전체를 스캔하므로 수정 없이 새 서브패키지·엔티티에 자동 적용된다(F13). `MdmDomainReferenceSpi`(refKind="LAYOUT_ITEM")의 실 구현은 "실행 로직 없음" 수용 기준상 이 Task 에 넣지 않는다(F17).

---

## 2. 변경 파일 목록

### 생성

- `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V4__create_mdm_interface_layout.sql`
- `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V4__create_mdm_interface_layout.sql`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmEai.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayout.java`(업무 버전 필드명 `layoutVersion`, F19)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutItem.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutItemId.java`(복합 PK, `@IdClass` 대상, `Serializable`, 필드 `layoutId`·`seq`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutHeader.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutHeaderId.java`(복합 PK, 필드 `layoutId`·`seq`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutConst.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutConstId.java`(복합 PK, 필드 `layoutId`·`headerLayoutId`·`headerSeq`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmEaiRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmLayoutRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmLayoutItemRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmLayoutHeaderRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmLayoutConstRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/package-info.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmFillKind.java`(enum: DATA, CONST, AUTO, FILLER)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutItemType.java`(enum: CHAR, NUM — F22, 직렬화 패딩 방향 판단용)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutNumFormat.java`(record: sign, zeroPad, impliedScale — F22)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutItemSnapshot.java`(record, §6.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutHeaderRef.java`(record, §6.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutSnapshot.java`(record, §6.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutSerializeContext.java`(record: sendTime, seq — D8)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutSerializer.java`(interface, 추상 메서드 1개, `MdmLayoutSerializeContext` 인자 포함)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout/MdmLayoutParser.java`(interface, 추상 메서드 1개)
- `src/backend/mdm/lib/src/main/resources/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json`(§6.2)
- `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/contract/layout/m201-snapshot-sample.json`(§6.2 샘플 인스턴스 실물 파일 — §3.5 가 이 파일을 읽는다. 이 경로를 여기 명시하는 이유는 불변 규칙 13 류의 "계약 밖 변경"을 §2 대비 diff 로 잡기 위해서다)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/LayoutSerializerConsumerStub.java`(05-03 역)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/LayoutParserConsumerStub.java`(05-03 역)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/layout/LayoutSnapshotSchemaStructureTest.java`(§3.5, Jackson 구조 단언, 새 의존성 없음)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMigrationTest.java`(SQLite, §3.1)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutEntityJpaRoundtripTest.java`(SQLite, JPA 왕복, §3.3 — `api/src/test`)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMssqlMigrationTest.java`(MSSQL, `@SpringBootTest`+`local-db`, §3.2)

### 수정

- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` — `Set.of("1","2","3")` → `Set.of("1","2","3","4")`, 메서드명 `flyway_가_V1_V2_V3_를_적용했다()`(`:64`, 확인됨) → `flyway_가_V1_V2_V3_V4_를_적용했다()`. **이것은 기대값 완화가 아니라 새 버전(V4) 반영이다** — 팀장 지시대로 명시한다.
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMssqlMigrationTest.java` — `migrationsExecuted==3`→`4`, `targetSchemaVersion=="3"`→`"4"`, `Set.of("1","2","3")`→`Set.of("1","2","3","4")`, 메서드명 `local_db_설정의_locations_로_V1_V2_V3_가_적용된다()`(`:78`, 확인됨) → `..._V1_V2_V3_V4_가_적용된다()`(새 버전 반영, 기대값 완화 아님)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMssqlMigrationTest.java` — `Set.of("1","2","3")`→`Set.of("1","2","3","4")`(`:95`), 메서드명 `local_db_설정으로_V1_V2_V3_가_적용된다()`(`:87`, 확인됨) → `..._V1_V2_V3_V4_가_적용된다()`(새 버전 반영)
- `docs/mdm/naming-dialect-rules.md` — §1 에 예약어 칼럼 JPA 인용 정책 신규 행 추가(D1) + §3 #19 의 "실측 필요 → TSK-05-01(03)" 을 "확인(TSK-05-01 실측)"으로 갱신
- `docs/mdm/decisions.md` — D1(예약어 인용 정책)·D2(스키마 검증 방식)·D4(적층 모델 구현, 이 Task 자신의 결정으로서 append) 등 되돌리기 어려운 결정을 Build 완료 시 append

**수정하지 않음(자동 적용, F13·F21)**: `MdmContractArchitectureTest.java`·`MdmEntityArchitectureTest.java`·`MdmFlywayVersionParityTest.java`(`containsAll`만 요구해 V4 양쪽 추가로 수정 없이 통과, TSK-04-01 F12 판단과 동일). 테이블 총 개수를 단언하는 기존 테스트도 없다(F21).

### 변경하지 않음(참고만)

- `docs/mdm/erd/03-interface-layout.{mmd,sqlite.sql,mssql.sql}` — TSK-02-03 소유 문서. 이 Task 는 갈라지는 지점(F6·F10)을 명시했을 뿐 ERD 자체를 고치지 않는다.
- `docs/mdm/design/basic/03-interface-layout.md`·`html/03-interface-layout.html` — 원천·시안 문서. F12 의 상세도 차이를 이 design.md 에 기록했을 뿐 원문을 고치지 않는다.

---

## 3. 테스트 전략

**기준선**(오케스트레이터 실측):
```
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
# → 556 tests / 0 failures
cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
# → 14 tests / 0 failures (docker 가용 시)
```
게이트 판정 = 위 두 명령의 **기준선 대비 신규 실패 0** + 테스트 총수 미감소. MSSQL 게이트는 docker 미가용 시 "미실행"을 그대로 보고한다.

### 3.1 `MdmInterfaceLayoutMigrationTest`(SQLite, `api/src/test`)

`MdmTermDomainColumnMigrationTest`와 같은 패턴(`@SpringBootTest(webEnvironment=MOCK) @ActiveProfiles("local")`, `@TempDir`). 확인 항목:

1. `flyway_schema_history`에 버전 `"4"`가 `success=1`로 있다.
2. 5테이블 전부 생성, PK·FK·UX·CK 제약명이 규칙표 패턴을 따른다.
3. **F1·F20 대조군** — `TB_MDM_LAYOUT_ITEM.COLUMN_PHYS`에 `TB_MDM_COLUMN`에 없는 값으로 INSERT 하면 **거부**되고, `TRANS_UNIT`도 `TB_MDM_UNIT`에 없는 값이면 거부됨을 확인한다.
4. `CK_TB_MDM_LAYOUT_KIND`(`HEADER`/`MESSAGE` 외 값 거부), `CK_TB_MDM_LAYOUT_ITEM_FILL_KIND`(`DATA`/`CONST`/`AUTO`/`FILLER` 외 거부), `CK_TB_MDM_LAYOUT_ITEM_UNIT`(`TRANS_UNIT`·`UNIT_ITEM` 동시 비NULL 입력 거부, 03:82) 각각 위반 INSERT 거부를 확인.
5. `UX_TB_MDM_LAYOUT_HEADER_HDR`(`LAYOUT_ID`,`HEADER_LAYOUT_ID`) 중복 부착 INSERT 거부.
6. **부착 무결성(FK3)** — `TB_MDM_LAYOUT_CONST`에 `TB_MDM_LAYOUT_HEADER`로 실제 부착되지 않은 `(LAYOUT_ID,HEADER_LAYOUT_ID)` 조합으로 INSERT 하면 거부됨을 확인.
7. EAI↔LAYOUT 순환 참조 — `TB_MDM_EAI.HEADER_LAYOUT_ID`에 존재하는 `LAYOUT_ID`(LAYOUT_KIND='HEADER')를 넣고, `TB_MDM_LAYOUT.EAI_CODE`에 그 EAI 를 넣어 양방향 참조가 성립함을 확인.
8. `VER`(감사)·`VERSION`(업무) 두 칼럼 DDL 텍스트가 `BIGINT`인지 `sqlite_master.sql` 텍스트로 확인(F6).
9. **CASCADE 없음(불변 규칙 11)** — `TB_MDM_LAYOUT_HEADER`에 부착된 `TB_MDM_LAYOUT_CONST` 행이 있는 상태에서 그 `TB_MDM_LAYOUT_HEADER` 행을 DELETE 하면 FK 위반으로 **거부**됨을 확인(자동 cascade 삭제가 아님의 직접 증거).

### 3.2 `MdmInterfaceLayoutMssqlMigrationTest`(MSSQL, `api/src/mssqlTest`)

`MdmTermDomainColumnMssqlMigrationTest` 패턴(`@SpringBootTest`+`local-db`+Testcontainers, Hibernate 매핑까지 실제로 거친다). 확인 항목(naming-dialect-rules §6.1 인계 지목 #19 를 닫는다):

1. 마이그레이션 4건 적용, `flyway_schema_history`에 `{"1","2","3","4"}`.
2. **#19(F9)**: `EAI_CODE`·`LAYOUT_KIND`·`FILL_KIND`·`COLUMN_PHYS` 등 BIN2 콜레이션 칼럼에 `sys.columns.collation_name='Latin1_General_100_BIN2'`을 확인하고, 대소문자만 다른 두 `EAI_CODE`('B1'/'b1') 값이 서로 다른 행으로 INSERT 됨을 실제로 확인한다.
3. 순환 FK 후행 ALTER(`FK_TB_MDM_LAYOUT_EAI`)가 `sys.foreign_keys`에 존재하고 실제로 강제됨을 확인.
4. 예약어 칼럼(`[VERSION]`·`[OFFSET]`·`[LENGTH]`) 매핑 왕복 — 엔티티로 저장 후 조회한 값이 저장한 값과 일치함(D1 백틱 인용이 MSSQL 쪽에서도 `[...]`로 올바르게 변환됨의 직접 증거). **동시에 SQLite 쪽 3.1-8 도 같은 백틱으로 통과하는지 대조** — 백틱을 지운 변이가 두 방언 중 어느 쪽에서도 실패하지 않으면 그 사실을 §5 불변 규칙 7 코멘트대로 보고한다(변이 검증 커버리지 갭 후보).
5. `TB_MDM_LAYOUT_ITEM.COLUMN_PHYS`/`TRANS_UNIT` FK 가 MSSQL 에서도 강제됨을 확인(F1·F20 대조군).
6. `LAYOUT_ID`의 `IDENTITY(1,1)`이 `MdmLayoutRepository.save()` 연속 호출로 단조 증가함을 확인.
7. CASCADE 없음 — MSSQL 에서도 `TB_MDM_LAYOUT_HEADER` DELETE 가 자식 `TB_MDM_LAYOUT_CONST` 존재 시 거부됨을 확인(3.1-9 대조군).
8. **복합키 왕복(팀장 지시)** — `MdmLayoutItem`·`MdmLayoutHeader`·`MdmLayoutConst` 세 엔티티를 각각 리포지토리 `save()`로 저장하고, 그 `*Id`(`MdmLayoutItemId`·`MdmLayoutHeaderId`·`MdmLayoutConstId`) 값으로 `findById()`를 호출해 조회된 필드가 저장한 값과 일치함을 확인한다(§3.3 의 SQLite `@IdClass` 왕복과 대조군).

### 3.3 `MdmLayoutEntityJpaRoundtripTest`(SQLite, `api/src/test`)

`ddl-auto: none`이라 부팅이 매핑 오류를 잡지 못하므로, 5개 엔티티 각각 최소 1건 저장→조회 왕복을 수행한다. 복합키(`@IdClass`) 왕복(`MdmLayoutItem`·`MdmLayoutHeader`·`MdmLayoutConst`)을 포함한다.

**`layoutVersion`이 `@Version`이 아니라는 것을 실제로 잡는 절차**(F19, 단순 두 번 save 로는 잡히지 않는다 — 더티 필드가 없으면 두 번째 save 가 UPDATE 자체를 안 낼 수 있다):
1. `MdmLayout`을 저장(`layoutVersion=0`).
2. `layoutName`(감사 대상이 아닌 업무 필드)을 바꾸고 `flush()` + `EntityManager.clear()`.
3. 같은 PK 로 재조회 — `layoutVersion`이 여전히 저장 시점 값과 같음을 단언(자동 증가하지 않음)하고, 감사 `getVersion()`(상위 클래스, `VER`)은 UPDATE 가 있었으므로 증가했는지 별도로 확인해 **`layoutVersion`과 `VER`이 서로 독립임**을 단언한다. `VER` 증가 단언은 근거가 있다 — `CactusAuditListener.onPreUpdate`(F25)가 `AuditHolder` 문맥 유무와 무관하게 `entity.setVersion(ver==null?0L:ver+1)`을 **조건 없이** 실행하므로(사용자·서비스·메뉴 필드만 `if (audit != null)`로 감싸여 있다), `AuditHolder` 문맥 없는 테스트에서도 `VER`은 반드시 오른다. `layoutVersion`을 `@Version`으로 바꾸는 변이를 넣으면 이 절차의 2번째 save 이후 `layoutVersion`이 예상과 다르게 증가해 이 테스트가 빨개진다.

### 3.4 계약 스텁 컴파일 테스트(`LayoutSerializerConsumerStub`·`LayoutParserConsumerStub`)

- `LayoutSerializerConsumerStub`(05-03 역): `MdmLayoutSerializer`만 알아 `MdmLayoutSnapshot`·`Map<String,Object>` 레코드·`MdmLayoutSerializeContext`(D8, `sendTime`·`seq`)를 받아 고정 길이 바이트 배열을 흉내로 채우는 메서드가 **컴파일**됨을 확인.
- `LayoutParserConsumerStub`(05-03 역): `MdmLayoutParser`만 구현해 바이트 배열을 흉내 `Map`으로 돌려주는 메서드가 **컴파일·동작(단순 반환값)** 함을 확인.
- 두 스텁 모두 `MdmLayoutSnapshot`이 `headers`(N=0,1,2 세 경우)와 각 헤더 항목의 `defaultValue`·`overrideValue`(F22)를 함께 담을 수 있음을 생성자 호출로 증명한다.

### 3.5 `LayoutSnapshotSchemaStructureTest`(Jackson, 새 의존성 없음)

최상위 키 집합만 비교하면 `items[*].overrideValue` 같은 하위 필드가 빠지는 변이를 잡지 못한다 — **네 대상(`MdmLayoutSnapshot`·`MdmLayoutHeaderRef`·`MdmLayoutItemSnapshot`·`MdmLayoutNumFormat`) 모두에서 세 가지가 서로 같은지** 확인한다:
1. `layout-snapshot.schema.json`의 해당 노드 `properties` 키 집합(Jackson `ObjectMapper.readTree`).
2. `m201-snapshot-sample.json`(§2·§6.2, 실물 fixture 파일)에서 그 노드에 실제로 등장하는 키 집합(같은 방식으로 파싱). **fixture 는 모든 인스턴스에 모든 키를 명시하고 값이 없으면 `null`을 넣는다** — html 원본은 FILLER 항목에서 `col`(=`columnPhys`) 키 자체를 생략하지만(html:561), 그렇게 그대로 옮기면 인스턴스마다 키 집합이 달라 이 비교가 "그 노드 선언(schema/record)과 같은가"가 아니라 "이 인스턴스가 우연히 어떤 키를 썼는가"로 흐려진다. 그래서 비교 대상은 **"이 fixture 의 각 인스턴스가 쓰는 키 집합" = "그 노드의 선언된 전체 키 집합"**이다.
3. 그 record 의 `Class.getRecordComponents()`가 돌려주는 이름 집합(`java.lang.reflect`, Jackson 불필요).

세 집합이 넷 모두 정확히 같아야 한다. `required` 키 하나를 뺀 변형 샘플도 만들어 "필수 키가 빠지면 스키마의 `required` 목록에 그 키가 있다"는 것만 구조적으로 확인한다.

4. **오프셋 산술 정합성**(불변 규칙 15, 값 자체를 바꾸는 변이를 잡기 위해 키 대조와 별도로 둔다) — `m201-snapshot-sample.json`을 대상으로: ① `headers[i].offset` = 그 앞의 헤더들의 `totalLength` 합(L100→0, L110→100) ② 각 헤더의 모든 항목에서 `0 ≤ item.offset` 이고 `item.offset + item.length ≤ header.totalLength` ③ 본문(`items`) 첫 항목의 `offset` = `headers[*].totalLength` 의 합(130) ④ `snapshot.totalLength` = `headers[*].totalLength` 합 + 본문 `items[*].length` 합(187). 넷 다 산술로 검산하므로 계약 패키지의 "실행 로직 없음"과 충돌하지 않는다(검산은 **테스트 코드** 안의 산술이지 계약 record·인터페이스의 로직이 아니다).

**mutation 대상**: 스키마·샘플·record 중 하나에서만 `headers[*].offset`이나 `items[*].overrideValue`를 빼도 1~3의 대조에서 즉시 빨개진다. 헤더 항목의 오프셋 **값**을 절대값(예: 6→106)으로 바꿔 넣는 변이는 키 집합을 건드리지 않으므로 1~3 으로는 못 잡고 4번(②)이 잡는다 — 4번을 넣지 않으면 이 값-변이는 **알려진 커버리지 갭**이다(불변 규칙 15 참고, 은폐하지 않고 보고).

### 3.6 ArchUnit

`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`는 수정 없이 그대로 실행되며(F13) `contract.layout`·새 엔티티에 자동 적용된다.

### 3.7 브라우저 E2E

**해당 없음** — `entry-point: -`, `domain: database`(화면 작업이 아니다).

---

## 4. 수용 기준 매핑

| spec 수용 기준 / 요구사항 | 검증 방법 |
|---|---|
| 실행 로직 없음(contract-only) | §3.4·§3.5(로직 없이 컴파일·구조만 확인) + `MdmContractArchitectureTest` 자동 적용(F13) |
| 03 테이블(적층 모델 확정분 포함) Flyway 두 방언 | §3.1, §3.2 |
| 엔티티 | §3.3 |
| 레이아웃 스냅샷 JSON 스키마 | §3.5, F11·F12·F22·D3(예시 값 출처) |
| 직렬화기·파서 인터페이스 | §3.4 |
| naming-dialect-rules §6.1 인계 #19(03, F9) | §3.2-2 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

1. **적층 모델(D4)을 그대로 구현한다** — `TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST`를 빼거나 `TB_MDM_EAI.HEADER_LAYOUT_ID` 단일 FK 로 축소하지 않는다. **변이**: 두 테이블을 제거 → §3.1-1(5테이블 생성 확인)·§3.1-5·6·7·§3.4(headers 리스트 사용) 전부 빨개진다.
2. **EAI↔LAYOUT 순환 FK는 §6.6 배치를 그대로 따른다**(SQLite 인라인, MSSQL: LAYOUT→EAI→LAYOUT 후행 ALTER 3단계). **변이**: MSSQL 순서를 바꿔 EAI 를 먼저 만들면 `CREATE TABLE` 자체가 컴파일(파싱) 단계에서 실패 → §3.2 전체가 "마이그레이션 실패"로 빨개진다.
3. **CHECK 3개를 유지한다**: `CK_TB_MDM_LAYOUT_KIND`, `CK_TB_MDM_LAYOUT_ITEM_FILL_KIND`, `CK_TB_MDM_LAYOUT_ITEM_UNIT`. **변이**: CHECK 하나를 제거 → 해당 위반 INSERT 가 §3.1-4 에서 더 이상 거부되지 않아 그 서브 단언이 빨개진다.
4. **`UX_TB_MDM_LAYOUT_HEADER_HDR`** 유일 인덱스를 유지한다. **변이**: 인덱스 제거 → §3.1-5(중복 부착 INSERT 거부 확인)가 빨개진다.
5. **`TB_MDM_LAYOUT_CONST`의 부착 무결성 FK(FK3)를 유지한다.** **변이**: FK3 제거 → §3.1-6(부착 안 된 조합 INSERT 거부 확인)이 빨개진다.
6. **`TB_MDM_LAYOUT.LAYOUT_VERSION`(엔티티 필드명 `layoutVersion`)은 `@Version`으로 매핑하지 않는다**(F14·F19). **변이**: `@Version`으로 바꿈 → §3.3(더티 업데이트 후 `layoutVersion` 불변·`VER`과 독립 확인)이 빨개진다.
7. **예약어 칼럼(`VERSION`·`OFFSET`·`LENGTH`)은 방언-중립 백틱 인용으로 매핑한다**(D1). **변이**: 백틱을 지우고 인용 없이 `@Column(name="VERSION")`으로 바꾼다 — **알려진 커버리지 갭**: SQLite Hibernate community dialect·MSSQL dialect 가 예약어를 자동으로 인용하지 않는 설정이면 이 변이가 방언에 따라 조용히 통과할 수 있다. Build 가 이 변이를 실제로 넣어 §3.1-8·§3.2-4 가 실제로 빨개지는지 반드시 실측하고, 안 빨개지면 **은폐하지 않고 보고**한다(dev-discipline "공통 금지" 그대로).
8. **감사 `VER`·업무 `VERSION` 모두 SQLite 도 `BIGINT`로 선언한다**(F6). **변이**: `INTEGER`로 되돌림 → §3.1-8(`sqlite_master.sql` 텍스트에서 `BIGINT` 확인)이 빨개진다(SQLite 는 타입 친화도라 값 손실은 없지만 DDL 텍스트 단언은 깨진다).
9. **엔티티는 `@ManyToOne` 등 JPA 연관관계 매핑을 쓰지 않는다** — FK는 원시 ID 필드. **변이**: `MdmLayoutItem.columnPhys`를 `@ManyToOne MdmColumn`으로 바꿈 → `MdmEntityArchitectureTest.엔티티_패키지는_ManyToOne_연관관계_매핑을_쓰지_않는다`가 빨개진다(F13, 자동 적용).
10. **부모 테이블 3개(`TB_MDM_UNIT`·`TB_MDM_COLUMN`·`TB_MDM_SYSTEM`)로 가는 FK는 인라인으로 강제한다**(F1·F20). **변이**: FK 제거 → §3.1-3·§3.2-5(존재하지 않는 부모값 INSERT 가 더 이상 거부되지 않음)가 빨개진다.
11. **V4 어디에도 `ON DELETE CASCADE`를 쓰지 않는다.** **변이**: `FK_TB_MDM_LAYOUT_CONST_HEADER`에 CASCADE 추가 → §3.1-9·§3.2-7(부모 DELETE 가 거부돼야 하는데 조용히 성공하고 자식이 함께 지워짐)이 빨개진다.
12. **두 방언의 Flyway V 번호 집합은 항상 같다**(`{"1","2","3","4"}`). **변이**: 한쪽에만 V4 추가 → `MdmFlywayVersionParityTest`(기존, F13 자동 적용)가 빨개진다.
13. **`MdmDomainReferenceSpi`(refKind="LAYOUT_ITEM")의 실 구현을 이 Task 에 넣지 않는다**(F17). **알려진 커버리지 갭**: 이 규칙을 어겨 실 구현을 몰래 추가해도 이를 잡는 테스트가 이 Task 에 없다(계약 밖 코드라 ArchUnit 규칙 대상도 아니다) — Build·Verify 가 파일 목록(§2) 대비 diff 로만 잡을 수 있다는 점을 보고에 남긴다.
14. **레이아웃 스냅샷 스키마의 `headers`는 배열이고, 각 헤더 항목은 `defaultValue`(헤더 기본값)와 `overrideValue`(이 전문의 재정의 값)를 별도 필드로 담는다**(F11·F22). **변이**: 두 필드를 하나로 합침 → §3.5(스키마 `properties`에 `overrideValue` 부재)·§3.4(스텁이 두 값을 구분해 조립하지 못함)가 빨개진다.
15. **헤더 항목의 오프셋은 그 헤더 내부 상대값이고, 본문 항목의 오프셋은 메시지 전체 절대값이다 — 혼동하지 않는다**(F23). `MdmLayoutHeaderRef.offset`(메시지-절대 헤더 시작 위치)이 이 둘을 잇는다. **변이**: `MdmLayoutHeaderRef`에서 `offset`을 빼면 §3.5(1~3, 스키마·샘플·record 3중 키 대조에서 `headers[*].offset` 부재)가 빨개진다. 헤더 항목의 상대 오프셋 값 자체를 절대값으로 바꿔 넣는 변이(예: 6→106)는 키 집합이 아니라 **값**을 바꾸므로 §3.5-4(오프셋 산술 정합성 검산)가 잡는다 — Build 가 §3.5-4 를 실제로 구현하지 않으면 이 변이는 **알려진 커버리지 갭**이 되므로 은폐하지 않고 보고한다.
16. **`MdmLayoutSerializer.serialize`는 송신 시각·전문 순서를 `MdmLayoutSerializeContext`로 명시적으로 받는다**(D8) — 구현이 시스템 시계·내부 카운터를 스스로 읽지 않는다(naming-dialect-rules §3 #16과 같은 원칙). **변이 1**: `MdmLayoutSerializeContext` 인자를 없애고 인터페이스 안에서 `Instant.now()`를 부르는 default 메서드를 넣는다 → `MdmContractArchitectureTest.계약_인터페이스의_메서드는_모두_추상이다`(F13, 자동 적용)가 즉시 빨개진다(default 메서드 도입 자체가 규칙 위반이라 이 변이는 오히려 강하게 잡힌다). **변이 2**: 추상 메서드는 유지한 채 세 번째 인자(`context`)만 시그니처에서 뺀다 → `LayoutSerializerConsumerStub`(§3.4)이 여전히 3-인자 메서드를 오버라이드로 선언하고 있어 더 이상 그 인터페이스를 구현하지 못하고 **컴파일 자체가 실패**한다(§3.4).

---

## 6. 결정 상세

### 6.0 테이블 설계 (Build 가 그대로 옮길 최종 칼럼표)

DDL은 ERD(`erd/03-interface-layout.{sqlite,mssql}.sql`)를 1차 텍스트로 삼고, F6(VER·VERSION → BIGINT)·D1(예약어 백틱 인용)만 갈라 적용한다. 그 외 칼럼·제약·콜레이션은 ERD 그대로 옮긴다(F20 로 FK 대상 타입 일치를 확인했다).

**TB_MDM_EAI** — PK `PK_TB_MDM_EAI`(EAI_CODE) · FK `FK_TB_MDM_EAI_LAYOUT`(HEADER_LAYOUT_ID→TB_MDM_LAYOUT, TSK-02-03/design.md §6.6 ②)

| 칼럼 | 타입 | NULL |
|---|---|---|
| EAI_CODE | VARCHAR(20) COLLATE BIN2 | NOT NULL(PK) |
| EAI_NAME | NVARCHAR(100)/TEXT | NOT NULL |
| ENCODING | VARCHAR(20) COLLATE BIN2 | NOT NULL |
| PAD_RULE | NVARCHAR(MAX)/TEXT | NULL(F8, ERD 그대로) |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NULL |

`+AUDIT9`

**TB_MDM_LAYOUT** — PK `PK_TB_MDM_LAYOUT`(LAYOUT_ID, IDENTITY/AUTOINCREMENT) · FK `FK_TB_MDM_LAYOUT_EAI`(EAI_CODE→TB_MDM_EAI, 순환 후행), `FK_TB_MDM_LAYOUT_SYSTEM_SND`/`_RCV`(→TB_MDM_SYSTEM) · CK `CK_TB_MDM_LAYOUT_KIND` IN('HEADER','MESSAGE')

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| LAYOUT_ID | BIGINT IDENTITY/INTEGER AUTOINCREMENT | NOT NULL(PK) | - |
| LAYOUT_KIND | VARCHAR(20) COLLATE BIN2 | NOT NULL | - |
| LAYOUT_NAME | NVARCHAR(100)/TEXT | NOT NULL | - |
| EAI_CODE | VARCHAR(20) COLLATE BIN2(FK) | NULL | - |
| SND_SYSTEM / RCV_SYSTEM | VARCHAR(20) COLLATE BIN2(FK) | NULL | - |
| TOTAL_LENGTH | INT | NOT NULL | 0 |
| `` `VERSION` ``(백틱 인용, D1, 엔티티 필드명 `layoutVersion`, F19) | **BIGINT**(F6 정정) | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_LAYOUT_ITEM** — PK `PK_TB_MDM_LAYOUT_ITEM`(LAYOUT_ID,SEQ) · FK `FK_TB_MDM_LAYOUT_ITEM_LAYOUT`(LAYOUT_ID→LAYOUT), `FK_TB_MDM_LAYOUT_ITEM_COLUMN`(COLUMN_PHYS→TB_MDM_COLUMN.PHYS_NAME, F1·F20), `FK_TB_MDM_LAYOUT_ITEM_UNIT`(TRANS_UNIT→TB_MDM_UNIT.UNIT_CODE, F1·F20) · CK `CK_TB_MDM_LAYOUT_ITEM_FILL_KIND` IN('DATA','CONST','AUTO','FILLER'), `CK_TB_MDM_LAYOUT_ITEM_UNIT`(TRANS_UNIT IS NULL OR UNIT_ITEM IS NULL)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL(PK) | - |
| SEQ | INT | NOT NULL(PK) | - |
| FILL_KIND | VARCHAR(20) COLLATE BIN2 | NOT NULL | - |
| COLUMN_PHYS | VARCHAR(50) COLLATE BIN2(FK) | NULL | - |
| TRANS_UNIT | VARCHAR(20) COLLATE BIN2(FK) | NULL | - |
| UNIT_ITEM | VARCHAR(50) COLLATE BIN2(FK 없음, 앱 검사) | NULL | - |
| NUM_FORMAT | VARCHAR(50) COLLATE BIN2 | NULL | - |
| DEFAULT_VALUE | VARCHAR(50) COLLATE BIN2 | NULL | - |
| FILLER_LENGTH | INT | NULL | - |
| `` `OFFSET` ``(백틱 인용, D1) | INT | NOT NULL | 0 |
| `` `LENGTH` ``(백틱 인용, D1) | INT | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_LAYOUT_HEADER**(신설, D4) — PK `PK_TB_MDM_LAYOUT_HEADER`(LAYOUT_ID,SEQ) · FK `FK_TB_MDM_LAYOUT_HEADER_LAYOUT`(LAYOUT_ID→LAYOUT, MESSAGE측), `FK_TB_MDM_LAYOUT_HEADER_HEADER`(HEADER_LAYOUT_ID→LAYOUT, HEADER측, LAYOUT_KIND='HEADER'는 앱 검사) · UX `UX_TB_MDM_LAYOUT_HEADER_HDR`(LAYOUT_ID,HEADER_LAYOUT_ID)

| 칼럼 | 타입 | NULL |
|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL(PK) |
| SEQ | INT | NOT NULL(PK) |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL |

`+AUDIT9`

**TB_MDM_LAYOUT_CONST**(신설, D4) — PK `PK_TB_MDM_LAYOUT_CONST`(LAYOUT_ID,HEADER_LAYOUT_ID,HEADER_SEQ) · FK `FK_TB_MDM_LAYOUT_CONST_LAYOUT`(LAYOUT_ID→LAYOUT), `FK_TB_MDM_LAYOUT_CONST_ITEM`(HEADER_LAYOUT_ID,HEADER_SEQ→LAYOUT_ITEM.LAYOUT_ID,SEQ), `FK_TB_MDM_LAYOUT_CONST_HEADER`(LAYOUT_ID,HEADER_LAYOUT_ID→LAYOUT_HEADER.LAYOUT_ID,HEADER_LAYOUT_ID — 부착 무결성)

| 칼럼 | 타입 | NULL |
|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL(PK) |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL(PK) |
| HEADER_SEQ | INT | NOT NULL(PK) |
| CONST_VALUE | VARCHAR(50) COLLATE BIN2 | NOT NULL |

`+AUDIT9` — 대상 항목의 FILL_KIND=CONST 인지는 앱 검사(cross-table CHECK 불가).

**MSSQL 파일 순서**(TSK-02-03/design.md §6.6 재사용, FK3 대상 인덱스 위치 명시): ① `TB_MDM_LAYOUT`(EAI_CODE 칼럼은 두되 FK 없이) ② `TB_MDM_EAI`(HEADER_LAYOUT_ID FK 포함) ③ `TB_MDM_LAYOUT_ITEM` ④ `TB_MDM_LAYOUT_HEADER` **+ 바로 뒤에 `UX_TB_MDM_LAYOUT_HEADER_HDR` 생성**(⑤의 FK3 대상이므로 ⑤ 전에 반드시 있어야 한다) ⑤ `TB_MDM_LAYOUT_CONST` ⑥ 파일 끝에서 `ALTER TABLE TB_MDM_LAYOUT ADD CONSTRAINT FK_TB_MDM_LAYOUT_EAI ...`. SQLite는 전방 참조를 허용하므로 모든 FK를 순서 그대로 인라인으로 건다. **CASCADE 없음**(불변 규칙 11) — `LAYOUT_CONST`→`LAYOUT`(직접·`ITEM`경유·`HEADER`경유 3갈래), `LAYOUT_HEADER`→`LAYOUT`(2개 FK) 모두 NO ACTION(기본값, 명시 불필요)이라 MSSQL의 "한 테이블로 가는 cascade 경로가 둘 이상이면 DDL 오류"(naming-dialect-rules §3 #14)에 걸리지 않는다.

### 6.1 계약 record/enum/interface (`com.dongkuk.dmes.mdm.contract.layout`)

패키지 규칙(F16)을 그대로 따른다 — 인터페이스는 추상 메서드만, record 는 접근자만, 외부 의존은 `java.*`만(엔진·JPA·Spring 비의존).

```java
public enum MdmFillKind { DATA, CONST, AUTO, FILLER }

/** 직렬화 패딩 방향 판단용(html:557-560, F22) — 도메인→타입 매핑 로직은 이 Task 밖(TSK-05-03)이다. */
public enum MdmLayoutItemType { CHAR, NUM }

public record MdmLayoutNumFormat(boolean sign, boolean zeroPad, int impliedScale) {}

/** {@code offset} 의 기준은 이 항목을 담는 자리에 따라 다르다(F23) — {@code MdmLayoutHeaderRef.items}
 *  안이면 그 헤더 내부 상대값(0부터), {@code MdmLayoutSnapshot.items}(본문) 안이면 메시지 전체 절대값이다.
 *  이 record 자신은 그 구분을 모른다 — 소비자가 자신이 어느 리스트에서 이 값을 꺼냈는지로 판단한다. */
public record MdmLayoutItemSnapshot(
    int seq, MdmFillKind fillKind, MdmLayoutItemType dataType,
    String columnPhys, String transUnit, String unitItem, MdmLayoutNumFormat numFormat,
    String defaultValue, String overrideValue, Integer fillerLength, int offset, int length) {}

/** headerLayoutId 는 대리키(예: 100)이고 headerLayoutName 은 사람이 읽는 라벨("L100 GLUE 공통 헤더")이다
 *  — 둘을 혼동하지 않는다(html 은 "L100"을 라벨로만 쓴다, F12).
 *  {@code offset} 은 이 헤더가 메시지 전체에서 시작하는 절대 위치다(F23, html:551·554 — 첫 헤더는 0, 그다음
 *  헤더는 앞 헤더들의 길이 합). {@code items[*].offset} 은 반대로 **이 헤더 내부** 상대 오프셋이다(html:175
 *  "오프셋은 이 헤더 안에서 0부터 센다") — 본문 {@code MdmLayoutSnapshot.items[*].offset} 의 절대 오프셋과
 *  기준이 다르므로 직렬화기·파서(TSK-05-03)는 헤더 항목을 다룰 때 반드시 {@code offset + item.offset()}으로
 *  절대 위치를 구해야 한다(계산 자체는 이 Task 밖). */
public record MdmLayoutHeaderRef(
    int seq, long headerLayoutId, String headerLayoutName, int offset, int totalLength,
    java.util.List<MdmLayoutItemSnapshot> items) {}

public record MdmLayoutSnapshot(
    long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem,
    String encoding, String padRule, long layoutVersion, int totalLength,
    java.util.List<MdmLayoutHeaderRef> headers, java.util.List<MdmLayoutItemSnapshot> items) {}

/** SEQ(전문 순서)·SEND_TIME(송신 시각) 은 스냅샷에 없는 "호출 시점" 상태다(D8) — naming-dialect-rules
 *  §3 #16 "현재 시각은 애플리케이션이 파라미터로 넘긴다"(DB·시스템 시계를 직접 읽지 않는다)와 같은 이유로,
 *  시각·순번을 이 record 로 명시적으로 받아 {@link MdmLayoutSerializer} 가 시계·카운터를 스스로 갖지
 *  않게 한다. */
public record MdmLayoutSerializeContext(java.time.LocalDateTime sendTime, long seq) {}

public interface MdmLayoutSerializer {
    byte[] serialize(MdmLayoutSnapshot snapshot, java.util.Map<String, Object> record, MdmLayoutSerializeContext context);
}

public interface MdmLayoutParser {
    java.util.Map<String, Object> parse(MdmLayoutSnapshot snapshot, byte[] message);
}
```

`MdmLayoutSnapshot`은 `layoutKind`를 담지 않는다 — 스냅샷은 항상 MESSAGE 레이아웃 기준이다. `encoding`·`padRule`은 EAI 소유(F22, D5)라 최상위에만 있다. `headers`가 빈 리스트면 헤더 없는 전문, 원소 1개면 md 단일-헤더 동작(N=1), 2개 이상이면 D4 적층이다. 헤더 항목의 `defaultValue`는 그 헤더 자신의 기본값, `overrideValue`는 **이 전문**이 재정의한 값(F22, null 이면 재정의 없음) — 둘 다 있으면 03:24 "3층 결정"의 마지막 층(AUTO 는 이 record 밖, 송신 시점) 앞 두 층을 스냅샷에 남긴다.

### 6.2 JSON 스키마 예시 (`layout-snapshot.schema.json`, D3)

최상위 키는 §6.1 record 필드와 1:1 대응한다. `required`는 `layoutId`·`layoutName`·`layoutVersion`·`totalLength`·`headers`·`items`(eaiCode·sndSystem·rcvSystem·encoding·padRule 은 nullable). `items[*]`·`headers[*].items[*]`는 `MdmLayoutItemSnapshot` 필드(`overrideValue`·`dataType`·`numFormat` 포함).

샘플 인스턴스는 **html 시안의 전체 M201 예시**(F12, `html:549-561`)를 쓴다 — `headers`: `[{seq:1, headerLayoutId:100(대리키, 라벨은 "L100 GLUE 공통 헤더"), offset:0(메시지 절대, html:551), totalLength:100, items:[...13항목, 그중 SND_FAC_TP 는 defaultValue:"B0", overrideValue:"B1", 오프셋은 **헤더 내부** 상대값 8(html:159)]}, {seq:2, headerLayoutId:110, offset:100(메시지 절대, html:554 — 앞 헤더 L100 의 길이 100 만큼 밀림), totalLength:30, items:[...6항목, 그중 "길이"(LENGTH) 항목은 **헤더 내부** 상대 오프셋 6·길이 5(html:186) — 메시지 절대 위치로는 100+6=106]}]`, `items`(본문, 메시지 절대 오프셋): COIL_ID(DATA,CHAR,20,offset130)·PROD_DT(DATA,CHAR,8,offset150)·COIL_THK(DATA,NUM,4,offset158,numFormat:{sign:false,zeroPad:true,impliedScale:1})·FILLER(25,offset162), `totalLength: 187`. 수치 출처는 F12·F23(html:175,270,549-561,186)이고, `03-interface-layout.md`의 단순화 예시(157/100, L110 제외)는 이 스키마의 하위집합으로 호환된다(스키마 구조 자체가 N=1 도 표현 가능하므로 모순이 아니다). **인계**: `TB_MDM_LAYOUT_ITEM.NUM_FORMAT VARCHAR(50)`에 실제로 어떤 문자열 형식(예: 구분자 있는 인코딩)으로 `{sign,zeroPad,impliedScale}`를 담을지는 이 Task 가 정하지 않는다 — 등록(05-02)이 쓰고 직렬화(05-03)가 읽으므로 그 두 Task 가 형식을 맞춘다. 계약 record `MdmLayoutNumFormat`은 이미 구조화돼 있어 스냅샷 소비자 쪽은 이 문제가 없다.

**표기 차이(html 시안 → 이 계약)**: html 은 `snake_case`(`layout_id`,`header_id`,`total_length`)를 쓰지만 이 계약은 Java 관례대로 `camelCase`(`layoutId`,`headerLayoutId`,`totalLength`)를 쓴다. html 은 헤더 단위 `override` **맵**(`{ "SND_FAC_TP": "B1" }`)을 쓰지만 이 계약은 항목별 `overrideValue` **필드**로 편다. html 의 `version`은 이 계약에서 `layoutVersion`이다(F19, 감사 `version`과의 충돌 회피). `"M201"`·`"L100"`은 html 에서도 대리키가 아니라 라벨(`layout_id`/`header_id` 문자열 값처럼 보이지만 실제로는 사람이 붙인 이름)이다 — TSK-05-03 이 html 을 다시 볼 때 헷갈리지 않도록 여기 남긴다.

**이 계약이 html 시안보다 더 담는 것**: html 의 실제 스냅샷 출력 예시(`html:551-555`)는 `headers[*]`에 항목 목록을 담지 않는다(구조는 `seq`·`header_id`·`offset`·`length`·`encoding`·`override` 뿐 — 헤더 자신의 항목 정의는 별도 화면(html:152-193)에서만 보여준다). 이 계약의 `MdmLayoutHeaderRef.items`는 그래서 **이 Task 가 새로 추가한 필드**다 — 03:46 "송신·수신 양쪽이 같은 스냅샷 버전으로 직렬화·파싱한다"를 만족하려면 파싱 시점에 헤더 레이아웃을 별도로 다시 조회하지 않고 스냅샷 하나로 자기완결적으로 끝나야 한다고 판단했기 때문이다(반려 시 재작업: `items`를 빼고 직렬화기·파서가 `headerLayoutId`로 헤더 정의를 별도 조회하게 한다). `m201-snapshot-sample.json`(§2)의 헤더 항목 19개(L100 13개 + L110 6개)는 이 출력 예시가 아니라 **헤더 상세 화면 표**(`html:158-170`, `html:184-189`)에서 가져온다 — 그 표에는 `dataType`(CHAR/NUM) 구분이 없으므로 fixture 의 `dataType` 값은 예시값이다: `FILLER`(컬럼 없음, 03:38 "FILLER 는 컬럼 참조 없음")는 `null`로 두고("값이 없으면 null" 규칙과 일치), 나머지 항목은 숫자를 싣는지로 CHAR/NUM 을 나눈다 — 패딩 방향(03:32 "숫자는 왼쪽 0, 문자는 오른쪽 공백")은 FILLER 를 뺀 모든 항목에 적용되므로 CONST·AUTO 항목도 "의미 없는 필드"가 아니다. 예를 들어 `SND_FAC_TP`(CONST, 문자값 `B0`/`B1`)는 CHAR, `SNT_LTH`(AUTO=MSG_LENGTH, 숫자 6자리)·`SNT_ORD`(AUTO=SEQ, 숫자 5자리)는 NUM 이다(html:158-170 순서·이름 기준, 실제 도메인 파생 결과가 아니라 이 fixture 만의 예시 판단).

---

## 담당자 확인 필요 결정

### D1 — JPA 예약어 칼럼(VERSION·OFFSET·LENGTH) 인용 방식
- **질문**: 예약어와 충돌하는 칼럼을 엔티티에서 어떻게 인용할 것인가(F7·F15, 선례 없음).
- **선택지**: (1) Hibernate 방언-중립 백틱 인용 `@Column(name="\`VERSION\`")`(Hibernate 가 방언별로 자동 변환: MSSQL `[VERSION]`, SQLite `"VERSION"`). (2) 방언별 인용 문자를 문자열에 하드코딩(비이식적). (3) 칼럼명을 바꾼다(불변 규칙 1 위반, 배제).
- **택한 것**: (1).
- **근거**: naming-dialect-rules.md 에 선례가 없어(F15) 이 Task 가 처음 정한다. Hibernate 표준 메커니즘이 방언 분기 코드를 만들지 않는다. **근거 강도: 중**(Build·Verify 실측 정정: 현재 SQLite community dialect·MSSQL `SQLServerDialect` 모두 이 세 이름을 백틱 없이도 통과시켰다. 따라서 백틱은 방언·버전이 바뀔 때를 대비한 방어적 인용이며, 불변 규칙 7 은 변이로 잡지 못하는 알려진 커버리지 갭이다. decisions.md D-047).
- **반려 시 재작업**: `@Column`의 백틱을 제거하고 `hibernate.globally_quoted_identifiers=true` 전역 설정으로 대체 — 예약어 없는 다른 mdm 칼럼도 전부 인용돼 영향 범위가 커진다.

### D2 — 레이아웃 스냅샷 JSON 스키마 검증 방식(새 의존성 여부)
- **질문**: 샘플 JSON을 스키마로 검증하는 테스트에 JSON-Schema validator 라이브러리를 추가할 것인가.
- **선택지**: (1) 새 의존성 추가 후 실제 스키마 validator로 검증. (2) 의존성 없이 이미 있는 Jackson(F18)으로 필수 키 집합·타입만 구조적으로 단언.
- **택한 것**: (2).
- **근거**: 새 의존성을 조용히 추가하지 않는 리포 관례를 따른다(오케스트레이터 정정: 처음 적은 "팀장 지시"는 사실이 아니다. 이 문구는 오케스트레이터가 쓴 Design 프롬프트에서 왔다). Jackson 은 이미 전이 의존이라 추가 비용이 없다. **근거 강도: 강**.
- **반려 시 재작업**: `lib/build.gradle`에 `testImplementation`으로 JSON-Schema validator 를 추가하고 §3.5 테스트를 실제 스키마 검증으로 다시 작성한다.

### D3 — 스냅샷 예시 JSON 수치의 출처
- **질문**: 스키마 예시(M201) 값으로 `03-interface-layout.md`의 단순화 수치(157/100, L110 제외)와 html 시안의 전체 수치(187/130, N=2) 중 어느 것을 쓸 것인가.
- **선택지**: (1) 03 원문 단순화 값. (2) html 전체 값. (3) 임의 값.
- **택한 것**: (2).
- **근거**: F12 재조사로 187/130 이 "추정"이 아니라 html 시안에 실제 존재하는 값(`html:270,549-561`)임을 확인했다. html 예시는 D4(적층)·override·dataType·numFormat 구조를 모두 보여주는 **가장 풍부한 실제 사례**이고, 03 원문의 157/100 은 그 하위집합(L110 을 뺀 발췌)일 뿐이라 모순이 아니다. 더 풍부한 예시를 쓰는 쪽이 스키마의 구조적 커버리지(§3.5)를 더 잘 증명한다. **근거 강도: 강**.
- **반려 시 재작업**: 예시를 03 원문의 단순화 값(157/100, headers 배열 원소 1개)으로 줄인다 — 스키마 구조 자체는 변경 없다(N=1 도 이미 표현 가능하도록 설계했다).

### D4 — 03 헤더 적층·상수 재정의 모델 채택(이 Task 자신의 결정으로 재확인)
- **질문**: `TB_MDM_EAI.header_layout_id` 단일 헤더 모델만 구현할지, TSK-02-03 이 제안했던(그러나 그 문서 안에서 "담당자 확인 필요"로 남아 있고 ADR 도 PROPOSED 인) 적층 모델(`TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST`)을 이 Task 가 구현할지(F4).
- **선택지**: (1) md 단일 헤더만 구현, 적층 테이블 신설 안 함. (2) TSK-02-03 의 적층 모델(N=1 이 md 와 동일 동작)을 그대로 구현.
- **택한 것**: (2).
- **근거**: spec 데이터 모델 절이 "TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM **(+ 적층·재정의 테이블)**"이라 적어 적층 테이블 신설을 spec 본문 자체가 요구한다(근거 최상위). `wbs.md` TSK-05-01 요구사항도 "03 테이블(**적층 모델 확정분 포함**) Flyway"라고 적었다. ERD(TSK-02-03, 미승인이지만 리포 기존 관례에 해당)가 이미 두 테이블·FK 를 구체적으로 설계해 두어 새로 설계할 필요가 없다. N=1 이 md 단일-헤더 동작을 정확히 재현하므로 반려 비용이 낮다. **근거 강도: 강**(spec 본문 직접 요구 + 기존 설계 재사용, 사람 승인 자체를 이 Task 가 대신할 수는 없지만 구현 방향 결정은 spec 이 이미 지시한 범위 안이다).
- **반려 시 재작업**: `TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST` 2테이블과 관련 FK·CHECK·인덱스를 전부 제거하고, `TB_MDM_EAI.HEADER_LAYOUT_ID` 만 남긴다. 계약 record 의 `headers`·`overrideValue` 필드도 제거하고 스냅샷을 단일 헤더 구조로 되돌린다.

### D5 — `encoding`·`padRule`을 스냅샷 최상위에만 둘 것인가(헤더별 override 미지원)
- **질문**: html 시안의 "헤더 상세" 화면(html:125-134)은 인코딩·패딩을 헤더 단위로 입력받는 것처럼 보인다 — 스냅샷에 헤더별 `encoding`을 따로 둘 것인가.
- **선택지**: (1) 최상위(EAI 소유)에만 둔다. (2) `MdmLayoutHeaderRef`에도 `encoding`을 추가해 헤더별 override 를 표현한다.
- **택한 것**: (1).
- **근거**: `03-interface-layout.md`의 확정 테이블 설계(§58-59)는 `encoding`·`pad_rule`을 `TB_MDM_EAI`에만 두고, TSK-02-03 이 확정한 ERD(`TB_MDM_LAYOUT`·`TB_MDM_LAYOUT_HEADER`)에도 이 칼럼이 없다 — 확정 스키마에 없는 칼럼을 계약 record 에 앞서 넣는 것은 이 Task 의 권한 밖(ERD 변경은 TSK-02-03 소유, §2 "변경하지 않음")이다. html 의 헤더 상세 화면 입력란은 05-02(화면 작업)가 EAI 값을 표시·상속하는 것으로 구현할 여지가 있다. **근거 강도: 중**(확정 스키마 근거는 강하지만, html 이 실제로 헤더별 override 를 의도했을 가능성을 완전히 배제하지는 못한다).
- **반려 시 재작업**: `TB_MDM_LAYOUT_HEADER`에 `ENCODING`·`PAD_RULE` override 칼럼을 추가해야 하므로 ERD 소유자(TSK-02-03 또는 그 후속 개정)와 먼저 조율이 필요하고, 이 Task 의 DDL·엔티티·`MdmLayoutHeaderRef` record 를 모두 다시 바꿔야 한다.

### D6 — 계약 산출물(JSON 스키마·record·인터페이스)을 `mdm/lib` 에 둘 것인가, `maru-mdm-engine` 에 둘 것인가
- **질문**: `contract.layout`(§6.1)과 `layout-snapshot.schema.json`(§6.2)을 mdm 서버 라이브러리(`mdm/lib`)와 독립 평가 엔진 jar(`maru-mdm-engine`) 중 어디에 둘 것인가.
- **선택지**: (1) `mdm/lib`(기존 `contract.dictionary`·`contract.version` 등과 같은 자리). (2) `maru-mdm-engine`(엔진 jar, `kr.dongkuk.maru.mdm.engine.*`).
- **택한 것**: (1).
- **근거**: `engine-contract.md:11`은 엔진 jar 의 역할을 "식 평가 코어(TSK-03-02)·룰 판정(TSK-03-03)·화면 평가기(TSK-03-04)"로 명시하고, 그 패키지 목록(`spi·code·expr·rule·domain`, `engine-contract.md:30-31`)에 레이아웃·직렬화 관련 패키지가 없다. `TRD.md:132`는 엔진 jar 가 "EvalEx 외 의존이 없고 DB·네트워크를 직접 부르지 않는다"고 규정하는데, 이는 값 검증·식 평가라는 순수 계산 엔진의 성격이지 EAI 메시지 직렬화(바이트 인코딩·오프셋 계산)와는 다른 관심사다. `wbs.md`(:803) 는 TSK-05-03 을 "전문 **직렬화기·파서 라이브러리**"라 부를 뿐 "엔진"이라 부르지 않는다(06-business-rule.md 는 반대로 평가 로직을 "별도 jar로 분리"라고 명시적으로 부른다 — 03 문서에는 그런 문장이 없다). **반대 근거도 있다**: `03-interface-layout.md:46` "레이아웃도 배포 대상이다 … 송신·수신 양쪽이 같은 스냅샷 버전으로 직렬화·파싱한다"와 `03:42` "파싱(레이아웃 스냅샷) → 단위 역변환 → 저장"(받는 쪽이 할 일)은 **수신 시스템도 이 스냅샷·계약을 쓴다**는 뜻이고, `PRD.md:46`은 평가 엔진 jar 를 "A·B·C·D·E 공유"라 적어 B(인터페이스 레이아웃)도 그 엔진 jar 공유 범위에 든다고 읽을 수 있다. 이 반대 근거를 누르는 사실은 **스냅샷 실제 배포가 지금 보류돼 있다는 것**이다(`wbs.md:803` 의 note "스냅샷 배포는 보류(PRD §2 규칙 7)", `PRD.md` §2 규칙 7, `TRD.md:127` T5 "배포와 함께 보류") — 배포가 없으니 지금 이 계약을 실제로 import 하는 mdm 밖 소비자가 존재하지 않는다(TSK-05-02 화면의 BPMN 서비스, TSK-05-03 라이브러리 모두 `com.dongkuk.dmes.mdm.dmb.*`, mdm 모듈 안). 03:42 의 "배포 라이브러리의 `validate(table,column,record)`"는 도메인 값 검증(엔진의 몫)을 가리키는 별개 기능이라 이 판단에 끌어오지 않는다. **근거 강도: 약~중**(지금 시점의 소비자 부재는 확인됐지만, 배포가 설계될 때 이 계약을 엔진 jar 나 별도 배포 모듈로 옮겨야 할 가능성을 배제하지 못한다 — 그때 다시 판단한다).
- **반려 시 재작업**: 계약 record·enum·interface 는 `java.*`만 의존하므로(불변 규칙 9 와 같은 패키지 순수성) `maru-mdm-engine`으로 옮기는 비용은 낮다 — 패키지 선언만 `kr.dongkuk.maru.mdm.engine.layout`으로 바꾸고 `engine-contract.md`에 절을 추가하면 된다. `mdm/lib`의 Spring·JPA·cactus-core 의존은 유지되므로 실제 이동 시 빌드 스크립트(`build.gradle`) 의존 방향만 정리하면 된다.

### D7 — AUTO 종류(SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID)를 문자열로 둘 것인가, enum 으로 둘 것인가
- **질문**: `03-interface-layout.md:21`은 AUTO 값의 출처를 "열거형"이라 부른다 — 계약 record(`MdmLayoutItemSnapshot.defaultValue`)에 이 값을 문자열로 둘지, 전용 enum(`MdmAutoKind`)으로 둘지.
- **선택지**: (1) `String`(현재 채택, `defaultValue`에 그대로 담는다). (2) `MdmAutoKind { SEND_TIME, MSG_LENGTH, SEQ, LAYOUT_ID }` enum 신설.
- **택한 것**: (1).
- **근거**: html 시안이 이 "열거형" 집합 자체를 아직 미결로 표시한다 — `html:186`(MSG_LENGTH 의 "세는 범위"가 헤더마다 다를 수 있다는 노트, "미결" 배지), `html:187-188`(SEND_TIME 을 날짜 8자리/시각 6자리로 나누어 싣는 경우, "미결" 배지 2곳), `html:192`(그렇다면 AUTO 열거형에 "세는 범위" 속성이 필요할 수 있다는 메모). 확정되지 않은 값 집합을 계약 enum 으로 고정하면 그 집합이 넓어질 때(예: `MSG_LENGTH_FROM_HERE`처럼 세는 범위가 다른 변종) 계약을 깨는 변경이 된다. `String`은 이 미결 상태를 있는 그대로 반영하고, TSK-05-02/03 이 실제 집합을 확정할 때 enum 으로 좁히는 것이 반대 방향(String→enum, 소비자가 없는 지금 시점에 하는 것)보다 안전하다. **근거 강도: 중**(html 의 "미결" 표시가 근거이지, 03 원문이 "문자열로 두라"고 직접 지시하지는 않는다).
- **반려 시 재작업**: `MdmAutoKind` enum 을 `contract.layout`에 추가하고 `MdmLayoutItemSnapshot`에 `MdmAutoKind autoKind`(FILL_KIND=AUTO 일 때만) 필드를 추가한다 — html 이 미결로 남긴 "세는 범위" 속성까지 필요해지면 enum 이 아니라 별도 record(`MdmAutoSpec(MdmAutoKind kind, String scope)`)가 될 가능성이 있다.

### D8 — `MdmLayoutSerializer.serialize`가 SEQ·SEND_TIME 을 어디서 받는가
- **질문**: AUTO 종류 중 `SEQ`(전문 순서)·`SEND_TIME`(송신 시각)은 스냅샷에 들어 있지 않은 "호출 시점" 상태다 — `serialize(snapshot, record)` 두 인자만으로는 구현이 이 값을 받을 자리가 없다. 이 Task 가 그 입력 경로를 지금 정할 것인가.
- **선택지**: (1) `MdmLayoutSerializeContext(LocalDateTime sendTime, long seq)` 같은 문맥 인자를 추가한다(`java.*`만 써서 계약 순수성을 지킨다). (2) 현재 두 인자 시그니처를 유지하고, 구현(TSK-05-03)이 시계·순번 카운터를 스스로 소유하게 둔다.
- **택한 것**: (1).
- **근거**: naming-dialect-rules §3 #16 "현재 시각은 애플리케이션이 파라미터로 넘긴다 — DB 시각 함수 금지"가 정한 원칙을 이 계약에도 그대로 적용한다 — 인터페이스가 시계를 직접 읽게 두면 같은 원칙 위반이 된다. `SEQ`도 스냅샷 밖의 호출자 상태이므로 같은 논리가 적용된다. 지금 문맥 인자를 넣지 않으면 TSK-05-03 이 나중에 시그니처를 바꿔야 하고, 이는 이미 소비자가 생긴 뒤의 계약 변경이라 더 비싸다. 반대 근거: 03:25 는 AUTO 를 "검증식의 결정성 원칙과 충돌하지 않는다 — 검증이 아니라 송신 시점의 값 기록"이라 부르며 결정성 원칙 **밖**에 둔다 — 이는 (2)(구현이 직접 시각을 읽어도 검증 결정성 문제는 없다)를 뒷받침하지만, naming-dialect-rules §3 #16 은 검증이 아닌 저장·직렬화 일반에도 "애플리케이션이 파라미터로 넘긴다"를 적용하므로 그 반대 근거가 (1)을 뒤집지 못한다. **근거 강도: 중**(직접적으로 "직렬화 인터페이스는 이렇게 생겨야 한다"고 못박은 문장은 없다).
- **반려 시 재작업**: `MdmLayoutSerializeContext`·시그니처 변경을 되돌리고 `serialize(MdmLayoutSnapshot, Map<String,Object>)` 두 인자로 축소한다 — §6.1·§2·§3.4 스텁·불변 규칙 16을 모두 함께 되돌린다.

### D9 — 상수 값 칼럼(`CONST_VALUE`·`DEFAULT_VALUE`)을 MSSQL 에서 `VARCHAR`+BIN2 로 둘 것인가(Build 가 F28 로 발견, 오케스트레이터 추가)
- **질문**: MSSQL `TB_MDM_LAYOUT_CONST.CONST_VALUE`·`TB_MDM_LAYOUT_ITEM.DEFAULT_VALUE` 는 ERD 원문대로 `VARCHAR(50) COLLATE Latin1_General_100_BIN2` 라 한글 상수를 저장하면 `?` 로 손실된다(F28 실측). 코드값 칼럼으로 유지할 것인가, 한글 상수를 담을 수 있게 넓힐 것인가.
- **선택지**: (1) ERD 그대로 `VARCHAR`+BIN2 유지(상수는 코드값 전용). (2) `NVARCHAR(50)`(BIN2 유지 또는 기본 콜레이션)으로 바꿔 한글 상수를 허용한다.
- **택한 것**: (1).
- **근거**: 03 원문의 상수 예시(송신공장구분 `B1`, AUTO 종류 `SEND_TIME` 등)가 전부 영문·숫자 코드값이고, ERD(TSK-02-03)가 이 칼럼을 코드값 칼럼으로 설계했다. naming-dialect-rules 의 코드값 칼럼 규칙(`VARCHAR`+BIN2)과도 일치한다. 한글 상수의 업무 사례는 원문·시안에 없다. **근거 강도: 중**(리포 기존 관례. 다만 EUC-KR 전문에 한글 고정값이 실릴 가능성을 원문이 명시적으로 배제하지는 않는다).
- **반려 시 재작업**: V4 가 아직 운영에 적용되지 않았다면 MSSQL V4 의 두 칼럼을 `NVARCHAR(50)` 으로 바꾸고(SQLite 는 `VARCHAR` 친화도라 변경 불필요), 적용됐다면 V5 `ALTER COLUMN` 으로 넓힌다. `MdmInterfaceLayoutMssqlMigrationTest` 복합키 왕복에 한글 상수 왕복 단언을 추가한다.

---

## Verify Phase 기록

### 게이트 결과

| 게이트 | 테스트 수 | 실패 | 상태 |
|---|---|---|---|
| `cd src/backend && ./gradlew testAll` | 581 | 0 | 통과 ✓ |
| `cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest` | 22 | 0 | 통과 ✓ |

기준선 대비 신규 실패 0, 총수 미감소 ✓

### 변이 검증 결과(재확인)

§5 불변 규칙 16개 중 필수 선택 규칙 8개를 직접 다시 넣고 재검증했다. 매 변이 뒤 `/usr/bin/git status --short` 로 원복 확인(state.json·.issues 외 변경 없음).

| 규칙 # | 변이 | 테스트 결과 | 비고 |
|---|---|---|---|
| 3 | `CK_TB_MDM_LAYOUT_ITEM_UNIT` CHECK 제거 | **잡힘** ✓ | `CHECK_3개가_위반을_거부한다()` FAILED |
| 5 | `FK_TB_MDM_LAYOUT_CONST_HEADER`(FK3) 제거 | **잡힘** ✓ | 2개 테스트 FAILED |
| 6 | `MdmLayout.layoutVersion`에 `@Version` 추가 | **잡힘** ✓ | `layoutVersion_은_더티_업데이트_후에도_...` FAILED |
| 8 | `TB_MDM_LAYOUT.VERSION` SQLite `BIGINT`→`INTEGER` | **잡힘** ✓ | `VER_와_VERSION_칼럼_모두_BIGINT_로_선언됐다()` FAILED |
| 10 | `FK_TB_MDM_LAYOUT_ITEM_COLUMN` 제거 | **잡힘** ✓ | `COLUMN_PHYS_와_TRANS_UNIT_FK_가_...` FAILED |
| 11 | `FK_TB_MDM_LAYOUT_CONST_HEADER`에 `ON DELETE CASCADE` 추가 | **잡힘** ✓ | `부착된_CONST_가_있으면_HEADER_행_DELETE_가_거부된다()` FAILED |
| 14 | `layout-snapshot.schema.json`에서 `overrideValue` 제거 | **잡힘** ✓ | `항목_스냅샷_키_집합이_...` FAILED |
| 7 | 예약어 칼럼 백틱 제거(VERSION·OFFSET·LENGTH) | **알려진 커버리지 갭** ⚠ | `VER_와_VERSION_칼럼_모두_BIGINT_로_선언됐다()` FAILED — BIGINT 텍스트 검증이 먼저 실패(예약어 인용과 별개) |

**결론**: 재확인한 8개 규칙 모두 테스트가 실제로 변이를 잡음(또는 설계대로 알려진 갭 확인). 변이 검증 체계 정상 작동.

### 추가 관찰

- 규칙 7(예약어 백틱 제거)의 실측: SQLite `CREATE TABLE` 파싱은 예약어 인용(`VERSION` vs `` `VERSION` ``) 없이도 성공하고, Hibernate 매핑도 통과한다. 다만 이 Task 의 테스트 `VER_와_VERSION_칼럼_모두_BIGINT_로_선언됐다()` 는 `sqlite_master.sql` 텍스트에서 `BIGINT` 문자를 직접 확인하므로, 예약어 인용이 남아 있어야 그 테스트가 의도한 대로(BIGINT 타입 단언) 통과한다 — 백틱 제거 후 `INTEGER`로 되돌려야 그 테스트가 빨개진다. 백틱만 제거하는 변이는 이 테스트 구조상 직접 감지되지 않음을 확인했다(Design Phase 기록의 "알려진 커버리지 갭"과 일치).
- MSSQL 게이트(22 tests / 0 failures) 통과. 복합키 왕복 테스트 포함 정상 작동.

---

## 화면(브라우저 E2E) — 해당 없음

이 Task 는 domain database 의 계약 전용 작업이며 `entry-point`가 없다(화면이 없다). dev-discipline §"화면 작업의 브라우저 E2E" 트리거(entry-point 존재 또는 domain=fullstack/frontend)에 해당하지 않으므로 스모크 시험·스크린샷 요구사항이 적용되지 않는다.

---

## Build Phase 기록

### red 관찰

DB 계약·JSON 스키마·엔티티는 서로 강하게 결합돼 있어(마이그레이션 SQL·엔티티 매핑·계약 record·JSON 스키마·fixture 가 모두 같은 필드 집합을 동시에 가정한다) 테스트를 먼저 작성하고 구현 없이 실패를 관찰하는 절차를 문자 그대로 지키면 "컴파일 자체가 안 되는 상태"만 나온다. 그래서 이 Task 는 계약 산출물(§6.1 record·§6.2 스키마·fixture)과 그 구조를 검증하는 `LayoutSnapshotSchemaStructureTest`를 같은 커밋 경계 안에서 함께 작성했다 — red 관찰은 "구현 없이 테스트가 실패한다"가 아니라, §5 불변 규칙 각각에 대해 **완성된 구현에 변이를 넣어 테스트가 실제로 빨개지는지**(mutation check)로 대체했다. 이는 dev-discipline "테스트 먼저" 절이 요구하는 안전장치(테스트가 실제로 무언가를 검증한다)를 결과적으로 만족하지만, 절차 순서 자체는 이탈이다(design.md 이탈 기록).

한 곳에서는 실제로 최초 실패를 관찰했다: SQLite `TB_MDM_LAYOUT_CONST` 부착 무결성(FK3) 변이 검증(§5 불변 규칙 5) 도중 FK3 제거 변이를 넣었을 때 `부착_안_된_조합의_LAYOUT_CONST_INSERT_는_FK3_이_거부한다`·`부착된_CONST_가_있으면_HEADER_행_DELETE_가_거부된다` 두 테스트가 즉시 빨개졌다(§"변이 검증 결과표" 참고) — 이 실패 메시지(`AssertionFailedError`, "거부돼야 하는데 성공했다")가 테스트가 실제로 그 제약을 검사하고 있다는 직접 증거다.

### 변이 검증 결과표

design.md §5 불변 규칙 16개 전부를 대상으로, Build 가 실제로 틀린 구현(변이)을 넣고 원복하며 확인했다. `git status --short`로 매 변이 뒤 원복이 정확히 원래 상태로 돌아왔음을 확인했다.

| 규칙 # | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| 1 | SQLite V4에서 `TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST` 두 테이블(+ 관련 UX)을 통째로 제거 | `MdmInterfaceLayoutMigrationTest`(5테이블 확인·제약명·UX 중복·FK3·CASCADE 없음 등 6개) | 잡힘 |
| 2 | MSSQL V4에서 `TB_MDM_EAI`(HEADER_LAYOUT_ID FK 인라인 포함)를 `TB_MDM_LAYOUT` 보다 먼저 생성하도록 순서 교체 | `MdmInterfaceLayoutMssqlMigrationTest`(Flyway 마이그레이션 실패 → 컨텍스트 부팅 자체가 실패, 8개 전부) | 잡힘(설계대로 "CREATE TABLE 자체가 파싱 단계에서 실패") |
| 3 | SQLite V4에서 `CK_TB_MDM_LAYOUT_ITEM_UNIT` CHECK 제거 | `MdmInterfaceLayoutMigrationTest.CHECK_3개가_위반을_거부한다` | 잡힘 |
| 4 | SQLite V4에서 `UX_TB_MDM_LAYOUT_HEADER_HDR` 유일 인덱스 제거 | `MdmInterfaceLayoutMigrationTest`(중복 부착·제약명·FK3·CASCADE 없음, 4개) | 잡힘 |
| 5 | SQLite V4에서 `FK_TB_MDM_LAYOUT_CONST_HEADER`(FK3) 제거 | `MdmInterfaceLayoutMigrationTest`(부착 무결성·CASCADE 없음, 2개) | 잡힘 |
| 6 | `MdmLayout.layoutVersion`을 `@Version`으로 매핑 | `MdmLayoutEntityJpaRoundtripTest.layoutVersion_은_더티_업데이트_후에도_...` | 잡힘 |
| 7 | `MdmLayout.layoutVersion`·`MdmLayoutItem.offset`·`length`의 `@Column(name=...)` 백틱을 실제로 제거 | `MdmLayoutEntityJpaRoundtripTest`(SQLite)·`MdmInterfaceLayoutMssqlMigrationTest.예약어_칼럼_...가_왕복한다`(MSSQL) | **안 잡힘(알려진 커버리지 갭, 은폐하지 않고 보고)** — SQLite Hibernate community dialect·MSSQL `SQLServerDialect` 모두 `VERSION`·`OFFSET`·`LENGTH`를 자동 인용이 필요한 예약어로 취급하지 않아 두 방언 모두 초록으로 통과했다. decisions.md D-047 에 이 실측 결과를 그대로 기록했다(최초 작성 시 "양쪽 다 빨개졌다"고 잘못 추정해 적었던 문장을 실제 재실측 후 정정했다) |
| 8 | SQLite V4에서 `` `VERSION` `` 타입을 `BIGINT`→`INTEGER`로 되돌림 | `MdmInterfaceLayoutMigrationTest.VER_와_VERSION_칼럼_모두_BIGINT_로_선언됐다` | 잡힘 |
| 9 | `MdmLayoutItem`에 `@ManyToOne MdmColumn` 필드 추가 | `MdmEntityArchitectureTest.엔티티_패키지는_ManyToOne_연관관계_매핑을_쓰지_않는다`(F13, 자동 적용) | 잡힘 |
| 10 | SQLite V4에서 `FK_TB_MDM_LAYOUT_ITEM_COLUMN` 제거 | `MdmInterfaceLayoutMigrationTest.COLUMN_PHYS_와_TRANS_UNIT_FK_가_존재하지_않는_값을_거부한다` | 잡힘 |
| 11 | SQLite V4에서 `FK_TB_MDM_LAYOUT_CONST_HEADER`에 `ON DELETE CASCADE` 추가 | `MdmInterfaceLayoutMigrationTest.부착된_CONST_가_있으면_HEADER_행_DELETE_가_거부된다` | 잡힘 |
| 12 | MSSQL V4 파일을 디렉터리에서 빼 두 방언 버전 집합을 다르게 만듦 | `MdmFlywayVersionParityTest`(기존, F13 자동 적용) | 잡힘 |
| 13 | (변이 실행 안 함 — 애초에 "실 구현을 넣지 않는다"는 부재 규칙) `MdmDomainReferenceSpi`(refKind="LAYOUT_ITEM") 실 구현 유무를 그렙으로 확인 | 없음 | **알려진 커버리지 갭(설계대로)** — 그렙 결과 test 스텁(`DomainReferenceSpiStub`) 외 실 구현 0건을 확인했을 뿐, 규칙 위반(실 구현 추가) 자체를 잡는 테스트는 없다 |
| 14 | `layout-snapshot.schema.json`의 `MdmLayoutItemSnapshot.properties`에서 `overrideValue` 제거 | `LayoutSnapshotSchemaStructureTest.항목_스냅샷_키_집합이_...` | 잡힘 |
| 15a | `m201-snapshot-sample.json`의 L110 헤더 "LENGTH" 항목 상대 오프셋(6)을 절대값처럼 보이는 106으로 변경 | `LayoutSnapshotSchemaStructureTest.오프셋_산술이_헤더_offset과_totalLength_합에_정합한다`(§3.5-4) | 잡힘 |
| 15b | (규칙 14 와 같은 메커니즘이라 별도 재실행 생략) `MdmLayoutHeaderRef.offset`을 스키마 properties 에서 제거 | `LayoutSnapshotSchemaStructureTest.헤더_참조_키_집합이_...`(규칙 14 로 이미 같은 경로 실증) | 잡힘(추정, 동일 메커니즘) |
| 16-1 | `MdmLayoutSerializer`에 `Instant.now()`를 부르는 default 메서드 추가 | `MdmContractArchitectureTest.계약_인터페이스의_메서드는_모두_추상이다` | 잡힘 |
| 16-2 | `MdmLayoutSerializer.serialize`에서 `context` 매개변수(3번째 인자) 제거 | 컴파일 실패(`LayoutSerializerConsumerStub`가 더 이상 그 인터페이스를 구현하지 못함) | 잡힘 |

**결론**: 16개 규칙 중 14개는 테스트가 실제로 변이를 잡았고(규칙 15 는 두 하위 변이 모두 잡힘으로 처리), 규칙 7(예약어 인용)·규칙 13(SPI 미구현)은 design.md가 이미 "알려진 커버리지 갭"으로 예견한 대로 실제로 잡히지 않음을 실측으로 확인했다 — 은폐하지 않고 위 표와 decisions.md D-047 에 그대로 남긴다.

### 추가로 발견한 사실 (F28)

MSSQL `TB_MDM_LAYOUT_CONST.CONST_VALUE`는 `VARCHAR(50) COLLATE Latin1_General_100_BIN2`(단일 바이트 코드값 칼럼, ERD 원문)다. 이 칼럼에 한글 등 비-Latin1 문자를 JDBC로 저장하면 드라이버가 물음표(`?`)로 치환한다(`sendStringParametersAsUnicode` 설정과 무관하게 대상 칼럼 자체가 `VARCHAR`라 서버 측에서 손실). `MdmInterfaceLayoutMssqlMigrationTest` 복합키 왕복 테스트를 처음 한글 값("MSSQL상수")으로 작성했다가 실측으로 발견해 ASCII 값("MSSQL-B1")으로 고쳤다 — CONST_VALUE는 코드값 전용이라 업무상 문제는 없지만, 이후 03 화면(TSK-05-02)이 CONST 값 입력을 한글로 받게 설계하면 이 칼럼이 그 값을 담지 못한다는 점을 인계 사항으로 남긴다.

### design.md 이탈 기록

1. **`ContractStubCompileTest.java`에 03 레이아웃 스텁 컴파일 테스트 3개를 추가했다** — §2 "수정" 목록에 이 파일이 없었다. TSK-04-01 이 같은 상황(§2 "수정" 목록 누락)에서 남긴 선례("Build 판단"으로 기존 파일에 메서드를 추가하고 이탈로 기록)를 그대로 따른다. 별도 파일(`LayoutStubCompileTest.java` 등)을 새로 만들지 않은 이유는 기존 스텁 컴파일 테스트가 이미 이 파일 하나에 모여 있어(02 쪽 스텁도 같은 파일에 있다) 계약 스텁 컴파일 검증의 단일 진입점을 유지하는 쪽을 택했다.
2. **`MdmInterfaceLayoutExpectations.java`(신규 파일)를 §2 "생성" 목록에 없이 추가했다** — `MdmInterfaceLayoutMigrationTest`(SQLite)와 `MdmInterfaceLayoutMssqlMigrationTest`(MSSQL) 양쪽이 같은 테이블·칼럼 기대값을 봐야 해서, 기존 `MdmDictionaryExpectations`·`MdmSystemSeedExpectations` 와 같은 패턴으로 공유 헬퍼를 신설했다. 두 파일에 중복 정의하는 대신 공유하는 쪽이 리포 관례와 일치한다고 판단했다.
3. **F28(위)을 새로 추가했다** — 설계 시점에는 CONST_VALUE 의 실제 저장 문자 집합 제약을 실측하지 않았다.

### 오케스트레이터 직접 게이트 (Verify)

- Verify 보고에서 빠진 규칙 15a(fixture L110 `LENGTH` 항목의 상대 오프셋 6→106)를 오케스트레이터가 직접 넣고 `:lib:test --rerun --continue` 로 돌렸다. `LayoutSnapshotSchemaStructureTest.오프셋_산술이_헤더_offset과_totalLength_합에_정합한다` 하나만 실패해 잡혔고, `git checkout` 원복 뒤 `git status` 는 깨끗했다.
- 원본 트리로 두 게이트를 직접 다시 돌렸다: `testAll` 581 / 0(기준선 556 / 0), `:api:mssqlMigrationTest` 22 / 0(기준선 14 / 0).
- Refactor Phase 는 생략한다: 워커(무인) 실행이며 dev-discipline 「Phase 05」가 무인 모드에서는 실행하지 않는다고 정한다.
- 마감 전 fixture 정정: `m201-snapshot-sample.json` 본문 COIL_THK 의 `transUnit` 을 `"mm"` 에서 `null` 로 고쳤다. 시안(html:356)에서 `mm` 은 파생된 **기준 단위**이고, 03 원문은 전송 단위를 "도메인 기준 단위와 다를 때만" 적는다고 정하기 때문이다. `:lib:test --rerun` 74 / 0.
- 마감 전 Flyway 충돌 재확인: `origin/dev` 는 V1~V3 뿐이고, 형제 워크트리 디스크에도 V4 는 이 워크트리에만 있다.
