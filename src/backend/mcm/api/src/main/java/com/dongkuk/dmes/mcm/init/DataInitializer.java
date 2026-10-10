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
import com.dongkuk.dmes.mcm.init.seed.SeedSupport;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 애플리케이션 시작 시 초기 데이터(시드)를 넣는다.
 *
 * <p>2026-10-04 분할 — 이 클래스는 단계의 순서만 정하고, 시드 본문은 단계 클래스가 갖는다.
 * {@code com.dongkuk.dmes.mcm.init.seed} 의 CaravanMetaSeeder·RuleMasterSampleSeeder·CoreRbacSeeder·McmMenuSeeder·
 * MdmMenuSeeder·ModuleMenuSeeder·MenuFinalizer·WidgetCategoryCodeSeeder 다. 단계 클래스는 빈이 아니다. {@link #run} 이 만든
 * {@link SeedSupport} 를 받아 쓰고, 트랜잭션은 {@link #run} 의 {@code @Transactional} 하나다.
 *
 * <p>2026-10-07 oracle-1007 — 스키마는 Flyway(mcm-core {@code db/migration/oracle/<스키마>} V1, {@code McmFlywayConfig})가
 * 만든다. 여기 있던 Java DDL 단계(SchemaArtifactsMssql·SchemaArtifactsSqlite·ScreenUsageSchemaArtifacts)와 SQLite 방언
 * 판정은 {@code src/backend/mcm/archive/} 로 옮겼다. 시드 SQL 은 Oracle 문법이다.
 *
 * <p>다른 모듈의 소스 대조 시험이 시드 소스를 문자열로 읽는다. PERM_ALL allActions 선언은 CoreRbacSeeder, mdm 메뉴·권한
 * 시드는 MdmMenuSeeder 파일에서 찾는다.
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

    // 업무기준(cmb/masterRuleList) 샘플 시드용 — primary EMF (MCAAPUSER). local/local-ph/local-kp tier 한정.
    @Autowired(required = false)
    private RuleMasterRepository ruleMasterRepository;

    // 2026-10-04 — 시드 끝에 MenuChangedEvent(SEED) 를 내 메뉴 카탈로그(MenuCatalog)를 비운다. ApplicationRunner 는 웹 서버가
    //   뜬 뒤에 돌므로 시드 커밋 전에 들어온 내 메뉴 요청이 시드 전 목록을 TTL 동안 남길 수 있기 때문이다. 필드 주입·required=false
    //   는 생성자로 만드는 기존 시험(지문·특성화·admin 잠금 해제)이 그대로 돌게 하기 위해서다(null 이면 내지 않는다).
    @Autowired(required = false)
    private ApplicationEventPublisher eventPublisher;

    // 2026-10-07 — 시드 끝에 권한 캐시(UserPermCache, TTL 10분)도 비운다. 시드가 OBJECT SYSTEM_CODE 를 바꾸면(공지 mls → mcm) 권한키의
    //   모듈이 바뀌는데, 시드 커밋 전에 들어온 권한 요청이 옛 키를 TTL 동안 남길 수 있다. required=false 인 이유는 eventPublisher 와 같다.
    @Autowired(required = false)
    private UserPermCache userPermCache;

    private final Environment environment;

    // 읽기 전용 기동 스위치 — false 면 run() 전체 skip (스키마/시드 INSERT·UPDATE·ALTER 미수행).
    // 기본 true(기존 동작). 데이터 보존 기동: --dmes.init.enabled=false (+ ddl-auto=none).
    @Value("${dmes.init.enabled:true}")
    private boolean initEnabled;

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
        // 시드 문맥을 한 번 만들어 모든 단계에 넘긴다 (단계 클래스는 빈이 아니다 — 트랜잭션은 이 메서드 하나).
        SeedSupport support = new SeedSupport(entityManager);

        // caravan-console 메타 (TB_CARAVAN_APPHOST / TB_CARAVAN_HUB_CONFIG) 는 보조 DataSource(CARAVANUSER).
        // biz 의 secUser count 와 무관하게 매번 idempotent saveAll 수행 (JpaRepository.save 는 PK 있으면 UPDATE).
        // v4 결정 #14 + Phase 4-C (2026-05-13).
        CaravanMetaSeeder caravanMeta = new CaravanMetaSeeder(appHostJpaRepository, consoleCaravanHubConfigJpaRepository);
        caravanMeta.initAppHostData();
        caravanMeta.initCaravanHubConfigData();

        // MCM cma 동기화 표(MCMAPUSER 사본 3표·MCM_BACKUP 2표)·VI_MCM_CODE_ACCESS 뷰·csa SEC 표·화면 사용 통계 표는
        // 2026-10-07 부터 Flyway V1(mcm-core db/migration/oracle/<스키마>)이 만든다 — 옛 Java DDL 단계는 archive.

        // 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 — local/local-ph/local-kp tier·idempotent (BR-002/003).
        new RuleMasterSampleSeeder(environment, ruleMasterRepository).initRuleMasterSampleData();

        // Phase R6 (2026-06-01) — 신규 RBAC 시드 (TB_MCM_SEC_*) 멱등 적재.
        // legacy TB_SEC_* 시드 (TB_SEC_USER / TB_SEC_ROLE / TB_SEC_USER_ROLE / TB_SEC_PERM /
        // TB_SEC_ROLE_PERM / TB_SEC_OBJ / TB_SEC_MENU) 는 모두 폐기 (Phase R7 자산 삭제 정합).
        // secUserRepository.count() 가드는 사용자 본인 SecUser (cactus) 기준 — 본 시드는 신규
        // TB_MCM_SEC_USER 기준이므로 별도 멱등 가드 (existsById) 로 처리한다.

        seedMcmSecRbac(support);

        log.info("[DataInitializer] 초기 데이터 삽입 완료. MCM SEC RBAC 시드 (admin / SYSADMIN role-group / SYSADMIN role / PERM_ALL / 9 화면 ROLE_MAPPING). caravan-console 메타는 CaravanMetaSeeder 로그를 본다(표가 없으면 건너뜀).");
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

        // 2026-10-02 — 공지사항 관리(lsh/noticeMgmt) 메뉴. 메뉴는 공통관리(mcm) 아래, 코드도 10-07 부터 mcm. 포털 홈 공지 목록(noticeBoard)은
        //   AUTH_ONLY 라 시드가 없다(seedNoticeMenus javadoc).
        moduleMenus.seedNoticeMenus();

        // 2026-10-02 — MDM 캐시 관리(csa/mdmCacheMng) 화면과 MDM 메타 제공(mdm metaFeed) 강제 기록 권한. seedMdmCacheMenus javadoc 참고.
        mdmMenus.seedMdmCacheMenus();

        // 2026-10-02 — 화면 사용 통계(csa/screenUsageStat) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 화면 사용 통계".
        moduleMenus.seedScreenUsageMenus();

        // 2026-10-02 — 위젯관리(csa/commWidgetMng) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 위젯 관리".
        moduleMenus.seedWidgetAdminMenus();

        // 2026-10-09 — 예약 작업 관리(csa/jobSchedMng) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 예약 작업 관리".
        moduleMenus.seedJobSchedMngMenu();

        // 2026-10-10 — 맞춤 레포트 메뉴(스펙 2026-10-10-user-query-program-design §3). 폴더 cmq(맞춤 레포트) 1 +
        //   맞춤 레포트 조회(cmq/userQuery)·맞춤 레포트 관리(cmq/userQueryMng) leaf 2.
        moduleMenus.seedUserQueryMenus();

        // 2026-10-07 — 조회 기본값 샘플 화면(csa/searchDefaultsSample) 메뉴. local 프로필 전용 — 운영·개발계 메뉴에는 넣지 않는다.
        if (environment.acceptsProfiles(Profiles.of("local"))) {
            moduleMenus.seedSearchDefaultsSampleMenu();
        }
        new com.dongkuk.dmes.mcm.init.seed.WidgetCategoryCodeSeeder(support).seedWidgetCategoryCodes();
        new com.dongkuk.dmes.mcm.init.seed.UserQueryCategoryCodeSeeder(support).seedUserQueryCategoryCodes();

        // 확장 지점 — 신규 업무 모듈을 추가할 때 여기에 seed{Module}Menus() 를 호출한다.

        // 2026-06-04 사용자 지시 — 모든 메뉴 시드 적재 후 FULL_SEQ 7자리 인코딩 강제 재계산 (멱등).
        //   결함: seedMcmSecMenuFld 의 INSERT 는 FULL_SEQ 미포함 + upgradeTbMcmSecMenuFldToFullOwner 의
        //   FULL_SEQ UPDATE 가 initMcmCsaCommObjMngArtifacts(line 69) 단계 = INSERT 보다 먼저 실행되어,
        //   신규(클린) DB 에서 폴더 FULL_SEQ 가 NULL 로 남아 메뉴 필드 관리 그리드에 빈 값이 표시됨.
        //   본 호출이 시드 순서와 무관하게 폴더(모듈 백만 / 그룹 만) + 화면(그룹 + 100,+10) FULL_SEQ 를
        //   트리 위치 기준으로 일괄 정정. saveCmMenu / saveCmMenuFld 의 저장 시 재계산과 동일 로직 (SoT).
        // 2026-06-11: 모듈 루트 폴더 표시 순서 고정 — 공정계획(mpn) 위 / 공통관리(mcm) 아래.
        //   b1eac364 가 시드 리터럴 MENU_SEQ 를 swap 했으나 seedMcmSecMenuFld/seedMpnMenus 는 insertIfAbsent 라
        //   이미 시드된 DB(개발계·다른 개발자 로컬 DB)엔 옛 값(mcm=00000001, mpn=00000002)이 남아 순서가 안 바뀐다.
        //   루트 2행만 멱등 보정(그룹/화면 정렬은 사용자 편집 보존) 후, 아래 recompute 가 FULL_SEQ 를 재부여한다.
        menuFinalizer.fixModuleRootMenuSeqOrder();

        // recomputeMenuFullSeq 는 mcm-core SecMenuNativeRepository 의 native @Query(MCMAPUSER. schema 접두) 다.
        menuFinalizer.recomputeMenuFullSeq();

        // 메뉴 카탈로그 무효화 — 이 메서드의 @Transactional 안이므로 즉시 한 번, 트랜잭션이 끝난 뒤(커밋·롤백) 한 번 더 비운다(MenuCatalog javadoc).
        if (eventPublisher != null) {
            eventPublisher.publishEvent(new MenuChangedEvent(MenuChangedEvent.SEED));
        }

        // 권한 캐시 무효화 — 메뉴 카탈로그와 같이 지금 한 번, 트랜잭션이 끝난 뒤 한 번 더 비운다(시드 커밋 전 요청이 옛 키를 다시 채운 경우).
        if (userPermCache != null) {
            userPermCache.invalidateAll();
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        userPermCache.invalidateAll();
                    }
                });
            }
        }
    }

    /**
     * local 프로필 부팅 때 admin 의 로그인 잠금을 푼다 — 본문은 {@link CoreRbacSeeder#unlockLocalAdmin()}.
     * 기존 시험(DataInitializerLocalAdminUnlockTest)이 이 진입점을 직접 부른다.
     *
     * @return 되돌린 행 수(0 또는 1)
     */
    int unlockLocalAdmin() {
        return new CoreRbacSeeder(new SeedSupport(entityManager), passwordEncoder, environment)
                .unlockLocalAdmin();
    }
}
