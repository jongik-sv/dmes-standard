# mcm 레인 구조 변경 기록

레인은 mcm-core·mcm(`src/backend/mcm-core`, `src/backend/mcm`), 브랜치는 `refactor/mcm`, 기준 태그는 `refactor-2026-10-base`(b557ccbd)다.
이 문서는 README.md §6.1 형식에 따라 이 레인이 머지한 구조 변경(S)을 적는다. 구조 변경이 아닌 조사 결과는 부록 A 에 둔다. 성능 수치는 `perf-mcm.md` 에 둔다.
시험만 추가한 커밋은 S 항목으로 만들지 않고 해당 S 항목의 동작 보존 근거에 넣었다.

## 이번 문서에 든 항목

| 번호 | 제목 | 머지 |
|---|---|---|
| S1 | 복제 값 변환 유틸을 `common.util.McmValues` 로 통합 | 4dd51e42 |
| S2 | `DataInitializer` 를 `init.seed` 단계 클래스로 분할 | a0a2e4d8, d7e5bf94(시험) |
| S3(예정) | 메뉴 카탈로그 캐시 | 진행 예정 |
| S4(예정) | `CommUserMngService` 분할 | 진행 예정 |
| 1번 N+1 정리 | 부서명 조회·사용자 삭제 매핑 삭제 | 진행 예정 |

사용자 관리·삭제·감사 조회 특성 시험(머지 f52d471d)은 S3·S4·N+1 정리의 동작 보존 근거로 쓰려고 먼저 깐 것이라 S 항목이 없다. 내용은 부록 A(5)에 있다.

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
  - 제외한 파일: 위젯 패키지 `widget/admin/service/CommWidgetMngService`(blankToNull 이 trim 에 더해 리터럴 "null" 도 null 로 바꾸는 다른 변형), 화면 사용 통계 패키지 `screenusage/service/ScreenUsageStatSupport`, `sample` 패키지의 `SampleMasterCodeService`(대상 이름 정의 없음). 위젯·화면 사용 통계는 다른 기능 소유 패키지라 이번 범위에서 뺐다. 조사로 확인한 Sample 계열 서비스는 이 1개이며 지시문의 "3개"와는 차이가 있다.
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
  DataInitializer.java        979줄  run() 순서 지정 + 시험이 읽는 중첩 클래스 2개
    ├ (바깥 클래스)           324줄
    ├ ScreenUsageSchemaArtifacts (중첩)  54줄
    └ MdmMenuSeeder (중첩)             600줄
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
- 중첩 클래스로 남은 이유: `MdmMenuSeeder`·`ScreenUsageSchemaArtifacts`·`allActions` 선언은 다른 모듈 시험 3개가 `DataInitializer.java` 를 경로로 직접 열어 소스 문자열을 확인한다. 이 시험들은 이 레인이 고칠 수 없는 위치에 있어 파일을 옮기지 않았다.

| 시험 | 위치 | 소스에서 확인하는 문자열 |
|---|---|---|
| `ScreenUsageOasisContractTest` | mcm-core screenusage | `String allActions = String.join(",",` 선언 |
| `ScreenUsageMssqlDdlTest` | mcm-core screenusage.schema | `ScreenUsageMssqlDdl` 상수 3개, `initScreenUsageArtifacts();` 가 `createSecMenuFldForSqlite();` 보다 앞에 있는지 |
| `MdmOasisActionVocabularyTest` | mdm/api | `allActions`, `readActions`·`editActions` 선언, `seedMdmObjectRbac(...)` 호출 3모양, `insertMcmSecObjIfAbsent("metaFeed", ` |

  후속 제안: 승인을 받아 세 시험이 `init/**/*.java` 를 읽게 고치면 두 중첩 클래스를 `seed/` 로 파일만 옮길 수 있다(둘 다 이미 `SeedSupport` 를 상속).
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

## 앞으로 들어갈 항목

- S3(예정) 메뉴 카탈로그 캐시: 진행 예정
- S4(예정) `CommUserMngService` 분할: 진행 예정
- 1번 N+1 정리: 진행 예정

## 부록 A. 조사 보고(구조 변경 아님)

코드를 바꾸지 않은 조사 결과다. 조치 여부는 별도 결정이 필요하다.

### (1) `SecUserService.searchUsers` 죽은 경로 후보
- `searchUsers`(`SecUserService.java:137-145`)는 `userAccountRepository.findAll()` 로 전수 로드한 뒤 stream 으로 거른다. BPMN `secUser.bpmn` 의 `searchTask` 에서만 호출된다.
- 실제 구현은 `@Primary` 인 `McmSecUserRepository` 이고 그 `findAll()`(:250)이 빈 리스트를 돌려준다. 따라서 이 경로는 항상 빈 결과로 보인다.
- 사용자 관리 화면 `commUserMng` 와 기능이 겹친다.
- 대상 테이블이 `TB_SEC_USER` 인지 `TB_MCM_SEC_USER` 인지 선택이 정해지지 않았다.
- 이번에 바꾸지 않았다. 지우거나 살리는 결정은 위 테이블 선택과 함께 한다.

### (2) pwdinit SSO 일괄 분기 개선안(bcrypt 비용 불변)
- 현재(`CommUserMngService.pwdinit`, 616-632): 행마다 `bcrypt.encode(userId + 사번)` → `updateSsoPwd` 단건 UPDATE → 영향 0건이면 `findById` 후 `save`. 한 요청이 OASIS 트랜잭션 하나라 중간 실패면 전체 롤백이다. 행 수 상한이 없다(필터 결과 수십~수천 행).
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
- 위치는 모두 `DataInitializer.java` 안 중첩 클래스 `MdmMenuSeeder`(S2 참조)다. 쓰기 호출 수는 호출 지점 기준이다.

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
