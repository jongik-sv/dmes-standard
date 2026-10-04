package com.dongkuk.dmes.mcm.init;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.caravan.console.host.AppHostJpaRepository;
import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigJpaRepository;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.init.seed.CaravanMetaSeeder;
import com.dongkuk.dmes.mcm.init.seed.CoreRbacSeeder;
import com.dongkuk.dmes.mcm.init.seed.McmMenuSeeder;
import com.dongkuk.dmes.mcm.init.seed.MdmMenuSeeder;
import com.dongkuk.dmes.mcm.init.seed.MenuFinalizer;
import com.dongkuk.dmes.mcm.init.seed.ModuleMenuSeeder;
import com.dongkuk.dmes.mcm.init.seed.RuleMasterSampleSeeder;
import com.dongkuk.dmes.mcm.init.seed.SchemaArtifactsMssql;
import com.dongkuk.dmes.mcm.init.seed.SchemaArtifactsSqlite;
import com.dongkuk.dmes.mcm.init.seed.ScreenUsageSchemaArtifacts;
import com.dongkuk.dmes.mcm.init.seed.SeedSupport;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 애플리케이션 시작 시 SQLite에 초기 데이터를 삽입한다.
 *
 * <p>2026-10-04 분할 — 이 클래스는 단계의 순서만 정하고, DDL·시드 본문은 단계 클래스가 갖는다.
 * {@code com.dongkuk.dmes.mcm.init.seed} 의 SchemaArtifactsMssql·SchemaArtifactsSqlite·CaravanMetaSeeder·
 * RuleMasterSampleSeeder·CoreRbacSeeder·McmMenuSeeder·MdmMenuSeeder·ModuleMenuSeeder·MenuFinalizer·
 * ScreenUsageSchemaArtifacts 다. 단계 클래스는 빈이 아니다. {@link #run} 이 방언을 판정한 뒤 만든
 * {@link SeedSupport} 를 받아 쓰고, 트랜잭션은 {@link #run} 의 {@code @Transactional} 하나다.
 *
 * <p>다른 모듈의 소스 대조 시험이 시드 소스를 문자열로 읽는다. PERM_ALL allActions 선언은 CoreRbacSeeder, mdm 메뉴·권한
 * 시드는 MdmMenuSeeder, 화면 사용 통계 DDL 사용은 ScreenUsageSchemaArtifacts 파일에서 찾는다.
 * mcm-core ScreenUsageMssqlDdlTest 는 {@link #run} 의 화면 사용 통계 단계와 SQLite 보강 단계의 호출 순서를 이 파일에서 본다.
 */
@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final PasswordEncoder passwordEncoder;
    // AppHostEntity 는 cactus secondary EMF (caravan.db / CARAVANUSER) 매핑 — v4 결정 #14 (2026-05-13).
    // Repository 는 ConsoleSecondaryJpaConfig 가 secondary EMF 로 wiring 하므로 자동으로 secondary DataSource 사용.
    @Autowired(required = false)
    private AppHostJpaRepository appHostJpaRepository;

    // ConsoleCaravanHubConfigEntity 도 동일 — secondary EMF 매핑. v4 Phase 4-C (2026-05-13).
    @Autowired(required = false)
    private ConsoleCaravanHubConfigJpaRepository consoleCaravanHubConfigJpaRepository;

    // mcm 의 default EMF 와 caravan 의 caravanEntityManagerFactory 가 공존하는 다중 EMF 환경.
    // SharedEntityManager 자동 주입 시 EMF 후보가 2개라 충돌 — unitName 명시로 default EMF 만 사용.
    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    // 2026-06-04 사용자 지시 — 메뉴 FULL_SEQ 7자리 인코딩 기동 시 강제 재계산용 (mcm-core read-only 어댑터).
    @Autowired
    private SecMenuNativeRepository secMenuNativeRepository;

    // 업무기준(cmb/masterRuleList) 샘플 시드용 — primary EMF (mcm.db / MCAAPUSER). local/mssql/dev tier 한정.
    @Autowired(required = false)
    private RuleMasterRepository ruleMasterRepository;

    // 2026-10-04 — 시드 끝에 MenuChangedEvent(SEED) 를 내 메뉴 카탈로그(MenuCatalog)를 비운다. ApplicationRunner 는 웹 서버가
    //   뜬 뒤에 돌므로 시드 커밋 전에 들어온 내 메뉴 요청이 시드 전 목록을 TTL 동안 남길 수 있기 때문이다. 필드 주입·required=false
    //   는 생성자로 만드는 기존 시험(지문·특성화·admin 잠금 해제)이 그대로 돌게 하기 위해서다(null 이면 내지 않는다).
    @Autowired(required = false)
    private ApplicationEventPublisher eventPublisher;

    private final Environment environment;

    // 읽기 전용 기동 스위치 — false 면 run() 전체 skip (스키마/시드 INSERT·UPDATE·ALTER 미수행).
    // 기본 true(기존 동작). 데이터 보존 기동: --dmes.init.enabled=false (+ ddl-auto=none).
    @Value("${dmes.init.enabled:true}")
    private boolean initEnabled;

    // 런타임 DB 방언 — SQLite(개발자 Mac local 단독 부팅) 여부. run() 초입 1회 감지.
    // true 면 MSSQL 전용 schema artifacts(sys.objects / SELECT INTO / CREATE SCHEMA) skip + 시드 SQL 방언 흡수.
    // false(MSSQL/dev/prod) 면 기존 동작 그대로 — 동료 환경 무영향.
    private boolean sqliteDialect;

    public DataInitializer(PasswordEncoder passwordEncoder, Environment environment) {
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!initEnabled) {
            log.info("[DataInitializer] dmes.init.enabled=false — 초기 시드/스키마 적재 전체 skip (읽기 전용 기동, 데이터 무수정).");
            return;
        }
        this.sqliteDialect = detectSqliteDialect();
        if (sqliteDialect) {
            log.info("[DataInitializer] SQLite(local 단독) 감지 — MSSQL 전용 schema artifacts skip, 시드 SQL 방언 흡수 모드 (동료 MSSQL 무영향).");
        }
        // 방언 판정 뒤 시드 문맥을 한 번 만들어 모든 단계에 넘긴다 (단계 클래스는 빈이 아니다 — 트랜잭션은 이 메서드 하나).
        SeedSupport support = new SeedSupport(entityManager, sqliteDialect);
        SchemaArtifactsMssql mssqlSchema = new SchemaArtifactsMssql(support);
        SchemaArtifactsSqlite sqliteSchema = new SchemaArtifactsSqlite(support);

        // caravan-console 메타 (TB_MCM_APPHOST / TB_MCM_MOM_KAFKA_SERAI_CONFIG) 는 secondary DB (caravan.db / CARAVANUSER).
        // mcm.db 의 secUser count 와 무관하게 매번 idempotent saveAll 수행 (JpaRepository.save 는 PK 있으면 UPDATE).
        // v4 결정 #14 + Phase 4-C (2026-05-13).
        CaravanMetaSeeder caravanMeta = new CaravanMetaSeeder(appHostJpaRepository, consoleCaravanHubConfigJpaRepository);
        caravanMeta.initAppHostData();
        caravanMeta.initCaravanHubConfigData();

        // MCM cma 동기화 schema artifacts — 매번 IF NOT EXISTS 멱등 적재 (2026-05-29 사용자 결정).
        // 원장 DML 대상 = MCM_SOURCE (Entity @Table schema). MCMAPUSER = 운영 read 동기화본 (빈 테이블 + 뷰).
        // MCM_BACKUP 은 동기화 화면 사이클 (별도 worker) 위임 — 현 사이클에서 미적재.
        if (!sqliteDialect) {
            mssqlSchema.initMcmCmaSyncSchemaArtifacts();
        } else {
            // MSSQL 전용 artifacts 는 skip 하지만 VI_MCM_CODE_ACCESS 뷰만은 SQLite 에도 만든다 (2026-08-07).
            // 이 뷰가 없으면 masterCodeSelPop(코드 선택 팝업) 조회가 "no such table: VI_MCM_CODE_ACCESS" 로
            // 통째로 실패하고, OASIS 가 HTTP 200 + meta.success=false 로 돌려줘 팝업이 조용히 빈 채로 떴다.
            sqliteSchema.createMcmCodeAccessViewSqlite();
        }

        // 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 — local/mssql/dev tier·idempotent (BR-002/003).
        new RuleMasterSampleSeeder(environment, ruleMasterRepository).initRuleMasterSampleData();

        // 2026-06-06 — SQLite(local 단독)에서는 아래 csa W1~W8 native DDL 을 전부 skip한다. SEC 테이블 대부분은
        // @Entity 가 있어 ddl-auto=update 가 SQLite 에 생성하고, entity 미보유 TB_MCM_SEC_MENU_FLD 만 else 에서 보강.
        if (!sqliteDialect) {
            // MCM csa 9 화면 schema artifacts W1~W8 — 호출 순서와 화면별 설명은 SchemaArtifactsMssql#initMcmCsaCommArtifacts.
            mssqlSchema.initMcmCsaCommArtifacts();

            // 화면 사용 통계(2026-10-02) — TB_SEC_SCREEN_USAGE_LOG / _DAY + 인덱스 멱등 생성.
            // 감사 계열(TB_SEC_AUDIT_LOG)처럼 schema 접두 없이 접속 계정 기본 스키마에 둔다. SQLite 는 ddl-auto 가 만든다.
            new ScreenUsageSchemaArtifacts(support).initScreenUsageArtifacts();
        } else {
            // SQLite(local 단독) — entity 미보유 TB_MCM_SEC_MENU_FLD 만 보강 생성 (나머지 SEC 테이블은 ddl-auto).
            sqliteSchema.createSecMenuFldForSqlite();
            sqliteSchema.createScreenUsageLogSegIndex();
        }

        // Phase R6 (2026-06-01) — 신규 RBAC 시드 (TB_MCM_SEC_*) 멱등 적재.
        // legacy TB_SEC_* 시드 (TB_SEC_USER / TB_SEC_ROLE / TB_SEC_USER_ROLE / TB_SEC_PERM /
        // TB_SEC_ROLE_PERM / TB_SEC_OBJ / TB_SEC_MENU) 는 모두 폐기 (Phase R7 자산 삭제 정합).
        // secUserRepository.count() 가드는 사용자 본인 SecUser (cactus) 기준 — 본 시드는 신규
        // TB_MCM_SEC_USER 기준이므로 별도 멱등 가드 (existsById) 로 처리한다.

        seedMcmSecRbac(support);

        log.info("[DataInitializer] 초기 데이터 삽입 완료. MCM SEC RBAC 시드 (admin / SYSADMIN role-group / SYSADMIN role / PERM_ALL / 9 화면 ROLE_MAPPING) + caravan-console 메타 완료.");
    }

    /**
     * Phase R6 (2026-06-01) — 신규 RBAC 시드 (TB_MCM_SEC_*) 멱등 적재.
     *
     * <p>운영 데이터:
     * <ul>
     *   <li>TB_MCM_SEC_USER: admin 1행 (PasswordEncoder 로 해시)</li>
     *   <li>TB_MCM_SEC_ROLE_GROUP: ROLE_GROUP_SYSADMIN 1행</li>
     *   <li>TB_MCM_SEC_USER_MAPPING: (admin, ROLE_GROUP_SYSADMIN) 1행</li>
     *   <li>TB_MCM_SEC_ROLE: ROLE_SYSADMIN 1행</li>
     *   <li>TB_MCM_SEC_ROLEGROUP_MAPPING: (ROLE_GROUP_SYSADMIN, ROLE_SYSADMIN) 1행</li>
     *   <li>TB_MCM_SEC_PERM: PERM_ALL 1행 (PERMISSION_COMMON / PERMISSION_ACTION 모든 action 콤마)</li>
     *   <li>TB_MCM_SEC_ROLE_MAPPING: SYSADMIN × 13 OBJECT × PERM_ALL = 13 rows</li>
     * </ul>
     *
     * <p>모든 INSERT 는 멱등 (존재 검증 후 skip).
     */
    private void seedMcmSecRbac(SeedSupport support) {
        McmMenuSeeder mcmMenu = new McmMenuSeeder(support);
        ModuleMenuSeeder moduleMenus = new ModuleMenuSeeder(support);
        MdmMenuSeeder mdmMenus = new MdmMenuSeeder(support);
        MenuFinalizer menuFinalizer = new MenuFinalizer(support, secMenuNativeRepository);

        // 사용자·비밀번호·역할그룹·역할·PERM_ALL·OBJECT·ROLE_MAPPING — 코어 RBAC. PERM_ALL 의 action 목록도 CoreRbacSeeder 안에 있다.
        new CoreRbacSeeder(support, passwordEncoder, environment).seedCoreRbac();

        // TB_MCM_SEC_MENU — 메뉴 트리 시드 leaf 13 row (화면 only). round 3 (2026-06-02): 모듈/그룹 폴더 4 row 는
        // 본 테이블 owner ✗ — 모두 TB_MCM_SEC_MENU_FLD owner. PARENT_MENU_ID 는 SEC_MENU_FLD.MENU_ID 참조.
        // SecUserService.getMyMenusTree 가 두 테이블 JOIN 으로 트리 조립.
        // FULL_SEQ 는 사용자 지정 7자리 인코딩 체계 (2026-06-02 R3 P1):
        //   백만 +1,000,000 = 모듈 / 만 +10,000 = 그룹 폴더 / 백/십 +100~+990 = 화면.
        //   화면=각 그룹 +100,+110,... (폴더 FULL_SEQ 는 SEC_MENU_FLD 시드 또는 본 화면 외 범위)
        mcmMenu.seedMcmSecMenu();

        // TB_MCM_DEPT_INFO — 부서 LoV 시드 3 row (정책 #2 / Q-002 — EAI 폐기 대체).
        // commUserMng 화면이 부서 LoV (DEPT_CD / DEPT_NM JOIN) 를 표시하려면 본 시드가 필요.
        // 빈 테이블이면 화면 LoV 가 비어 admin 사용자의 DEPT_CD='IT' 값도 미해소.
        mcmMenu.seedMcmDeptInfo();

        // TB_MCM_SEC_MENU_FLD — 메뉴 폴더 트리 시드 4 row (2026-06-01 cycle 2 결함 fix).
        // commMenuMng 분석 §9.3 정합 — 트리 안 폴더 (디렉토리) 4 row (root mcm + group cma/csa/cme).
        // 본 시드가 없으면 commMenuMng 화면 진입 시 searchMenuFld 의 CTE 가 빈 결과 = 트리 빈 출력.
        mcmMenu.seedMcmSecMenuFld();

        // 2026-08-07 — 1글자 코드 컬럼의 빈 문자열 정규화 (commMenuMng 전면 장애 fix).
        //   TB_MCM_SEC_MENU.USE_TP 등 length=1 컬럼에 '' 가 들어가 있으면 Hibernate 가 native query 결과를
        //   Character 로 추론하다 CoercionException("value does not contain a character: ''") 을 던져
        //   commMenuMng 의 조회·저장이 통째로 실패한다(HTTP 200 + meta.success=false 로만 보여 원인 추적이 어렵다).
        //   유입 경로와 무관하게 부팅 시 자가 치유한다.
        mcmMenu.normalizeSecMenuCharColumns();

        // 2026-07-16 — ANALOG(로그 분석 도구) 메뉴/OBJECT/RBAC 시드 (CR관리 ppe 패턴 미러).
        //   analog-express-ui-plate 포팅 화면(anl/logViewer)의 포털 진입점. 폴더 2(analog 모듈 루트 + anl 그룹)
        //   + OBJECT 1 + 메뉴 leaf 1 + SYSADMIN RBAC 1. componentPath=anl/logViewer.
        moduleMenus.seedAnalogMenus();

        // 2026-09-23 — TSK-01-01 mdm(마루 MDM) 스캐폴드 검증용 샘플 화면 시드.
        //   그룹 dma(용어·도메인, TSK-01-02 에서 옛 그룹에서 이동). 폴더 2(mdm 모듈 루트 + dma 그룹) + OBJECT 1
        //   + 메뉴 leaf 1 + SYSADMIN RBAC 1. componentPath=dma/mdmSample. 화면 자체는 API 를 호출하지 않는 빈 화면.
        mdmMenus.seedMdmMenus();

        // 2026-10-02 — 공지사항 관리(lsh/noticeMgmt) 메뉴. 메뉴는 공통관리(mcm) 아래, 코드는 mls. 포털 홈 공지 목록(noticeBoard)은
        //   AUTH_ONLY 라 시드가 없다(seedMlsMenus javadoc).
        moduleMenus.seedMlsMenus();

        // 2026-10-02 — MDM 캐시 관리(csa/mdmCacheMng) 화면과 MDM 메타 제공(mdm metaFeed) 강제 기록 권한. seedMdmCacheMenus javadoc 참고.
        mdmMenus.seedMdmCacheMenus();

        // 2026-10-02 — 화면 사용 통계(csa/screenUsageStat) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 화면 사용 통계".
        moduleMenus.seedScreenUsageMenus();

        // 2026-10-02 — 위젯관리(csa/commWidgetMng) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 위젯 관리".
        moduleMenus.seedWidgetAdminMenus();

        // 확장 지점 — 신규 업무 모듈을 추가할 때 여기에 seed{Module}Menus() 를 호출한다.

        // 2026-06-04 사용자 지시 — 모든 메뉴 시드 적재 후 FULL_SEQ 7자리 인코딩 강제 재계산 (멱등).
        //   결함: seedMcmSecMenuFld 의 INSERT 는 FULL_SEQ 미포함 + upgradeTbMcmSecMenuFldToFullOwner 의
        //   FULL_SEQ UPDATE 가 initMcmCsaCommObjMngArtifacts(line 69) 단계 = INSERT 보다 먼저 실행되어,
        //   신규(클린) DB 에서 폴더 FULL_SEQ 가 NULL 로 남아 메뉴 필드 관리 그리드에 빈 값이 표시됨.
        //   본 호출이 시드 순서와 무관하게 폴더(모듈 백만 / 그룹 만) + 화면(그룹 + 100,+10) FULL_SEQ 를
        //   트리 위치 기준으로 일괄 정정. saveCmMenu / saveCmMenuFld 의 저장 시 재계산과 동일 로직 (SoT).
        // 2026-06-11: 모듈 루트 폴더 표시 순서 고정 — 공정계획(mpn) 위 / 공통관리(mcm) 아래.
        //   b1eac364 가 시드 리터럴 MENU_SEQ 를 swap 했으나 seedMcmSecMenuFld/seedMpnMenus 는 insertIfAbsent 라
        //   이미 시드된 DB(dev MSSQL · 동료 SQLite)엔 옛 값(mcm=00000001, mpn=00000002)이 남아 순서가 안 바뀐다.
        //   루트 2행만 멱등 보정(그룹/화면 정렬은 사용자 편집 보존) 후, 아래 recompute 가 FULL_SEQ 를 재부여한다.
        menuFinalizer.fixModuleRootMenuSeqOrder();

        // recomputeMenuFullSeq 는 mcm-core SecMenuNativeRepository 의 native @Query(MCMAPUSER. schema 접두) 이지만,
        // SQLite 에서는 McmAuditStatementInspector(JpaConfig 가 SQLite 한정 등록)가 schema 접두를 제거하므로 그대로 동작.
        menuFinalizer.recomputeMenuFullSeq();

        // 메뉴 카탈로그 무효화 — 이 메서드의 @Transactional 안이므로 즉시 한 번, 커밋 뒤 한 번 더 비운다(MenuCatalog javadoc).
        if (eventPublisher != null) {
            eventPublisher.publishEvent(new MenuChangedEvent(MenuChangedEvent.SEED));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SQLite(개발자 Mac local 단독 부팅) 호환 레이어 — 2026-06-06
    //  · detectSqliteDialect       : 런타임 connection product name 으로 방언 1회 감지 (profile 비의존)
    //  · sanitize / nq             : 시드 native SQL 의 MSSQL 전용 토큰을 SQLite 로 흡수 (MSSQL 무영향) — seed.SeedSupport
    //  · createSecMenuFldForSqlite : entity 미보유 TB_MCM_SEC_MENU_FLD 보강 (그 외 SEC 테이블은 ddl-auto) — seed.SchemaArtifactsSqlite
    // ─────────────────────────────────────────────────────────────────────────

    /** 런타임 connection 의 DB product name 으로 SQLite 여부 1회 감지 (profile 이름 비의존 — dialect 실측). */
    private boolean detectSqliteDialect() {
        try {
            String product = entityManager.unwrap(Session.class)
                    .doReturningWork(conn -> conn.getMetaData().getDatabaseProductName());
            return product != null && product.toLowerCase().contains("sqlite");
        } catch (Exception e) {
            log.warn("[DataInitializer] DB 방언 감지 실패 — MSSQL 로 가정(기존 동작 유지). 원인: {}", e.getMessage());
            return false;
        }
    }

    /**
     * local 프로필 부팅 때 admin 의 로그인 잠금을 푼다 — 본문은 {@link CoreRbacSeeder#unlockLocalAdmin()}.
     * 기존 시험(DataInitializerLocalAdminUnlockTest)이 이 진입점을 직접 부른다.
     *
     * @return 되돌린 행 수(0 또는 1)
     */
    int unlockLocalAdmin() {
        return new CoreRbacSeeder(new SeedSupport(entityManager, sqliteDialect), passwordEncoder, environment)
                .unlockLocalAdmin();
    }
}
