# ERD 정본 결정 조사 (C-diff-sot) — 2026-10-09

질문: Flyway V 파일 정본(가) vs ERD 모델 정본(나) vs 중간안. DB = Oracle 23ai 하나, 머지된 V 파일 수정 불가(체크섬), 표 136개→수백 개, 개발 PC Oracle 컨테이너 PDB 복제 가능.

표기: [확인] = 공식 문서/원문 페이지에서 직접 확인, [검색요약] = 검색 결과 스니펫·2차 자료, [확인 안 됨] = 찾지 못함.

## 1. 선언형 vs 버전형

- 버전형(change-based): 변경 스크립트를 순서대로 적용. 이력이 명시적, PR 리뷰 가능, 운영 적용 통제 쉬움. 계획(ALTER 작성) 부담이 개발자에게 있음. [확인] https://atlasgo.io/concepts/declarative-vs-versioned
- 선언형(state-based): 원하는 상태를 주면 엔진이 대상 DB 와 비교해 계획·적용. 대상 DB 네트워크 접근 필요, 적용 시점 승인 흐름이 약함. [확인] 같은 페이지
- 하이브리드: 로컬은 선언형으로 짜고, 공유 환경용 버전형 파일을 생성. [확인] 같은 페이지
- 버전형 + 자동 계획(Atlas 의 "versioned authoring"): 모델을 주면 계획을 파일로 저장해 리뷰. [확인] 같은 페이지

## 2. Atlas (ariga.io)

- `atlas migrate diff <이름> --dir=file://migrations --to=file://schema.hcl --dev-url=<URL>` 형태. dev database 에서 현재 마이그레이션 디렉터리를 재생해 상태를 얻고 원하는 상태와 비교해 .sql 과 atlas.sum 을 생성. [검색요약] https://www.atlasgo.io/guides/evaluation/setup-migrations (스니펫). 공식 concept 페이지 자체에는 dev DB 언급이 없음 [확인] — dev DB 방식은 가이드 예시 기준.
- Oracle dev DB URL 예: `docker://oracle/free:latest-lite?t=10m` (컨테이너 기동이 느려 t 옵션). [확인] https://atlasgo.io/guides/oracle/automatic-migrations
- Oracle 드라이버는 유료: "only available on the Pro plan or during a Trial", Atlas Pro 계정·`atlas login` 필요. [확인] 같은 페이지
- 요금: Pro 와 Enterprise 두 플랜, 30일 trial 후 Pro 는 라이선스 필요. migrate lint(CI 파이프라인)·drift 감지(Schema Monitoring, 모니터 DB 수 과금)는 유료. schema diff 자체 과금 여부는 페이지에 명시 없음 [확인 안 됨]. 검색 스니펫의 $9/$29/$59 가격은 출처별 불일치, 신뢰 안 함. https://atlasgo.io/cloud/pricing
- Oracle 지원 자체: 비교 페이지에서 Atlas·Liquibase·Flyway 모두 Oracle 지원 표기 [확인] https://atlasgo.io/atlas-vs-others
- Flyway 형식 출력: Atlas 는 Flyway 디렉터리를 Atlas 형식으로 *가져오기* 가능. `atlas migrate import --from "file://migrations?format=flyway" --to "file://atlas-migrations"`. V__ 와 R__ 변환(R__ 은 R 접미 버전 파일), U__ 는 건너뜀(down 은 자동 계산), atlas.sum 생성. 예시는 MySQL 기준이며 Oracle 대상 제약은 페이지에 없음 [확인 + 확인 안 됨]. https://atlasgo.io/guides/migrate-flyway-to-atlas
- Atlas 가 Flyway 형식으로 *내보내기* 하는지: [확인 안 됨] (검색에서 찾지 못함)
- 드리프트 감지: Atlas 는 라이브 스키마와 저장소 스키마 차이를 지속 비교·알림(유료 Schema Monitoring). Liquibase·Flyway·ORM 은 "미지원" 으로 표기. [확인] atlas-vs-others 페이지. 단 Flyway 는 별도로 drift 기능이 있음(아래 4).
- Oracle 23ai 버전 명시 지원 범위: 가이드가 23ai VECTOR 가이드를 링크하는 정도 [검색요약]. 버전별 세부는 [확인 안 됨].

## 3. diff→ALTER 도구와 rename 처리

| 도구 | 방식 | Oracle | rename 처리 | 비고 |
|---|---|---|---|---|
| Atlas | 선언형 + 버전형(diff 를 dev DB 로 계산) | 지원, 드라이버 Pro 유료 | 명시 힌트 `renamed_from` (HCL 속성, SQL 은 `-- atlas:renamed_from <이전이름>` 주석). 힌트 없으면 대화형 질문, 비대화형이면 DROP+CREATE 로 데이터 손실 | [확인] https://atlasgo.io/changelog/declarative-schema-renames |
| Liquibase diff / diff-changelog | 리비전형 도구의 diff 생성 | Oracle 지원, diff 계열은 Pro 기능 표기 | 원문 확인 못 함. 일반적으로 drop+add 로 나온다고 알려져 있으나 검증 안 됨 | [확인 안 됨] rename 감지 세부 |
| Flyway (Redgate) state-based/Desktop | 모델 폴더 + shadow DB 비교, diff·model·generate·prepare·deploy | Oracle 비교 가능 | Oracle 비교 도구는 휴리스틱 사용: 동일 이름 → 대상이 원본 이름을 포함 → 같은 순서위치·타입·유사 이름 → 같은 타입·유사 이름 순. 완벽하지 않아 누락·오탐 가능 | [검색요약] https://documentation.red-gate.com/fd/reference/configuration/redgate-compare-namespace/redgate-compare-oracle-namespace/oracle-behavior-options-namespace/oracle-detect-renamed-columns-setting |
| Oracle DBMS_METADATA_DIFF.COMPARE_ALTER | 객체 단위로 ALTER DDL(CLOB) 반환 | 네이티브 | 이름이 다르면 별개 객체로 취급하는 것으로 보임(휴리스틱 없음) [검색요약 — 추정] | 스키마 전체 비교 API 없음, 루프 필요. 패키지 미지원 목록 [검색요약] https://technology.amis.nl/ 등 블로그 |
| Oracle SQL Developer Data Modeler | 모델 간 Compare/Merge, DDL 생성 | 지원 | rename 감지 방식 확인 안 됨 | [검색요약] release notes. Oracle Designer 저장소 직접 비교는 확인 안 됨 |
| migra (Postgres) | 두 스키마 diff → SQL | 해당 없음(PG 10+) | 공식 문서에서 rename 감지 확인 안 됨 | [검색요약] pypi 페이지 |
| Prisma migrate | 섀도 DB 로 드리프트 감지, 체크섬으로 수정된 마이그레이션 감지 | 해당 없음 | 공식 rename 힌트 확인 안 됨 | 드리프트는 공식 문서 [검색요약]; 체크섬 세부는 2차 자료 |
| Skeema (MySQL) | 선언형, DDL 생성 | 해당 없음 | rename 감지 확인 안 됨 | [검색요약] |
| sqldef | 선언형 | 해당 없음 | 구버전 README 기준 테이블·인덱스·컬럼을 이름으로 식별, rename 미지원으로 보임. 최신 버전 확인 안 됨 | [검색요약] pkg.go.dev 구버전 |

rename 처리 방식 정리:
- 휴리스틱형(Flyway 비교, Atlas 구형 대화 프롬프트): 이름 유사도·위치·타입으로 추정. 오탐·누락 있음. 비대화형 CI 에서는 위험.
- 명시 힌트형(Atlas `renamed_from`): 모델 안에 "이전 이름" 을 기록. 결정적이고 CI 에서 안전. 힌트를 언제 지울지 등 정책은 페이지에 없음 [확인 안 됨].
- 이름 고정 ID(일부 모델링 도구의 내부 ID): 확인 안 됨.
- 이름 기반 식별만 하는 도구(sqldef 구버전 등): rename 은 수동 처리 후 재-export.

## 4. drift 감지 사례

- Atlas: 라이브 DB 와 저장소 스키마의 지속 비교, 유료 Schema Monitoring. [확인] atlas-vs-others
- Flyway Enterprise: `flyway check -drift` 로 파이프라인에서 스키마 드리프트 검사. 정적 참조 데이터는 별도 비교 필요. 기준 스냅샷을 배포 뒤 저장하는 방식. [검색요약] https://documentation.red-gate.com/fd/drift-detection-149127470.html , https://documentation.red-gate.com/ddfo/drift-detection
- Prisma: 섀도 DB 로 재생한 상태와 개발 DB 비교, 차이가 있으면 드리프트 보고. 운영 `migrate deploy` 는 드리프트 감지 안 함. [검색요약] 공식 shadow-database 페이지
- Oracle 자체 도구: dbForge Schema Compare for Oracle 로 "골드 베이스라인" 과 비교, Redgate Schema Compare for Oracle 스냅샷 기반. [검색요약] devart/cleverence 페이지. 라이선스·가격은 확인 안 됨.
- 직접 구축 방법: DBA_OBJECTS / USER_TAB_COLUMNS / USER_CONSTRAINTS / USER_INDEXES 를 주기적으로 덤프해 저장소의 기대 상태와 비교 — 일반 기법이며 사례 URL 없음 [추정].

## 5. Oracle 특유의 ALTER 함정

확인된 것 (검색 스니펫 기준, 공식 Oracle 문서 본문은 페이지가 잘려 직접 확인 못함):
- 컬럼 길이 축소: 값이 있으면 ORA-01441 ("cannot decrease column length because some value is too big"). 축소는 해당 컬럼이 전부 NULL 이어야 하는 조건 — 실제로는 값을 자르거나 NULL 로 바꾼 뒤 ALTER. [검색요약] https://docs.oracle.com/en/error-help/db/ora-01441
- NOT NULL 추가: 기존 NULL 이 있으면 ORA-02296. 먼저 백필 후 MODIFY. [검색요약] 같은 계열 자료
- NOT NULL 이면서 축소: 둘 다 해결해야 하며 NULL 로 비울 수 없어 값 재작성 필요. [검색요약]
- 컬럼 순서: Oracle 은 순서 변경 명령이 없음. INVISIBLE 토글 트릭: 컬럼을 INVISIBLE 로 바꿨다가 VISIBLE 로 되돌리면 맨 뒤로 감. 원하는 순서대로 토글. 단 INSERT 시 컬럼 순서에 주의. [검색요약] 블로그 다수 (공식 문서 확인 안 됨)
- 표 이름 변경: `ALTER TABLE ... RENAME TO` 는 제약·인덱스 이름을 바꾸지 않음(오래된 관리 가이드 언급, 여러 포럼 일치). 시스템 생성 이름(SYS_C…) 이 남음. 이름 정리는 `ALTER TABLE ... RENAME CONSTRAINT`, `ALTER INDEX ... RENAME TO` 로 따로 수행. PK 의 백킹 인덱스가 같이 바뀌는지는 확인 안 됨 → user_indexes 로 확인 필요. [검색요약] 일부 출처는 반대 주장(자동 갱신) — 충돌, 실측 필요.
- 테이블 DDL 은 참조 프로시저·패키지·트리거·MV 를 무효화. [검색요약]
- COMMENT ON: 컬럼·표 주석은 ALTER 와 별도 문장으로 관리해야 하며 rename 시 주석이 따라오는지 확인 필요 [확인 안 됨]. 일반적으로 주석은 객체에 붙어 있어 rename 후에도 남는 것으로 알려져 있으나 이 조사에서 원문 확인 못함.
- 온라인 재정의 DBMS_REDEFINITION (Oracle 23 문서 [확인]):
  - 절차: CAN_REDEF_TABLE → START_REDEF_TABLE → COPY_TABLE_DEPENDENTS(num_errors 확인 필수) → (선택) SYNC_INTERIM_TABLE → FINISH_REDEF_TABLE. 빈 중간 표를 미리 만들어 둬야 함.
  - 기본은 PK 기준(CONS_USE_PK), PK 없으면 ROWID. 중간 표 제약은 비활성으로 만들어졌다가 자동 활성.
  - REDEF_TABLE 한 번에 하는 방식은 롤백 불가.
  - 감사 정책은 객체 ID 를 따라가므로 점검 필요. VPD 는 copy_vpd_opt 로 지정.
  - 컬럼 변경 제한 목록은 페이지가 잘려 확인 안 됨.
- 참고: Oracle 의 `MODIFY` 의 의미·NOT NULL 세부 조항·RENAME TO 의미 원문은 ALTER TABLE 레퍼런스 페이지 뒷부분이라 이번 조사에서 확인 못함. https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/ALTER-TABLE.html

## 6. 업계 사례

- 모델 정본(ERwin, ER/Studio + DDL 생성): ERwin 은 논리·물리 모델을 나눠 DBMS 별 타입·접두어를 규칙으로 적용, DDL 생성 가능. [검색요약] BioSQL 메일링 리스트(2005), ER_Modeler 논문 소개. 현장 사례로는 "DDL 을 생성해 개발팀이 한 줄씩 검토" 라는 개인 리뷰 1건 — 신뢰도 낮음.
- Oracle SQL Developer Data Modeler: 모델 간 compare/merge 로 DDL 생성, 기존 데이터 딕셔너리와 비교 가능. [검색요약] release notes
- 마이그레이션 정본 운영(Flyway, Liquibase): 실패담 공통 패턴은 "직접 운영 DB 변경 → 드리프트 → 다음 배포 실패" 이며 드리프트 검사를 붙이는 방향으로 해결. 구체 기업 사례 URL 은 이번 조사에서 확인 못함 [확인 안 됨].
- 한국 SI 의 exERD / DA# 운영 방식: 검색으로 관련 자료 찾지 못함 [확인 안 됨]. 제품명 표기 확인 필요.
- ERwin 형상관리 사례: ERwin 모델 파일 버전 호환성 문제(이전 버전 파일을 새 버전이 못 읽음) 가 한 사례에 언급. [검색요약] earticle — 신뢰도 낮음.

## 7. 정본 안별 장단점

(가) V 파일이 정본, ERD 는 보기와 초안 생성
- 장점: 적용 이력·체크섬이 이미 정본. 운영 적용이 명확. 도구 의존 낮음. 개발자 이해·리뷰 친숙.
- 단점: 136→수백 표에서 ALTER 를 사람이 계속 씀. rename 과 컬럼 순서 등 Oracle 함정을 수작업으로 맞춤. ERD 초안 품질이 diff 휴리스틱에 달림(rename 오탐).

(나) ERD 모델이 정본, V 파일은 생성 결과
- 장점: 설계 한 곳에서 관리, 표 수백 개에서 일관성. rename 을 모델에 `renamed_from` 같은 명시 힌트로 기록하면 결정적.
- 단점: 머지된 V 파일은 어차피 고정이라 과거 이력은 V 파일 그대로 남음 → 모델과 V 이력이 이중. 생성기 자체 개발·검증 비용. 모델 도구 버전 호환 위험. 운영 DB 직접 변경이 모델에 안 들어가면 드리프트.

(중간안) 모델=설계 정본, V=적용 정본 + drift 검사
- 장점: 기존 V 이력 보존. 새 변경은 모델에서 diff 로 V 초안을 만들고 사람이 검토·확정. 운영·개발 DB 와 기대 상태를 주기적으로 비교. 이미 머지된 V 는 건드리지 않음.
- 단점: 두 정본이 어긋날 수 있어 "V 가 최종 권위" 규칙을 명문화해야 함. 초안 생성 도구 필요.

## 8. 권장안 (조사 기반 판단)

- 권장: 중간안을 기본으로, 단 "V 파일 = 적용 정본(이미 머지된 것 + 새로 확정된 것), 모델 = 설계 정본" 으로 못 박는다. 모델 변경은 항상 V 초안으로 떨어지고, 확정 전 모델과 V 적용 결과가 같은지 시험 PDB 에서 검증.
- 근거:
  1. 머지된 V 는 고정이므로 (나) 는 과거 이력을 모델에서 재현할 수 없다. 기준선은 V 여야 한다.
  2. rename 은 어떤 자동 diff 도 완벽하지 않다(휴리스틱 한계, Redgate 문서도 명시). 명시 힌트가 있는 모델 기록이 필요 → 모델 쪽에 rename 힌트 칸을 두고, diff 는 그 힌트를 입력으로 쓴다.
  3. Oracle 함정(축소·NOT NULL·순서·재정의)은 어떤 도구도 자동으로 안전하게 처리하지 않으므로 사람 검토 단계가 필수. 따라서 "모델→V 자동 확정" 은 피한다.
  4. drift 검사는 중간안의 필수 조건이다. 드리프트 감지가 없으면 (가)도 (나)도 운영에서 깨진다.
- 도구 선택 (비용 관점):
  - Atlas: 기능은 가장 맞으나 Oracle 드라이버가 Pro 유료. 사내 도입 전 라이선스 확인 필요. Flyway 형식 가져오기와 renamed_from 이 장점.
  - 자체 스크립트(DBA_* 뷰 기반 비교 + 모델 YAML/CSV + rename 힌트): 무료, 통제 쉬움, 구현 비용 있음. Oracle 에 맞춘 규칙을 직접 넣을 수 있음.
  - 상용 Oracle 비교 도구(dbForge, Redgate Schema Compare for Oracle): 드리프트 리포트 제공, 라이선스 비용 확인 필요.
- 실행 전 시험 항목(PDB 복제에서):
  - rename 힌트가 DROP+CREATE 로 빠지지 않는지
  - 축소·NOT NULL 변경의 실패 조건(ORA-01441, ORA-02296) 재현
  - 인덱스·제약 이름이 rename 후 어떻게 남는지 user_indexes·user_constraints 로 확인 (출처 간 충돌)
  - INVISIBLE 토글 순서 변경 뒤 SELECT 목록 영향

## 9. 확인 안 됨 목록

- Liquibase diff-changelog 의 rename 처리 원문
- Atlas schema diff 가 무료인지 유료인지
- Atlas Flyway 가져오기의 Oracle 대상 제약
- Atlas 가 Flyway 형식으로 내보내는지
- Oracle ALTER TABLE MODIFY·RENAME TO 의 공식 의미 전문 (문서 페이지 잘림)
- Oracle 컬럼 순서 INVISIBLE 기법의 공식 문서 근거
- PK 백킹 인덱스가 제약 rename 시 함께 바뀌는지
- COMMENT ON 이 rename 후 유지되는지
- SQL Developer Data Modeler 의 rename 감지 방식
- exERD·DA# 운영 사례
- 국내 SI 프로젝트의 ERD·DDL 운영 공개 자료
- Prisma 체크섬 세부 (2차 자료만 확인)
- sqldef·Skeema·migra 의 rename 처리 최신 버전 여부

## 10. 핵심 URL

- Atlas 선언형 vs 버전형: https://atlasgo.io/concepts/declarative-vs-versioned
- Atlas rename 힌트: https://atlasgo.io/changelog/declarative-schema-renames
- Atlas Oracle 자동 마이그레이션(드라이버 Pro): https://atlasgo.io/guides/oracle/automatic-migrations
- Atlas Flyway 가져오기: https://atlasgo.io/guides/migrate-flyway-to-atlas
- Atlas 도구 비교표(드리프트·rename 지원 표): https://atlasgo.io/atlas-vs-others
- Atlas 요금: https://atlasgo.io/cloud/pricing
- Redgate Oracle rename 휴리스틱: https://documentation.red-gate.com/fd/reference/configuration/redgate-compare-namespace/redgate-compare-oracle-namespace/oracle-behavior-options-namespace/oracle-detect-renamed-columns-setting
- Redgate drift: https://documentation.red-gate.com/fd/drift-detection-149127470.html
- Oracle DBMS_REDEFINITION (23): https://docs.oracle.com/en/database/oracle/oracle-database/23/arpls/DBMS_REDEFINITION.html
- Oracle ALTER TABLE (23): https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/ALTER-TABLE.html
- ORA-01441: https://docs.oracle.com/en/error-help/db/ora-01441
- Prisma shadow database: https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
