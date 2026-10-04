# mcm 레인 구조 변경 기록

레인은 mcm-core·mcm(`src/backend/mcm-core`, `src/backend/mcm`), 브랜치는 `refactor/mcm`, 기준 태그는 `refactor-2026-10-base`(b557ccbd)다.
이 문서는 README.md §6.1 형식에 따라 이 레인이 머지한 구조 변경(S)을 적는다. 구조 변경이 아닌 조사 결과는 부록 A 에 둔다. 성능 수치는 `perf-mcm.md` 에 둔다.
시험만 추가한 커밋은 S 항목으로 만들지 않고 해당 S 항목의 동작 보존 근거에 넣었다.

## 이번 문서에 든 항목

| 번호 | 제목 | 머지 |
|---|---|---|
| S1 | 복제 값 변환 유틸을 `common.util.McmValues` 로 통합 | 4dd51e42 |
| S2 | `DataInitializer` 를 `init.seed` 단계 클래스로 분할 | a0a2e4d8, d7e5bf94(시험) |
| S3 | 메뉴 카탈로그 캐시 | (진행 중 — 별도 머지) |
| S4 | `CommUserMngService` 를 퍼사드 + 조회·저장·비밀번호·SSO 위임 클래스로 분할 | 레인 커밋 6e6f0bf4, 1f6d0cb6, 24038a95 |
| S5 | 시드 단계 이동 후속: `MdmMenuSeeder`·`ScreenUsageSchemaArtifacts`·`PERM_ALL` 선언을 `init/seed/` 로 | 레인 커밋(S5 참조) |
| S6 | 1번 N+1·전수 로드 정리와 공개 API 확장(부서명 일괄 조회·매핑 벌크 삭제·감사 조회 page·size) | 레인 커밋(S6 참조) |

사용자 관리·삭제·감사 조회 특성 시험(머지 f52d471d)은 S3·S4·S6 의 동작 보존 근거로 쓰려고 먼저 깐 것이라 S 항목이 없다. 내용은 부록 A(5)에 있다.

## S1. 복제 값 변환 유틸을 `common.util.McmValues` 로 통합
- 커밋: 79d62878(McmValues 신설), 6cdfb321, 61f1e7d6, 3d024667, ca14ccbb, 2936c9fe, caa446ba, 6b059b8f(호출부 치환), 시험 7002d032, 머지 4dd51e42
- 바뀌기 전: mcm-core 서비스 20여 곳이 같은 이름의 `private static` 변환 함수를 각자 복사해 갖고 있었다. mcm-core 에 문자열·날짜 유틸 패키지는 없었다.
- 바뀐 뒤: `mcm-core/.../common/util/McmValues.java` 한 곳에 변형 7개를 두고, 서비스들은 static import 로 쓴다. 순수 유틸이라 다른 업무 슬라이스를 참조하지 않는다.

| McmValues 메서드 | 의미 | 지운 private 정의 |
|---|---|---|
| `strOf` | null 이면 null, 아니면 `String.valueOf`. trim 없음 | 12곳 |
| `strOfTrim` | `valueOf` 뒤 trim. 공백만 있으면 "" | 6곳 |
| `blankToNullTrim` | 공백이면 null, 아니면 trim 한 값 | 4곳 |
| `blankToNull` | 공백이면 null, 아니면 원본 그대로 | 5곳 |
| `parseLocalDateTime` | `yyyyMMdd`·`yyyy-MM-dd`·공백 구분·ISO 4형식, 실패 시 fallback | 6곳 |
| `toIntStrict(Object, label)` | 콤마 허용, 빈값 null, 실패 시 `BusinessException` | 2곳 |
| `toIntOrNull` | Number 는 `intValue`, 문자열은 trim 후 `parseInt`, 실패 시 null | 2곳 |

  - 합계: strOf 18(12+6), blankToNull 9(4+5), parseLocalDateTime 6, toInt 4(2+2).
  - 제외한 파일: 위젯 패키지 `widget/admin/service/CommWidgetMngService`(blankToNull 이 trim 에 더해 리터럴 "null" 도 null 로 바꾸는 다른 변형), 화면 사용 통계 패키지 `screenusage/service/ScreenUsageStatSupport`, 샘플 서비스 3개(`SampleNoticeService`(mcm/lib), `SampleMasterCodeService`(mcm-core, 대상 이름 정의 없음), `SampleInventoryItemService`(mls/lib)). 위젯·화면 사용 통계는 다른 작업이 진행 중인 금지 영역이고, 샘플 서비스 3개는 a8 레인(AOP 어노테이션 규약 위반 수정)으로 넘어간 파일이라 이번 범위에서 뺐다. 이번 치환 대상은 mcm-core 뿐이라 mcm/lib·mls/lib 의 두 샘플 서비스는 원래 범위 밖이다.
  - 의미가 다른 변형을 합치지 않은 근거: `strOf` 와 `strOfTrim` 은 앞뒤 공백이 달라진다. `blankToNullTrim` 과 `blankToNull` 은 호출처가 trim 하지 않은 값을 DB 에 쓰므로 합치면 저장값이 바뀐다. `toIntStrict`(예외, 콤마 허용)와 `toIntOrNull`(null 반환, 소수 버림)도 실패 동작이 다르다. 그래서 7개를 이름으로 구분해 남겼다.
- 바꾼 이유: 같은 함수가 파일마다 복사돼 있어 한 곳을 고치면 나머지가 어긋난다. 변형 차이도 파일을 열어 봐야 알 수 있었다.
- 동작 보존 근거:
  - 정의 본문은 원본 그대로 옮겼다(79d62878). 치환 커밋은 변형별로 나눠 하나씩 돌렸다.
  - `McmValuesTest` 11건. 7002d032 가 소수 초·길이 10 비ISO·잘못된 8자리 날짜·int 범위 밖 Number·`toIntStrict` 경계를 고정했고, 기대값은 지운 원본 정의와 대조했다.
  - mcm-core 801/801 통과(기준선 790 + 11), mcm 55/55 통과, `McmCoreArchitectureTest`(ArchUnit) 5/5 통과.
- 로그 출처 변경: `parseLocalDateTime` 파싱 실패 경고가 서비스 로거(`[commMenuMng.parseLocalDateTime]` 등)에서 McmValues 로거(`[McmValues.parseLocalDateTime]`)로 바뀐다. 반환 동작은 같다. 로그 필터·알림이 서비스 로거 이름을 보고 있다면 맞춰 고쳐야 한다.
- 영향 범위: mcm-core 안 서비스 20여 파일의 import 만 바뀐다. 공개 API·BPMN·설정 변경 없음. mdm·mls 에도 비슷한 `blankToNull` 정의가 있으나 범위 밖이다.
- 되돌리는 방법: 머지 4dd51e42 를 `-m 1` 로 revert 하거나 치환 커밋 6개를 역순으로 revert 한다. 신설 커밋 79d62878 과 시험은 남겨도 된다. 치환 커밋 일부만 revert 해도 나머지와 독립이다.

## S2. `DataInitializer`(3,690줄)를 `init.seed` 패키지의 단계 클래스로 분할
- 커밋: 074e1440, 6dfa03b5, 3435b56f, 7dadc709, 653c01fd, 49c3c0b8(주석 정정), 머지 a0a2e4d8. 시험 ccc7eebe·a5af6746(지문 골든), 0fd6687f(MSSQL SQL 기록, 머지 d7e5bf94)
- 바뀌기 전: `mcm/api/.../init/DataInitializer.java` 한 파일(3,690줄)에 초기화 흐름, 공유 SQL 헬퍼, MSSQL DDL 약 1,300줄, 코어 RBAC·메뉴·MDM 시드가 모두 들어 있었다.
- 바뀐 뒤:

```
init/
  DataInitializer.java        979줄  run() 순서 지정 + 시험이 읽는 중첩 클래스 2개 (S5 뒤 275줄)
    ├ (바깥 클래스)           324줄
    ├ ScreenUsageSchemaArtifacts (중첩)  54줄  → S5 에서 seed/ 로 이동(58줄)
    └ MdmMenuSeeder (중첩)             600줄  → S5 에서 seed/ 로 이동(602줄)
  seed/
    SeedSupport.java          374줄  공유 헬퍼·AUDIT 상수·EntityManager·방언 플래그 (빈 아님)
    SchemaArtifactsMssql.java 1,381줄  cma 동기화·csa W1~W8 DDL (initMcmCsaCommArtifacts 로 묶음)
    SchemaArtifactsSqlite.java  72줄  VI_MCM_CODE_ACCESS 뷰·MENU_FLD·UK 인덱스
    CaravanMetaSeeder.java     118줄
    RuleMasterSampleSeeder.java 89줄
    CoreRbacSeeder.java        238줄
    McmMenuSeeder.java         452줄
    ModuleMenuSeeder.java      144줄  ANALOG·mls·화면 사용 통계·위젯 메뉴
    MenuFinalizer.java          47줄
```

  - 단계 클래스는 `SeedSupport` 를 상속해 메서드 본문(SQL 문자열 포함)을 그대로 옮겼다. 로그 범주는 분할 전처럼 `DataInitializer` 다.
  - `run()` 은 134줄에서 61줄, `seedMcmSecRbac` 는 241줄에서 124줄이 됐다. 시험이 읽는 `allActions` 목록 약 45줄이 이 안에 남아 있다.
  - 시험이 reflection 으로 쓰는 `entityManager`·`sqliteDialect` 필드와 `unlockLocalAdmin()` 은 `DataInitializer` 에 남겼고, `unlockLocalAdmin()` 은 `CoreRbacSeeder` 에 위임한다.
- 호출 순서: **순서 변경 없음.** `run()` 호출 순서, `seedMcmSecRbac` 내부 순서(코어 RBAC → 메뉴 시드 10개 → `fixModuleRootMenuSeqOrder` → `recomputeMenuFullSeq`), `seedMdmMenus` 내부 순서가 원본과 같다. 기계 대조로 호출 순서 64개가 같음을 확인했다. 형태만 달라진 곳은 둘이다. W1~W8 DDL 호출 묶음이 `initMcmCsaCommArtifacts()` 한 메서드로 옮겨졌고(내부 순서 그대로), `PERM_ALL` 의 `allActions` 문자열이 `CoreRbacSeeder` 호출 인자로 앞당겨 계산된다(문자열을 잇기만 하므로 결과 같음).
- `@Transactional` 경계: `run()` 에만 있다. 단계 클래스에는 붙이지 않았고 `REQUIRES_NEW` 도 만들지 않았다. caravan 저장소 `saveAll` 두 곳이 별도(secondary) 트랜잭션인 점과 `run()` 첫 단계에 있는 점도 그대로다.
- AUDIT 지역 상수: `AUDIT_COLS`·`AUDIT_VALS` 가 메서드마다 지역 상수로 25곳 반복돼 있었고(조사 때 12곳, 구현 때 23곳으로 셌으나 리뷰가 25곳으로 바로잡음, 49c3c0b8) 값이 모두 같아 `SeedSupport` 상수 하나로 합쳤다.
- 중첩 클래스로 남은 이유(머지 당시. **S5 에서 해소**): `MdmMenuSeeder`·`ScreenUsageSchemaArtifacts`·`allActions` 선언은 다른 모듈 시험 3개가 `DataInitializer.java` 를 경로로 직접 열어 소스 문자열을 확인한다. 이 시험들은 이 레인이 고칠 수 없는 위치에 있어 파일을 옮기지 않았다.

| 시험 | 위치 | 소스에서 확인하는 문자열 |
|---|---|---|
| `ScreenUsageOasisContractTest` | mcm-core screenusage | `String allActions = String.join(",",` 선언 |
| `ScreenUsageMssqlDdlTest` | mcm-core screenusage.schema | `ScreenUsageMssqlDdl` 상수 3개, `initScreenUsageArtifacts();` 가 `createSecMenuFldForSqlite();` 보다 앞에 있는지 |
| `MdmOasisActionVocabularyTest` | mdm/api | `allActions`, `readActions`·`editActions` 선언, `seedMdmObjectRbac(...)` 호출 3모양, `insertMcmSecObjIfAbsent("metaFeed", ` |

  후속 제안이었던 이 이동은 조정 세션의 조건부 허가를 받아 S5 에서 했다.
- 바꾼 이유: 한 파일 3,690줄에 도메인이 섞여 있어 시드 하나를 고치려면 전체를 읽어야 했고, AUDIT 상수·SQL 헬퍼가 복붙돼 있었다. 새 모듈 메뉴를 넣는 위치도 불분명했다.
- 동작 보존 근거:
  - SQLite 시드 지문 골든: 빈 SQLite 에 local 프로필로 `run()` 을 돌려 테이블 51개·245행의 정규화 해시를 비교한다(`DataInitializerSeedFingerprintTest`, ccc7eebe). 분할 전 코드에서 만든 골든을 단계마다(4회) 그대로 통과했다. 시각 컬럼 4종(C_AT·U_AT·START_ACTIVE_DATE·LAST_PWD_CHNG_DATE)만 해시에서 빼고 VER·USER_ENC_PWD(스텁 고정값)는 넣었다. 실행 간 결정성은 3회 확인했다. 갱신 요청이 없으면 골든이 없을 때 실패한다(a5af6746).
  - MSSQL 경로 SQL 기록 골든 4시나리오(`DataInitializerMssqlSqlCharacterizationTest`, 0fd6687f): EntityManager 를 Proxy 가짜로 바꿔 실행 SQL 을 순서대로 기록하고 문자열 완전 일치를 확인한다. 기록 건수는 local 1284, no-profile 1280, local-existing 925, local-legacy-stub 1075. 분할 후 구조(653c01fd)에 이 시험과 골든을 넣어 4건 모두 일치함을 확인했다.
  - 원본 메서드 108개 중 `seedMcmSecRbac` 를 뺀 107개 본문을 공백 정규화 뒤 기계 대조해 모두 같음을 확인했다. 문자열 리터럴 약 2,400개 집합도 AUDIT 통합분과 로거 이름 3개를 빼면 같다.
  - 소스 문자열을 읽는 시험 3개: `ScreenUsageMssqlDdlTest` 4건, `ScreenUsageOasisContractTest` 3건, `MdmOasisActionVocabularyTest` 15건 통과.
  - 모듈 전체: mcm-core 790/790, mcm 57/57(api 39 + lib 18, 지문 시험 2건 증가), `McmCoreArchitectureTest` 5/5 통과.
  - 한계: 지문 골든은 SQLite 경로만 덮는다. MSSQL 경로는 SQL 기록 골든과 기계 대조로 지켰고, 두 번째 부팅 멱등성 지문은 만들지 않았다. SQL 기록은 네 시나리오를 합쳐도 SQLite 전용 메서드 2개, caravan 저장소(null)로 건너뛴 2개, SQL 을 내지 않는 메서드 6개는 지나가지 않는다.
- 영향 범위:
  - 호출부·설정·BPMN 변경 없음. `DataInitializer` 공개 생성자·`run()`·reflection 필드·`unlockLocalAdmin()` 시그니처는 유지했다.
  - 가이드 문서 `docs/guide/BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md`(269·276줄)와 `02-structure-naming-constraints.md`(152줄)가 헬퍼·시드가 `DataInitializer.java` 에 있다고 적고 있어 옛 위치를 가리킨다. 이번에 고치지 않았다(후속).
  - 옮긴 본문 안의 `line 69` 같은 줄 번호 주석, 일부 javadoc `{@link #…}` 대상이 다른 클래스로 옮겨져 어긋난다. mcm 빌드에 javadoc 작업이 없어 빌드 영향은 없다.
  - 새 모듈 메뉴 시드는 `ModuleMenuSeeder` 에 메서드를 만들고 `seedMcmSecRbac` 에서 부르면 된다.
- 되돌리는 방법: 머지 a0a2e4d8 을 `-m 1` 로 revert 하거나 구현 커밋 074e1440·6dfa03b5·3435b56f·7dadc709·653c01fd·49c3c0b8 을 역순으로 revert 한다. 지문·SQL 기록 시험과 골든(ccc7eebe·a5af6746·0fd6687f)은 분할 전 코드에서 먼저 만들었으므로 그대로 둬도 통과해야 한다. 단계별 커밋은 앞 단계에 의존하므로 일부만 revert 하지 않는다.

## S3. 메뉴 카탈로그 캐시
(진행 중 — 별도 머지)

## S4. `CommUserMngService`(분할 직전 890줄)를 퍼사드 + 조회·저장·비밀번호·SSO 위임 클래스로 분할
- 커밋: 6e6f0bf4(조회 5개), 1f6d0cb6(저장·비밀번호 행 쓰기 지원 클래스), 24038a95(pwdinit 단건·SSO 분기)
- 바뀌기 전: `mcm-core/.../csa/commUserMng/service/CommUserMngService.java` 한 파일에 사용자 조회·저장·역할그룹 저장·비밀번호 초기화·SSO 일괄 초기화가 모두 들어 있었다(분할 직전 890줄, 1단계 `searchCmUser` 개선이 끝난 상태. 레인 기준점 4a314348 에서는 869줄).
- 바뀐 뒤: 퍼사드 한 개와 위임 클래스 네 개, 패키지 private 지원 클래스 한 개. 줄 수와 public 메서드 배치는 아래와 같다.

| 클래스(`csa.commUserMng.service`) | 줄 수 | public 메서드 |
|---|---|---|
| `CommUserMngService`(퍼사드, 빈 `commUserMngService`) | 224 | 12개 모두 위임만 한다. `pwdinit` 은 `SSO_RESET_FLAG="Y"` 분기만 정한다 |
| `CommUserMngQueryService` | 290 | `searchCmUser`, `searchUserRoleGrp`, `searchRoleGrp`, `commonUserDept`, `searchDeptLov` |
| `CommUserMngSaveService` | 463 | `saveCmUser`, `reRegCmUser`, `saveUserRoleGrp`, `saveUserRoleGrpCopy`(`RoleChangedEvent` 발행 포함). 퍼사드의 `regCmUser`·`deleteCmUser` 는 `saveCmUser` 로 위임 |
| `CommUserMngPasswordService` | 61 | `initPwd`(`pwdinit` 단건 분기) |
| `CommUserMngSsoService` | 64 | `resetSsoPwd`(`pwdinit` SSO 일괄 분기) |
| `CommUserMngPwdWriter`(패키지 private `@Component`) | 76 | 없음. bcrypt 인코더·`DEFAULT_PASSWORD`·`upsertUserPwd`·`resetToInitial` 을 저장·비밀번호·SSO 가 같이 쓴다 |

  - 분할 직전 본문과 새 클래스 본문을 한 줄씩 대조했다. 코드를 옮긴 것 말고 바뀐 곳은 셋이다. (a) `commonUserDept` 와 `searchDeptLov` 의 같은 부서 행 조립 루프를 `deptRows` 하나로 합쳤다(행 순서·컬럼 같음). (b) 반복되던 bcrypt 호출 두 번을 `PwdWriter.resetToInitial` 로 묶었다(호출 순서·인코더 같음). (c) `reRegCmUser` 의 `(userId == null ? "" : userId)` 를 `userId` 로 바꿨다(이 분기에서 `userId` 는 null 일 수 없어 결과 같음).
- 유지한 것:
  - **빈 이름·BPMN 바인딩**: 퍼사드 빈 이름 `commUserMngService` 와 public 12개의 이름·시그니처·파라미터 이름(`request`, `master`)·반환 Map 은 그대로다. BPMN 은 고치지 않았다. 새 빈 이름 `commUserMngQueryService`·`commUserMngSaveService`·`commUserMngPasswordService`·`commUserMngSsoService`·`commUserMngPwdWriter` 는 다른 BPMN 빈 이름과 겹치지 않는다.
  - **트랜잭션 경계 불변**: 어느 클래스에도 `@Transactional` 을 붙이지 않았다. 한 요청은 OASIS 트랜잭션 하나 안에서 퍼사드 → 위임 클래스로 이어진다. `RoleChangedEvent` 의 발행 내용·시점(`saveUserRoleGrp` 루프 뒤, `saveUserRoleGrpCopy` 루프 뒤)도 같다. 인코더는 `new BCryptPasswordEncoder()`(strength 10) 하나만 `PwdWriter` 에 둔다.
  - **로그 범주**: 위임 클래스의 로거도 `CommUserMngService.class` 를 쓴다(`CommUserMngSaveService` 에 일부러 그렇게 두었다). 로그 필터·알림은 고칠 필요가 없다.
- 바꾼 이유: 한 파일 890줄에 조회·저장·비밀번호·SSO 가 섞여 있어 한 action 을 고치려면 전체를 읽어야 했고, bcrypt 호출 등이 중복돼 있었다. 위임 클래스로 나누면 `pwdinit` SSO 일괄 개선(부록 A(2))처럼 한 분기만 고치는 작업의 범위가 작아진다.
- 동작 보존 근거:
  - 1단계 특성 시험(`csa.commUserMng.*` 49건)을 한 줄도 고치지 않고 통과했다. `git diff --stat 6e6f0bf4^ HEAD -- .../test/.../csa/commUserMng` 출력이 비어 있다. 시험 설정(`CommUserMngJpaTestConfig`, `CommUserMngServiceSearchRoleGrpSqliteTest` 의 SqliteConfig)이 `csa.commUserMng` 패키지를 컴포넌트 스캔해 새 빈이 그대로 올라오므로 설정·단언 수정도 없었고, 그래서 이 항목에는 `test(...)` 커밋이 없다.
  - 같은 설정을 쓰는 `SecUserServiceDelete*`·`AuditLogServiceSearch*` 를 함께 돌려 86건 통과.
  - mcm-core 887/887 통과(기준선 868 대비 +19), mcm api+lib 통과(기준선과 같은 건수), `McmCoreArchitectureTest`(ArchUnit) 5/5 — 새 클래스 다섯 개가 슬라이스·이름 규칙에 걸리지 않는다.
  - `oasis-contract-check`(mcm 모듈): ERROR 0 / WARN 0 / INFO 39. BPMN 35개, 진입점 빈 36개 모두 해석(미해석 0). commUserMng 관련 INFO 두 건(`commUserMng.bpmn` 6-C-3, 퍼사드 Map 반환 6-D-2)은 분할 전부터 있던 것이다. 검사기 자기시험 통과.
- 영향 범위: `commUserMngService` 를 부르는 BPMN·화면은 그대로다. 새 클래스 다섯 개가 스프링 빈으로 추가된다. mcm/api·mcm/lib 에는 이 빈들을 띄우는 컨텍스트 시험이 없다. 부록 A(2) 의 `pwdinit` SSO 분기 위치는 `CommUserMngSsoService.resetSsoPwd` 로 바뀌었다(이미 문서에 반영). 클래스 주석의 action 개수(11개)와 실제 public 12개 불일치는 그대로다(부록 A(5)).
- 되돌리는 방법: 24038a95, 1f6d0cb6, 6e6f0bf4 를 역순으로 revert 한다. 뒤 커밋이 앞 커밋의 클래스를 쓰므로 일부만 revert 하지 않는다. 이 분할 뒤에 `CommUserMngQueryService` 를 고친 S6 의 부서명 일괄 조회 커밋(21821142 등)이 얹혀 있으므로, S4 를 되돌리려면 S6 의 해당 부분을 먼저 되돌린다.

## S5. 시드 단계 이동 후속: `MdmMenuSeeder`·`ScreenUsageSchemaArtifacts`·`PERM_ALL` 선언을 `init/seed/` 로
- 커밋:
  - 시험 준비(파일 이름 명시): f3b5288f(mcm-core), 67aef7ac(mdm)
  - 이동과 짝 시험: db39104c↔b57de141(`ScreenUsageSchemaArtifacts`), b16f697b↔3442b992(`MdmMenuSeeder`), cdfefc7f↔870ad847·5147dcf9(`PERM_ALL` 선언)
  - 낡은 안내 문구 정리: b7aef974(main javadoc·주석), e69cd0bb(mdm 시험), 1f0692ed(mcm-core 시험 DisplayName)
  - 게이트: ff6d20cd, f27dddbf, b84fda56, b5a846ba
  - 1b 레인의 시험 입력 선언(참고, 이 레인 커밋 아님): fa6bfec4(mdm/api `mcmDataInitializer`), e08cb0f7(mcm-core `mcmSeedSources`)
- 바뀌기 전(S2 직후): `DataInitializer.java`(979줄) 안에 중첩 클래스 `ScreenUsageSchemaArtifacts`(54줄)·`MdmMenuSeeder`(600줄)와 `seedMcmSecRbac` 안 `PERM_ALL` 의 `allActions` 선언이 있었다. 소스 대조 시험 3개가 이 파일 경로를 직접 열어 문자열을 확인한다는 이유로 옮기지 못했다.
- 바뀐 뒤(모두 `init/seed/`):
  - `ScreenUsageSchemaArtifacts` → `seed/ScreenUsageSchemaArtifacts.java`(58줄)
  - `MdmMenuSeeder` → `seed/MdmMenuSeeder.java`(602줄)
  - `allActions` 선언 → `seed/CoreRbacSeeder.seedCoreRbac()` 안 `PERM_ALL` INSERT 바로 앞. `seedCoreRbac(String allActions)` 의 매개변수를 없앴다. 선언의 토큰·순서·주석은 그대로이고, 문자열을 잇기만 하므로 계산 시점이 바뀌어도 `PERMISSION_ACTION` 값과 SQL 순서가 같다(S2 에서 호출 인자로 앞당겨 계산하던 것을 원래 위치 쪽으로 되돌린 셈).
  - `DataInitializer.java` 979줄 → 275줄. `run()` 호출 순서·구조는 그대로다.
- 소스 대조 시험 3개의 변경(조정 세션 조건부 허가, b9 통지): 폴더 glob 대신 **역할마다 파일 이름 하나를 상수로 명시**하고, 순서는 **한 파일 안에서 단언**한다. 단언 문자열은 바꾸지 않았다.

| 시험 | 상수 → 이동 뒤 읽는 파일 |
|---|---|
| `ScreenUsageOasisContractTest` | `ALL_ACTIONS_SOURCE` → `seed/CoreRbacSeeder.java` |
| `ScreenUsageMssqlDdlTest` | `SCREEN_USAGE_ARTIFACTS_SOURCE` → `seed/ScreenUsageSchemaArtifacts.java`(DDL 상수 3개), `RUN_ORDER_SOURCE` → `DataInitializer.java`(두 호출이 있는지는 각각 확인하고 `initScreenUsageArtifacts();` 가 `createSecMenuFldForSqlite();` 보다 앞인지는 `run()` 이 있는 한 파일 안에서 `isLessThan` 으로 본다) |
| `MdmOasisActionVocabularyTest` | `ALL_ACTIONS_SOURCE` → `seed/CoreRbacSeeder.java`, `MDM_MENU_SEEDER_SOURCE` → `seed/MdmMenuSeeder.java`(`readActions`·`editActions`·`confirmActions`·`matrix`, `seedMdmObjectRbac` 호출 3모양, `metaFeed`·`layoutConfirm` 시드) |

- 바꾼 이유: 시드 하나를 고치려고 `DataInitializer.java` 를 열 때 700줄가량의 메뉴 시드가 함께 있었다. 시험이 파일 이름을 명시하면 어떤 문자열이 어느 파일에 있어야 하는지가 코드에 드러나 다음 이동이 상수 한 줄 수정으로 끝난다.
- 동작 보존 근거:
  - 본문 대조: 원본(`DataInitializer.java` 330~387행·389~978행)에서 들여쓰기 4칸을 걷어 새 파일과 diff 했다. 다른 곳은 package·import·클래스 javadoc, 접근자 `public` 추가(클래스·생성자·`initScreenUsageArtifacts`·`seedMdmCacheMenus`·`seedMdmMenus`), `seedMdmMenus` javadoc 한 줄뿐이고 메서드 본문은 한 글자도 바뀌지 않았다.
  - SQLite 시드 지문·MSSQL SQL 기록 골든 무변경 일치: `DataInitializerSeedFingerprintTest` 2/2(골든 일치), `DataInitializerMssqlSqlCharacterizationTest` 4/4(골든 4개 일치), `DataInitializerLocalAdminUnlockTest` 7/7. `refactor/mcm` 대비 골든 파일 변경 없음.
  - 소스 대조 시험 3개: `ScreenUsageOasisContractTest` 3, `ScreenUsageMssqlDdlTest` 4, `MdmOasisActionVocabularyTest` 15 모두 통과.
  - 뮤테이션 확인(시험이 새 위치의 변조를 실제로 잡는지): 이동 전 준비 단계에서 27건(`allActions` 7건·DDL 참조와 `run()` 호출 6건·mdm 시드 14건, 문자열 한 곳씩 바꿈), 이동 뒤 9건(`CoreRbacSeeder` 3·`ScreenUsageSchemaArtifacts` 2·`DataInitializer` 호출 이름 1·`MdmMenuSeeder` 3)을 돌렸고 **모두 시험이 실패해 잡혔다**(실패하지 않은 뮤테이션 0건, 컴파일 오류가 아니라 단언 실패임을 결과 XML 로 확인, 매번 원본 복구를 `cmp` 로 확인). 대표 항목은 아래와 같다.

| 대상 | 바꾼 것 | 잡은 시험 |
|---|---|---|
| `allActions`(이동 전 `DataInitializer`, 이동 뒤 `CoreRbacSeeder`) | 선언 이름 변경, `overview`·`byScreen`·`byDept`·`byUser`·`unused`·`history`·`handover` 각각 제거 | `permAllContainsStatActions`, mdm `allActions` 시험(`없는 mdm BPMN action [handover]`) |
| DDL 참조 | `CREATE_LOG_TABLE`·`CREATE_DAY_TABLE`·`LOG_INDEXES` 이름 변경 | `dataInitializerUsesDdl` |
| `run()` 호출 | `initScreenUsageArtifacts();`·`createSecMenuFldForSqlite();` 이름 변경, 두 호출 자리 맞바꿈 | `dataInitializerUsesDdl`(순서 단언 포함) |
| mdm 메뉴 시드 | `readActions`·`editActions`·`confirmActions`·`matrix` 선언·값, `seedMdmObjectRbac` 3모양 각 1개 제거, `metaFeed`·`layoutConfirm` 변경 | mdm 어휘 시험의 해당 메서드 |

  - 모듈 전체(이 작업 단독 집계): mcm-core 868/868, mcm 61/61(기준선과 같음), `McmCoreArchitectureTest` 5/5, mdm `MdmOasisActionVocabularyTest` 15/15 통과.
- 영향 범위:
  - 호출부·BPMN·설정 변경 없음. `DataInitializer` 공개 생성자·`run()`·reflection 필드·`unlockLocalAdmin()` 시그니처는 그대로다.
  - **루트 `.dflow-gates` 교차 입력 게이트를 옮긴 파일에 맞췄다**(ff6d20cd, f27dddbf, b84fda56, b5a846ba, 조정 세션 승인). `seed/MdmMenuSeeder.java`·`seed/CoreRbacSeeder.java`·`seed/ScreenUsageSchemaArtifacts.java`·`DataInitializer.java` 가 바뀌면 이 파일들을 읽는 `:mdm:api:test`·`:mcm-core:test` 도 돌게 줄을 걸었고, 게이트 37행(`DataInitializer.java`)에 `:mdm:api:test` 를 더했다.
  - **1b 레인이 시험 입력 선언을 더했다**: mdm/api 에 `mcmDataInitializer`(fa6bfec4), mcm-core 에 `mcmSeedSources`(e08cb0f7). `build.gradle` 은 이 레인의 금지 파일이라 이 레인에서는 고치지 않았다. 이 선언이 없으면 게이트 밖에서 `gradle` 을 직접 돌릴 때 `seed/` 파일만 바뀐 경우 `:mdm:api:test` 가 `UP-TO-DATE` 로 건너뛰어질 수 있었다(리뷰에서 재현).
  - **1b 2차 대기**: (a) `ScreenUsageOasisContractTest` 가 읽는 BPMN 2개(`services/audit/screenUsage.bpmn`·`services/csa/screenUsageStat.bpmn`)를 mcm-core 입력에 더하는 일과 그 게이트 줄(43행보다 위), (b) mdm 입력 `mcmDataInitializer` 에서 `DataInitializer.java` 를 빼는 일. `MdmOasisActionVocabularyTest` 는 이제 `DataInitializer.java` 를 읽지 않는다. (b) 를 하면 게이트 37행의 `:mdm:api:test` 와 30행 주석도 같이 줄인다. 그 전에는 불필요한 재실행이 있을 뿐 시험을 건너뛰는 일은 없다(재리뷰 minor).
  - 가이드 문서 `docs/guide/BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md` 등이 `DataInitializer.java` 위치를 적은 곳은 S2 의 후속 항목 그대로다. 시드 위치 안내 문구는 b7aef974 가 ADR-0003·표준 04 §13-3·mcm README 에서 고쳤다.
- 되돌리는 방법: 이동 커밋(db39104c, b16f697b, cdfefc7f)과 짝 test 커밋(b57de141, 3442b992, 870ad847·5147dcf9)을 같이 revert 한다. 시험 준비 커밋(f3b5288f, 67aef7ac)은 상수 이름만 정한 것이라 남겨 둬도 되고, 이동을 되돌리면 상수가 가리키는 파일 이름만 `DataInitializer.java` 로 되돌린다. **이동 커밋과 짝 test 커밋 사이 중간 커밋은 단독으로 시험이 실패하므로 bisect 때 skip 한다(db39104c↔b57de141, b16f697b↔3442b992, cdfefc7f↔870ad847·5147dcf9).** 시험을 먼저 두 파일 모두에서 찾게 바꾼 뒤 이동하는 순서로 나누면 막을 수 있었으나, 시험 변경을 `test(...)` 커밋으로 따로 두라는 규칙을 지켰다. dev 에는 merge 커밋으로 들어가므로 first-parent 기준으로는 모두 녹색이다.

## S6. 1번 N+1·전수 로드 정리와 공개 API 확장
- 커밋(perf·fix): 21821142(부서명), 6e5eb813(매핑 벌크 삭제), 8783e933(감사 조회 page·size), 1ad624df(감사 조회 오프셋 넘침·int 범위 밖), c9a2f7ee(`flushAutomatically` 제거, fix), ba7353f5·944faa52·ab3ed6d0(알려진 차이 문서·javadoc), da78ef16(javadoc 전제). 시험: b8bd452a(SQL 수 근거), fdf1e0d9(SQL 수 시험 전제 단언), 2c1d3e39(auto-flush 순서 고정)
- 바뀌기 전:
  - `searchCmUser` 가 사용자 행마다 `deptInfoRepository.findById(deptCd)` 를 불렀다. 없는 부서는 캐시하지 않아 그런 행마다 다시 조회했다.
  - 사용자 삭제('D' 분기)가 사용자마다 매핑 ID JPQL SELECT 뒤 매핑마다 `deleteById` 를 했다.
  - `AuditLogService.searchByActor` 는 전수 로드(정렬 없는 `findAll` 포함)뿐이었다.
- 바뀐 뒤:
  - **부서명 일괄 조회**: `CommUserMngQueryService.deptNamesOf(rows)` 가 null·공백이 아닌 `deptCd` 를 `LinkedHashSet` 에 모아 `deptInfoRepository.findAllById` 를 한 번 부르고, DB 가 돌려준 `DEPT_CD` 를 키(정확 일치)로 이름을 붙인다. 없는 부서는 `DEPT_NM` null, 비활성 부서도 이름이 붙는다(`USE_TP` 를 거르지 않음). 행 순서는 그대로이고, 붙일 부서코드가 하나도 없으면 부서 표를 읽지 않는다.
  - **매핑 벌크 삭제**: `SecUserMappingRepository.bulkDeleteByUserId(String userId)`(`@Modifying`, JPQL `DELETE FROM SecUserMapping m WHERE m.userId = :userId`, 반환 `int`)를 추가하고 `SecUserService.doSaveUsers` 의 'D' 분기가 `findRoleGroupIdsByUserId` + 건별 `deleteById` 대신 이를 한 번 부른다. 생성자 시그니처는 그대로다. `SecUserMapping` 에 `@PreRemove`·cascade·연관이 없고 `McmAuditListener` 가 `@PrePersist`·`@PreUpdate` 만 다뤄 건별 삭제와 DB 결과가 같다. `clearAutomatically` 는 쓰지 않았다(`secUser.bpmn` 의 `saveTask` 는 바로 종료로 가서 삭제 뒤 같은 트랜잭션에서 매핑을 다시 읽는 곳이 없고, 비우면 같은 영속성 단위의 다른 관리 엔티티까지 분리되기 때문).
  - **감사 조회 page·size(공개 API 확장)**: `AuditLogService.searchByActor` 가 `page`(0부터)·`size` 선택 인자를 받는다. 없거나 null·공백이면 **이전과 완전히 같다**(필터 경로는 `OrderByOccurredAtDesc`, 필터 없음은 `findAll`, action 형변환 시점도 같다). 하나라도 있으면 `occurredAt` 내림차순·`auditId` 내림차순(같은 시각 사이 중복·누락 없음)으로 `Pageable` 조회하고 `size` 상한은 2000, `page` 만 오면 `size` 2000, `size` 만 오면 `page` 0 이다. 숫자와 숫자 문자열(앞뒤 공백 허용)을 받고, 음수 `page`·0 이하 `size`·숫자가 아님·int 범위 밖 정수·오프셋 넘침은 `BusinessException(ErrorCode.INVALID_VALUE)` 로 거부한다(오프셋 넘침·int 범위 밖은 1ad624df). `searchByPeriod` 는 그대로다.
  - **`AuditLogRepository` 새 메서드**(모두 `List` 반환이라 COUNT 쿼리 없음, 정렬·범위는 `Pageable`): `findByActorUserId(String, Pageable)`, `findByAction(String, Pageable)`, `findPage(Pageable)`(`SELECT a FROM AuditLog a`). 기존 메서드는 그대로다.
- 바꾼 이유: 부서명은 행 수만큼, 삭제는 사용자×매핑 수만큼 쿼리가 나갔고, 감사 조회는 건수와 무관하게 전수 로드였다. 수치는 `perf-mcm.md` P1·P2.
- 동작 보존 근거:
  - 1단계 특성 시험(`CommUserMngService*Test`·`SecUserServiceDeleteUsersTest`·`AuditLogService*Test`)을 고치지 않고 통과. 성능 근거 시험 `CommUserMngServiceSearchSqlCountTest`·`SecUserServiceDeleteSqlCountTest` 는 변경 전 코드에서 의도대로 실패(부서 표 SELECT 4 → 1, 매핑 DELETE 6 → 2)했다.
  - `AuditLogServiceSearchByActorPagingTest`: H2 로 페이지 내용·필터 우선순위·같은 시각 정렬·문자열 인자·오류를, mock 저장소로 `Pageable` 2000 상한·정렬과 page·size 가 없을 때 기존 메서드를 부르는지를 고정한다.
  - 매핑 삭제 순서: `SecUserServiceDeleteAutoFlushTest`·2c1d3e39 가 같은 트랜잭션의 미뤄 둔 매핑 INSERT 가 플래그 없이도 벌크 DELETE 앞에 나간다는 것과 검증 오류 시 롤백(`validationErrorRollsBackMappingDeletion`)을 고정한다.
- 영향 범위:
  - **MSSQL 대소문자·뒤 공백 무시 비교 주의(부서명)**: 맵 키가 요청 키가 아니라 DB 가 돌려준 `DEPT_CD` 이므로, 사용자 표 `DEPT_CD` 가 부서 마스터와 대소문자·뒤 공백만 다르면 전에는 `findById` 가 요청 키로 이름을 붙였으나 지금은 `DEPT_NM` 이 null 이 된다. Oracle(VARCHAR2)·PostgreSQL·SQLite·H2 는 차이 없고 저장소 DDL 에 CHAR 형 `DEPT_CD`·NOCASE 콜레이션은 없다. 대소문자 보정은 구분하는 DB 에서 결과를 바꾸므로 넣지 않았다. 또 distinct 부서코드가 2,000개 안팎을 넘으면 `IN` 목록이 MSSQL 바인드 파라미터 한도 2100 에 닿을 수 있다(Oracle 1000 한도는 Hibernate 가 나눈다. 이론적 위험, `deptNamesOf` javadoc 에 전제로 적음, da78ef16).
  - **매핑 벌크 삭제의 `flushAutomatically` 와 VER·오류 시점**: 처음 커밋 6e5eb813 은 `flushAutomatically=true` 를 붙였으나 첫 'D' 행에서 계정(`TB_SEC_USER`)까지 앞당겨 flush 해 VER 증가 횟수가 옛 경로와 달라지고 DB 오류가 행별 검증 오류보다 먼저 나서 c9a2f7ee 에서 뺐다(Hibernate 7.0.5·7.2.12 모두 벌크 DML 실행 첫머리에서 영향 표의 미뤄 둔 변경을 auto-flush 하므로 순서는 플래그 없이 지켜진다). c9a2f7ee 제목의 '옛 경로와 같게' 는 **'D' 행이 하나인 요청에만** 맞는다. 'D' 행이 둘 이상이고 앞 'D' 사용자에게 매핑이 있었다면, 옛 경로는 남은 `em.remove` 때문에 다음 'D' 행에서 계정까지 전체 flush 를 했으나 지금은 계정 변경이 커밋 때(또는 뒤 'C' 행의 `existsById` 가 계정 표 flush 를 일으키는 시점) 나간다. 그래서 'U' 행 뒤에 'D' 행이 n 개(n ≥ 2) 오면 그 계정의 VER 이 옛 +2 대신 n+1 이고 `U_AT` 가 다르며, 계정 INSERT·UPDATE·DELETE 의 DB 오류 시점이 `saveUsers` 안에서 커밋 때로 늦어진다(944faa52·ab3ed6d0 과 `bulkDeleteByUserId` javadoc). 'U' 1행 + 'D' 1행의 VER +2 는 Hibernate 가 '필요 없음' 으로 끝나는 auto-flush 검사에서도 `@PreUpdate` 를 부르는 원래 동작이다. 현재 `src/frontend` 에서 이 save 를 부르는 화면이 없고 시험은 계정 저장소가 메모리 가짜라 이 차이를 잡지 못한다(실제 JPA 계정 저장소 시험은 호출 화면이 생길 때 더한다). 미리 읽어 둔 매핑 엔티티가 있으면 벌크 삭제 뒤 같은 PK 로 다시 save 할 때 `StaleStateException` 이 나거나(새 인스턴스), 읽어 둔 관리 인스턴스를 그대로 save 하면 SQL 이 나가지 않아 행이 조용히 사라지므로 새 호출부는 `em.clear`·detach 를 판단해야 한다(javadoc).
  - 감사 조회: `src/frontend` 에서 `auditLog` 를 부르는 곳은 0건이라 지금 page·size 를 보내는 호출자는 없다. 기존 화면 동작은 그대로다. 같은 인자가 없으면 이전과 같다.
  - 시험 설정: `CommUserMngJpaTestConfig` 에 `SqlStatementCounter` 를 `statement_inspector` 로 등록했다(SQL 은 바꾸지 않음). 전역 싱글턴이라 한 JVM 안에서 시험이 순차로 돈다는 전제다. 시험 전제(JDBC 배치 꺼짐·순차)는 fdf1e0d9 가 단언한다.
  - 레인 간: 메뉴 카탈로그 작업(S3)이 같은 `SecUserService.java`(생성자 13 → 12인자)·`SecUserServiceDeleteUsersTest.java`·이 항목의 `SecUserServiceDeleteSqlCountTest.java`(옛 13인자 생성자 호출)를 고친다. 나중에 들어가는 쪽이 12인자로 맞춘다.
- 되돌리는 방법: 항목별로 독립이다. 부서명은 21821142(와 javadoc 커밋), 매핑 벌크 삭제는 6e5eb813·c9a2f7ee·2c1d3e39 와 문서 커밋, 감사 조회는 8783e933·1ad624df 를 역순으로 revert 한다. 시험 b8bd452a 는 되돌린 항목의 SQL 수 단언이 실패하므로 같이 되돌린다.

## 앞으로 들어갈 항목

- S3 메뉴 카탈로그 캐시: 진행 중, 별도 머지

## 부록 A. 조사 보고(구조 변경 아님)

코드를 바꾸지 않은 조사 결과다. 조치 여부는 별도 결정이 필요하다.

### (1) `SecUserService.searchUsers` 죽은 경로 후보
- `searchUsers`(`SecUserService.java:137-145`)는 `userAccountRepository.findAll()` 로 전수 로드한 뒤 stream 으로 거른다. BPMN `secUser.bpmn` 의 `searchTask` 에서만 호출된다.
- 실제 구현은 `@Primary` 인 `McmSecUserRepository` 이고 그 `findAll()`(:250)이 빈 리스트를 돌려준다. 따라서 이 경로는 항상 빈 결과로 보인다.
- 사용자 관리 화면 `commUserMng` 와 기능이 겹친다.
- 대상 테이블이 `TB_SEC_USER` 인지 `TB_MCM_SEC_USER` 인지 선택이 정해지지 않았다.
- 이번에 바꾸지 않았다. 지우거나 살리는 결정은 위 테이블 선택과 함께 한다.

### (2) pwdinit SSO 일괄 분기 개선안(bcrypt 비용 불변)
- 현재(퍼사드 `CommUserMngService.pwdinit` 의 `SSO_RESET_FLAG="Y"` 분기 → `CommUserMngSsoService.resetSsoPwd`, 43-63): 행마다 `bcrypt.encode(userId + 사번)`(`CommUserMngPwdWriter.encode`, 인코더 하나) → `updateSsoPwd` 단건 UPDATE → 영향 0건이면 `findById` 후 `save`(`CommUserMngPwdWriter.upsertUserPwd`). 한 요청이 OASIS 트랜잭션 하나라 중간 실패면 전체 롤백이다. 행 수 상한이 없다(필터 결과 수십~수천 행).
- 개선안
  1. 해시 계산 병렬화: 해시 N개를 먼저 병렬(스레드 풀)로 계산하고 DB 쓰기는 모아서 한다. cost·salt 는 그대로라 보안 속성이 같다. 같은 JVM 의 다른 요청 지연이 커질 수 있다. 병목은 행당 bcrypt(약 50~100ms)라서 이 안의 효과가 가장 크다.
  2. 해시 재사용은 권하지 않는다. 비밀번호가 `userId+사번` 이라 사용자마다 평문이 달라 효과가 없고, 재사용하면 같은 해시(같은 salt)가 되어 한 해시가 새면 전원이 같은 비밀번호임이 드러난다.
  3. DB 왕복: 해시를 모은 뒤 JDBC batch 로 UPDATE 한다(설정에 `batch_size` 지정 없음). `findAllById(userIds)` 로 PWD 행이 있는 ID 를 미리 조회해 UPDATE 대상과 INSERT 대상으로 나누면 행마다의 영향 건수 확인이 사라진다. 해시 계산 시간은 줄지 않는다.
- 이번에는 구현하지 않는다. 현재 동작은 `CommUserMngServiceSsoTest`·`PasswordTest` 로 고정돼 있다.

### (3) `McmSecUserRepository` 중복 판정: 합치면 안 된다
- 대상: `mcm/lib` `McmSecUserRepository`(cactus `SecUserRepository` 구현, 네이티브 SQL, `@Primary`)와 mcm-core `SecUserRepository`(Spring Data JPQL, `McmSecUser` 엔티티).
- 겹치는 것은 같은 `TB_MCM_SEC_USER` 를 다룬다는 점과 잠금 해제 SQL(`unlockUser` 와 `updateReRegUser`), 단건 조회 정도다.
- 합치면 안 되는 이유
  - 의존 방향: mcm 은 mcm-core 에 의존하고, mcm-core 는 cactus 를 import 할 수 없다(ArchUnit 규칙). cactus 인터페이스를 구현한 쪽을 mcm-core 로 내릴 수 없다. 반대로 올리면 `CommUserMngService` 등이 끊긴다.
  - 계약: 한쪽은 `JpaRepository<cactus.SecUser>`, 다른 쪽은 `JpaRepository<McmSecUser>` 라 엔티티 타입이 달라 한 인터페이스로 합칠 수 없다.
  - `@Primary` 는 cactus 기본 매핑(`TB_SEC_USER`)을 덮어쓰는 교체 지점이라 합치면 이 교체가 깨진다. 빈 이름·`@EntityScan` 단일 소유 규칙도 다시 맞춰야 한다.
- 줄일 수 있는 것은 잠금 해제 SQL 정도이고 효과가 작다.
- 별도 확인점: 삭제(`updateEndActiveDate`)와 로그인 잠금(`lockUser`)이 모두 `USE_TP='N'` 이라 둘을 `USE_TP` 만으로 구별할 수 없다. 두 EntityManagerFactory 가 같은 `default` 유닛인지는 확인하지 못했다.

### (4) mcm 이 mdm 용 메뉴·권한을 시드하는 위치
- mcm 은 mdm 스키마·테이블에 쓰지 않는다. mcm 안에 `TB_MDM`·`MDMAPUSER` 참조와 mdm gradle 의존이 없다. 실제로는 mcm 소유 테이블(`TB_MCM_SEC_*`)에 mdm 모듈용 메뉴·권한·역할 행(`SYSTEM_CODE='mdm'` OBJ, `dma`~`dme` 폴더, MDM 역할·권한)을 넣는다.
- 위치는 모두 `init/seed/MdmMenuSeeder.java`(S2 에서는 `DataInitializer.java` 안 중첩 클래스였고 S5 에서 파일로 옮김)다. 쓰기 호출 수는 호출 지점 기준이다.

| 메서드 | 대상 테이블 | 쓰기 호출 |
|---|---|---|
| `seedMdmMenus` | FLD 6, OBJ 5, MENU 4, ROLE_MAPPING, `seedMdmObjectRbac` | 26 |
| `migrateMdmSampleGroupToDma` | MENU·FLD·USER_FAVORITE(UPDATE) | 5 |
| `seedMdmDomainMngMenu` | OBJ·MENU·ROLE_MAPPING·RBAC | 4 |
| `seedMdmCodeItemEditMenu` | 같음 | 4 |
| `seedMdmCodeCateEditObject` | OBJ·ROLE_MAPPING·RBAC | 3 |
| `removeMergedMdmCodeMenus` | USER_FAVORITE·MENU(DELETE) | 2 |
| `seedMdmCodeConfirmMenu` | OBJ·MENU·ROLE_MAPPING·RBAC | 4 |
| `seedMdmLayoutMenus` | OBJ 2·MENU 2·ROLE_MAPPING·RBAC | 6 |
| `seedMdmLayoutConfirmMenu` | OBJ·MENU·ROLE_MAPPING·RBAC×3 | 6 |
| `seedMdmDataMngMenus` | OBJ 3·MENU·ROLE_MAPPING·RBAC | 6 |
| `seedMdmDataItemMenus` | OBJ 2·MENU·UPDATE·ROLE_MAPPING·RBAC | 6 |
| `removeMergedMdmDataMenus` | USER_FAVORITE·MENU(DELETE) | 2 |
| `seedMdmDataCsvUploadPopObject` | OBJ·ROLE_MAPPING·RBAC | 3 |
| `seedMdmRuleMenus` | OBJ·MENU·ROLE_MAPPING·RBAC | 4 |
| `seedMdmRuleConfirmMenu` | 같음 | 4 |
| `seedMdmRuleSetMenus` | 같음 | 4 |
| `seedMdmRuleSetConfirmMenu` | 같음 | 4 |
| `seedMdmRbac` | ROLE 2·ROLEGROUP 2·ROLEGROUP_MAPPING 2·PERM 3 | 6 |
| `seedMdmObjectRbac` | ROLE_MAPPING(MDM 역할×2) | 1 |
| `seedMdmCacheMenus` 중 `metaFeed` | OBJ·ROLE_MAPPING | 2(4 중) |

- 세는 기준: 위 표의 mdm 전용 메서드 안 insert·seed 호출 줄 수(루프 1회를 1로)는 99다. `seedMdmObjectRbac` 본문과 `metaFeed`·relocate 부분을 더하면 약 104다. 대소문자 무시 `mdm` 포함 줄은 132(주석 제외)·179(주석 포함), 따옴표 안 `dma/dmb/dmc/dmd/dme/mdm` 리터럴 줄은 73이다. 첫 부팅 때 실제로 들어가는 행은 약 140이다(폴더 6, OBJ 27, MENU leaf 19, SYSADMIN ROLE_MAPPING 27, MDM 역할 매트릭스 52, ROLE 2, ROLEGROUP 2, ROLEGROUP_MAPPING 2, PERM 3).
- 지시에 있던 '117곳'은 위 어느 기준으로도 재현되지 않았다. 원 출처의 세는 기준 확인이 필요하다. 기준으로는 호출 지점 99와 첫 부팅 행 약 140 중 하나를 쓰기를 권한다.

### (5) 특성 시험이 찾은 결함 의심(고치지 않음)
현재 동작대로 고정했고 시험 주석에도 적었다. 고치려면 `fix(...)` 커밋으로 따로 한다.
- `saveCmUser` 의 updated 분기: 행에 없는 키를 null 로 덮어쓴다. `SecUserService` U 분기는 `containsKey` 로 걸러 이렇게 하지 않는다.
- 같은 날 처리한 이력이 서로 덮어써진다: `USER_HIS` 는 (USER_ID, ACTIVE_DT), `ROLL_HIS` 는 날짜가 든 복합키라 같은 날 두 번째 처리가 첫 이력을 지운다.
- `pwdinit`: 단건·SSO 두 분기 모두 `TB_MCM_SEC_USER` 에 없는 USER_ID 도 비밀번호 행을 만들고 성공으로 센다. 단건 분기는 이때 `INIT_PWD` 까지 돌려준다.
- `reRegCmUser`: 갱신이 0건이면 예외 없이 cnt 0 만 돌려준다. As-Is 는 `UserException` 을 던졌다.
- 삭제 분기: END_ACTIVE_DATE 가 없으면 자정이 아니라 호출 시각(now())으로 마감하고, 9999-12-31 이 들어오면 오늘 00:00 으로 마감한다.
- `searchRoleGrp`: SQLite 가 아닌 분기가 MSSQL 전용 함수(GETDATE·ISNULL·DATEADD)를 쓴다. 운영 DB 가 Oracle 또는 PostgreSQL 이면 실패할 것으로 보인다.
- `SecUserService` D 분기: 없는 사용자를 지워도 성공 건수로 센다.
- `AuditLogService.searchByActor`: actorUserId 와 action 이 둘 다 오면 AND 로 묶지 않고 actorUserId 만 적용한다. 요청이 null 이면 `NullPointerException`, 값이 문자열이 아니면 `ClassCastException` 이 난다. 필터가 없을 때 쓰는 `findAll` 은 정렬이 없다.
- `CommUserMngService` 클래스 주석은 action 이 11개라고 하지만 실제 public 메서드는 12개다(`searchDeptLov` 가 뒤늦게 추가됨).
- `McmValues.toIntOrNull`(S1): int 범위를 넘는 Number 를 `intValue` 로 조용히 잘라 쓴다(4294967297L 이 1). 같은 값을 문자열로 주면 null 이라 두 경우가 다르게 처리된다. 원본에서 이어받은 동작이다.

### (6) `auditLog.bpmn` 게이트웨이의 `search` 분기와 `searchByActor` 의 action 필터 충돌 의심(확인 안 됨)
- `auditLog.bpmn` 의 게이트웨이는 `input=action` 으로 분기하고 분기값이 `search` 다. OASIS 가 요청 Map 을 그대로 `searchByActor` 에 넘기면 요청의 `action` 키가 `search` 라서, 필터 없이 부른 호출도 `action='search'` 로 걸러져 0건이 될 수 있다.
- OASIS 바인딩을 열어 확인하지 못했다. 화면 호출처는 0건이라 지금 드러나는 증상은 없다. `oasis-contract-check` 나 통합 시험으로 확인할 일이다. 이번에 바꾸지 않았다(S6 의 page·size 와 무관).
