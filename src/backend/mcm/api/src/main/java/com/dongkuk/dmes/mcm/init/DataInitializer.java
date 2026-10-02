package com.dongkuk.dmes.mcm.init;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.caravan.console.host.AppHostEntity;
import com.dongkuk.caravan.console.host.AppHostJpaRepository;
import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigEntity;
import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigJpaRepository;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.entity.RuleMaster;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 애플리케이션 시작 시 SQLite에 초기 데이터를 삽입한다.
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
        // caravan-console 메타 (TB_MCM_APPHOST / TB_MCM_MOM_KAFKA_SERAI_CONFIG) 는 secondary DB (caravan.db / CARAVANUSER).
        // mcm.db 의 secUser count 와 무관하게 매번 idempotent saveAll 수행 (JpaRepository.save 는 PK 있으면 UPDATE).
        // v4 결정 #14 + Phase 4-C (2026-05-13).
        initAppHostData();
        initCaravanHubConfigData();

        // MCM cma 동기화 schema artifacts — 매번 IF NOT EXISTS 멱등 적재 (2026-05-29 사용자 결정).
        // 원장 DML 대상 = MCM_SOURCE (Entity @Table schema). MCMAPUSER = 운영 read 동기화본 (빈 테이블 + 뷰).
        // MCM_BACKUP 은 동기화 화면 사이클 (별도 worker) 위임 — 현 사이클에서 미적재.
        if (!sqliteDialect) {
            initMcmCmaSyncSchemaArtifacts();
        } else {
            // MSSQL 전용 artifacts 는 skip 하지만 VI_MCM_CODE_ACCESS 뷰만은 SQLite 에도 만든다 (2026-08-07).
            // 이 뷰가 없으면 masterCodeSelPop(코드 선택 팝업) 조회가 "no such table: VI_MCM_CODE_ACCESS" 로
            // 통째로 실패하고, OASIS 가 HTTP 200 + meta.success=false 로 돌려줘 팝업이 조용히 빈 채로 떴다.
            createMcmCodeAccessViewSqlite();
        }

        // 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 — local/mssql/dev tier·idempotent (BR-002/003).
        initRuleMasterSampleData();

        // MCM csa commObjMng schema artifacts — 멱등 적재 (2026-06-01 사용자 결정 csa 9 화면 1차 worker W1).
        // 스키마 = MCMAPUSER (cma 정본과 다름 — csa 9 화면 공통 정책 #1).
        //  - TB_MCM_SEC_OBJ        : 본 화면 owner (commObjMng). 본 13 컬럼 + audit 9 컬럼 명시 DDL.
        //  - TB_MCM_SEC_MENU       : read-only 조인 (selectCommObjMng MENU_ID scalar subquery + delete NOT EXISTS).
        //  - TB_MCM_SEC_MENU_FLD   : read-only lov (selectMenuId).
        //  - TB_MCM_SEC_ROLE_MAPPING : read-only EXISTS 검증 (delete 차단).
        // hibernate ddl-auto 가 MCMAPUSER schema 의 TB_MCM_SEC_OBJ 를 SecObj entity 로 자동 생성하지만,
        // 다른 3 테이블은 entity ✗ → 본 메서드가 native DDL 로 명시 생성.
        // 2026-06-06 — SQLite(local 단독)에서는 아래 csa W1~W8 native DDL 을 전부 skip한다. SEC 테이블 대부분은
        // @Entity 가 있어 ddl-auto=update 가 SQLite 에 생성하고, entity 미보유 TB_MCM_SEC_MENU_FLD 만 else 에서 보강.
        if (!sqliteDialect) {
        initMcmCsaCommObjMngArtifacts();

        // MCM csa commMenuMng schema artifacts — 멱등 적재 (2026-06-01 worker W2).
        // 본 화면 owner = TB_MCM_SEC_MENU (W1 stub 2 컬럼 → W2 full 15 본 + audit 9 컬럼으로 ALTER 확장).
        // W1 의 TB_MCM_SEC_OBJ / TB_MCM_SEC_MENU_FLD / TB_MCM_SEC_ROLE_MAPPING 는 본 화면도 사용 (read-only) —
        // 본 메서드는 그것들을 재생성 ✗ (W1 IF NOT EXISTS 가드와 정합).
        initMcmCsaCommMenuMngArtifacts();

        // MCM csa commRoleMng schema artifacts — 멱등 적재 (2026-06-01 worker W3).
        // 본 화면 owner 2 테이블:
        //  - TB_MCM_SEC_ROLE          : 본 7 컬럼 (PK ROLE_ID) + audit 9 — 신규 생성 (entity SecRole 정합)
        //  - TB_MCM_SEC_ROLE_MAPPING  : W1 stub (ROLE_ID, OBJECT_ID 2 컬럼) → W3 full owner (PK 3 복합 + audit 9)
        //                               PERMISSION_ID 컬럼 ADD + PK 재설계 (drop + recreate)
        // 본 화면 read-only stub 2 테이블:
        //  - TB_MCM_SEC_PERM          : searchCmPerm NOT EXISTS 검증 + JOIN (commPermMng 화면 owner)
        //  - TB_MCM_SEC_ROLEGROUP_MAPPING : deleteCommRole NOT EXISTS 검증 (commRoleGrpMng 화면 owner)
        initMcmCsaCommRoleMngArtifacts();

        // MCM csa commRoleGrpMng schema artifacts — 멱등 적재 (2026-06-01 worker W4).
        // 본 화면 owner 2 테이블:
        //  - TB_MCM_SEC_ROLEGROUP        : 본 6 컬럼 (PK ROLE_GROUP_ID) + audit 9 — 신규 생성 (entity SecRoleGroup 정합)
        //  - TB_MCM_SEC_ROLEGROUP_MAPPING : W3 stub (ROLE_GROUP_ID, ROLE_ID 2 컬럼 + PK 2 복합) → W4 full owner
        //                                   PK 는 W3 stub 과 동일 (변경 ✗) — audit 9 컬럼만 ALTER ADD (멱등)
        // 본 화면 read-only stub 1 테이블:
        //  - TB_MCM_SEC_USER_MAPPING     : selectCommRoleGrp scalar subquery + deleteCommRoleGrp NOT EXISTS 검증 (commUserMng 화면 owner)
        //  TB_MCM_SEC_ROLE / TB_MCM_SEC_ROLE_MAPPING / TB_MCM_SEC_MENU / TB_MCM_SEC_MENU_FLD / TB_MCM_SEC_OBJ 는
        //  본 화면도 read-only 사용 (selectCommRole / selectCommRoleGrpMap / selectMenuObjTree CTE) — W1·W2·W3 owner DDL 재사용.
        initMcmCsaCommRoleGrpMngArtifacts();

        // MCM csa commUserMng schema artifacts — 멱등 적재 (2026-06-01 worker W5).
        // 본 화면 owner 6 테이블:
        //  - TB_MCM_SEC_USER             : 본 21 컬럼 (PK USER_ID) + audit 9 — 신규 (entity SecUser)
        //  - TB_MCM_SEC_USER_MAPPING     : W4 stub (USER_ID/ROLE_GROUP_ID 2 컬럼 + PK 2 복합) → W5 full owner
        //                                   PK 동일 (변경 ✗) — audit 9 컬럼만 ALTER ADD (정책 #15)
        //  - TB_MCM_SEC_USER_PWD         : 본 7 컬럼 (PK USER_ID) + audit 9 — 신규 (entity SecUserPwd / mergeCommonPwdInit)
        //  - TB_MCM_SEC_USER_HIS         : 본 7 컬럼 + PK 2 복합 (USER_ID + ACTIVE_DT) + audit 9 — 신규 (정책 #3 (C) 흡수)
        //  - TB_MCM_SEC_USER_ROLL_HIS    : 본 8 컬럼 + PK 5 복합 + audit 9 — 신규 (정책 #3 (C) 흡수)
        //  - TB_MCM_DEPT_INFO            : 본 7 컬럼 (PK DEPT_CD) + audit 9 — 신규 (정책 #2 / Q-002 — EAI 폐기 대체)
        // TB_MCM_SEC_ROLEGROUP 는 W4 owner — read-only JOIN (selectCommUserRoleGrp / selectCommRoleGrpList).
        initMcmCsaCommUserMngArtifacts();

        // MCM csa commPermMng schema artifacts — 멱등 적재 (2026-06-01 worker W6).
        // 본 화면 owner 1 테이블:
        //  - TB_MCM_SEC_PERM : W3 stub (PERMISSION_ID(PK) + 5 컬럼) → W6 full owner
        //                      PK 동일 (변경 ✗) — 본 5 컬럼 ADD (PERMISSION_DESC / PERMISSION_ACTION /
        //                      START_ACTIVE_DATE / END_ACTIVE_DATE + BIZ_SYSTEM_CODE legacy)
        //                      + audit 9 컬럼 ALTER ADD (정책 #15)
        // TB_MCM_SEC_ROLE_MAPPING 은 W3 owner — read-only EXISTS 검증 (deleteCommPermMng NOT EXISTS xml:91~95
        // + selectCommPermMng scalar subquery ROLE_ID xml:19~22). 본 메서드 재생성 ✗.
        initMcmCsaCommPermMngArtifacts();

        // MCM csa commSyncMng schema artifacts — 멱등 적재 (2026-06-01 worker W8).
        // 본 화면 owner 테이블 ✗ — cma 4 화면 (masterCodeMng) entity 재사용 (정책 #6 (A) / Q-007 해소).
        // 본 메서드는 동기화 TARGET schema 의 3 테이블만 보장:
        //  - MCMAPUSER.TB_MCM_CODE_{MASTER|CATEGORY|DETAIL} — 이미 initMcmCmaSyncSchemaArtifacts() 가 적재
        //  - MCM_BACKUP.TB_MCM_CODE_{MASTER|CATEGORY} — 본 worker 가 신규 적재 (MA2 분기 대상 schema)
        //    DETAIL 은 As-Is java:115 백업 제외 정책으로 미적재.
        initMcmCsaCommSyncMngArtifacts();

        // MCM csa commUserRoleCopy schema artifacts — 멱등 보장 (2026-06-01 worker W7).
        // 본 화면은 신규 owner 테이블 ✗ — 모두 W4 (commRoleGrpMng) + W5 (commUserMng) owner 재사용:
        //  - TB_MCM_SEC_USER         (W5 owner) — selectUserList / selectCopyUserMap (read-only)
        //  - TB_MCM_SEC_USER_MAPPING (W5 owner) — selectCopyRoleGroupList / selectRoleMergeObject (read) +
        //                                         mergeCommonCopyRoleGrp (write — SecUserMapping save)
        //  - TB_MCM_SEC_ROLEGROUP    (W4 owner) — ROLE_GROUP_NM scalar subquery (read-only)
        //  - TB_MCM_SEC_USER_ROLL_HIS (W5 owner) — 권한부여 이력 적재 (SecUserRollHis save / 정책 #6 Q-002/Q-006)
        //  - TB_MCM_DEPT_INFO        (W5 owner) — selectUserList JOIN DEPT_NM (정책 #2 Q-004)
        // 본 메서드는 W5 의 owner DDL 멱등성을 신뢰 (IF NOT EXISTS 가드) — 본 worker 는 호환 가드 호출만.
        initMcmCsaCommUserRoleCopyArtifacts();

        // 화면 사용 통계(2026-10-02) — TB_SEC_SCREEN_USAGE_LOG / _DAY + 인덱스 멱등 생성.
        // 감사 계열(TB_SEC_AUDIT_LOG)처럼 schema 접두 없이 접속 계정 기본 스키마에 둔다. SQLite 는 ddl-auto 가 만든다.
        initScreenUsageArtifacts();
        } else {
            // SQLite(local 단독) — entity 미보유 TB_MCM_SEC_MENU_FLD 만 보강 생성 (나머지 SEC 테이블은 ddl-auto).
            createSecMenuFldForSqlite();
        }

        // Phase R6 (2026-06-01) — 신규 RBAC 시드 (TB_MCM_SEC_*) 멱등 적재.
        // legacy TB_SEC_* 시드 (TB_SEC_USER / TB_SEC_ROLE / TB_SEC_USER_ROLE / TB_SEC_PERM /
        // TB_SEC_ROLE_PERM / TB_SEC_OBJ / TB_SEC_MENU) 는 모두 폐기 (Phase R7 자산 삭제 정합).
        // secUserRepository.count() 가드는 사용자 본인 SecUser (cactus) 기준 — 본 시드는 신규
        // TB_MCM_SEC_USER 기준이므로 별도 멱등 가드 (existsById) 로 처리한다.

        seedMcmSecRbac();

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
    private void seedMcmSecRbac() {
        // ── 공통 audit 9 컬럼 fragment (모든 seed INSERT 동일 — McmAuditEntity 정합) ──
        // 사용 패턴: 컬럼 list 에 AUDIT_COLS 추가 + VALUES 에 AUDIT_VALS 추가.
        // C_USR_ID='admin' / C_AT=SYSDATETIME() / C_SVC_ID='DataInitializer' / C_PGM_ID='DataInitializer' /
        // U_USR_ID='admin' / U_AT=SYSDATETIME() / U_SVC_ID='DataInitializer' / U_PGM_ID='DataInitializer' / VER=0
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // TB_MCM_SEC_USER — admin
        insertIfAbsent(
                "TB_MCM_SEC_USER", "USER_ID", "admin",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER " +
                "(USER_ID, USER_NM, USER_EMP_NO, DEPT_CD, USE_TP, IN_OUT_EMP_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('admin', N'관리자', 'E0001', 'IT', 'Y', 'I', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_USER_PWD — admin 비밀번호 (BCrypt). passwordEncoder 가 null 인 빈 환경에서는 skip.
        if (passwordEncoder != null) {
            insertIfAbsent(
                    "TB_MCM_SEC_USER_PWD", "USER_ID", "admin",
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_PWD " +
                    "(USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE" + AUDIT_COLS + ") " +
                    "VALUES ('admin', '" + escapeSql(passwordEncoder.encode("admin123")) + "', SYSDATETIME()" + AUDIT_VALS + ")");
            // 2026-06-05 사용자 결정 — 매 부팅 시 admin 비밀번호 admin123 으로 강제 재설정.
            //   사유: DB hash 가 commUserMng 의 "비밀번호 초기화" 액션 / 수동 변경으로 어긋난 경우 dev 환경 복구 안전망.
            //   운영 환경(prod profile)에서는 본 강제 갱신을 분기로 차단할 수 있도록 후속 cycle 에서 조건 추가 검토.
            String adminHash = passwordEncoder.encode("admin123");
            int updated = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_USER_PWD " +
                    "   SET USER_ENC_PWD = :hash, LAST_PWD_CHNG_DATE = SYSDATETIME(), U_USR_ID = 'admin', U_AT = SYSDATETIME() " +
                    " WHERE USER_ID = 'admin'")
                    .setParameter("hash", adminHash)
                    .executeUpdate();
            log.info("[DataInitializer] admin password force-reset to 'admin123' (UPDATE rows={})", updated);
        }

        // TB_MCM_SEC_ROLEGROUP — ROLE_GROUP_SYSADMIN
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_SYSADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_SYSADMIN', N'시스템관리자 그룹', N'시스템 전체 관리 권한', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_USER_MAPPING — (admin, ROLE_GROUP_SYSADMIN)
        insertIfAbsentComposite(
                "TB_MCM_SEC_USER_MAPPING",
                new String[]{"USER_ID", "ROLE_GROUP_ID"},
                new String[]{"admin",   "ROLE_GROUP_SYSADMIN"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID" + AUDIT_COLS + ") " +
                "VALUES ('admin', 'ROLE_GROUP_SYSADMIN'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLE — SYSADMIN
        // 2026-06-01 fix — RoleId 에서 "ROLE_" prefix 제거. McmAuthService.loadUserRoles 가 "ROLE_" + roleId 로
        // JWT claim 빌드 시 결과는 "ROLE_SYSADMIN" (Spring Security 표준). EndpointPermissionFilter /
        // SecUserService.filterMenusByRole 의 hasAuthority("ROLE_SYSADMIN") 검사와 정합.
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "SYSADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', N'시스템관리자', N'전체 권한', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // 기존 잔존 "ROLE_SYSADMIN" row 가 있다면 swap UPDATE — 멱등성 (신규 클린 DB 무영향).
        // 외래키 (TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID / TB_MCM_SEC_ROLE_MAPPING.ROLE_ID) 도 동시 UPDATE.
        cleanupLegacyRoleSysadmin();

        // TB_MCM_SEC_ROLEGROUP_MAPPING — (ROLE_GROUP_SYSADMIN, SYSADMIN)
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLEGROUP_MAPPING",
                new String[]{"ROLE_GROUP_ID",       "ROLE_ID"},
                new String[]{"ROLE_GROUP_SYSADMIN", "SYSADMIN"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_SYSADMIN', 'SYSADMIN'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_PERM — PERM_ALL (전체 권한).
        // PERMISSION_ACTION 에 모든 action 콤마 텍스트 (UserPermCache 가 콤마 분할 후 PermKey 빌드).
        String allActions = String.join(",",
                "search", "save", "delete", "import", "export", "reg",
                "confirm", "cancel", "approve", "reject", "copy",
                "deleteCmUser", "reRegCmUser", "regCmUser", "pwdinit",
                "searchUserRoleGrp", "saveUserRoleGrp",
                "searchRoleGrp", "saveUserRoleGrpCopy",
                "commonUserDept", "commonList",
                "searchObj", "searchCmMenu", "searchMenuGrp", "saveCmMenu",
                "searchCmMenuFld", "saveCmMenuFld",
                "searchCmRole", "saveCmRole",
                "searchCmRoleMap", "saveCmRoleMap",
                "searchCmPerm", "lov",
                "searchDetail", "saveDetail",
                "searchObjectLov", "searchSystemLov", "searchDeptLov",
                "searchCmRoleGrp", "saveCmRoleGrp",
                "searchCmRoleGrpMap", "saveCmRoleGrpMap",
                "searchCmRoleGrpMenu",
                "searchCmUser", "saveCmUser",
                "searchCmObj", "saveCmObj",
                "searchUserList",
                "execute", "validate", "analyze", "view",
                "activate", "deactivate", "compare", "restore",
                "apply", "release", "calculate",
                // TSK-08-02 D4 — mdm DRAFT 소유권(선점·해제·넘기기). mdm MdmActions·MdmPermissions 와 같은 이름.
                "lock", "unlock", "handover",
                // 2026-10-02 — mls 공지사항 관리(services/lsh/noticeMgmt.bpmn) 게시상태 변경. 이 토큰이 없어 SYSADMIN 도
                //   게시중지가 403 이었다. 이미 시드된 DB 는 아래 ensurePermAllActions 가 끝에 덧붙인다.
                "changeStatus",
                // 2026-10-02 — mcm 화면 사용 통계(services/csa/screenUsageStat.bpmn) 6개 action. 이미 시드된 DB 는
                //   아래 ensurePermAllActions 가 덧붙인다. screenUsage/record 는 AUTH_ONLY 라 여기 넣지 않는다.
                "overview", "byScreen", "byDept", "byUser", "unused", "history"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
                // 본 목록은 PERM_ALL 의 PERMISSION_ACTION 이며, UserPermCache 가 콤마 분할해 PermKey
                // (`{objId}/{action}`) 를 만든다. **여기에 없는 action 은 SYSADMIN 도 403 이다.**
                // 증상이 조용해서 추적이 어렵다 — 조회 1건은 되는데 콤보/팝업/저장만 죽는 형태로 나타난다.
                // 목록 정본 = 각 모듈 BPMN 의 actionGateway 분기명 전수:
                //   grep -h 'sourceRef="actionGateway"' src/backend/{모듈}/**/services/**/*.bpmn
                // 화면을 추가할 때마다 함께 갱신할 것.
        );
        insertIfAbsent(
                "TB_MCM_SEC_PERM", "PERMISSION_ID", "PERM_ALL",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM " +
                "(PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_COMMON, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('PERM_ALL', N'전체 권한', N'SYSADMIN 전체 접근', " +
                "'search,save,delete,import,export', " +
                "'" + escapeSql(allActions) + "', " +
                "'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        ensurePermAllActions(allActions);

        // TB_MCM_SEC_OBJ — 13 화면 OBJECT 시드 (W1~W9 9 화면 + cma 4 화면).
        insertMcmSecObjIfAbsent("commObjMng",          "OBJECT 관리",                  "mcm");
        insertMcmSecObjIfAbsent("commMenuMng",         "MENU 관리",                    "mcm");
        insertMcmSecObjIfAbsent("commRoleMng",         "역할 관리",            "mcm");
        insertMcmSecObjIfAbsent("commRoleGrpMng",      "역할 그룹 관리", "mcm");
        insertMcmSecObjIfAbsent("commUserMng",         "사용자 관리",      "mcm");
        insertMcmSecObjIfAbsent("commPermMng",         "PERMISSION 관리",              "mcm");
        insertMcmSecObjIfAbsent("commUserRoleCopy",    "사용자 권한 일괄 등록", "mcm");
        insertMcmSecObjIfAbsent("commSyncMng",         "동기화 관리",      "mcm");
        insertMcmSecObjIfAbsent("masterCodeMngList",   "Master Code 상세조회", "mcm");
        // cma 4 화면 — 동일 RBAC 적용
        insertMcmSecObjIfAbsent("masterCodeMng",                  "Master Code 관리",                 "mcm");
        insertMcmSecObjIfAbsent("masterCategoryMng",              "카테고리 관리",     "mcm");
        insertMcmSecObjIfAbsent("masterCodeSelPop",               "마스터코드 선택 팝업", "mcm");
        insertMcmSecObjIfAbsent("masterCodeUploadFilePopup",      "마스터코드 등록(Excel Upload)", "mcm");
        // cmb 7 화면 — 업무기준 관리(원장). 일반 4 + 팝업 3.
        //   2026-06-05 masterRuleList 만 등재했다가, 나머지 6 화면(2026-08-12 점검)이 통째로 누락돼 있었다.
        //   FE 는 /api/mcm/oasis/{serviceId}/{action} 를 호출하고 UserPermCache 는 TB_MCM_SEC_OBJ.OBJECT_ID
        //   로만 PermKey 를 만든다 → OBJECT 행이 없으면 admin(SYSADMIN)도 EndpointPermissionFilter 에서
        //   전부 403 이다(증상은 "조용한 빈 데이터"). BPMN(services/cmb/*.bpmn) 은 7개 모두 존재한다.
        insertMcmSecObjIfAbsent("masterRuleList",                 "업무기준 목록조회",            "mcm");
        insertMcmSecObjIfAbsent("masterRuleData",                 "업무기준 Data관리",            "mcm");
        insertMcmSecObjIfAbsent("masterRuleDataList",             "업무기준 상세조회",            "mcm");
        insertMcmSecObjIfAbsent("masterRuleFrame",                "업무기준 구조관리",            "mcm");
        // 팝업 3 — 모달이지만 자기 serviceId 로 OASIS 를 직접 호출하므로 OBJECT+RBAC 를 갖는다(mpp ppz 와 동일 규약).
        insertMcmSecObjIfAbsent("masterRuleListPop",              "업무기준 List조회 팝업",       "mcm");
        insertMcmSecObjIfAbsent("masterRuleFrameColListPopup",    "업무기준 컬럼 리스트 등록 팝업", "mcm");
        insertMcmSecObjIfAbsent("masterRuleDataUploadFilePopup",  "일반 업무기준 등록(Excel Upload)", "mcm");

        // TB_MCM_SEC_ROLE_MAPPING — SYSADMIN x 20 OBJECT x PERM_ALL = 20 rows
        for (String objId : new String[]{
                "commObjMng", "commMenuMng", "commRoleMng", "commRoleGrpMng", "commUserMng",
                "commPermMng", "commUserRoleCopy", "commSyncMng", "masterCodeMngList",
                "masterCodeMng", "masterCategoryMng", "masterCodeSelPop", "masterCodeUploadFilePopup",
                "masterRuleList", "masterRuleData", "masterRuleDataList", "masterRuleFrame",
                "masterRuleListPop", "masterRuleFrameColListPopup", "masterRuleDataUploadFilePopup"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + escapeSql(objId) + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }

        // TB_MCM_SEC_MENU — 메뉴 트리 시드 leaf 13 row (화면 only). round 3 (2026-06-02): 모듈/그룹 폴더 4 row 는
        // 본 테이블 owner ✗ — 모두 TB_MCM_SEC_MENU_FLD owner. PARENT_MENU_ID 는 SEC_MENU_FLD.MENU_ID 참조.
        // SecUserService.getMyMenusTree 가 두 테이블 JOIN 으로 트리 조립.
        // FULL_SEQ 는 사용자 지정 7자리 인코딩 체계 (2026-06-02 R3 P1):
        //   백만 +1,000,000 = 모듈 / 만 +10,000 = 그룹 폴더 / 백/십 +100~+990 = 화면.
        //   화면=각 그룹 +100,+110,... (폴더 FULL_SEQ 는 SEC_MENU_FLD 시드 또는 본 화면 외 범위)
        seedMcmSecMenu();

        // TB_MCM_DEPT_INFO — 부서 LoV 시드 3 row (정책 #2 / Q-002 — EAI 폐기 대체).
        // commUserMng 화면이 부서 LoV (DEPT_CD / DEPT_NM JOIN) 를 표시하려면 본 시드가 필요.
        // 빈 테이블이면 화면 LoV 가 비어 admin 사용자의 DEPT_CD='IT' 값도 미해소.
        seedMcmDeptInfo();

        // TB_MCM_SEC_MENU_FLD — 메뉴 폴더 트리 시드 4 row (2026-06-01 cycle 2 결함 fix).
        // commMenuMng 분석 §9.3 정합 — 트리 안 폴더 (디렉토리) 4 row (root mcm + group cma/csa/cme).
        // 본 시드가 없으면 commMenuMng 화면 진입 시 searchMenuFld 의 CTE 가 빈 결과 = 트리 빈 출력.
        seedMcmSecMenuFld();

        // 2026-08-07 — 1글자 코드 컬럼의 빈 문자열 정규화 (commMenuMng 전면 장애 fix).
        //   TB_MCM_SEC_MENU.USE_TP 등 length=1 컬럼에 '' 가 들어가 있으면 Hibernate 가 native query 결과를
        //   Character 로 추론하다 CoercionException("value does not contain a character: ''") 을 던져
        //   commMenuMng 의 조회·저장이 통째로 실패한다(HTTP 200 + meta.success=false 로만 보여 원인 추적이 어렵다).
        //   유입 경로와 무관하게 부팅 시 자가 치유한다.
        normalizeSecMenuCharColumns();

        // 2026-07-16 — ANALOG(로그 분석 도구) 메뉴/OBJECT/RBAC 시드 (CR관리 ppe 패턴 미러).
        //   analog-express-ui-plate 포팅 화면(anl/logViewer)의 포털 진입점. 폴더 2(analog 모듈 루트 + anl 그룹)
        //   + OBJECT 1 + 메뉴 leaf 1 + SYSADMIN RBAC 1. componentPath=anl/logViewer.
        seedAnalogMenus();

        // 2026-09-23 — TSK-01-01 mdm(마루 MDM) 스캐폴드 검증용 샘플 화면 시드.
        //   그룹 dma(용어·도메인, TSK-01-02 에서 옛 그룹에서 이동). 폴더 2(mdm 모듈 루트 + dma 그룹) + OBJECT 1
        //   + 메뉴 leaf 1 + SYSADMIN RBAC 1. componentPath=dma/mdmSample. 화면 자체는 API 를 호출하지 않는 빈 화면.
        seedMdmMenus();

        // 2026-10-02 — 공지사항 관리(lsh/noticeMgmt) 메뉴. 메뉴는 공통관리(mcm) 아래, 코드는 mls. 포털 홈 공지 목록(noticeBoard)은
        //   AUTH_ONLY 라 시드가 없다(seedMlsMenus javadoc).
        seedMlsMenus();

        // 2026-10-02 — 화면 사용 통계(csa/screenUsageStat) 메뉴. 시스템관리(csa) 아래 leaf 1 — 사이드바 "시스템관리 > 화면 사용 통계".
        seedScreenUsageMenus();

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
        fixModuleRootMenuSeqOrder();

        // recomputeMenuFullSeq 는 mcm-core SecMenuNativeRepository 의 native @Query(MCMAPUSER. schema 접두) 이지만,
        // SQLite 에서는 McmAuditStatementInspector(JpaConfig 가 SQLite 한정 등록)가 schema 접두를 제거하므로 그대로 동작.
        secMenuNativeRepository.recomputeMenuFullSeq();
    }

    /**
     * TB_MCM_SEC_MENU 시드 — 메뉴 트리 17 row (화면 leaf 만). 멱등 (복합 PK MENU_ID + MENU_SEQ).
     *
     * <p>SecUserService.getMyMenus / getMyMenusTree 가 본 시드를 읽어 myMenus / myMenusTree 응답을 만든다.
     * 본 시드가 없으면 myMenus 가 빈 배열을 반환하여 FE 사이드바 메뉴가 표시되지 않는다.
     *
     * <p>구조 (2026-06-02 R3 P1 round 3 — 데이터 구조 분리 / 사용자 결정):
     * <ul>
     *   <li><b>TB_MCM_SEC_MENU 에는 화면 (leaf) 만 보관.</b> 모듈/그룹 폴더 (mcm / cma / csa / cme / cmb / cmz)
     *       6 row 는 {@code TB_MCM_SEC_MENU_FLD} 가 owner — 본 테이블에 INSERT ✗.</li>
     *   <li>cma group leaf 2 (PARENT_MENU_ID="cma"): masterCategoryMng=1010100 / masterCodeMng=1010110</li>
     *   <li>csa group leaf 8 (PARENT_MENU_ID="csa"): commObjMng=1020100 / commMenuMng=1020110 /
     *       commRoleMng=1020120 / commRoleGrpMng=1020130 / commUserMng=1020140 / commPermMng=1020150 /
     *       commUserRoleCopy=1020160 / commSyncMng=1020170</li>
     *   <li>cme group leaf 1 (PARENT_MENU_ID="cme"): masterCodeMngList=1030100</li>
     *   <li>cmb group leaf 4 (PARENT_MENU_ID="cmb"): masterRuleList=1040100 / masterRuleData=1040110 /
     *       masterRuleDataList=1040120 / masterRuleFrame=1040130.
     *       2026-08-14 — 뒤 3 건은 OBJECT·RBAC·FE 라우팅이 모두 있는데 메뉴 leaf 만 없어 사이드바 진입이
     *       불가했다(팝업 3 건과 달리 일반 업무화면이므로 {@code MENU_VIEW_YN='Y'}).</li>
     *   <li><b>cmz 팝업 leaf 5</b> (PARENT_MENU_ID="cmz", 전부 {@code MENU_VIEW_YN='N'}):
     *       masterCodeSelPop=1050100 / masterCodeUploadFilePopup=1050110 / masterRuleListPop=1050120 /
     *       masterRuleFrameColListPopup=1050130 / masterRuleDataUploadFilePopup=1050140.
     *       2026-08-13 에 cma·cmb 에서 팝업 전용 그룹으로 이관 (mpp {@code ppz} 와 동일 규약).</li>
     * </ul>
     *
     * <p>FULL_SEQ 인코딩 (사용자 결정 2026-06-02):
     * <ul>
     *   <li>백만 자리 (+1,000,000) = 모듈 (mcm=1)</li>
     *   <li>만 자리 (+10,000)      = 그룹 폴더 (cma=01 / csa=02 / cme=03 / cmb=04 / cmz=05)</li>
     *   <li>백/십 자리 (+100 시작, +10 증가) = 화면 (100 → 110 → 120 ...)</li>
     * </ul>
     * 시드 리터럴은 체계 표현용이고, 부팅 말미 {@code recomputeMenuFullSeq()} 가 트리 위치 기준으로
     * 실제 값을 재부여한다 (모듈 순번이 바뀌면 백만 자리도 달라진다).
     *
     * <p>OBJECT_ID 는 TB_MCM_SEC_OBJ 의 OBJECT_ID (=화면식별자) 와 1:1 매칭 — 권한 chain (SecUser → SecUserMapping →
     * SecRoleGroupMapping → SecRoleMapping.OBJECT_ID) 검증용. 모든 leaf row 는 OBJECT_ID 보유.
     *
     * <p>정정 처리 (round 3 — 직전 worker 가 SEC_MENU 에 잘못 적재한 모듈/그룹 4 row 제거):
     * <ol>
     *   <li>legacy {@code grp-cma}/{@code grp-csa}/{@code grp-cme} 와 신규 {@code mcm}/{@code cma}/{@code csa}/
     *       {@code cme} 폴더 row 가 SEC_MENU 에 잔존하면 DELETE. SEC_MENU_FLD 만 폴더 owner.</li>
     *   <li>FULL_SEQ 7자리 인코딩 일괄 재적용 (잔존 DB 의 legacy FULL_SEQ "1"/"100"/"110"/... 정정 — leaf 17 만).</li>
     * </ol>
     */
    private void seedMcmSecMenu() {
        // R3 P1 round 3 — SEC_MENU 의 폴더 row (모듈/그룹) 정리:
        //  - swapLegacyGrpMenuIds: SEC_MENU_FLD 의 legacy grp-* swap (FLD owner 정합 보장)
        //  - cleanupLegacyFolderRowsInSecMenu: SEC_MENU 의 폴더 row (mcm/cma/csa/cme + grp-*) DELETE
        //  자식 FK (leaf 의 PARENT_MENU_ID='cma'/'csa'/'cme' 등) 는 SEC_MENU 내부 참조이며 외래키 제약이 ✗
        //  (entity 미선언) → 부모 row DELETE 가능. 자식 leaf 는 그대로 유지.
        swapLegacyGrpMenuIds();
        cleanupLegacyFolderRowsInSecMenu();

        // cma group leaf 2 — PARENT_MENU_ID = cma (round 3 매핑 / 백/십 자리 +100~+110)
        //   팝업 2종(masterCodeSelPop · masterCodeUploadFilePopup)은 2026-08-13 팝업 전용 그룹 cmz 로 이관했다
        //   (아래 "cmz 팝업 leaf 5" 블록). 본 그룹에는 사이드바에 뜨는 업무 화면만 남는다.
        insertMcmSecMenuIfAbsent("masterCategoryMng",         "001", "1010100", "카테고리 관리",                       "cma", "masterCategoryMng");
        insertMcmSecMenuIfAbsent("masterCodeMng",             "001", "1010110", "Master Code 관리",                    "cma", "masterCodeMng");

        // csa group leaf 8 — PARENT_MENU_ID = csa (round 3 매핑 / 백/십 자리 +100~+170)
        insertMcmSecMenuIfAbsent("commObjMng",        "001", "1020100", "OBJECT 관리",            "csa", "commObjMng");
        insertMcmSecMenuIfAbsent("commMenuMng",       "001", "1020110", "메뉴 관리",              "csa", "commMenuMng");
        insertMcmSecMenuIfAbsent("commRoleMng",       "001", "1020120", "역할 관리",              "csa", "commRoleMng");
        insertMcmSecMenuIfAbsent("commRoleGrpMng",    "001", "1020130", "역할 그룹 관리",         "csa", "commRoleGrpMng");
        insertMcmSecMenuIfAbsent("commUserMng",       "001", "1020140", "사용자 관리",            "csa", "commUserMng");
        insertMcmSecMenuIfAbsent("commPermMng",       "001", "1020150", "PERMISSION 관리",        "csa", "commPermMng");
        insertMcmSecMenuIfAbsent("commUserRoleCopy",  "001", "1020160", "사용자 권한 일괄 등록",  "csa", "commUserRoleCopy");
        insertMcmSecMenuIfAbsent("commSyncMng",       "001", "1020170", "동기화 관리",            "csa", "commSyncMng");

        // cme group leaf 1 — PARENT_MENU_ID = cme (round 3 매핑 / 백/십 자리 +100)
        insertMcmSecMenuIfAbsent("masterCodeMngList", "001", "1030100", "Master Code 상세조회",   "cme", "masterCodeMngList");

        // cmb group leaf 4 — PARENT_MENU_ID = cmb (그룹 04 / 백/십 자리 +100~+130) — 2026-06-05 masterRuleList 등재
        //   팝업 3종은 아래 cmz 블록으로 이관(2026-08-13). 본 그룹에는 업무 화면만 남는다.
        //   2026-08-14 — 일반 화면 3종(masterRuleData/masterRuleDataList/masterRuleFrame) 추가 등재.
        //     OBJECT(TB_MCM_SEC_OBJ) · RBAC(SYSADMIN×PERM_ALL) · BPMN(services/cmb/*.bpmn) ·
        //     FE PAGE_REGISTRY 키("cmb/masterRuleData" 외 2)는 이미 있는데 메뉴 leaf 만 없어
        //     사이드바 진입점이 생기지 않았다(직접 URL 로만 도달 가능).
        //   MENU_VIEW_YN 은 6-인자 오버로드의 기본값 'Y'(표시) — cmz 팝업과 달리 일반 업무화면이므로
        //     사이드바에 떠야 하고, PAGE_REGISTRY 키가 실재하므로 클릭 시 오류탭이 열리지 않는다.
        //   MENU_NM 은 위 TB_MCM_SEC_OBJ 시드의 OBJECT_NM 을 그대로 사용(단일 식별자·단일 명칭 규약).
        insertMcmSecMenuIfAbsent("masterRuleList",     "001", "1040100", "업무기준 목록조회",      "cmb", "masterRuleList");
        insertMcmSecMenuIfAbsent("masterRuleData",     "001", "1040110", "업무기준 Data관리",      "cmb", "masterRuleData");
        insertMcmSecMenuIfAbsent("masterRuleDataList", "001", "1040120", "업무기준 상세조회",      "cmb", "masterRuleDataList");
        insertMcmSecMenuIfAbsent("masterRuleFrame",    "001", "1040130", "업무기준 구조관리",      "cmb", "masterRuleFrame");

        // ── cmz 팝업 leaf 5 — PARENT_MENU_ID = cmz, MENU_VIEW_YN='N'(사이드바 숨김). 2026-08-13 ──
        //   사용자 결정: "팝업과 팝업그룹은 전부 등재하고 트리 표시여부는 전부 숨김". 종전에는 팝업이
        //   업무 그룹(cma 2 · cmb 3)에 섞여 있었고, 이번에 mpp ppz 와 동일한 팝업 전용 그룹으로 모았다.
        //   (OBJECT/RBAC 는 seedMcmSecRbac 에 기시드 — 여기서는 메뉴 트리 위치만 다룬다.)
        //
        //   leaf 를 두는 이유 = ① 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 팝업 단위 RBAC 를
        //   역할/메뉴 화면에서 화면과 똑같이 다루고 ② commMenuMng 에서 명칭·순서를 관리하기 위함이다
        //   (insertMcmSecMenuIfAbsent 7-인자 오버로드 javadoc "팝업 leaf 정책").
        //   숨김인 이유 = 팝업은 부모 화면에서 모달로 열리는 컴포넌트라 FE PAGE_REGISTRY 에 라우팅 키가 없다.
        //   사이드바에 진입점이 뜨면 클릭 시 빈 오류탭이 열린다(cma 팝업 2 건에서 실제로 발생했던 결함).
        //   MENU_NM 은 위 TB_MCM_SEC_OBJ 시드의 OBJECT_NM 을 그대로 사용(단일 식별자·단일 명칭 규약).
        //   FULL_SEQ = 모듈 백만(mcm=1) + 그룹 만(cmz=05) + 화면 백·십(+100 부터 +10 씩).
        //   나열 순서는 이관 전 소속(cma 2 → cmb 3)을 유지해 대조가 쉽도록 했다.
        insertMcmSecMenuIfAbsent("masterCodeSelPop",              "001", "1050100", "마스터코드 선택 팝업",             "cmz", "masterCodeSelPop",              "N");
        insertMcmSecMenuIfAbsent("masterCodeUploadFilePopup",     "001", "1050110", "마스터코드 등록(Excel Upload)",    "cmz", "masterCodeUploadFilePopup",     "N");
        insertMcmSecMenuIfAbsent("masterRuleListPop",             "001", "1050120", "업무기준 List조회 팝업",           "cmz", "masterRuleListPop",             "N");
        insertMcmSecMenuIfAbsent("masterRuleFrameColListPopup",   "001", "1050130", "업무기준 컬럼 리스트 등록 팝업",   "cmz", "masterRuleFrameColListPopup",   "N");
        insertMcmSecMenuIfAbsent("masterRuleDataUploadFilePopup", "001", "1050140", "일반 업무기준 등록(Excel Upload)", "cmz", "masterRuleDataUploadFilePopup", "N");
        // 이미 적재된 DB(개발 MSSQL·동료 SQLite) 백필 — INSERT 헬퍼는 기존 행을 갱신하지 않으므로,
        //   시드 리터럴만 cmz 로 바꿔서는 기존 DB 의 부모가 영원히 cma/cmb 로 남는다.
        for (String popupId : new String[]{
                "masterCodeSelPop", "masterCodeUploadFilePopup",
                "masterRuleListPop", "masterRuleFrameColListPopup", "masterRuleDataUploadFilePopup"}) {
            ensureMenuParent(popupId, "cmz");
            ensureMenuViewYn(popupId, "N");
        }

        // FULL_SEQ 7자리 인코딩 일괄 재적용 (잔존 DB 의 legacy FULL_SEQ "1"/"100"/"110"/... 정정 — leaf 17 row 만).
        int updatedFullSeq = applyR3FullSeqEncoding();
        log.info("[DataInitializer] SEC_MENU UPDATE — leaf FULL_SEQ rows={}", updatedFullSeq);
    }

    /**
     * R3 P1 round 3 (2026-06-02) — TB_MCM_SEC_MENU 에서 폴더 (모듈/그룹) row 제거.
     *
     * <p>사용자 결정: 메인 그리드 조회 시 메뉴 폴더 표시 ✗. TB_MCM_SEC_MENU 는 화면 (leaf) 만 보관.
     * 모듈/그룹 폴더는 TB_MCM_SEC_MENU_FLD 가 owner.
     *
     * <p>처리 대상 (잔존 DB only — 신규 클린 DB 무영향):
     * <ul>
     *   <li>legacy R3 P1 시드: {@code mcm} / {@code cma} / {@code csa} / {@code cme} (PARENT_MENU_ID IS NULL or 'mcm')</li>
     *   <li>legacy cycle 1 시드: {@code grp-cma} / {@code grp-csa} / {@code grp-cme}</li>
     * </ul>
     *
     * <p>자식 leaf row (PARENT_MENU_ID='cma'/'csa'/'cme') 는 entity 미선언 = FK 제약 ✗ 라 부모 폴더 row DELETE
     * 가능. 자식 leaf 는 그대로 유지하며 PARENT_MENU_ID 값만 SEC_MENU_FLD.MENU_ID 를 참조하는 의미가 된다.
     */
    private void cleanupLegacyFolderRowsInSecMenu() {
        String[] folderIds = {"mcm", "cma", "csa", "cme", "grp-cma", "grp-csa", "grp-cme"};
        int totalDeleted = 0;
        for (String id : folderIds) {
            int del = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", id).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] R3 round3 — SEC_MENU 폴더 row DELETE MENU_ID={} rows={}", id, del);
                totalDeleted += del;
            }
        }
        if (totalDeleted > 0) {
            log.info("[DataInitializer] R3 round3 — SEC_MENU 폴더 row 총 DELETE rows={} (폴더 owner=SEC_MENU_FLD 만)", totalDeleted);
        }
    }

    /**
     * R3 P1 round 3 (2026-06-02) — 잔존 grp- 접두 row 처리.
     *
     * <p>대상 테이블 정합 (round 3 — 데이터 구조 분리):
     * <ul>
     *   <li><b>TB_MCM_SEC_MENU_FLD</b> (폴더 owner): legacy grp-cma/grp-csa/grp-cme 를 신규 cma/csa/cme 로 swap.
     *       PARENT_MENU_ID FK 도 동시 swap.</li>
     *   <li><b>TB_MCM_SEC_MENU</b> (화면 leaf owner): 폴더 row 는 본 테이블에 존재 ✗ 가 정합 —
     *       PARENT_MENU_ID 의 legacy 값만 신규로 swap. 폴더 row 자체 (grp-* / mcm / cma / csa / cme) 는
     *       {@link #cleanupLegacyFolderRowsInSecMenu()} 가 DELETE.</li>
     * </ul>
     *
     * <p>FK 순서: 자식 PARENT_MENU_ID 먼저 swap → 부모 PK swap (FLD 만). PK 충돌 시 legacy DELETE.
     */
    private void swapLegacyGrpMenuIds() {
        String[] legacy = {"grp-cma", "grp-csa", "grp-cme"};
        String[] target = {"cma",     "csa",     "cme"};
        for (int i = 0; i < legacy.length; i++) {
            String oldId = legacy[i];
            String newId = target[i];
            // (a) TB_MCM_SEC_MENU 자식 PARENT_MENU_ID swap (leaf 의 부모 참조만 정정 — 폴더 row 자체는 cleanup 가 DELETE)
            int childMenu = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = :n WHERE PARENT_MENU_ID = :o")
                    .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
            // (b) TB_MCM_SEC_MENU_FLD 자식 PARENT_MENU_ID swap (폴더 children)
            int childFld = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = :n WHERE PARENT_MENU_ID = :o")
                    .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
            // (c) TB_MCM_SEC_MENU_FLD 폴더 row 자체 PK swap (신규 PK 존재 시 legacy DELETE)
            Number newExistsFld = (Number) nq(
                    "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :n")
                    .setParameter("n", newId).getSingleResult();
            if (newExistsFld != null && newExistsFld.intValue() > 0) {
                int delFld = nq(
                        "DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :o")
                        .setParameter("o", oldId).executeUpdate();
                if (delFld > 0) {
                    log.info("[DataInitializer] R3 round3 grp- legacy delete (신규 PK 충돌) — MENU_FLD MENU_ID={} rows={}", oldId, delFld);
                }
            } else {
                int updFld = nq(
                        "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_ID = :n WHERE MENU_ID = :o")
                        .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
                if (updFld > 0) {
                    log.info("[DataInitializer] R3 round3 grp- legacy swap — MENU_FLD MENU_ID {}→{} rows={}", oldId, newId, updFld);
                }
            }
            if (childMenu > 0 || childFld > 0) {
                log.info("[DataInitializer] R3 round3 grp- child PARENT_MENU_ID swap — MENU={} MENU_FLD={} ({}→{})",
                        childMenu, childFld, oldId, newId);
            }
        }
    }

    /**
     * R3 P1 round 3 (2026-06-02) — TB_MCM_SEC_MENU 의 leaf 13 row FULL_SEQ 7자리 인코딩 일괄 재적용
     * (멱등 — 동일 값 UPDATE 무영향).
     *
     * <p>인코딩 = 모듈 백만(+1,000,000) + 그룹 폴더 만(+10,000) + 화면 백/십(+100~+990).
     * leaf 13 만 본 테이블의 대상 — 폴더 4 row (mcm/cma/csa/cme) 는 SEC_MENU_FLD 가 owner 라 본 인코딩 대상 ✗.
     *
     * @return UPDATE 영향 행 수 합산 (정보용)
     */
    private int applyR3FullSeqEncoding() {
        // {menuId, fullSeq, parentMenuId} — Round 3 정합 PARENT_MENU_ID 도 함께 멱등 정정.
        // 잔존 row 의 PARENT_MENU_ID 가 자기 자신 또는 다른 값으로 잘못 시드된 경우 본 UPDATE 가 정정.
        String[][] rows = {
            {"masterCategoryMng",         "1010100", "cma"},
            {"masterCodeMng",             "1010110", "cma"},
            {"commObjMng",                "1020100", "csa"},
            {"commMenuMng",               "1020110", "csa"},
            {"commRoleMng",               "1020120", "csa"},
            {"commRoleGrpMng",            "1020130", "csa"},
            {"commUserMng",               "1020140", "csa"},
            {"commPermMng",               "1020150", "csa"},
            {"commUserRoleCopy",          "1020160", "csa"},
            {"commSyncMng",               "1020170", "csa"},
            {"masterCodeMngList",         "1030100", "cme"},
            {"masterRuleList",            "1040100", "cmb"},
            // 2026-08-14 등재 — 본 배열에 빠지면 잔존 DB 의 FULL_SEQ/PARENT_MENU_ID 가 매 부팅 어긋난 채 남는다
            //   (insertMcmSecMenuIfAbsent 는 기존 행을 갱신하지 않으므로 신규 leaf 도 반드시 여기 함께 등재).
            {"masterRuleData",            "1040110", "cmb"},
            {"masterRuleDataList",        "1040120", "cmb"},
            {"masterRuleFrame",           "1040130", "cmb"},
            // ── cmz 팝업 5 (2026-08-13 이관) — 업무 그룹(cma/cmb)이 아닌 팝업 전용 그룹이 정본이다.
            //   ⚠ 본 배열은 PARENT_MENU_ID 를 무조건 덮어쓴다. 여기에 옛 부모(cma/cmb)가 남아 있으면
            //   seedMcmSecMenu 말미의 ensureMenuParent(…, "cmz") 백필을 매 부팅마다 되돌려 버린다.
            //   팝업의 소속 그룹을 바꿀 때는 반드시 두 곳을 함께 고칠 것.
            //   MENU_VIEW_YN 은 본 UPDATE 대상 ✗ (사용자 편집 값 — ensureMenuViewYn 이 명시 대상만 정정).
            {"masterCodeSelPop",              "1050100", "cmz"},
            {"masterCodeUploadFilePopup",     "1050110", "cmz"},
            {"masterRuleListPop",             "1050120", "cmz"},
            {"masterRuleFrameColListPopup",   "1050130", "cmz"},
            {"masterRuleDataUploadFilePopup", "1050140", "cmz"},
        };
        int total = 0;
        for (String[] r : rows) {
            // 2026-06-05 — PK = MENU_ID 단독이므로 MENU_SEQ='001' 조건 제거 (MENU_ID 로 단건 매칭).
            int n = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET FULL_SEQ = :f, PARENT_MENU_ID = :p " +
                    "WHERE MENU_ID = :m")
                    .setParameter("f", r[1])
                    .setParameter("p", r[2])
                    .setParameter("m", r[0])
                    .executeUpdate();
            total += n;
        }
        return total;
    }

    /**
     * TB_MCM_SEC_MENU_FLD 시드 — 메뉴 폴더 트리 6 row (mcm root + 업무 group 4 + 팝업 group 1).
     *
     * <p>commMenuMng 분석리포트 §9.3 정합 — 본 4 컬럼 (MENU_ID PK / MENU_SEQ 정렬 / MENU_NM / PARENT_MENU_ID).
     * As-Is 의도는 폴더 (디렉토리) 트리만 보유 → leaf 화면 행은 별도 매핑 (TB_MCM_SEC_MENU). 본 시드는
     * mcm root 1 + 업무 group 4 (cma/csa/cme/cmb) + 팝업 group 1 (cmz, 숨김) = 6 row 적재.
     *
     * <p>SecMenuNativeRepository.searchMenuFld 의 CTE WITH RECURSIVE 가:
     * <ul>
     *   <li>anchor = PARENT_MENU_ID IS NULL → mcm 1 row (LEV=0)</li>
     *   <li>recursive = child.PARENT_MENU_ID = parent.MENU_ID → group 5 row (LEV=1)</li>
     * </ul>
     *
     * <p>{@code cmz} 만 {@code MENU_VIEW_YN='N'} (팝업 전용 그룹 — 사이드바 비노출). 나머지는 값을 두지
     * 않으며 NULL 은 표시로 취급된다.
     *
     * <p>insertIfAbsent 가드로 멱등 (이미 시드된 row 가 있으면 skip).
     */
    private void seedMcmSecMenuFld() {
        // TB_MCM_SEC_MENU_FLD 는 entity 미보유 + audit listener 미적용 — DDL 본 4 컬럼만 INSERT (audit 9 컬럼은
        // 본 stub DDL 의 컬럼 list 에 없음. W1 commObjMng 가 적재한 4 컬럼 stub + W2 가 ALTER 로 MENU_SEQ 만 ADD).
        // 추후 본 테이블을 entity 화 / audit 통합 시 audit fragment 적재 필요.

        // Root 1 — mcm (PARENT_MENU_ID = NULL)
        // MENU_SEQ='00000002' — 공정계획(mpn=00000001) 다음 순서. 폴더 정렬은 MENU_SEQ 기준(2026-06-10).
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "mcm",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('mcm', '00000002', N'공통관리', NULL)");

        // Group 3 — cma / csa / cme (PARENT_MENU_ID = 'mcm') — 2026-06-02 R3 P1 grp- 접두 제거.
        // 잔존 grp-* row 는 swapLegacyGrpMenuIds() 가 신규 토큰으로 swap (FK 동시).
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cma",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cma', '00000100', N'마스터관리(원장)', 'mcm')");

        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "csa",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('csa', '00000200', N'시스템관리', 'mcm')");

        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cme",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cme', '00000300', N'마스터관리(가동)', 'mcm')");

        // cmb group (PARENT_MENU_ID = 'mcm') — 2026-06-05 masterRuleList 등재 (업무기준 관리(원장))
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cmb",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cmb', '00000400', N'업무기준관리(원장)', 'mcm')");

        // cmz — 팝업 전용 그룹 (PARENT_MENU_ID = 'mcm', MENU_VIEW_YN='N' 숨김). 2026-08-13 신설.
        //   사용자 결정: "팝업과 팝업그룹은 전부 등재하되 트리 표시는 전부 숨김". mpp 가 먼저 채택한
        //   ppz 규약(팝업 20종을 업무 그룹이 아닌 전용 숨김 그룹에 모음)을 mcm 에도 동일 적용한다.
        //   종전에는 팝업 5종이 업무 그룹(cma 2 · cmb 3) 안에 섞여 있어, 그룹을 펼쳤을 때 commMenuMng
        //   메뉴 트리에서 업무 화면과 팝업이 구분되지 않았다.
        //   위 4개 그룹과 달리 insertMpnFld 를 쓰는 이유 = 이 헬퍼만 MENU_VIEW_YN 을 명시 INSERT 한다
        //   (모듈 무관 범용 FLD 헬퍼 — mpn/mls/mqc/analog/mpp 가 이미 공용한다).
        //   폴더까지 숨겨야 하는 이유 = 자식 leaf 를 전부 'N' 으로 숨겨도 폴더가 표시면 사이드바에
        //   빈 그룹이 남는다(seedMppMenus javadoc "팝업 leaf 정책").
        //   FULL_SEQ = 모듈 백만(mcm=1) + 그룹 만(cmz=05) — cma01/csa02/cme03/cmb04 다음 자리.
        //   시드 리터럴은 체계만 맞으면 되고, 부팅 말미 recomputeMenuFullSeq() 가 트리 위치 기준으로
        //   실제 값을 재부여한다(현 DB 실값은 모듈 순번이 2 라 20xxxxx 대다).
        insertMpnFld("cmz", "00000500", "팝업", "mcm", 1050000L, "N");
        // 이미 적재된 DB(개발 MSSQL·동료 SQLite) 백필 — insertMpnFld 는 기존 행을 갱신하지 않는다.
        ensureMenuFldViewYn("cmz", "N");
    }

    /**
     * {@code TB_MCM_SEC_MENU} 의 1글자 코드 컬럼에서 빈 문자열을 제거한다 (2026-08-07).
     *
     * <p><b>왜 필요한가</b> — {@code SecMenuNativeRepository} 는 native query 결과를 {@code List<Object[]>}
     * 로 받는데, Hibernate 6 는 컬럼 길이가 1인 VARCHAR 를 {@code Character} 로 추론한다. 값이 {@code ''}
     * 이면 {@code CharacterJavaType.wrap} 이
     * {@code CoercionException: value does not contain a character: ''} 를 던져 <b>행 한 건 때문에
     * commMenuMng 화면의 조회·저장 전체가 실패</b>한다. OASIS 는 이를 HTTP 200 + {@code meta.success=false}
     * 로 돌려주므로 화면에서는 "아무 일도 안 일어나는" 것처럼 보인다.
     *
     * <p>{@code ''} 는 Y/N·WEB 같은 코드값이 들어가야 할 자리에 잘못 들어간 값이므로 기본값으로 승격한다.
     * 유입 경로(구 시드·수동 저장 등)와 무관하게 매 부팅 멱등 보정한다.
     */
    private void normalizeSecMenuCharColumns() {
        int n = 0;
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET USE_TP = 'Y' "
              + " WHERE USE_TP IS NULL OR LTRIM(RTRIM(USE_TP)) = ''").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_VIEW_YN = 'Y' "
              + " WHERE MENU_VIEW_YN IS NULL OR LTRIM(RTRIM(MENU_VIEW_YN)) = ''").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_TP = 'WEB' "
              + " WHERE MENU_TP IS NULL OR LTRIM(RTRIM(MENU_TP)) = ''").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] SEC_MENU 코드컬럼 빈 문자열 정규화 — {} 행 보정 (Character 변환 오류 예방)", n);
        }
    }

    /**
     * ANALOG(로그 분석 도구) 메뉴/OBJECT/RBAC 시드 — seedMppCrMenus(ppe) 패턴 미러.
     *
     * <p>2026-07-16 — analog-express-ui-plate 포팅 화면(로그 뷰어)의 포털 진입점 등록:
     * <ul>
     *   <li>폴더 2: analog(모듈 루트, 로그 분석) + anl(그룹, 로그 조회) — TB_MCM_SEC_MENU_FLD (insertMpnFld 재사용).</li>
     *   <li>OBJECT 1: logViewer — TB_MCM_SEC_OBJ (SYSTEM_CODE='analog' = FE moduleId(sysCd),
     *       m-mcm PORTAL_MODULE_CONFIG 의 analog 로더로 라우팅).</li>
     *   <li>메뉴 leaf 1: parent='anl' — TB_MCM_SEC_MENU. componentPath = 'anl/logViewer' (SecUserService 조립).</li>
     *   <li>RBAC 1: SYSADMIN × logViewer × PERM_ALL — TB_MCM_SEC_ROLE_MAPPING.</li>
     * </ul>
     *
     * <p>FULL_SEQ 인코딩(2026-06-02 사용자 결정): 모듈 백만(analog=4,000,000 — mcm=1/mpn=2/mpp=3 다음) /
     * 그룹 만(anl=4,010,000) / 화면 백·십(4010100). MENU_SEQ analog='00000004'(mpp='00000003' 다음).
     * 시드 후 recomputeMenuFullSeq() 가 트리 위치 기준으로 FULL_SEQ 재부여(멱등). 모두 insertIfAbsent 멱등.
     */
    private void seedAnalogMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // ── 폴더 (FLD) — root analog + group anl ──
        insertMpnFld("analog", "00000004", "로그 분석", null,     4000000L);
        insertMpnFld("anl",    "00000100", "로그 조회", "analog", 4010000L);

        // ── OBJECT 1 — SYSTEM_CODE='analog' 가 FE moduleId(sysCd)가 된다 ──
        insertMcmSecObjIfAbsent("logViewer", "로그 뷰어", "analog");

        // ── 메뉴 leaf 1 (parent=anl) — componentPath = 'anl/logViewer' ──
        insertMcmSecMenuIfAbsent("logViewer", "001", "4010100", "로그 뷰어", "anl", "logViewer");

        // ── RBAC — SYSADMIN × 1 OBJECT × PERM_ALL ──
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", "logViewer", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'logViewer', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] ANALOG 로그 분석(anl) 메뉴 시드 — 폴더 2 + OBJECT 1 + 메뉴 leaf 1 + RBAC 1");
    }

    /**
     * 화면 사용 통계(csa/screenUsageStat) 메뉴 시드 (2026-10-02) — OBJECT 1 + 메뉴 leaf 1 + SYSADMIN × PERM_ALL 1.
     * 폴더는 기존 시스템관리 그룹 {@code csa} 를 쓰므로 더 만들지 않는다. componentPath={@code csa/screenUsageStat} 는
     * m-mcm 페이지 레지스트리 키와 같다. FULL_SEQ 1020180 은 csa 기존 leaf(1020100~1020170) 다음이다.
     * 모두 insert-if-absent 라 재기동해도 중복 행이 생기지 않는다.
     */
    private void seedScreenUsageMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        final String objId = "screenUsageStat";
        insertMcmSecObjIfAbsent(objId, "화면 사용 통계", "mcm");
        insertMcmSecMenuIfAbsent(objId, "001", "1020180", "화면 사용 통계", "csa", objId);
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', '" + objId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 화면 사용 통계 메뉴 시드 — OBJECT 1(screenUsageStat) + 메뉴 leaf 1(csa/screenUsageStat) + RBAC(SYSADMIN 1)");
    }

    /**
     * 공지사항 관리(noticeMgmt) 메뉴·OBJECT·RBAC 시드 — 2026-10-02. <b>메뉴는 공통관리(mcm) 아래, 코드는 mls</b> 다.
     *
     * <ul>
     *   <li>폴더 1: lsh(공지관리) — 부모는 공통관리 루트 {@code mcm}. MENU_SEQ '00000600' 으로 기존 그룹
     *       cma(100)·csa(200)·cme(300)·cmb(400)·cmz(500, 숨김 팝업) 뒤에 둔다 — 기존 그룹의 순서·FULL_SEQ 는 그대로다.
     *       폴더 ID {@code lsh} 는 식별자 사전의 mls 그룹 코드이고, componentPath 가 {@code PARENT_MENU_ID/OBJECT_ID} 로
     *       조립되므로 FE 경로 {@code lsh/noticeMgmt}(m-mls {@code pages/lsh/noticeMgmt/page}) 와 맞추려면 폴더 ID 를 바꾸면 안 된다.</li>
     *   <li>noticeMgmt: OBJECT(SYSTEM_CODE='mls' — 화면 코드를 m-mls 로더로 부른다) + 메뉴 leaf(parent=lsh) + SYSADMIN × PERM_ALL.
     *       action(search·save·changeStatus) 은 PERM_ALL 에 있다(changeStatus 는 같은 날 allActions 에 추가).</li>
     * </ul>
     *
     * <p><b>경과</b> — 같은 날 처음에는 물류관리(mls) 모듈 루트를 새로 만들고 그 아래에 lsh 를 두었다. 사용자 요청으로 공통관리 아래로
     * 옮겼다. insert-if-absent 는 이미 있는 lsh 행을 옮기지 않으므로 {@link #relocateNoticeFolderToMcm()} 이 멱등 보정한다. mls 루트
     * 폴더는 더 시드하지 않는다(이미 생긴 DB 의 빈 mls 폴더는 보이는 화면이 없어 사이드바에 나오지 않는다).
     *
     * <p><b>포털 홈 공지 목록(mls noticeBoard)은 여기서 시드하지 않는다</b> — 로그인한 모든 사용자에게 여는 AUTH_ONLY 경로다
     * (m-mcm {@code proxy.ts} authOnlyPrefixes · mcm-core {@code EndpointPermissionFilter}). 게시 대상은 서비스가 현재 사용자
     * 역할로 거른다. 같은 날 잠시 두었던 {@code PERM_SEARCH_ONLY} 권한 세트와 noticeBoard OBJECT·역할 매핑 시드는 뺐다.
     * 이미 시드된 DB 에 남은 그 행들은 지우지 않는다 — search 하나만 주는 행이라 AUTH_ONLY 와 결과가 같아 해가 없다.
     *
     * <p>FULL_SEQ: 공통관리 모듈(1,000,000) + 그룹 6번째(lsh=1,060,000) + 화면(1060100). 부팅 끝 recomputeMenuFullSeq() 가
     * 트리 위치 기준으로 다시 매긴다. 모두 멱등이다.
     */
    private void seedMlsMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // ── 폴더 (FLD) — 공통관리(mcm) 아래 lsh(공지관리). 이미 다른 부모로 시드된 DB 는 아래 보정이 옮긴다 ──
        insertMpnFld("lsh", "00000600", "공지관리", "mcm", 1060000L);
        relocateNoticeFolderToMcm();

        // ── noticeMgmt — OBJECT + 메뉴 leaf + SYSADMIN 전체 권한 ──
        insertMcmSecObjIfAbsent("noticeMgmt", "공지사항 관리", "mls");
        insertMcmSecMenuIfAbsent("noticeMgmt", "001", "1060100", "공지사항 관리", "lsh", "noticeMgmt");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",  "PERMISSION_ID"},
                new String[]{"SYSADMIN", "noticeMgmt", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'noticeMgmt', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 공지 메뉴 시드 — 폴더 1(mcm/lsh) + OBJECT 1(noticeMgmt, SYSTEM_CODE=mls) + 메뉴 leaf 1(lsh/noticeMgmt) + RBAC(SYSADMIN 1)");
    }

    /**
     * 공지관리 폴더(lsh) 위치 보정 — 부모가 공통관리 루트({@code mcm})가 아니면 옮긴다 (2026-10-02, 멱등).
     *
     * <p>같은 날 잠깐 물류관리(mls) 루트 아래로 시드된 DB 를 맞춘다. 옮길 때 MENU_SEQ 도 '00000600' 으로 바꾼다 — 옛 값 '00000100' 그대로
     * 공통관리 아래로 가면 cma(100)와 순번이 겹쳐 기존 그룹의 FULL_SEQ 가 한 칸씩 밀린다. 부모가 이미 {@code mcm} 이면 손대지 않으므로
     * 메뉴 관리 화면에서 사용자가 바꾼 순서는 보존된다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void relocateNoticeFolderToMcm() {
        int n = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = 'mcm', MENU_SEQ = '00000600' "
                 + " WHERE MENU_ID = 'lsh' AND (PARENT_MENU_ID IS NULL OR PARENT_MENU_ID <> 'mcm')").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] 공지관리 폴더(lsh)를 공통관리(mcm) 아래로 옮김 — rows={}", n);
        }
    }

    /**
     * mdm(마루 MDM) 메뉴 그룹 트리·RBAC 시드(TSK-01-01 샘플 화면 + TSK-01-03 메뉴 그룹·역할·권한 세트).
     *
     * <ul>
     *   <li>폴더 6: mdm(모듈 루트) + 그룹 5개 dma 용어·도메인 / dmb 레이아웃 / dmc 마스터코드 / dmd 마스터데이터 /
     *       dme 업무기준 — TB_MCM_SEC_MENU_FLD. 이름은 MdmScreenGroup·screens/README §2·m-mdm MDM_GROUPS 와 글자까지
     *       같다(TSK-01-03). leaf 가 없는 폴더는 사이드바에 나오지 않고, 화면 Task 가 leaf 를 붙이면 보인다.</li>
     *   <li>OBJECT 1: mdmSample — TB_MCM_SEC_OBJ (SYSTEM_CODE='mdm' = FE moduleId,
     *       m-mcm PORTAL_MODULE_CONFIG 의 mdm 로더로 라우팅).</li>
     *   <li>메뉴 leaf 1: parent='dma' — TB_MCM_SEC_MENU. componentPath = 'dma/mdmSample'.</li>
     *   <li>RBAC: SYSADMIN × mdmSample × PERM_ALL(기존) + {@link #seedMdmRbac()}(역할 2·역할 그룹 2·권한 세트 3) +
     *       {@link #seedMdmObjectRbac(String, String)}(그룹 × 역할 매트릭스, ADR-0003 D5).</li>
     * </ul>
     *
     * <p>시험 사용자는 시드하지 않는다(TSK-01-03 D10) — E2E 는 격리 DB 에 픽스처(e2e/fixtures/mdm-rbac-users.sql)로 넣는다.
     *
     * <p>TSK-01-02 D2 — TSK-01-01 이 옛 그룹으로 시드한 기존 DB 는 시드 전에 {@link #migrateMdmSampleGroupToDma()}
     * 가 UPDATE 로 이행한다(insert-if-absent 시드와 조회 때 계산되는 componentPath 때문에 리터럴만 바꾸면 기존 DB 에서
     * 화면이 열리지 않는다).
     *
     * <p>FULL_SEQ 인코딩: 모듈 백만(mdm=5,000,000 — analog=4,000,000 다음, {@code insertMpnFld} 전수
     * grep 으로 5 가 미사용임을 확인) / 그룹 만(dma=5,010,000) / 화면 백·십(5010100). MENU_SEQ
     * mdm='00000005'. 시드 후 recomputeMenuFullSeq() 가 트리 위치 기준으로 FULL_SEQ 재부여(멱등).
     * 샘플 화면이 API 를 호출하지 않아(design.md §3.3) PERMISSION_ACTION 등재는 불필요 — 실 BPMN 이
     * 생기는 다음 화면 Task 에서 seedMcmSecRbac() 의 allActions 목록에 추가한다.
     */
    private void seedMdmMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // ── 기존 DB 이행 — 반드시 dma 폴더 INSERT 보다 먼저(옛 폴더 행을 이름과 함께 옮긴다) ──
        migrateMdmSampleGroupToDma();

        // ── 폴더 (FLD) — root mdm(모듈 5) + group dma(용어·도메인) ──
        insertMpnFld("mdm", "00000005", "마루 MDM", null,   5000000L);
        insertMpnFld("dma", "00000100", "용어·도메인", "mdm", 5010000L);
        // ── TSK-01-03 — 나머지 메뉴 그룹 4개(MdmScreenGroup·screens/README §2 와 같은 이름) ──
        insertMpnFld("dmb", "00000200", "레이아웃",     "mdm", 5020000L);
        insertMpnFld("dmc", "00000300", "마스터코드",   "mdm", 5030000L);
        insertMpnFld("dmd", "00000400", "마스터데이터", "mdm", 5040000L);
        insertMpnFld("dme", "00000500", "업무기준",     "mdm", 5050000L);

        // ── OBJECT — SYSTEM_CODE='mdm' 이 FE moduleId 가 된다 ──
        insertMcmSecObjIfAbsent("mdmSample", "MDM 샘플", "mdm");
        // TSK-04-02 — 단위 마스터·용어 관리(mdm 최초의 실제 OASIS 서비스 화면, mdmSample 선례 패턴).
        insertMcmSecObjIfAbsent("unitMng", "단위 마스터", "mdm");
        insertMcmSecObjIfAbsent("termMng", "용어 관리", "mdm");

        // ── 메뉴 leaf (parent=dma) — componentPath = 'dma/mdmSample' ──
        insertMcmSecMenuIfAbsent("mdmSample", "001", "5010100", "MDM 샘플", "dma", "mdmSample");
        insertMcmSecMenuIfAbsent("unitMng", "002", "5010200", "단위 마스터", "dma", "unitMng");
        insertMcmSecMenuIfAbsent("termMng", "003", "5010300", "용어 관리", "dma", "termMng");

        // ── RBAC — SYSADMIN × 3 OBJECT × PERM_ALL ──
        for (String objectId : new String[]{"mdmSample", "unitMng", "termMng"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }

        // ── TSK-01-03 — MDM 역할·권한 세트와 화면별 매트릭스 ──
        seedMdmRbac();
        seedMdmObjectRbac("mdmSample", "dma");
        seedMdmObjectRbac("unitMng", "dma");
        seedMdmObjectRbac("termMng", "dma");
        log.info("[DataInitializer] MDM 메뉴 시드 — 폴더 6 + OBJECT 3 + 메뉴 leaf 3 + RBAC(SYSADMIN 1 + MDM 역할 2)");

        seedMdmDomainMngMenu();
        seedMdmCodeItemEditMenu();
        seedMdmCodeCateEditObject();
        seedMdmCodeConfirmMenu();

        // ── TSK-04-04 — 컬럼 사전(columnMng) + 용어 인라인 등록 팝업(termRegPop). 팝업은 메뉴 leaf 없이 OBJECT·권한만
        //    둔다(screens/README §3·§5 — 버튼·API 권한은 역할 매핑에서 오고 메뉴를 보지 않는다, design.md F14·F15).
        insertMcmSecObjIfAbsent("columnMng", "컬럼 사전", "mdm");
        insertMcmSecObjIfAbsent("termRegPop", "용어 인라인 등록", "mdm");
        insertMcmSecMenuIfAbsent("columnMng", "004", "5010140", "컬럼 사전", "dma", "columnMng");
        for (String objectId : new String[]{"columnMng", "termRegPop"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dma");
        }
        log.info("[DataInitializer] TSK-04-04 MDM 컬럼 사전 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
        seedMdmLayoutMenus();
        log.info("[DataInitializer] TSK-05-02 MDM 레이아웃 메뉴 시드 — headerMng·layoutMng");

        // ── TSK-06-02 — 마루 코드 조회·등록(codeMng) + 마루 코드 수정(codeEdit), 폴더 dmc. DRAFT 소유권 액션
        //    (lock·unlock·handover) 권한은 여기서 더하지 않는다 — TSK-08-02 몫(D-075).
        //    D-101(2026-09-28): codeEdit 는 codeMng 화면에 합쳐 메뉴 leaf 가 없다. 합친 화면이 codeEdit 서비스를
        //    그대로 부르므로 OBJECT·권한은 남긴다(메뉴 없는 OBJECT 도 권한 키를 받는다 — dataCsvUploadPop 과 같다).
        insertMcmSecObjIfAbsent("codeMng", "마루 코드", "mdm");
        insertMcmSecObjIfAbsent("codeEdit", "마루 코드 수정", "mdm");
        insertMcmSecMenuIfAbsent("codeMng", "001", "5030100", "마루 코드", "dmc", "codeMng");
        removeMergedMdmCodeMenus();
        for (String objectId : new String[]{"codeMng", "codeEdit"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmc");
        }
        log.info("[DataInitializer] TSK-06-02 MDM 마루 코드 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
        seedMdmDataMngMenus();
        seedMdmDataItemMenus();
        seedMdmDataCsvUploadPopObject();
        seedMdmRuleMenus();
        seedMdmRuleConfirmMenu();
        seedMdmRuleSetMenus();
    }

    /**
     * TSK-07-02 — 마루 데이터 조회·등록(dataMng)·수정(dataEdit)·카테고리 편집(dataCateEdit), 폴더 dmd. F2 가 예약한
     * MENU_SEQ 001~003. action(search·reg·view·save·delete·restore·compare)은 모두 기존 권한 세트·allActions 안에
     * 있다(D9). FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     * D-104: dataEdit 는 dataMng 화면에 합쳐 메뉴 leaf 가 없다(dataCateEdit 는 dataItemMng 로 합침). 합친 화면이 두
     * 서비스를 그대로 부르므로 OBJECT·권한은 남기고, 이미 있는 메뉴 행은 {@link #removeMergedMdmDataMenus()} 가 지운다.
     */
    private void seedMdmDataMngMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("dataMng", "마루 데이터", "mdm");
        insertMcmSecObjIfAbsent("dataEdit", "마루 데이터 수정", "mdm");
        insertMcmSecObjIfAbsent("dataCateEdit", "카테고리 편집", "mdm");
        insertMcmSecMenuIfAbsent("dataMng", "001", "5040100", "마루 데이터", "dmd", "dataMng");
        removeMergedMdmDataMenus();
        for (String objectId : new String[]{"dataMng", "dataEdit", "dataCateEdit"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmd");
        }
        log.info("[DataInitializer] TSK-07-02 MDM 마루 데이터 조회·등록·수정·카테고리 편집 시드 — OBJECT 3 + 메뉴 leaf 1 "
                + "+ RBAC(SYSADMIN 3 + MDM 역할 6)");
    }

    /**
     * TSK-07-03 — 항목 편집(dmd/dataItemMng)·항목 이력(dmd/dataHistory). 부모 폴더 mdm·dmd 는 seedMdmMenus() 가 이미 멱등
     * 시드한다. OBJECT_ID = screenId = BPMN process id. action(view·search·reg·save·delete·restore)은 모두 기존 권한 세트·
     * allActions 안에 있다(design.md D9). MENU_SEQ 001~003 은 TSK-07-02(dataMng·dataEdit·dataCateEdit) 몫으로 비워 둔다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     * D-104: dataHistory 는 dataItemMng 화면에 합쳐 메뉴 leaf 가 없다. OBJECT·권한은 남기고 이미 있는 메뉴 행은
     * {@link #removeMergedMdmDataMenus()} 가 지운다. 남는 메뉴 이름은 "항목 편집" 이며, 이미 시드된 DB 의
     * 옛 이름 "항목 관리" 는 {@code MENU_NM} 이 그 값 그대로일 때만 바로잡는다(commMenuMng 에서 바꾼 이름은 건드리지 않는다).
     */
    private void seedMdmDataItemMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("dataItemMng", "항목 관리", "mdm");
        insertMcmSecObjIfAbsent("dataHistory", "항목 이력", "mdm");
        insertMcmSecMenuIfAbsent("dataItemMng", "004", "5040400", "항목 편집", "dmd", "dataItemMng");
        int renamed = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_NM = :nn WHERE MENU_ID = 'dataItemMng' AND MENU_NM = :on")
                .setParameter("nn", "항목 편집").setParameter("on", "항목 관리").executeUpdate();
        if (renamed > 0) {
            log.info("[DataInitializer] D-104 — dataItemMng 메뉴 이름 보정 '항목 관리' → '항목 편집' rows={}", renamed);
        }
        for (String objectId : new String[]{"dataItemMng", "dataHistory"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmd");
        }
        log.info("[DataInitializer] TSK-07-03 MDM 항목 편집·이력 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * D-104 — 마루 데이터 화면 5개를 2개로 합치며 없앤 메뉴 leaf(dataEdit·dataCateEdit·dataHistory)를 잔존 DB 에서
     * 지운다. 메뉴 행만 지운다. OBJECT·역할 매핑은 합친 화면이 세 서비스를 계속 부르므로 남긴다. 멱등(없으면 0행).
     */
    private void removeMergedMdmDataMenus() {
        for (String menuId : new String[]{"dataEdit", "dataCateEdit", "dataHistory"}) {
            // 즐겨찾기가 없앤 메뉴를 가리키면 목록에 이름 없는 행이 남으므로 메뉴보다 먼저 지운다.
            int fav = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_FAVORITE WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (fav > 0) {
                log.info("[DataInitializer] D-104 — 없앤 메뉴의 즐겨찾기 DELETE MENU_ID={} rows={}", menuId, fav);
            }
            int del = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] D-104 — 합친 화면의 메뉴 leaf DELETE MENU_ID={} rows={}", menuId, del);
            }
        }
    }

    /**
     * TSK-07-04 — CSV 업로드({@code dataCsvUploadPop}). 독립 화면이 아니라 {@code dataItemMng} 화면이 여는 팝업이라
     * 메뉴 leaf 는 만들지 않는다(D2, TSK-04-04 {@code termRegPop} 선례와 같은 모양 — OBJECT·역할 매핑만 둔다).
     */
    private void seedMdmDataCsvUploadPopObject() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("dataCsvUploadPop", "CSV 업로드", "mdm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",         "PERMISSION_ID"},
                new String[]{"SYSADMIN", "dataCsvUploadPop",  "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'dataCsvUploadPop', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("dataCsvUploadPop", "dmd");
        log.info("[DataInitializer] TSK-07-04 MDM CSV 업로드 팝업 시드 — OBJECT 1(메뉴 leaf 없음) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }

    /**
     * TSK-08-02 — 업무기준(dme) 폴더의 룰 화면 두 개: 룰 조회·등록(dme/ruleMng)과 룰 화면(dme/ruleEdit). 기존 마스터관리·업무기준관리
     * 메뉴는 고치지 않고 dme 폴더 아래 새 leaf 로 등록한다. OBJECT_ID = screenId = BPMN process id(design I23·I24). action 은
     * ruleMng search·reg, ruleEdit search·view·save·delete·copy·lock·unlock·handover 이고 모두 allActions·권한 세트 안에 있다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        String[][] screens = {
                {"ruleMng",  "룰",      "001", "5050100"},
                {"ruleEdit", "룰 화면", "002", "5050200"},
        };
        for (String[] screen : screens) {
            String objectId = screen[0];
            insertMcmSecObjIfAbsent(objectId, screen[1], "mdm");
            insertMcmSecMenuIfAbsent(objectId, screen[2], screen[3], screen[1], "dme", objectId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dme");
        }
        log.info("[DataInitializer] TSK-08-02 MDM 룰 화면 시드 — OBJECT 2 + 메뉴 leaf 2(dme) + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * TSK-08-05 — 룰 버전 확정(dme/ruleConfirm). 08-02·08-06 의 메뉴 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다
     * (design §6.9). MENU_SEQ 003·FULL_SEQ 5050300 은 08-06 D12 가 이 Task 몫으로 비워 두었다. OBJECT_ID = screenId = BPMN process id.
     * action(search·view·validate·confirm)은 모두 기존 권한 세트·allActions 안에 있고, dme 매트릭스는 표준 관리자 READ(search·view)·
     * 담당자 CONFIRM(validate·confirm 포함)이다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleConfirmMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("ruleConfirm", "버전 확정", "mdm");
        insertMcmSecMenuIfAbsent("ruleConfirm", "003", "5050300", "버전 확정", "dme", "ruleConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",   "PERMISSION_ID"},
                new String[]{"SYSADMIN", "ruleConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'ruleConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("ruleConfirm", "dme");
        log.info("[DataInitializer] TSK-08-05 MDM 룰 버전 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dme) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }

    /**
     * TSK-08-06 — 업무기준(dme) 폴더의 룰 세트 화면 두 개: 룰 세트 조회·등록(dme/ruleSetMng)과 룰 세트 편집(dme/ruleSetEdit). 08-02 의
     * seedMdmRuleMenus() 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다(design D12). OBJECT_ID = screenId = BPMN process id(I17·I18).
     * action 은 ruleSetMng search·reg, ruleSetEdit search·view·save·delete(폐기)·restore(되살리기)이고 모두 allActions·권한 세트 안에 있다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleSetMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        String[][] screens = {
                {"ruleSetMng",  "룰 세트",      "004", "5050400"},
                {"ruleSetEdit", "룰 세트 편집", "005", "5050500"},
        };
        for (String[] screen : screens) {
            String objectId = screen[0];
            insertMcmSecObjIfAbsent(objectId, screen[1], "mdm");
            insertMcmSecMenuIfAbsent(objectId, screen[2], screen[3], screen[1], "dme", objectId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dme");
        }
        log.info("[DataInitializer] TSK-08-06 MDM 룰 세트 화면 시드 — OBJECT 2 + 메뉴 leaf 2(dme) + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * TSK-01-03 D10 — MDM 역할 2종·역할 그룹 2종(1:1)·권한 세트 3종 시드(ADR-0003 D5).
     *
     * <p>역할 ID 는 {@code ROLE_} 접두 없이 넣는다(JWT 역할 클레임이 "ROLE_" + ROLE_ID). 사용자는 역할 그룹을 거쳐서만
     * 역할을 받으므로 역할 그룹을 함께 둔다. 권한 세트의 액션 목록은 mdm 계약 MdmPermissions.*_ACTIONS 와 같다(이 모듈은
     * mdm lib 을 의존하지 않아 문자열로 적고, e2e/fixtures/mdm-rbac-seed-check 가 대조한다).
     * <b>PERMISSION_COMMON·PERMISSION_CUSTOM·POPUP_BTN 은 비운다</b> — UserPermCache 가 네 칸의 합집합을 액션으로
     * 쓰므로 PERM_ALL 처럼 COMMON 을 채우면 READ 가 save·delete 를 얻는다.
     */
    private void seedMdmRbac() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // TB_MCM_SEC_ROLE — 표준 관리자·담당자
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "MDM_STD_ADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('MDM_STD_ADMIN', N'표준 관리자', N'용어·도메인·레이아웃 등록·수정(ADR-0003 D5)', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "MDM_STEWARD",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('MDM_STEWARD', N'담당자', N'마스터코드·마스터데이터·업무기준 편집과 버전 확정(ADR-0003 D5)', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLEGROUP — 역할 그룹 1:1
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_MDM_STD_ADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_MDM_STD_ADMIN', N'MDM 표준 관리자 그룹', N'MDM 표준 관리자 역할 그룹', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_MDM_STEWARD",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_MDM_STEWARD', N'MDM 담당자 그룹', N'MDM 담당자 역할 그룹', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLEGROUP_MAPPING — (그룹, 역할)
        for (String roleId : new String[]{"MDM_STD_ADMIN", "MDM_STEWARD"}) {
            String groupId = "ROLE_GROUP_" + roleId;
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLEGROUP_MAPPING",
                    new String[]{"ROLE_GROUP_ID", "ROLE_ID"},
                    new String[]{groupId,         roleId},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID" + AUDIT_COLS + ") " +
                    "VALUES ('" + groupId + "', '" + roleId + "'" + AUDIT_VALS + ")");
        }

        // TB_MCM_SEC_PERM — READ ⊂ EDIT ⊂ CONFIRM (MdmPermissions.*_ACTIONS 와 같은 순서)
        // TSK-08-02 D4 — DRAFT 소유권 액션 lock·unlock·handover 는 EDIT 부터(restore 뒤).
        String readActions = "search,view,export,compare";
        String editActions = readActions + ",save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover";
        String confirmActions = editActions + ",confirm";
        String[][] perms = {
                {"PERM_MDM_READ",    "MDM 조회",      "MDM 조회 권한(ADR-0003 D5)",           readActions},
                {"PERM_MDM_EDIT",    "MDM 편집",      "MDM 조회·편집 권한(ADR-0003 D5)",      editActions},
                {"PERM_MDM_CONFIRM", "MDM 편집·확정", "MDM 조회·편집·확정 권한(ADR-0003 D5)", confirmActions},
        };
        for (String[] perm : perms) {
            insertIfAbsent(
                    "TB_MCM_SEC_PERM", "PERMISSION_ID", perm[0],
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM " +
                    "(PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                    "VALUES ('" + perm[0] + "', N'" + escapeSql(perm[1]) + "', N'" + escapeSql(perm[2]) + "', " +
                    "'" + escapeSql(perm[3]) + "', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
            // 이미 있는 DB 는 insert-if-absent 가 건너뛰므로 빠진 action 만 끝에 덧붙인다(TSK-08-02 — 기존 순서는 바꾸지 않는다).
            ensurePermActions(perm[0], perm[3]);
        }
    }

    /**
     * TSK-01-03 D10 — MDM 화면 OBJECT 하나에 그룹 × 역할 매트릭스(ADR-0003 D5)를 매핑한다.
     *
     * <p>화면 Task 는 OBJECT·leaf 시드 뒤 이 메서드를 한 줄 부른다(TSK-01-03 D10). SYSADMIN 은 여기 없다 —
     * 기존대로 PERM_ALL 행을 따로 둔다. 매트릭스는 mdm 계약 MdmPermissions.MATRIX 와 같다.
     *
     * @param objectId  TB_MCM_SEC_OBJ.OBJECT_ID(= screenId)
     * @param groupCode 메뉴 그룹 코드 dma~dme. 모르는 값이면 기동 실패
     */
    private void seedMdmObjectRbac(String objectId, String groupCode) {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        java.util.Map<String, java.util.Map<String, String>> matrix = java.util.Map.of(
                "dma", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", "MDM_STEWARD", "PERM_MDM_READ"),
                "dmb", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", "MDM_STEWARD", "PERM_MDM_READ"),
                "dmc", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_CONFIRM"),
                "dmd", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_EDIT"),
                "dme", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_CONFIRM"));
        java.util.Map<String, String> byRole = matrix.get(groupCode);
        if (byRole == null) {
            throw new IllegalStateException("[DataInitializer] 알 수 없는 MDM 메뉴 그룹: " + groupCode);
        }
        for (String roleId : new String[]{"MDM_STD_ADMIN", "MDM_STEWARD"}) {
            String permissionId = byRole.get(roleId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID", "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{roleId,    objectId,    permissionId},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('" + roleId + "', '" + escapeSql(objectId) + "', '" + permissionId + "'" + AUDIT_VALS + ")");
        }
    }

    // TSK-01-02 D2 — TSK-01-01 이 옛 그룹 mdt 로 시드한 기존 DB 를 dma 로 옮긴다.
    // UPDATE 만 쓴다(DELETE 없음). 새 DB 에서는 영향 행 0 이라 아무 일도 하지 않는다(멱등).
    // 순서: leaf 부모 → 자식 폴더 부모 → 폴더 PK·이름(dma 가 없을 때만) → 즐겨찾기 경로(FULL_ID = componentPath).
    // dma·mdt 가 둘 다 있으면 mdt 폴더 행은 남긴다 — 자식이 없어 사이드바에 보이지 않고, 삭제는 사용자 확인 대상이다.
    private void migrateMdmSampleGroupToDma() {
        int leaf = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
        int childFld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
        Number dmaExists = (Number) nq("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = 'dma'").getSingleResult();
        int fld = 0;
        if (dmaExists == null || dmaExists.intValue() == 0) {
            fld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_ID = 'dma', MENU_NM = N'용어·도메인' WHERE MENU_ID = 'mdt'").executeUpdate();
        }
        int fav = nq("UPDATE MCMAPUSER.TB_MCM_SEC_USER_FAVORITE SET FULL_ID = 'dma/mdmSample' WHERE FULL_ID = 'mdt/mdmSample'").executeUpdate();
        if (leaf + childFld + fld + fav > 0) {
            log.info("[DataInitializer] MDM 샘플 그룹 이행 mdt → dma — leaf {} · 자식 폴더 {} · 폴더 {} · 즐겨찾기 {}행",
                    leaf, childFld, fld, fav);
        }
    }

    /**
     * TSK-04-03 — 도메인 관리 화면(dma/domainMng). 기존 마스터관리·업무기준관리 메뉴는 고치지 않고 dma 폴더 아래 새 leaf 로
     * 등록한다(design.md §3.9). 부모 폴더 mdm·dma 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN
     * process id(불변 I17). action(search·view·validate·execute·save)은 모두 기존 권한 세트·allActions 안에 있다.
     * FULL_SEQ 는 screens/README §3 순서(unitMng·termMng·domainMng·columnMng)의 셋째 자리이며 부팅 끝
     * recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmDomainMngMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("domainMng", "도메인 관리", "mdm");
        insertMcmSecMenuIfAbsent("domainMng", "001", "5010130", "도메인 관리", "dma", "domainMng");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", "domainMng", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'domainMng', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("domainMng", "dma");
    }

    /**
     * TSK-06-03 — 코드 편집 화면(dmc/codeItemEdit). 기존 마스터관리 메뉴는 고치지 않고 dmc 폴더 아래 새 leaf 로 등록한다
     * (design.md §3 커밋 C). 부모 폴더 mdm·dmc 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN
     * process id. action(search·view·compare·validate·save·restore·execute)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는
     * 표준 관리자 READ·담당자 CONFIRM 이다. FULL_SEQ 는 screens/README §3 순서(codeMng·codeItemEdit·codeConfirm,
     * D-101 로 codeEdit·codeCateEdit 메뉴 없음)의 둘째 자리이며 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmCodeItemEditMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("codeItemEdit", "코드 편집", "mdm");
        insertMcmSecMenuIfAbsent("codeItemEdit", "003", "5030300", "코드 편집", "dmc", "codeItemEdit");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",    "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeItemEdit", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeItemEdit', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeItemEdit", "dmc");
    }

    /**
     * TSK-06-04 — 카테고리 편집(codeCateEdit) OBJECT·권한. OBJECT_ID = BPMN process id. action(search·view·compare·
     * validate·save·restore)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는 표준 관리자 READ·담당자 CONFIRM 이다.
     * D-101(2026-09-28): 화면은 코드 편집(codeItemEdit)의 카테고리 탭으로 합쳐 메뉴 leaf 가 없다. 그 탭이 codeCateEdit
     * 서비스를 그대로 부르므로 OBJECT·권한만 둔다. 이미 있는 메뉴 행은 {@link #removeMergedMdmCodeMenus()} 가 지운다.
     */
    private void seedMdmCodeCateEditObject() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("codeCateEdit", "카테고리 편집", "mdm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",    "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeCateEdit", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeCateEdit', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeCateEdit", "dmc");
    }

    /**
     * D-101(2026-09-28) — 마루 코드 화면 4개를 2개로 합치며 없앤 메뉴 leaf(codeEdit·codeCateEdit)를 잔존 DB 에서 지운다.
     * 메뉴 행만 지운다. OBJECT·역할 매핑은 합친 화면이 두 서비스를 계속 부르므로 남긴다. 멱등(없으면 0행).
     */
    private void removeMergedMdmCodeMenus() {
        for (String menuId : new String[]{"codeEdit", "codeCateEdit"}) {
            // 즐겨찾기가 없앤 메뉴를 가리키면 목록에 이름 없는 행이 남으므로 메뉴보다 먼저 지운다.
            int fav = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_FAVORITE WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (fav > 0) {
                log.info("[DataInitializer] D-101 — 없앤 메뉴의 즐겨찾기 DELETE MENU_ID={} rows={}", menuId, fav);
            }
            int del = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] D-101 — 합친 화면의 메뉴 leaf DELETE MENU_ID={} rows={}", menuId, del);
            }
        }
    }

    /**
     * TSK-06-05 — 버전 확정(dmc/codeConfirm). 기존 마스터관리 메뉴는 고치지 않고 dmc 폴더 아래 새 leaf 로 등록한다
     * (design.md §6.8). 부모 폴더 mdm·dmc 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN process id.
     * action(search·view·validate·confirm)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는 표준 관리자 READ(search·view)·
     * 담당자 CONFIRM(validate·confirm 포함)이다. FULL_SEQ 는 screens/README §3 순서의 셋째 자리(D-101)이며 부팅 끝
     * recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmCodeConfirmMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("codeConfirm", "버전 확정", "mdm");
        insertMcmSecMenuIfAbsent("codeConfirm", "005", "5030500", "버전 확정", "dmc", "codeConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",   "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeConfirm", "dmc");
    }

    /**
     * TSK-05-02 — 전문 헤더 정의(dmb/headerMng)·전문 레이아웃(dmb/layoutMng). 기존 마스터관리·업무기준관리 메뉴는 고치지 않고
     * 이미 시드된 dmb "레이아웃" 폴더 아래 새 leaf 로 등록한다. OBJECT_ID = screenId = BPMN process id. action(search·view·save)은
     * 모두 기존 권한 세트·allActions 안에 있다(design.md D8). FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmLayoutMenus() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("headerMng", "전문 헤더 정의", "mdm");
        insertMcmSecObjIfAbsent("layoutMng", "전문 레이아웃", "mdm");
        insertMcmSecMenuIfAbsent("headerMng", "001", "5020110", "전문 헤더 정의", "dmb", "headerMng");
        insertMcmSecMenuIfAbsent("layoutMng", "002", "5020120", "전문 레이아웃", "dmb", "layoutMng");
        for (String objectId : new String[]{"headerMng", "layoutMng"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmb");
        }
        log.info("[DataInitializer] TSK-05-02 MDM 레이아웃 시드 — OBJECT 2 + 메뉴 leaf 2 + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }


    /**
     * 모듈 무관 범용 폴더 INSERT 헬퍼(이름의 Mpn 은 legacy).
     *
     * <p>TB_MCM_SEC_MENU_FLD 폴더 1행 멱등 INSERT — FULL_SEQ/USE_TP/MENU_VIEW_YN 명시 (첫 부팅 트리 표시 보장).
     *
     * <p>MENU_VIEW_YN 은 'Y'(사이드바 표시). 숨김 폴더가 필요하면
     * {@link #insertMpnFld(String, String, String, String, long, String)} 오버로드를 쓴다.
     */
    private void insertMpnFld(String menuId, String menuSeq, String menuNm, String parent, long fullSeq) {
        insertMpnFld(menuId, menuSeq, menuNm, parent, fullSeq, "Y");
    }

    /**
     * 모듈 무관 범용 폴더 INSERT 헬퍼(이름의 Mpn 은 legacy).
     *
     * <p>TB_MCM_SEC_MENU_FLD 폴더 1행 멱등 INSERT — 사이드바 표시 여부까지 지정하는 오버로드 (2026-08-12).
     *
     * <p>팝업 전용 그룹(예: mpp {@code ppz})처럼 "메뉴관리 화면에는 보이되 사이드바에는 뜨지 않아야 하는"
     * 폴더를 시드하려면 {@code viewYn='N'} 을 넘긴다. 기존 호출부(수십 곳)를 건드리지 않도록 5-인자
     * 시그니처는 그대로 두고 'Y' 로 위임한다.
     *
     * @param viewYn MENU_VIEW_YN — 'Y'(표시) / 'N'(숨김). 그 외 값은 {@link #normalizeViewYn(String)} 이
     *               'Y' 로 폴백한다(시드 오타로 트리가 통째로 사라지는 것보다 표시 쪽이 안전하다).
     */
    private void insertMpnFld(String menuId, String menuSeq, String menuNm, String parent, long fullSeq, String viewYn) {
        String parentLit = (parent == null) ? "NULL" : "'" + escapeSql(parent) + "'";
        String viewLit = normalizeViewYn(viewYn);
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", menuId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ, USE_TP, MENU_VIEW_YN) " +
                "VALUES ('" + escapeSql(menuId) + "', '" + escapeSql(menuSeq) + "', N'" + escapeSql(menuNm) + "', " +
                parentLit + ", " + fullSeq + ", 'Y', '" + viewLit + "')");
    }

    /**
     * MENU_VIEW_YN 값 정규화 — 'Y'/'N' 만 허용하고 그 외(null·공백·오타)는 'Y' 로 폴백한다 (2026-08-12).
     *
     * <p><b>예외가 아니라 폴백인 이유</b>: 본 컬럼은 VARCHAR(1) 이고 Hibernate 6 가 length=1 VARCHAR 를
     * {@code Character} 로 추론하므로 잘못된 값이 들어가면 {@code normalizeSecMenuCharColumns()} 의
     * 자가치유 대상이 되거나 commMenuMng 조회가 통째로 실패한다. 반대로 시드 오타 하나로 부팅이 죽으면
     * (IllegalStateException) 그 DB 는 아예 못 쓰게 된다. "잘못 숨겨서 메뉴가 사라지는" 쪽보다
     * "표시되는" 쪽이 복구 가능하므로 표시('Y')로 폴백한다. 대소문자는 허용해 대문자로 승격한다.
     */
    private static String normalizeViewYn(String viewYn) {
        if (viewYn == null) return "Y";
        String v = viewYn.trim().toUpperCase(java.util.Locale.ROOT);
        return ("Y".equals(v) || "N".equals(v)) ? v : "Y";
    }

    /**
     * TB_MCM_DEPT_INFO 시드 — 부서 마스터 3 row (정책 #2 / Q-002 — EAI 폐기 대체).
     *
     * <p>commUserMng 화면 (W5) 의 부서 LoV 가 본 시드를 read → admin 사용자의 DEPT_CD='IT' 값과
     * 일치하는 부서가 없으면 화면 표기 부서명이 공란. 본 시드는 admin / commUserMng / commUserRoleCopy
     * 화면이 기본 LoV 로 표시할 최소 부서 3 행 (경영지원본부 / 정보기술팀 / 생산관리팀) 만 제공.
     *
     * <p>관련 화면:
     * <ul>
     *   <li>commUserMng — selectUserList JOIN DEPT_NM (정책 #2 Q-004)</li>
     *   <li>commUserRoleCopy — selectUserList JOIN DEPT_NM (정책 #2 Q-004)</li>
     * </ul>
     *
     * <p>{@code DEPT_001} (경영지원본부 — root) / {@code DEPT_002} (정보기술팀 — UPPER=DEPT_001) /
     * {@code DEPT_003} (생산관리팀 — UPPER=DEPT_001). admin 사용자의 DEPT_CD='IT' 와는 일치하지 않으나,
     * LoV 표기는 표시되며 admin DEPT_CD 의 별도 정정은 후속 운영 시드에서 처리.
     */
    private void seedMcmDeptInfo() {
        // 본 메서드 내부 audit fragment — seedMcmSecRbac 의 AUDIT_COLS/VALS 와 동일 값
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // DEPT_001 — 경영지원본부 (root, UPPER_DEPT_CD = NULL)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_001",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_001', N'경영지원본부', 'Management Support HQ', NULL, 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_002 — 정보기술팀 (UPPER = DEPT_001)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_002",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_002', N'정보기술팀', 'IT Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_003 — 생산관리팀 (UPPER = DEPT_001)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_003",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_003', N'생산관리팀', 'Production Mgmt Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // 2026-06-04 — 사용자 결정: Detail LoV 모달 확인을 위해 추가 부서 4 row 시드.
        // DEPT_004 ~ DEPT_007 — 인사팀 / 재무팀 / 영업1팀 / 영업2팀 / 품질관리팀.
        // UPPER_DEPT_CD = DEPT_001 (경영지원본부 산하 가정 — 후속 운영 조직개편 시 정정).

        // DEPT_004 — 인사팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_004",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_004', N'인사팀', 'HR Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_005 — 재무팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_005",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_005', N'재무팀', 'Finance Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_006 — 영업1팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_006",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_006', N'영업1팀', 'Sales Team 1', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_007 — 품질관리팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_007",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_007', N'품질관리팀', 'Quality Mgmt Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
    }

    /**
     * TB_MCM_SEC_MENU 멱등 INSERT — 복합 PK (MENU_ID, MENU_SEQ) 기준 존재 시 skip.
     *
     * <p>모든 행 공통값:
     * <ul>
     *   <li>MENU_TP = 'WEB'</li>
     *   <li>USE_TP = 'Y'</li>
     *   <li>MENU_VIEW_YN = 'Y' (숨김 leaf 는 7-인자 오버로드로 'N' 지정)</li>
     *   <li>START_ACTIVE_DATE = SYSDATETIME()</li>
     *   <li>END_ACTIVE_DATE = '9999-12-31 23:59:59'</li>
     *   <li>audit 9 컬럼 = 'admin' / SYSDATETIME() / 'DataInitializer' / 'DataInitializer' / ... / 0</li>
     * </ul>
     *
     * @param menuId       MENU_ID (PK#1) — VARCHAR(30)
     * @param menuSeq      MENU_SEQ (PK#2) — VARCHAR(30). 모든 seed = "001".
     * @param fullSeq      FULL_SEQ — VARCHAR 사전순 정렬 (예: 100/110/120 ... 200/210/220 ... 300/310)
     * @param menuNm       MENU_NM (한글) — N'...' literal 로 래핑
     * @param parentMenuId PARENT_MENU_ID — root 그룹은 null
     * @param objectId     OBJECT_ID — 화면식별자 (TB_MCM_SEC_OBJ FK). root 그룹은 null
     */
    private void insertMcmSecMenuIfAbsent(String menuId, String menuSeq, String fullSeq,
                                          String menuNm, String parentMenuId, String objectId) {
        insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, menuNm, parentMenuId, objectId, "Y");
    }

    /**
     * TB_MCM_SEC_MENU 멱등 INSERT — 사이드바 표시 여부까지 지정하는 오버로드 (2026-08-12).
     *
     * <p><b>왜 필요한가</b> — 팝업(모달)도 메뉴 leaf 로 등재하는 정책으로 바뀌었다. leaf 가 있어야
     * ① 팝업 단위 RBAC 를 메뉴/역할 화면에서 화면과 똑같이 다룰 수 있고 ② commMenuMng 에서 순서·명칭을
     * 관리할 수 있다. 다만 팝업은 부모 화면에서 열리므로 <b>사이드바에는 뜨면 안 된다</b> →
     * {@code MENU_VIEW_YN='N'}. 6-인자 시그니처는 기존 호출부(수십 곳) 보존용으로 'Y' 에 위임한다.
     *
     * @param viewYn MENU_VIEW_YN — 'Y'(사이드바 표시) / 'N'(숨김, 팝업 leaf).
     *               그 외 값은 {@link #normalizeViewYn(String)} 이 'Y' 로 폴백한다.
     */
    private void insertMcmSecMenuIfAbsent(String menuId, String menuSeq, String fullSeq,
                                          String menuNm, String parentMenuId, String objectId,
                                          String viewYn) {
        // 본 메서드 내부 audit fragment — seedMcmSecRbac 의 AUDIT_COLS/VALS 와 동일 값 (final constant 재정의로 가독성 보존)
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

        // 2026-06-05 Phase 1 — OBJECT_ID camelCase 룰 강제 (reference_naming_standards §A.3.1).
        //   FE 의 page-components/{group}/{OBJECT_ID}/page.tsx 폴더명과 1:1 일치해야 동적 import 가 성공한다.
        //   PascalCase / snake_case / 빈 문자열 / 하이픈 포함 등은 모두 시드 단계에서 차단 (런타임 fail 회피).
        //   null 은 허용 (root 그룹 폴더 — TB_MCM_SEC_MENU_FLD 가 owner 라 본 메서드 호출 시 null 입력 가능).
        if (objectId != null && !objectId.matches("^[a-z][a-zA-Z0-9]*$")) {
            throw new IllegalStateException(
                    "OBJECT_ID camelCase 룰 위반 — menuId=" + menuId + " objectId='" + objectId +
                    "'. 허용 패턴: ^[a-z][a-zA-Z0-9]*$ (소문자 시작 + 영숫자만)");
        }

        String parentLit = (parentMenuId == null) ? "NULL" : "'" + escapeSql(parentMenuId) + "'";
        String objectLit = (objectId == null)     ? "NULL" : "'" + escapeSql(objectId) + "'";
        String viewLit = normalizeViewYn(viewYn);
        // 2026-06-05 — MENU_SEQ '0' LPAD 8자리 ("001" → "00000001"). 비숫자는 그대로.
        String seq8 = (menuSeq != null && menuSeq.matches("\\d{1,8}"))
                ? String.format("%08d", Long.parseLong(menuSeq)) : menuSeq;

        // 2026-06-05 — PK = MENU_ID 단독. 존재 체크도 MENU_ID 기준 (멱등).
        insertIfAbsent(
                "TB_MCM_SEC_MENU", "MENU_ID", menuId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU " +
                "(MENU_ID, MENU_SEQ, FULL_SEQ, MENU_NM, MENU_TP, OBJECT_ID, USE_TP, " +
                " START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_VIEW_YN, PARENT_MENU_ID" + AUDIT_COLS + ") " +
                "VALUES ('" + escapeSql(menuId) + "', '" + escapeSql(seq8) + "', '" + escapeSql(fullSeq) + "', " +
                "N'" + escapeSql(menuNm) + "', 'WEB', " + objectLit + ", 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59', '" + viewLit + "', " + parentLit + AUDIT_VALS + ")");
    }

    /**
     * 이미 존재하는 메뉴 leaf 행의 {@code MENU_VIEW_YN} 을 목표값으로 강제 정정한다 (2026-08-12).
     *
     * <p><b>왜 필요한가</b> — {@link #insertIfAbsent}/{@link #insertMcmSecMenuIfAbsent} 는 대상 행이
     * 이미 있으면 skip 하고 <b>갱신하지 않는다</b>. 그래서 시드 리터럴만 'N' 으로 바꿔봐야 이미 시드된
     * 개발 MSSQL·동료 SQLite 에서는 값이 영원히 'Y' 로 남는다({@link #fixModuleRootMenuSeqOrder} ·
     * {@link #ensurePermAllActions} 와 같은 계열의 백필 보정).
     *
     * <p>값이 이미 목표와 같으면 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향). 사용자가 commMenuMng 에서
     * 표시 여부를 편집할 수 있는 값이므로 <b>대상 menuId 를 명시한 것만</b> 정정한다 — 일괄 정정 금지.
     *
     * <p>SQLite 에서는 McmAuditStatementInspector 가 {@code MCMAPUSER.} schema 접두를 제거하므로 동일 SQL 로 동작.
     *
     * @param menuId TB_MCM_SEC_MENU.MENU_ID (leaf). 없는 행이면 0 행 (무해).
     * @param viewYn 목표 MENU_VIEW_YN — 'Y'/'N'. 그 외는 {@link #normalizeViewYn} 이 'Y' 로 폴백.
     * @return UPDATE 영향 행 수 (0 또는 1)
     */
    private int ensureMenuViewYn(String menuId, String viewYn) {
        return ensureMenuViewYnOn("TB_MCM_SEC_MENU", menuId, viewYn);
    }

    /**
     * 이미 존재하는 <b>폴더</b>({@code TB_MCM_SEC_MENU_FLD}) 행의 {@code MENU_VIEW_YN} 을 정정한다 (2026-08-12).
     *
     * <p>leaf 판은 {@link #ensureMenuViewYn(String, String)}. 팝업 전용 그룹 폴더(예: mpp {@code ppz})를
     * 사이드바에서 숨길 때 쓴다 — 폴더가 'Y' 로 남아 있으면 자식이 전부 숨겨져도 빈 그룹이 노출된다.
     *
     * @see #ensureMenuViewYn(String, String)
     */
    private int ensureMenuFldViewYn(String menuId, String viewYn) {
        return ensureMenuViewYnOn("TB_MCM_SEC_MENU_FLD", menuId, viewYn);
    }

    /**
     * 이미 존재하는 메뉴 leaf 행의 {@code PARENT_MENU_ID} 를 목표 그룹으로 강제 정정한다 (2026-08-13).
     *
     * <p><b>왜 필요한가</b> — {@link #ensureMenuViewYn(String, String)} 과 같은 계열의 백필이다.
     * {@link #insertMcmSecMenuIfAbsent}는 대상 행이 이미 있으면 skip 하고 <b>갱신하지 않는다</b>. 그래서
     * 화면/팝업의 소속 그룹을 바꿔도 시드 리터럴만 고쳐서는 이미 시드된 개발 MSSQL·동료 SQLite 에서
     * 부모가 옛 그룹으로 영원히 남는다. 최초 사용처 = mcm 팝업 5종의 {@code cma}/{@code cmb} → {@code cmz}
     * (팝업 전용 그룹) 이관.
     *
     * <p>값이 이미 목표와 같으면 {@code WHERE ... <> :p} 가드로 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향
     * — {@link #fixModuleRootMenuSeqOrder()} 와 동일한 가드 방식). 메뉴 트리 소속은 제품 구조 정책이므로
     * <b>대상 menuId 를 명시한 것만</b> 정정한다.
     *
     * <p><b>주의</b> — {@link #applyR3FullSeqEncoding()} 도 자기 배열의 행에 대해 PARENT_MENU_ID 를
     * 무조건 덮어쓴다. 두 곳의 목표 부모가 어긋나면 부팅마다 값이 왕복하므로 반드시 함께 고쳐야 한다.
     *
     * <p>SQLite 에서는 McmAuditStatementInspector 가 {@code MCMAPUSER.} schema 접두를 제거하므로 동일 SQL 로 동작.
     *
     * @param menuId       TB_MCM_SEC_MENU.MENU_ID (leaf). 없는 행이면 0 행 (무해).
     * @param parentMenuId 목표 PARENT_MENU_ID — TB_MCM_SEC_MENU_FLD.MENU_ID (그룹 폴더).
     * @return UPDATE 영향 행 수 (0 또는 1)
     */
    private int ensureMenuParent(String menuId, String parentMenuId) {
        int n = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = :p " +
                   "WHERE MENU_ID = :m AND (PARENT_MENU_ID IS NULL OR PARENT_MENU_ID <> :p)")
                .setParameter("p", parentMenuId)
                .setParameter("m", menuId)
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] PARENT_MENU_ID 보정 — TB_MCM_SEC_MENU.{} → {} ({}행)", menuId, parentMenuId, n);
        }
        return n;
    }

    /**
     * {@code MENU_VIEW_YN} 백필 UPDATE 본체 — leaf/폴더 두 테이블 공용 (테이블명 인자는
     * {@link #insertIfAbsent(String, String, String, String)} 관례와 동일하게 시드 하드코딩 값만 받는다).
     */
    private int ensureMenuViewYnOn(String table, String menuId, String viewYn) {
        String target = normalizeViewYn(viewYn);
        int n = nq("UPDATE MCMAPUSER." + table + " SET MENU_VIEW_YN = :v " +
                   "WHERE MENU_ID = :m AND (MENU_VIEW_YN IS NULL OR MENU_VIEW_YN <> :v)")
                .setParameter("v", target)
                .setParameter("m", menuId)
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] MENU_VIEW_YN 보정 — {}.{} = {} ({}행)", table, menuId, target, n);
        }
        return n;
    }

    /** 단일 PK 기준 멱등 INSERT — 존재하면 skip. */
    private void insertIfAbsent(String table, String pkCol, String pkVal, String insertSql) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER." + table + " WHERE " + pkCol + " = :v")
                .setParameter("v", pkVal)
                .getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(insertSql).executeUpdate();
        log.info("[DataInitializer] SEED INSERT: {}.{} = {}", table, pkCol, pkVal);
    }

    /** 복합 PK 기준 멱등 INSERT — 모든 PK 컬럼이 일치하면 skip. */
    private void insertIfAbsentComposite(String table, String[] pkCols, String[] pkVals, String insertSql) {
        if (pkCols.length != pkVals.length || pkCols.length == 0) return;
        StringBuilder where = new StringBuilder();
        for (int i = 0; i < pkCols.length; i++) {
            if (i > 0) where.append(" AND ");
            where.append(pkCols[i]).append(" = :v").append(i);
        }
        var q = nq(
                "SELECT COUNT(*) FROM MCMAPUSER." + table + " WHERE " + where);
        for (int i = 0; i < pkVals.length; i++) {
            q.setParameter("v" + i, pkVals[i]);
        }
        Number cnt = (Number) q.getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(insertSql).executeUpdate();
        log.info("[DataInitializer] SEED INSERT: {} composite PK={}", table, String.join("/", pkVals));
    }

    /**
     * 모듈 루트 폴더(mpn 공정계획 / mcm 공통관리) 표시 순서를 기동 시 멱등 고정.
     *
     * <p>폴더 정렬은 MENU_SEQ asc 기준(2026-06-10, {@code recomputeMenuFullSeq}). 그러나 seedMcmSecMenuFld /
     * seedMpnMenus 는 {@code insertIfAbsent} 라 기존 행의 MENU_SEQ 를 갱신하지 않아, 시드 리터럴 변경
     * (b1eac364: mpn 2→1, mcm 1→2)이 이미 시드된 DB(dev MSSQL · 동료 SQLite)에는 반영되지 않는다.
     *
     * <p>모듈 루트 순서는 제품 고정 정책이므로 루트 2행만 강제 정정한다. 그룹/화면 순서(사용자 편집)는
     * 건드리지 않는다. 값이 이미 맞으면 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향). 본 메서드 직후
     * {@code recomputeMenuFullSeq()} 가 정정된 MENU_SEQ 기준으로 FULL_SEQ 를 재부여한다.
     *
     * <p>SQLite 에서는 McmAuditStatementInspector 가 {@code MCMAPUSER.} schema 접두를 제거하므로 동일 SQL 로 동작.
     */
    private void fixModuleRootMenuSeqOrder() {
        int n = 0;
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_SEQ = '00000001' " +
                "WHERE MENU_ID = 'mpn' AND (MENU_SEQ IS NULL OR MENU_SEQ <> '00000001')").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_SEQ = '00000002' " +
                "WHERE MENU_ID = 'mcm' AND (MENU_SEQ IS NULL OR MENU_SEQ <> '00000002')").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] 모듈 루트 순서 보정 — 공정계획(mpn=00000001)/공통관리(mcm=00000002) MENU_SEQ {}행 갱신.", n);
        }
    }

    /**
     * 2026-06-01 fix — 기존 잔존 "ROLE_SYSADMIN" RoleId 를 "SYSADMIN" 으로 swap.
     *
     * <p>cycle 1 시드는 RoleId="ROLE_SYSADMIN" 으로 적재되었고, McmAuthService.loadUserRoles 가
     * "ROLE_" + roleId 를 prefix 로 붙여 JWT claim 을 만들어 "ROLE_ROLE_SYSADMIN" 이라는 double prefix
     * authority 가 생성. 결과적으로 hasAuthority("ROLE_SYSADMIN") 검사가 false → SYSADMIN bypass 실패.
     *
     * <p>fix 정책: 시드 RoleId 를 "SYSADMIN" (prefix 없음) 으로 변경 + 기존 row 를 멱등 UPDATE.
     * 신규 클린 DB 에서는 UPDATE 영향 0 (행 미존재) → 무영향.
     *
     * <p>처리 순서 (FK 영향 회피):
     * <ol>
     *   <li>TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID 변경 (자식)</li>
     *   <li>TB_MCM_SEC_ROLE_MAPPING.ROLE_ID 변경 (자식)</li>
     *   <li>TB_MCM_SEC_ROLE.ROLE_ID 변경 (부모)</li>
     * </ol>
     *
     * <p>SYSADMIN row 가 이미 시드되어 PK 충돌이 발생하지 않도록, 변경 전 SYSADMIN row 존재 시 ROLE_SYSADMIN row 만 삭제.
     */
    private void cleanupLegacyRoleSysadmin() {
        // SYSADMIN 신규 row 가 이미 존재하면, legacy ROLE_SYSADMIN row 들은 PK 충돌 회피를 위해 DELETE.
        Number sysadminExists = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'SYSADMIN'")
                .getSingleResult();
        Number legacyExists = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .getSingleResult();
        if (legacyExists == null || legacyExists.intValue() == 0) {
            return; // 잔존 데이터 ✗ → 무영향
        }
        if (sysadminExists != null && sysadminExists.intValue() > 0) {
            // 충돌 회피 — legacy ROLE_SYSADMIN 자식 + 부모 DELETE (SYSADMIN 시드가 정본).
            int dRgm = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            int dRm = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            int dRole = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            log.info("[DataInitializer] legacy ROLE_SYSADMIN cleanup (SYSADMIN 충돌) — RGM={} RM={} ROLE={}",
                    dRgm, dRm, dRole);
            return;
        }
        // SYSADMIN row 미존재 → 단순 UPDATE swap (자식 먼저).
        int uRgm = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        int uRm = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        int uRole = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLE SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        log.info("[DataInitializer] legacy ROLE_SYSADMIN UPDATE swap — RGM={} RM={} ROLE={}",
                uRgm, uRm, uRole);
    }

    /** TB_MCM_SEC_OBJ 멱등 INSERT — SecObj entity 컬럼 정합 + audit 9 컬럼 명시 (McmAuditEntity 정합). */
    private void insertMcmSecObjIfAbsent(String objectId, String objectNm, String systemCode) {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertIfAbsent("TB_MCM_SEC_OBJ", "OBJECT_ID", objectId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ " +
                "(OBJECT_ID, OBJECT_NM, SYSTEM_CODE, OBJECT_TYPE, USE_TP, ACCESS_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('" + escapeSql(objectId) + "', N'" + escapeSql(objectNm) + "', " +
                "'" + escapeSql(systemCode) + "', 'web', 'Y', N'내부', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
    }

    /**
     * 기존 DB 보정 — {@code insertIfAbsent(PERM_ALL)} 은 이미 존재하는 PERM_ALL 을 갱신하지 않는다.
     * PageLayout button RBAC 는 {@code PERMISSION_ACTION} 콤마 토큰을 그대로 펼치므로, 표준 액션이
     * 뒤늦게 추가된 경우 부팅 시 누락분만 append 한다.
     */
    private void ensurePermAllActions(String desiredActionsCsv) {
        ensurePermActions("PERM_ALL", desiredActionsCsv);
    }

    /**
     * 이미 있는 권한 세트의 PERMISSION_ACTION 에 빠진 action 만 끝에 덧붙인다(멱등). 없는 권한 세트는 건너뛴다.
     * TSK-08-02 — PERM_ALL 전용이던 보정을 PERM_MDM_EDIT·PERM_MDM_CONFIRM 에도 쓰려고 권한 ID 를 받게 했다.
     */
    private void ensurePermActions(String permissionId, String desiredActionsCsv) {
        @SuppressWarnings("unchecked")
        List<Object> rows = nq(
                "SELECT PERMISSION_ACTION FROM MCMAPUSER.TB_MCM_SEC_PERM WHERE PERMISSION_ID = :permissionId")
                .setParameter("permissionId", permissionId)
                .getResultList();
        if (rows.isEmpty()) {
            return;
        }

        Set<String> actions = new LinkedHashSet<>();
        appendCsv(actions, String.valueOf(rows.get(0) == null ? "" : rows.get(0)));
        appendCsv(actions, desiredActionsCsv);
        String normalized = String.join(",", actions);
        if (!normalized.equals(String.valueOf(rows.get(0) == null ? "" : rows.get(0)))) {
            int updated = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_PERM "
                            + "SET PERMISSION_ACTION = :actions, U_USR_ID = 'admin', U_AT = SYSDATETIME() "
                            + "WHERE PERMISSION_ID = :permissionId")
                    .setParameter("actions", normalized)
                    .setParameter("permissionId", permissionId)
                    .executeUpdate();
            log.info("[DataInitializer] {} action 보정 — rows={} actions={}", permissionId, updated, normalized);
        }
    }

    private static void appendCsv(Set<String> sink, String csv) {
        if (csv == null || csv.isBlank()) {
            return;
        }
        for (String raw : csv.split(",")) {
            if (raw == null) {
                continue;
            }
            String token = raw.trim();
            if (!token.isEmpty()) {
                sink.add(token);
            }
        }
    }

    /** Simple SQL literal escape (single-quote -> double single-quote). 시드 hard-coded 값에만 사용. */
    private static String escapeSql(String s) {
        if (s == null) return "";
        return s.replace("'", "''");
    }


    /**
     * v4 Phase 4-B (2026-05-13) — TB_MCM_APPHOST 시드 단순화.
     *
     * <p>v3: 모듈별 5 row (mcm/mls/mpn/mpp/mqc) — caravan-console 가 모듈 WAS 직접 호출하던 패턴.
     * <p>v4: <b>caravan-hub 인스턴스 row 만</b> — caravan-console 는 caravan-hub VIP 한 곳만 호출 (v4 §3 정본). 모듈은 caravan-hub 통한
     * 메시지 발행만 (CaravanHubIntegrationClient). caravan-console 콘솔의 토픽/메시지/대시보드는 caravan API 응답을 caravan-hub 가
     * 그대로 반환하므로 모듈 호스트 매핑 무의미.
     *
     * <p>local: 단일 'hub1' row (LB VIP 또는 단일 인스턴스). 운영: hub1/hub2/hub3 멀티 인스턴스 가능.
     *
     * <p>v4 결정 #14 (2026-05-13) — AppHostEntity 가 cactus secondary EMF (caravan.db / CARAVANUSER) 매핑이라
     * {@link AppHostJpaRepository} 사용. Repository 는 {@code ConsoleSecondaryJpaConfig} 가 secondary EMF 로 wiring.
     *
     * <p>secondary EMF 비활성 환경 (Repository 빈 미등록) 에서는 skip.
     */
    private void initAppHostData() {
        if (appHostJpaRepository == null) {
            log.info("[DataInitializer] AppHostJpaRepository 미활성 — TB_MCM_APPHOST 시드 skip (secondary EMF 비활성 환경)");
            return;
        }
        // v4 §8-1 — caravan-hub 인스턴스 row 만. WORKS_CD='p' (caravan-console caravan-console.works-code yml property 와 정합).
        // appHostId 는 caravan-hub 의 biz-system(application.yml: HUB1) 과 정확히 일치해야 한다.
        //   ConsoleTopicService.getTopicsWithStatus() 가 hostUrlMap.containsKey(topic.bizSystem) 로 case-sensitive 매핑하고,
        //   AppHostService.getHostUrl(bizSystem)=findByAppHostIdAndWorksCd(bizSystem,..) 이므로 대소문자 불일치 시
        //   토픽 상태 UNKNOWN + 컨슈머 제어 "호스트 미등록" 이 된다. (SoT = caravan-hub biz-system)
        List<AppHostEntity> hosts = List.of(
                AppHostEntity.builder()
                        .appHostId("HUB1")
                        .worksCd("p")
                        .appHostNm("caravan-hub EAI 게이트웨이")
                        .appHostDesc("caravan-hub EAI hub — caravan 라이브러리 유일 호스트 (v4 §3)")
                        .appHostUrl("http://localhost:8200")
                        .build()
        );
        appHostJpaRepository.saveAll(hosts);
    }

    /**
     * v4 Phase 4-C (2026-05-13) — SERAI_CONFIG 시드 (PoC 토픽별 INTEGRATION_TYPE 등록).
     *
     * <p>v4 §6-1 — 각 토픽이 INBOUND/OUTBOUND × DB/HTTP/FILE 4 조합 중 어느 패턴인지 운영자가 등록.
     * caravan-hub 가 부팅 시점에 본 테이블 read → 토픽별 라우팅 결정.
     *
     * <p>PoC 3 row (mls 제외 — §11 별 트랙):
     * <ul>
     *   <li>{@code MMPPMERPTT01} INBOUND DB — mpp 가 IF_MMPPMERPTT01 INSERT → caravan-hub 60초 polling → Kafka publish</li>
     *   <li>{@code MMCMMERPTT02} INBOUND HTTP — mcm 이 CaravanHubIntegrationClient.send() → caravan-hub sync REST → Kafka publish</li>
     *   <li>{@code MMQCMMPNTT01} OUTBOUND DB — caravan-hub 가 Kafka 수신 → IF_MMQCMMPNTT01 INSERT → mpn 60초 polling</li>
     * </ul>
     *
     * <p>secondary EMF 비활성 환경 (Repository 빈 미등록) 에서는 skip.
     */
    private void initCaravanHubConfigData() {
        if (consoleCaravanHubConfigJpaRepository == null) {
            log.info("[DataInitializer] ConsoleCaravanHubConfigJpaRepository 미활성 — SERAI_CONFIG 시드 skip");
            return;
        }
        List<ConsoleCaravanHubConfigEntity> configs = List.of(
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMPPMERPTT01")
                        .direction("INBOUND")
                        .integrationType("DB")
                        .pollingIntervalMs(60000)
                        .dbTableName("IF_MMPPMERPTT01")
                        .useYn("Y")
                        .build(),
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMCMMERPTT02")
                        .direction("INBOUND")
                        .integrationType("HTTP")
                        .httpUrl("http://localhost:8200/caravanHubApi/v1/send")
                        .httpMethod("POST")
                        .useYn("Y")
                        .build(),
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMQCMMPNTT01")
                        .direction("OUTBOUND")
                        .integrationType("DB")
                        .pollingIntervalMs(60000)
                        .dbTableName("IF_MMQCMMPNTT01")
                        .useYn("Y")
                        .build()
        );
        consoleCaravanHubConfigJpaRepository.saveAll(configs);
        log.info("[DataInitializer] SERAI_CONFIG 시드 완료 — {} row (PoC)", configs.size());
    }

    /**
     * MCM cma 동기화 schema artifacts 멱등 적재 (2026-05-29 사용자 결정 정정).
     *
     * <p>아키텍처 (사용자 명시):
     * <ul>
     *   <li>{@code MCM_SOURCE} — 원장 (편집/DML 대상). Entity {@code MasterCode / MasterCodeCategory / MasterCodeDetail}
     *       의 @Table(schema="MCM_SOURCE") 기반으로 hibernate ddl-auto=update 가 자동 생성.</li>
     *   <li>{@code MCMAPUSER}  — 운영 read 동기화본 (read-only). 동기화 화면이 MCM_SOURCE → MCMAPUSER 로 row copy.
     *       SELECT 카탈로그 (다른 모듈 GRANT 대상). 본 메서드가 빈 테이블 3 개 + view 1 개 멱등 적재.</li>
     *   <li>{@code MCM_BACKUP} — 백업본. 동기화 화면 사이클 (별도 worker) 위임 — 본 메서드 미적재.</li>
     * </ul>
     *
     * <p>적재 대상 (멱등 — {@code IF NOT EXISTS}):
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_MASTER}   — {@code SELECT INTO ... WHERE 1=0} 빈 구조 복제</li>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_CATEGORY} — 동</li>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_DETAIL}   — 동</li>
     *   <li>{@code MCMAPUSER.VI_MCM_CODE_ACCESS}   — view (사용자 제공 정본 DDL 의 MSSQL 변환).
     *       JOIN 대상 = MCMAPUSER 자기 schema (동기화본). MASTER.USE_TP='Y' 필터.</li>
     * </ol>
     *
     * <p>MSSQL 변환 메모 — Oracle PUBLIC SYNONYM 은 MSSQL 미지원 → schema 명시 (a 안). 본 메서드는 schema 명시 view 만 생성하고,
     * 호출측 (Service.java FROM 절) 도 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 로 schema 를 명시한다.
     */
    private void initMcmCmaSyncSchemaArtifacts() {
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_MASTER",   "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_CATEGORY", "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_DETAIL",   "MCM_SOURCE");
        createOrReplaceMcmCodeAccessView();
        log.info("[DataInitializer] MCM cma 동기화 schema artifacts 멱등 적재 완료 (MCMAPUSER 빈 3 테이블 + VI_MCM_CODE_ACCESS)");
    }

    /** {@code target} schema 에 {@code table} 이 없으면 {@code source} schema 의 동명 테이블 구조를 빈 복제. */
    private void copyEmptyTableIfAbsent(String target, String table, String source) {
        Number exists = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects " +
                "WHERE object_id = OBJECT_ID(:fqn) AND type = 'U'")
                .setParameter("fqn", target + "." + table)
                .getSingleResult();
        if (exists.intValue() > 0) {
            return;
        }
        // MSSQL: SELECT INTO 는 컬럼 타입을 복제하지만 PK / 인덱스 / DEFAULT 는 복제하지 않는다 (운영 동기화본은 read 중심이라 충분).
        nq(
                "SELECT * INTO " + target + "." + table +
                " FROM " + source + "." + table + " WHERE 1=0")
                .executeUpdate();
        log.info("[DataInitializer] 빈 테이블 복제: {}.{} ← {}.{}", target, table, source, table);
    }

    /**
     * {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 를 사용자 제공 정본 DDL 의 MSSQL 변환으로 멱등 생성.
     * <p>JOIN 대상 = MCMAPUSER 자기 schema 의 동기화본 3 테이블. 원장 (MCM_SOURCE) 직접 JOIN ✗ — 동기화 시차 의도.
     */
    private void createOrReplaceMcmCodeAccessView() {
        // CREATE VIEW 는 batch 의 first statement 여야 한다. IF 블록 안에서는 EXEC dynamic SQL 로 우회.
        nq(
                "IF OBJECT_ID('MCMAPUSER.VI_MCM_CODE_ACCESS', 'V') IS NULL " +
                "EXEC('CREATE VIEW MCMAPUSER.VI_MCM_CODE_ACCESS (" +
                "  CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN," +
                "  CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5," +
                "  CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ" +
                ") AS " +
                "SELECT MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM," +
                "       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN," +
                "       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5," +
                "       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ " +
                "  FROM MCMAPUSER.TB_MCM_CODE_MASTER MASTER, MCMAPUSER.TB_MCM_CODE_CATEGORY CATEGORY, MCMAPUSER.TB_MCM_CODE_DETAIL DETAIL " +
                " WHERE MASTER.USE_TP = ''Y''" +
                "   AND MASTER.MASTER_CODE = CATEGORY.MASTER_CODE" +
                "   AND MASTER.MASTER_CODE = DETAIL.MASTER_CODE" +
                "   AND CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID')")
                .executeUpdate();
    }

    /**
     * SQLite(local 단독) 용 {@code VI_MCM_CODE_ACCESS} 뷰 멱등 생성 (2026-08-07).
     *
     * <p>MSSQL 판({@link #createOrReplaceMcmCodeAccessView()})과 컬럼 구성·JOIN 조건이 동일하며,
     * SQLite 는 schema 접두를 쓰지 않으므로({@code McmAuditStatementInspector} 가 제거) 테이블명만 남긴다.
     * {@code CREATE VIEW IF NOT EXISTS} 라 매 부팅 재실행해도 안전하다.
     */
    private void createMcmCodeAccessViewSqlite() {
        nq("CREATE VIEW IF NOT EXISTS VI_MCM_CODE_ACCESS (" +
           "  CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN," +
           "  CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5," +
           "  CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ" +
           ") AS " +
           "SELECT MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM," +
           "       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN," +
           "       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5," +
           "       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ " +
           "  FROM TB_MCM_CODE_MASTER MASTER, TB_MCM_CODE_CATEGORY CATEGORY, TB_MCM_CODE_DETAIL DETAIL " +
           " WHERE MASTER.USE_TP = 'Y'" +
           "   AND MASTER.MASTER_CODE = CATEGORY.MASTER_CODE" +
           "   AND MASTER.MASTER_CODE = DETAIL.MASTER_CODE" +
           "   AND CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID")
                .executeUpdate();
        log.info("[DataInitializer] SQLite VI_MCM_CODE_ACCESS 뷰 멱등 생성 (masterCodeSelPop 조회용)");
    }

    /**
     * MCM csa commObjMng schema artifacts 멱등 적재 (2026-06-01 worker W1).
     *
     * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — cma 의 MCM_SOURCE 와 다름. 분석리포트 §11.1).
     *
     * <p>적재 대상:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_OBJ} — 본 화면 owner. 본 13 컬럼 (To-Be 정책 #1 — BIZ_SYSTEM_CODE 폐기)
     *       + audit 9 컬럼 (McmAuditEntity 정합 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT /
     *       U_SVC_ID / U_PGM_ID / VER). hibernate ddl-auto=update 가 SecObj entity 로 자동 생성 가능하나,
     *       schema 미존재 시 자동 생성 실패 위험 → 본 메서드가 명시 DDL 로 보장.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU} — read-only 조인 (selectCommObjMng MENU_ID scalar subquery +
     *       delete NOT EXISTS). 본 화면 owner ✗ — 본 화면이 native query 로 OBJECT_ID / MENU_ID 2 컬럼만 사용.
     *       commMenuMng 화면 owner 가 정본 DDL 등록 시 본 stub 은 hibernate skip.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov (selectMenuId). MENU_ID / BIZ_SYSTEM_CODE /
     *       MENU_NM / PARENT_MENU_ID 4 컬럼만 사용.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — read-only EXISTS 검증 (delete 차단). OBJECT_ID 1 컬럼만 사용.</li>
     * </ol>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. 본 화면 owner 인 {@code TB_MCM_SEC_OBJ} 만 컬럼 카탈로그
     * 1:1 정의 (분석 §9.6.1 인용). 나머지 3 read-only 테이블은 본 화면이 사용하는 최소 컬럼만 포함.
     */
    private void initMcmCsaCommObjMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecObjIfAbsent();
        alterTbMcmSecObjAccessTpColumnWidth();
        normalizeTbMcmSecObjAccessTpValues();
        createTbMcmSecMenuStubIfAbsent();
        normalizeTbMcmSecObjFormUrlValues();
        createTbMcmSecMenuFldStubIfAbsent();
        createTbMcmSecRoleMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commObjMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_OBJ + TB_MCM_SEC_MENU / _FLD / TB_MCM_SEC_ROLE_MAPPING stub)");
    }

    /**
     * 2026-06-03 사용자 명시 변경 — TB_MCM_SEC_OBJ.ACCESS_TP 컬럼 사이즈 VARCHAR(1) → VARCHAR(10) 확장
     * (한글 "내부"/"외부" 저장 위함). 이미 적재된 DB 에 대해 멱등 ALTER COLUMN.
     * sys.columns 에서 max_length 가 1 (VARCHAR(1) — char_max_length 1 byte) 이면 ALTER.
     */
    private void alterTbMcmSecObjAccessTpColumnWidth() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        Object curLen = nq(
                "SELECT c.max_length FROM sys.columns c " +
                "JOIN sys.tables t ON t.object_id = c.object_id " +
                "JOIN sys.schemas s ON s.schema_id = t.schema_id " +
                "WHERE s.name = 'MCMAPUSER' AND t.name = 'TB_MCM_SEC_OBJ' AND c.name = 'ACCESS_TP'")
                .getSingleResult();
        if (curLen == null) return;
        int len = ((Number) curLen).intValue();
        if (len >= 10) return;
        nq(
                "ALTER TABLE MCMAPUSER.TB_MCM_SEC_OBJ ALTER COLUMN ACCESS_TP VARCHAR(10) NULL")
                .executeUpdate();
        log.info("[DataInitializer] ALTER COLUMN: MCMAPUSER.TB_MCM_SEC_OBJ.ACCESS_TP VARCHAR(1) -> VARCHAR(10)");
    }

    /**
     * 2026-06-03 사용자 명시 변경 — TB_MCM_SEC_OBJ.ACCESS_TP 잔존 값 멱등 정규화.
     * <p>As-Is 3 enum ("1 내부 neXacro" / "2 외부 neXacro" / "3 외부 url") + 가능한 옛 시드 값
     * ('1' / '2' / '3' / '내부 neXacro' / '외부 neXacro' / '외부 url' / 'I' / 'E' 등) → To-Be 2 enum ("내부" / "외부") 로 일괄 정정.
     * <p>매핑 정책: AsIs "1 내부 neXacro" 계열 → "내부". AsIs "2 외부 neXacro" / "3 외부 url" 계열 → "외부".
     * <p>이미 "내부" / "외부" 인 row 는 WHERE 절로 skip (멱등).
     */
    private void normalizeTbMcmSecObjAccessTpValues() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        int toInner = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_OBJ SET ACCESS_TP = N'내부' " +
                "WHERE ACCESS_TP IN ('1', N'1', 'I', 'INNER', N'내부 neXacro', N'내부_neXacro', N'내부neXacro') " +
                "  AND ACCESS_TP <> N'내부'")
                .executeUpdate();
        int toOuter = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_OBJ SET ACCESS_TP = N'외부' " +
                "WHERE ACCESS_TP IN ('2', '3', N'2', N'3', 'E', 'OUTER', N'외부 neXacro', N'외부 url', N'외부_neXacro', N'외부url', N'외부neXacro') " +
                "  AND ACCESS_TP <> N'외부'")
                .executeUpdate();
        if (toInner > 0 || toOuter > 0) {
            log.info("[DataInitializer] TB_MCM_SEC_OBJ.ACCESS_TP 정규화 — 내부={} / 외부={}", toInner, toOuter);
        }
    }

    /**
     * 2026-06-03 사용자 명시 — As-Is nexacro `${OBJECT_ID}.xfdl` 형식 폐기,
     * ToBe portal shell 실제 라우팅 형식 `{group}/{OBJECT_ID}` 적용 (page-components/{group}/{leaf}/page.tsx).
     * SEC_MENU.PARENT_MENU_ID (cma/csa/cme) 와 JOIN 해서 group 결정 후 멱등 UPDATE.
     */
    private void normalizeTbMcmSecObjFormUrlValues() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) return;
        int n = nq(
                "UPDATE o " +
                "   SET o.FORM_URL = m.PARENT_MENU_ID + '/' + o.OBJECT_ID " +
                "  FROM MCMAPUSER.TB_MCM_SEC_OBJ o " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_MENU m ON m.OBJECT_ID = o.OBJECT_ID " +
                " WHERE m.PARENT_MENU_ID IS NOT NULL " +
                "   AND (o.FORM_URL IS NULL " +
                "        OR o.FORM_URL = '' " +
                "        OR o.FORM_URL LIKE '%.xfdl' " +
                "        OR o.FORM_URL = o.OBJECT_ID) " +
                "   AND (o.FORM_URL IS NULL OR o.FORM_URL <> (m.PARENT_MENU_ID + '/' + o.OBJECT_ID))")
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] TB_MCM_SEC_OBJ.FORM_URL 정규화 (group/OBJECT_ID) - {} row", n);
        }
    }

    /** {@code MCMAPUSER} schema 가 없으면 생성 (MSSQL). */
    private void ensureSchemaMcmapuser() {
        nq(
                "IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'MCMAPUSER') "
                + "EXEC('CREATE SCHEMA MCMAPUSER')")
                .executeUpdate();
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_OBJ} — 본 화면 owner (commObjMng). 본 13 컬럼 (To-Be 정책 #1) +
     * audit 9 컬럼. 분석리포트 §9.6.1 / §11.1 인용.
     */
    private void createTbMcmSecObjIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_OBJ (" +
                "  OBJECT_ID         VARCHAR(50)   NOT NULL," +
                "  OBJECT_NM         VARCHAR(100)  NULL," +
                "  PROGRAM_DESC      VARCHAR(300)  NULL," +
                "  SYSTEM_CODE       VARCHAR(10)   NULL," +
                "  OBJECT_TYPE       VARCHAR(10)   NULL," +
                "  SERVICE           VARCHAR(100)  NULL," +
                "  USE_TP            VARCHAR(1)    NULL," +
                "  ACCESS_TP         VARCHAR(10)   NULL," +
                "  FORM_URL          VARCHAR(100)  NULL," +
                "  OUT_ACCESS_IP     VARCHAR(150)  NULL," +
                "  PARAM             VARCHAR(150)  NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_OBJ PRIMARY KEY (OBJECT_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_OBJ");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU} — read-only 조인 stub (본 화면 미 owner — commMenuMng 화면 owner).
     * 본 화면이 사용하는 컬럼 (MENU_ID / OBJECT_ID) 만 포함. 후속 worker (commMenuMng) 가 컬럼 추가 시
     * {@code IF NOT EXISTS} 가드로 본 stub 보존.
     */
    private void createTbMcmSecMenuStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU (" +
                "  MENU_ID    VARCHAR(30)  NOT NULL," +
                "  OBJECT_ID  VARCHAR(100) NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU (stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov stub (As-Is 1:1 컬럼 정합).
     *
     * <p>분석리포트 commMenuMng §9.3 정합 — 본 4 컬럼:
     * <ul>
     *   <li>{@code MENU_ID}        — PK (xml:127)</li>
     *   <li>{@code MENU_SEQ}       — 정렬 키 (xml:128 / SYS_CONNECT_BY_PATH 의 TO_CHAR(MENU_SEQ,'00000000'))</li>
     *   <li>{@code MENU_NM}        — 트리 표시 텍스트 (xml:129)</li>
     *   <li>{@code PARENT_MENU_ID} — 부모-자식 관계 (xml:130)</li>
     * </ul>
     *
     * <p>SecMenuNativeRepository.searchMenuFld 의 CTE 쿼리가 MENU_SEQ 를 SELECT/ORDER BY 사용 — 본 컬럼이
     * 없으면 SQL 실행 시 "열 이름 'MENU_SEQ'이(가) 유효하지 않습니다" 에러 발생 (2026-06-01 cycle 2 결함).
     *
     * <p>BIZ_SYSTEM_CODE 컬럼은 commMenuMng 분석 §9.3 #5 정책 #1 (BIZ_SYSTEM_CODE 도메인 전면 폐기) 에
     * 따라 미적재. 본 환경에서 W1 시점에 적재된 BIZ_SYSTEM_CODE 컬럼은 ALTER DROP 하지 않고 잔존 보존
     * (DDL 카탈로그 의미만 — entity ✗ + read SQL 미사용).
     */
    private void createTbMcmSecMenuFldStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_MENU_FLD")) {
            // 이미 존재 → W1 stub (MENU_SEQ 누락) 가능성 → ALTER ADD 로 누락 컬럼 보강 (멱등).
            upgradeTbMcmSecMenuFldToFullOwner();
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU_FLD (" +
                "  MENU_ID         VARCHAR(30)  NOT NULL," +
                "  MENU_SEQ        VARCHAR(30)  NULL," +
                "  MENU_NM         VARCHAR(100) NULL," +
                "  PARENT_MENU_ID  VARCHAR(30)  NULL," +
                "  BIZ_SYSTEM_CODE VARCHAR(10)  NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU_FLD PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU_FLD (stub + MENU_SEQ)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} 누락 컬럼 ADD — W1 stub 4 컬럼 → As-Is 정합 (MENU_SEQ ADD).
     *
     * <p>2026-06-01 cycle 2 결함 fix — W1 (commObjMng) 가 적재한 4 컬럼 stub 에 MENU_SEQ 누락 →
     * SecMenuNativeRepository.searchMenuFld 의 CTE 가 MENU_SEQ SELECT/ORDER BY 시 에러. 본 메서드가
     * IF NOT EXISTS 가드로 MENU_SEQ 만 ALTER ADD (멱등).
     *
     * <p>PK 는 단일 MENU_ID 유지 (As-Is 정책 — MENU_SEQ 는 정렬 키만, PK 후보 ✗).
     */
    private void upgradeTbMcmSecMenuFldToFullOwner() {
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_SEQ", "VARCHAR(30)");
        // Round 3 (2026-06-02): 폴더에도 FULL_SEQ 인코딩 적용 (모듈=백만 / 그룹=만).
        // USE_TP / MENU_TP / MENU_VIEW_YN — SEC_MENU 와 동일 형식 (sidebar 트리 응답에 필요).
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "FULL_SEQ", "NUMERIC(10,0)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "USE_TP", "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_TP", "VARCHAR(20)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_VIEW_YN", "VARCHAR(1)");
        // R3 시드 보정 — 4 폴더 row 의 FULL_SEQ / USE_TP / MENU_VIEW_YN 멱등 UPDATE.
        Object[][] fldR3 = new Object[][]{
                {"mcm", 1000000L},
                {"cma", 1010000L},
                {"csa", 1020000L},
                {"cme", 1030000L},
        };
        for (Object[] r : fldR3) {
            nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                    "   SET FULL_SEQ = :fs, USE_TP = COALESCE(USE_TP, 'Y'), " +
                    "       MENU_VIEW_YN = COALESCE(MENU_VIEW_YN, 'Y') " +
                    " WHERE MENU_ID = :id")
                    .setParameter("fs", r[1])
                    .setParameter("id", r[0])
                    .executeUpdate();
        }
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — read-only EXISTS 검증 stub (본 화면 미 owner —
     * commRoleMng / commPermMng 화면 owner). delete 차단용 OBJECT_ID 컬럼만 포함.
     */
    private void createTbMcmSecRoleMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (" +
                "  ROLE_ID    VARCHAR(30)  NOT NULL," +
                "  OBJECT_ID  VARCHAR(50)  NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (stub)");
    }

    /**
     * MCM csa commMenuMng schema artifacts 멱등 적재 (2026-06-01 worker W2).
     *
     * <p>본 화면 owner = {@code TB_MCM_SEC_MENU} (메뉴 항목 마스터).
     * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 #1 — W1 commObjMng 와 동일).
     *
     * <p>적재 대상:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU} — 본 화면 owner. 본 15 컬럼 (PK 복합 MENU_ID+MENU_SEQ) +
     *       audit 9 컬럼 (McmAuditEntity 정합). 분석리포트 §9.1 / §11.1 인용.
     *       <ul>
     *         <li>W1 stub (MENU_ID/OBJECT_ID 2 컬럼) 이 이미 존재할 수 있음 → 본 메서드가 ALTER 로
     *             누락 컬럼을 individual 추가 (멱등). 컬럼별 존재 검증 후 IF NOT EXISTS 등가 ALTER.</li>
     *         <li>W1 stub 미존재 시 (= 빈 환경) → full DDL 로 신규 생성.</li>
     *       </ul></li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov stub. W1 에서 이미 4 컬럼 stub 생성됨
     *       → 본 화면도 동일 컬럼만 사용 (selectMenuFldList CTE). 본 메서드는 W1 stub 재사용 — 추가 컬럼 ✗.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_OBJ} — W1 owner. 본 화면은 read-only LEFT JOIN — 추가 컬럼 ✗.</li>
     * </ol>
     *
     * <p>모든 DDL 은 MSSQL 멱등 (tableExists / columnExists 가드). hibernate ddl-auto=update 가 SecMenu
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommMenuMngArtifacts() {
        ensureSchemaMcmapuser();
        upgradeTbMcmSecMenuToFullOwner();
        // 2026-06-05 사용자 결정 — PK (MENU_ID, MENU_SEQ) → (MENU_ID) 마이그레이션 (기존 DB) +
        //   MENU_SEQ '0' LPAD 8자리 일괄 정규화 ("001" → "00000001"). 멱등.
        migrateSecMenuPkToMenuIdOnly();
        normalizeMenuSeqLpad8();
        log.info("[DataInitializer] MCM csa commMenuMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_MENU = full 15 본 + audit 9 컬럼 owner / PK=MENU_ID / MENU_SEQ 8자리)");
    }

    /**
     * 2026-06-05 사용자 결정 — {@code TB_MCM_SEC_MENU} PK 를 (MENU_ID, MENU_SEQ) 복합 → (MENU_ID) 단독으로 변경.
     *
     * <p>멱등: 현재 PK 에 MENU_SEQ 가 포함되어 있을 때만 DROP + 재생성. 이미 MENU_ID 단독이면 skip.
     * MENU_ID 중복 존재 시(단독 PK 불가) 마이그레이션 SKIP + 경고 (DROP 후 ADD 실패로 PK 소실 방지).
     */
    private void migrateSecMenuPkToMenuIdOnly() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) return;
        Number seqInPk = (Number) nq(
                "SELECT COUNT(*) FROM sys.index_columns ic " +
                "JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id " +
                "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id " +
                "WHERE i.is_primary_key = 1 AND i.object_id = OBJECT_ID('MCMAPUSER.TB_MCM_SEC_MENU') " +
                "  AND c.name = 'MENU_SEQ'")
                .getSingleResult();
        if (seqInPk == null || seqInPk.intValue() == 0) return; // 이미 MENU_ID 단독 PK (또는 PK에 MENU_SEQ 없음)

        Number dup = (Number) nq(
                "SELECT COUNT(*) FROM (SELECT MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU " +
                "GROUP BY MENU_ID HAVING COUNT(*) > 1) d")
                .getSingleResult();
        if (dup != null && dup.intValue() > 0) {
            log.warn("[DataInitializer] SEC_MENU PK 마이그레이션 SKIP — MENU_ID 중복 {} 건 존재 "
                   + "(MENU_ID 단독 PK 불가). 중복 행 정리 후 재기동 필요.", dup.intValue());
            return;
        }
        String pkName = (String) nq(
                "SELECT name FROM sys.key_constraints " +
                "WHERE parent_object_id = OBJECT_ID('MCMAPUSER.TB_MCM_SEC_MENU') AND type = 'PK'")
                .getSingleResult();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU DROP CONSTRAINT " + pkName).executeUpdate();
        // PK 컬럼 NOT NULL 보장 (방어) — MENU_SEQ 는 이제 NULL 허용 컬럼으로 완화.
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ALTER COLUMN MENU_ID VARCHAR(30) NOT NULL").executeUpdate();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ALTER COLUMN MENU_SEQ VARCHAR(30) NULL").executeUpdate();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ADD CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)").executeUpdate();
        log.info("[DataInitializer] SEC_MENU PK 마이그레이션 완료 — (MENU_ID, MENU_SEQ) → (MENU_ID). 기존 PK 제약={}", pkName);
    }

    /**
     * 2026-06-05 사용자 지시 — 기존 MENU_SEQ 값을 '0' LPAD 8자리로 일괄 정규화 ("001" → "00000001").
     *
     * <p>대상: 숫자로만 구성된 8자 미만 MENU_SEQ (8자 이상 / 비숫자 / NULL 은 변경 ✗ = 멱등).
     * SEC_MENU(화면) · SEC_MENU_FLD(폴더) 양쪽. {@link #migrateSecMenuPkToMenuIdOnly()} 직후 호출되어
     * (MENU_SEQ 가 PK 에서 분리된 뒤) 안전하게 UPDATE.
     */
    private void normalizeMenuSeqLpad8() {
        final String upd =
                "SET MENU_SEQ = RIGHT('00000000' + MENU_SEQ, 8) " +
                "WHERE MENU_SEQ IS NOT NULL AND LEN(MENU_SEQ) < 8 AND MENU_SEQ NOT LIKE '%[^0-9]%'";
        int nMenu = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU " + upd).executeUpdate();
        int nFld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD " + upd).executeUpdate();
        if (nMenu > 0 || nFld > 0) {
            log.info("[DataInitializer] MENU_SEQ 8자리 LPAD 일괄 정규화 — SEC_MENU={} / SEC_MENU_FLD={}", nMenu, nFld);
        }
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU} 를 W2 owner (full 15 본 + audit 9) 로 보장.
     * <p>W1 stub (MENU_ID/OBJECT_ID 2 컬럼) 이 이미 있으면 누락 컬럼만 ALTER 로 추가.
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성 (PK 복합 MENU_ID + MENU_SEQ).
     */
    private void upgradeTbMcmSecMenuToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) {
            // 신규 생성 — full DDL
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU (" +
                    "  MENU_ID           VARCHAR(30)   NOT NULL," +
                    "  MENU_SEQ          VARCHAR(30)   NOT NULL," +
                    "  FULL_SEQ          VARCHAR(30)   NULL," +
                    "  MENU_NM           VARCHAR(300)  NULL," +
                    "  MENU_DESC         VARCHAR(1000) NULL," +
                    "  MENU_TP           VARCHAR(10)   NULL," +
                    "  OBJECT_ID         VARCHAR(50)   NULL," +
                    "  USE_TP            VARCHAR(1)    NULL," +
                    "  START_ACTIVE_DATE DATETIME2     NULL," +
                    "  END_ACTIVE_DATE   DATETIME2     NULL," +
                    "  MENU_VIEW_YN      VARCHAR(1)    NULL," +
                    "  PARENT_MENU_ID    VARCHAR(30)   NULL," +
                    "  MENU_PARAM1       VARCHAR(300)  NULL," +
                    "  MENU_PARAM2       VARCHAR(300)  NULL," +
                    "  MENU_PARAM3       VARCHAR(300)  NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID          VARCHAR(100)  NULL," +
                    "  C_AT              DATETIME2     NULL," +
                    "  C_SVC_ID          VARCHAR(100)  NULL," +
                    "  C_PGM_ID          VARCHAR(100)  NULL," +
                    "  U_USR_ID          VARCHAR(100)  NULL," +
                    "  U_AT              DATETIME2     NULL," +
                    "  U_SVC_ID          VARCHAR(100)  NULL," +
                    "  U_PGM_ID          VARCHAR(100)  NULL," +
                    "  VER               BIGINT        NULL," +
                    // 2026-06-05 사용자 결정 — PK = MENU_ID 단독 (MENU_SEQ 는 순수 순서 컬럼).
                    "  CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU (full owner / 15 본 + audit 9 / PK=MENU_ID)");
            return;
        }
        // 이미 존재 → W1 stub 일 가능성. 누락 컬럼만 ALTER 로 추가.
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_SEQ",          "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "FULL_SEQ",          "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_NM",           "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_DESC",         "VARCHAR(1000)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_TP",           "VARCHAR(10)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "USE_TP",            "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "START_ACTIVE_DATE", "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "END_ACTIVE_DATE",   "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_VIEW_YN",      "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "PARENT_MENU_ID",    "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM1",       "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM2",       "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM3",       "VARCHAR(300)");
        // audit 9
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_USR_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_AT",              "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_SVC_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_PGM_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_USR_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_AT",              "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_SVC_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_PGM_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "VER",               "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_MENU (W1 stub → W2 owner / 누락 컬럼 ADD)");
    }

    /**
     * MSSQL — 컬럼이 없으면 ALTER TABLE ADD (멱등). hibernate ddl-auto=update 와 동일 효과.
     * 컬럼 타입은 호출자가 책임 (변경 시 ALTER COLUMN 별도 필요).
     */
    private void addColumnIfAbsent(String schema, String table, String column, String columnType) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.columns "
                + "WHERE object_id = OBJECT_ID(:fqn) AND name = :col")
                .setParameter("fqn", schema + "." + table)
                .setParameter("col", column)
                .getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(
                "ALTER TABLE " + schema + "." + table + " ADD " + column + " " + columnType + " NULL")
                .executeUpdate();
        log.info("[DataInitializer] ALTER ADD COLUMN: {}.{}.{} {}", schema, table, column, columnType);
    }

    /** MSSQL {@code sys.objects} 으로 schema + table 존재 여부 확인. */
    private boolean tableExists(String schema, String table) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects "
                + "WHERE object_id = OBJECT_ID(:fqn) AND type = 'U'")
                .setParameter("fqn", schema + "." + table)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /**
     * 화면 사용 통계 원본·일별 집계 테이블 멱등 생성 (MSSQL 계열, 2026-10-02).
     * <p>DDL 정본은 mcm-core {@link ScreenUsageMssqlDdl} — 운영 DBA 전달본과 같은 문장이다. 두 테이블은 schema 접두가 없어
     * {@link #tableExists(String, String)}(schema 필수) 대신 기본 스키마로 해석하는 {@code OBJECT_ID(테이블)} 로 확인한다.
     * local-db 는 ddl-auto=update 가 먼저 만들 수 있으므로 인덱스도 이름으로 하나씩 확인한다.
     */
    private void initScreenUsageArtifacts() {
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_LOG_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.LOG_TABLE);
        }
        for (ScreenUsageMssqlDdl.IndexDdl index : ScreenUsageMssqlDdl.LOG_INDEXES) {
            if (!indexExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE, index.name())) {
                nq(index.sql()).executeUpdate();
                log.info("[DataInitializer] CREATE INDEX: {}", index.name());
            }
        }
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.DAY_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_DAY_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.DAY_TABLE);
        }
    }

    /** schema 접두 없는 테이블 존재 여부 — 접속 계정 기본 스키마로 해석 (MSSQL). */
    private boolean tableExistsInDefaultSchema(String table) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects WHERE object_id = OBJECT_ID(:name) AND type = 'U'")
                .setParameter("name", table)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /** schema 접두 없는 테이블의 인덱스 존재 여부 (MSSQL). */
    private boolean indexExistsInDefaultSchema(String table, String indexName) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(:name) AND name = :idx")
                .setParameter("name", table)
                .setParameter("idx", indexName)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /**
     * MCM csa commRoleMng schema artifacts 멱등 적재 (2026-06-01 worker W3).
     *
     * <p>본 화면 owner 2 테이블:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE} — entity {@code SecRole} 정합. 본 7 컬럼 (PK ROLE_ID + ROLE_NM /
     *       ROLE_DESC / PARENT_ROLE_ID / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE) + audit 9.
     *       To-Be 정책 #1 — BIZ_SYSTEM_CODE 컬럼은 entity 미반영 (DDL 자체에는 잔존 보존 의도 — DMES 카탈로그).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — entity {@code SecRoleMapping} 정합 (PK 복합
     *       ROLE_ID + OBJECT_ID + PERMISSION_ID).
     *       <ul>
     *         <li>W1 stub (ROLE_ID/OBJECT_ID 2 컬럼 + PK 2 복합) 이 존재 → PERMISSION_ID 컬럼 ADD +
     *             PK 재설계 (DROP CONSTRAINT + ADD CONSTRAINT) + audit 9 ADD.</li>
     *         <li>W1 stub 미존재 시 → full DDL 신규 생성.</li>
     *       </ul></li>
     * </ol>
     *
     * <p>본 화면 read-only stub 2 테이블 (다른 화면 owner — IF NOT EXISTS 가드):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_PERM} — commPermMng 화면 owner. 본 화면 사용 컬럼만 (PERMISSION_ID(PK) /
     *       PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / USE_TP).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — commRoleGrpMng 화면 owner. 본 화면 사용 컬럼만
     *       (ROLE_GROUP_ID(PK) / ROLE_ID(PK)).</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecRole/SecRoleMapping
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommRoleMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecRoleIfAbsent();
        upgradeTbMcmSecRoleMappingToFullOwner();
        createTbMcmSecPermStubIfAbsent();
        createTbMcmSecRoleGroupMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commRoleMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_ROLE owner + TB_MCM_SEC_ROLE_MAPPING owner upgrade + "
               + "TB_MCM_SEC_PERM / TB_MCM_SEC_ROLEGROUP_MAPPING stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE} — 본 화면 owner (commRoleMng). 본 7 컬럼 + audit 9 컬럼.
     * 분석리포트 §9.4.1 (DMES 시트 26 컬럼) 중 To-Be 채택 7 컬럼만. BIZ_SYSTEM_CODE 는 DDL 잔존 (다른 화면 사용).
     */
    private void createTbMcmSecRoleIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE (" +
                "  ROLE_ID           VARCHAR(30)   NOT NULL," +
                "  ROLE_NM           VARCHAR(100)  NULL," +
                "  ROLE_DESC         VARCHAR(300)  NULL," +
                "  PARENT_ROLE_ID    VARCHAR(30)   NULL," +
                "  MENU_ID           VARCHAR(30)   NULL," +
                "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존 (다른 화면)
                "  USE_TP            VARCHAR(1)    NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합 (W1·W2 동일)
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLE PRIMARY KEY (ROLE_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE (owner / 본 7 + BIZ_SYSTEM_CODE + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} 를 W3 owner (PK 3 복합 + audit 9) 로 보장.
     * <p>W1 stub (ROLE_ID/OBJECT_ID 2 컬럼 + PK 2 복합) 이 존재하면:
     *   <ol>
     *     <li>PERMISSION_ID 컬럼 ADD (NOT NULL DEFAULT '' — PK 추가 가능하도록)</li>
     *     <li>기존 PK 제약 DROP (PK_TB_MCM_SEC_ROLE_MAPPING)</li>
     *     <li>새 PK 복합 (ROLE_ID + OBJECT_ID + PERMISSION_ID) ADD CONSTRAINT</li>
     *     <li>audit 9 컬럼 ADD (멱등)</li>
     *   </ol>
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     */
    private void upgradeTbMcmSecRoleMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING")) {
            // 신규 생성 — full DDL (PK 3 복합)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (" +
                    "  ROLE_ID       VARCHAR(30)   NOT NULL," +
                    "  OBJECT_ID     VARCHAR(50)   NOT NULL," +
                    "  PERMISSION_ID VARCHAR(100)  NOT NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID      VARCHAR(100)  NULL," +
                    "  C_AT          DATETIME2     NULL," +
                    "  C_SVC_ID      VARCHAR(100)  NULL," +
                    "  C_PGM_ID      VARCHAR(100)  NULL," +
                    "  U_USR_ID      VARCHAR(100)  NULL," +
                    "  U_AT          DATETIME2     NULL," +
                    "  U_SVC_ID      VARCHAR(100)  NULL," +
                    "  U_PGM_ID      VARCHAR(100)  NULL," +
                    "  VER           BIGINT        NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID, PERMISSION_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (full owner / PK 3 + audit 9)");
            return;
        }
        // W1 stub 호환 — 컬럼 ADD + PK 재설계 + audit 9 ADD (멱등)
        // PERMISSION_ID 컬럼 추가 (없으면) — NOT NULL DEFAULT '' (PK 추가 가능)
        if (!columnExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "PERMISSION_ID")) {
            nq(
                    "ALTER TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING "
                  + "ADD PERMISSION_ID VARCHAR(100) NOT NULL CONSTRAINT DF_TB_MCM_SEC_ROLE_MAPPING_PERMID DEFAULT ''")
                    .executeUpdate();
            log.info("[DataInitializer] ALTER ADD COLUMN: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID VARCHAR(100) NOT NULL DEFAULT ''");
            // PK 재설계 — 기존 PK 가 (ROLE_ID, OBJECT_ID) 였으므로 DROP + 새 PK ADD (ROLE_ID, OBJECT_ID, PERMISSION_ID)
            dropPkIfExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "PK_TB_MCM_SEC_ROLE_MAPPING");
            nq(
                    "ALTER TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING "
                  + "ADD CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID, PERMISSION_ID)")
                    .executeUpdate();
            log.info("[DataInitializer] PK 재설계: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID)");
        }
        // audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (W1 stub → W3 owner / PK 3 복합 + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_PERM} — read-only stub (commPermMng 화면 owner).
     * 본 화면이 사용하는 컬럼만 (PERMISSION_ID(PK) / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM /
     * POPUP_BTN / USE_TP). 후속 worker (commPermMng) 가 컬럼 추가 시 IF NOT EXISTS 가드로 본 stub 보존.
     */
    private void createTbMcmSecPermStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_PERM")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_PERM (" +
                "  PERMISSION_ID     VARCHAR(100)  NOT NULL," +
                "  PERMISSION_NM     VARCHAR(100)  NULL," +
                "  PERMISSION_COMMON VARCHAR(500)  NULL," +
                "  PERMISSION_CUSTOM VARCHAR(500)  NULL," +
                "  POPUP_BTN         VARCHAR(1000) NULL," +
                "  USE_TP            VARCHAR(1)    NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_PERM PRIMARY KEY (PERMISSION_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_PERM (stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — read-only stub (commRoleGrpMng 화면 owner).
     * 본 화면 deleteCommRole NOT EXISTS 검증용 (V-003 서버 재검증). PK 복합 (ROLE_GROUP_ID, ROLE_ID).
     */
    private void createTbMcmSecRoleGroupMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (" +
                "  ROLE_GROUP_ID VARCHAR(30) NOT NULL," +
                "  ROLE_ID       VARCHAR(30) NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP_MAPPING PRIMARY KEY (ROLE_GROUP_ID, ROLE_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (stub)");
    }

    /**
     * MCM csa commRoleGrpMng schema artifacts 멱등 적재 (2026-06-01 worker W4).
     *
     * <p>본 화면 owner 2 테이블:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP} — entity {@code SecRoleGroup} 정합.
     *       본 6 컬럼 (PK ROLE_GROUP_ID + ROLE_GROUP_NM / ROLE_GROUP_DESC / USE_TP / START_ACTIVE_DATE /
     *       END_ACTIVE_DATE) + audit 9. To-Be 정책 #1 — BIZ_SYSTEM_CODE 컬럼은 entity 미반영
     *       (DDL 자체에는 잔존 보존 — DMES 카탈로그 §9.9.1 24 컬럼 정합).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — entity {@code SecRoleGroupMapping} 정합
     *       (PK 복합 ROLE_GROUP_ID + ROLE_ID).
     *       <ul>
     *         <li>W3 stub (ROLE_GROUP_ID/ROLE_ID 2 컬럼 + PK 2 복합) 이 존재 → PK 그대로 보존 (W4 entity PK 와 동일).
     *             audit 9 컬럼만 ALTER ADD 로 추가 (멱등).</li>
     *         <li>W3 stub 미존재 시 → full DDL 신규 생성.</li>
     *       </ul></li>
     * </ol>
     *
     * <p>본 화면 read-only stub 1 테이블 (다른 화면 owner — IF NOT EXISTS 가드):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} — commUserMng 화면 owner.
     *       본 화면 사용 컬럼만 (USER_ID / ROLE_GROUP_ID(PK 2 복합)).
     *       selectCommRoleGrp scalar subquery (xml:14~18) + deleteCommRoleGrp NOT EXISTS (xml:77~80) 검증용.</li>
     * </ul>
     *
     * <p>본 화면이 사용하지만 다른 화면이 owner 인 테이블 (재생성 ✗, 기존 owner DDL 재사용):
     * <ul>
     *   <li>{@code TB_MCM_SEC_ROLE} (W3 owner) — selectCommRoleGrpMap JOIN + selectCommRole 본 테이블 + PARENT_ROLE_ID</li>
     *   <li>{@code TB_MCM_SEC_ROLE_MAPPING} (W3 owner) — selectMenuObjTree WITH MROLE 의 RM</li>
     *   <li>{@code TB_MCM_SEC_MENU} (W2 owner) — selectMenuObjTree WITH MROLE 의 MNU</li>
     *   <li>{@code TB_MCM_SEC_MENU_FLD} (W1 stub) — selectMenuObjTree MENU CTE (CONNECT BY 등가 WITH RECURSIVE)</li>
     *   <li>{@code TB_MCM_SEC_OBJ} (W1 owner) — selectMenuObjTree 최종 LEFT JOIN</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecRoleGroup/SecRoleGroupMapping
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommRoleGrpMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecRoleGroupIfAbsent();
        upgradeTbMcmSecRoleGroupMappingToFullOwner();
        createTbMcmSecUserMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commRoleGrpMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_ROLEGROUP owner + TB_MCM_SEC_ROLEGROUP_MAPPING owner upgrade + "
               + "TB_MCM_SEC_USER_MAPPING stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP} — 본 화면 owner (commRoleGrpMng). 본 6 컬럼 + audit 9.
     * 분석리포트 §9.9.1 (DMES 시트 24 컬럼) 중 To-Be 채택 6 컬럼만. BIZ_SYSTEM_CODE 는 DDL 잔존 (다른 화면 사용 가능성).
     */
    private void createTbMcmSecRoleGroupIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP (" +
                "  ROLE_GROUP_ID     VARCHAR(30)   NOT NULL," +
                "  ROLE_GROUP_NM     VARCHAR(100)  NULL," +
                "  ROLE_GROUP_DESC   VARCHAR(300)  NULL," +
                "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존
                "  USE_TP            VARCHAR(1)    NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합 (W1·W2·W3 동일)
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP PRIMARY KEY (ROLE_GROUP_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP (owner / 본 6 + BIZ_SYSTEM_CODE + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} 를 W4 owner (PK 2 복합 + audit 9) 로 보장.
     * <p>W3 stub (ROLE_GROUP_ID/ROLE_ID 2 컬럼 + PK 2 복합) 이 존재하면:
     *   <ol>
     *     <li>PK 는 W3 stub 과 동일 (변경 ✗ — W4 entity SecRoleGroupMapping PK 도 (ROLE_GROUP_ID, ROLE_ID) 2 복합)</li>
     *     <li>audit 9 컬럼 ADD (멱등)</li>
     *   </ol>
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     */
    private void upgradeTbMcmSecRoleGroupMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING")) {
            // 신규 생성 — full DDL (PK 2 복합)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (" +
                    "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                    "  ROLE_ID       VARCHAR(30)  NOT NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID      VARCHAR(100) NULL," +
                    "  C_AT          DATETIME2    NULL," +
                    "  C_SVC_ID      VARCHAR(100) NULL," +
                    "  C_PGM_ID      VARCHAR(100) NULL," +
                    "  U_USR_ID      VARCHAR(100) NULL," +
                    "  U_AT          DATETIME2    NULL," +
                    "  U_SVC_ID      VARCHAR(100) NULL," +
                    "  U_PGM_ID      VARCHAR(100) NULL," +
                    "  VER           BIGINT       NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP_MAPPING PRIMARY KEY (ROLE_GROUP_ID, ROLE_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (full owner / PK 2 + audit 9)");
            return;
        }
        // W3 stub 호환 — PK 동일 (변경 ✗) / audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (W3 stub → W4 owner / PK 2 보존 + audit 9 ADD)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} — read-only stub (commUserMng 화면 owner).
     * 본 화면 selectCommRoleGrp scalar subquery (xml:14~18) + deleteCommRoleGrp NOT EXISTS (xml:77~80) 검증용.
     * PK 복합 (USER_ID, ROLE_GROUP_ID).
     */
    private void createTbMcmSecUserMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_MAPPING (" +
                "  USER_ID       VARCHAR(100) NOT NULL," +
                "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_MAPPING PRIMARY KEY (USER_ID, ROLE_GROUP_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (stub)");
    }

    // ────────────────────────────────────────────────────────────────
    // W5 commUserMng — schema artifacts (owner 6 테이블)
    // ────────────────────────────────────────────────────────────────

    /**
     * commUserMng (W5) schema artifacts — 멱등 적재.
     *
     * <p>본 화면 owner 6 테이블:
     * <ul>
     *   <li>{@code TB_MCM_SEC_USER}          — 본 21 컬럼 + audit 9 (entity SecUser)</li>
     *   <li>{@code TB_MCM_SEC_USER_MAPPING}  — W4 stub (PK 2 복합) → W5 full owner: audit 9 ADD (정책 #15)</li>
     *   <li>{@code TB_MCM_SEC_USER_PWD}      — 본 7 컬럼 + audit 9 (entity SecUserPwd / mergeCommonPwdInit)</li>
     *   <li>{@code TB_MCM_SEC_USER_HIS}      — 본 7 컬럼 + PK 2 복합 + audit 9 (정책 #3 (C) 흡수)</li>
     *   <li>{@code TB_MCM_SEC_USER_ROLL_HIS} — 본 8 컬럼 + PK 5 복합 + audit 9 (정책 #3 (C) 흡수)</li>
     *   <li>{@code TB_MCM_DEPT_INFO}         — 본 7 컬럼 + audit 9 (정책 #2 / Q-002 — EAI 폐기 대체)</li>
     * </ul>
     */
    private void initMcmCsaCommUserMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecUserIfAbsent();
        upgradeTbMcmSecUserMappingToFullOwner();
        createTbMcmSecUserPwdIfAbsent();
        createTbMcmSecUserHisIfAbsent();
        createTbMcmSecUserRollHisIfAbsent();
        createTbMcmDeptInfoIfAbsent();
        log.info("[DataInitializer] MCM csa commUserMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_USER owner + TB_MCM_SEC_USER_MAPPING W4 stub → W5 owner upgrade + "
               + "TB_MCM_SEC_USER_PWD owner + TB_MCM_SEC_USER_HIS owner + TB_MCM_SEC_USER_ROLL_HIS owner + "
               + "TB_MCM_DEPT_INFO owner)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER} — 본 화면 owner (commUserMng). 본 21 컬럼 + audit 9.
     * 분석 §9.1.1 (DMES 38 컬럼) 중 audit 17 폐기 + 본 21.
     */
    private void createTbMcmSecUserIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER (" +
                "  USER_ID            VARCHAR(30)   NOT NULL," +
                "  USER_EMP_NO        VARCHAR(10)   NULL," +
                "  SSO_ID             VARCHAR(30)   NULL," +
                "  USER_NM            VARCHAR(30)   NULL," +
                "  START_ACTIVE_DATE  DATETIME2     NULL," +
                "  END_ACTIVE_DATE    DATETIME2     NULL," +
                "  DEPT_CD            VARCHAR(10)   NULL," +
                "  USER_CATEGORY_CD   VARCHAR(10)   NULL," +
                "  USE_TP             VARCHAR(1)    NULL," +
                "  EMAIL              VARCHAR(30)   NULL," +
                "  TEL_NO             VARCHAR(15)   NULL," +
                "  MOBILE_TEL_NO      VARCHAR(15)   NULL," +
                "  IN_OUT_EMP_TP      VARCHAR(1)    NULL," +
                "  GROUP_ID1          VARCHAR(50)   NULL," +
                "  GROUP_ID2          VARCHAR(50)   NULL," +
                "  GROUP_ID3          VARCHAR(50)   NULL," +
                "  THEME_TP           VARCHAR(20)   NULL," +
                "  MENU_TP            VARCHAR(1)    NULL," +
                "  BOTTOM_MSG_YN      VARCHAR(1)    NULL," +
                "  EXCEL_TP           VARCHAR(1)    NULL," +
                "  PWD_FAIL_COUNT     BIGINT        NULL," +
                // audit 9 — McmAuditEntity 정합
                "  C_USR_ID           VARCHAR(100)  NULL," +
                "  C_AT               DATETIME2     NULL," +
                "  C_SVC_ID           VARCHAR(100)  NULL," +
                "  C_PGM_ID           VARCHAR(100)  NULL," +
                "  U_USR_ID           VARCHAR(100)  NULL," +
                "  U_AT               DATETIME2     NULL," +
                "  U_SVC_ID           VARCHAR(100)  NULL," +
                "  U_PGM_ID           VARCHAR(100)  NULL," +
                "  VER                BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER PRIMARY KEY (USER_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER (owner / 본 21 + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} 을 W5 owner 로 upgrade.
     * W4 stub (USER_ID/ROLE_GROUP_ID 2 컬럼 + PK 2 복합) 이 존재하면 audit 9 ADD 만 (PK 변경 ✗ / 정책 #15).
     * 테이블 자체가 없으면 full DDL 신규.
     */
    private void upgradeTbMcmSecUserMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING")) {
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_MAPPING (" +
                    "  USER_ID       VARCHAR(100) NOT NULL," +
                    "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                    "  C_USR_ID      VARCHAR(100) NULL," +
                    "  C_AT          DATETIME2    NULL," +
                    "  C_SVC_ID      VARCHAR(100) NULL," +
                    "  C_PGM_ID      VARCHAR(100) NULL," +
                    "  U_USR_ID      VARCHAR(100) NULL," +
                    "  U_AT          DATETIME2    NULL," +
                    "  U_SVC_ID      VARCHAR(100) NULL," +
                    "  U_PGM_ID      VARCHAR(100) NULL," +
                    "  VER           BIGINT       NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_USER_MAPPING PRIMARY KEY (USER_ID, ROLE_GROUP_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (full owner / PK 2 + audit 9)");
            return;
        }
        // W4 stub 호환 — PK 동일 (변경 ✗) + audit 9 ADD (멱등 / 정책 #15)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (W4 stub → W5 owner / PK 2 보존 + audit 9 ADD)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_PWD} — 본 7 컬럼 + audit 9 (mergeCommonPwdInit / updateCommonSSOPwdInit). */
    private void createTbMcmSecUserPwdIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_PWD")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_PWD (" +
                "  USER_ID                  VARCHAR(30)  NOT NULL," +
                "  USER_ENC_PWD             VARCHAR(100) NULL," +
                "  SALT                     VARCHAR(100) NULL," +
                "  LAST_PWD_CHNG_DATE       DATETIME2    NULL," +
                "  USER_SSO_PWD             VARCHAR(100) NULL," +
                "  USER_ENC_TEMP_PWD        VARCHAR(100) NULL," +
                "  TEMP_PWD_EXPIRATION_DATE DATETIME2    NULL," +
                "  C_USR_ID                 VARCHAR(100) NULL," +
                "  C_AT                     DATETIME2    NULL," +
                "  C_SVC_ID                 VARCHAR(100) NULL," +
                "  C_PGM_ID                 VARCHAR(100) NULL," +
                "  U_USR_ID                 VARCHAR(100) NULL," +
                "  U_AT                     DATETIME2    NULL," +
                "  U_SVC_ID                 VARCHAR(100) NULL," +
                "  U_PGM_ID                 VARCHAR(100) NULL," +
                "  VER                      BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_PWD PRIMARY KEY (USER_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_PWD (owner / 본 7 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_HIS} — 본 7 + PK 2 복합 (USER_ID, ACTIVE_DT) + audit 9. 정책 #3 (C) 흡수. */
    private void createTbMcmSecUserHisIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_HIS")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_HIS (" +
                "  USER_ID     VARCHAR(30)  NOT NULL," +
                "  ACTIVE_DT   VARCHAR(8)   NOT NULL," +
                "  PROC_TYPE   VARCHAR(1)   NULL," +
                "  PROC_CASE   VARCHAR(1)   NULL," +
                "  USER_NM     VARCHAR(30)  NULL," +
                "  INF_REQ_NO  VARCHAR(100) NULL," +
                "  DESCRIPTION VARCHAR(300) NULL," +
                "  C_USR_ID    VARCHAR(100) NULL," +
                "  C_AT        DATETIME2    NULL," +
                "  C_SVC_ID    VARCHAR(100) NULL," +
                "  C_PGM_ID    VARCHAR(100) NULL," +
                "  U_USR_ID    VARCHAR(100) NULL," +
                "  U_AT        DATETIME2    NULL," +
                "  U_SVC_ID    VARCHAR(100) NULL," +
                "  U_PGM_ID    VARCHAR(100) NULL," +
                "  VER         BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_HIS PRIMARY KEY (USER_ID, ACTIVE_DT)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_HIS (owner / 본 7 + PK 2 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS} — 본 8 + PK 5 복합 + audit 9. 정책 #3 (C) 흡수. */
    private void createTbMcmSecUserRollHisIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_ROLL_HIS")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS (" +
                "  OP_SUMUP_DT   VARCHAR(8)   NOT NULL," +
                "  WORKS_CODE    VARCHAR(1)   NOT NULL," +
                "  USER_ID       VARCHAR(30)  NOT NULL," +
                "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                "  RESP_GBN      VARCHAR(1)   NOT NULL," +
                "  ROLE_GROUP_NM VARCHAR(100) NULL," +
                "  INF_REQ_NO    VARCHAR(100) NULL," +
                "  DESCRIPTION   VARCHAR(300) NULL," +
                "  C_USR_ID      VARCHAR(100) NULL," +
                "  C_AT          DATETIME2    NULL," +
                "  C_SVC_ID      VARCHAR(100) NULL," +
                "  C_PGM_ID      VARCHAR(100) NULL," +
                "  U_USR_ID      VARCHAR(100) NULL," +
                "  U_AT          DATETIME2    NULL," +
                "  U_SVC_ID      VARCHAR(100) NULL," +
                "  U_PGM_ID      VARCHAR(100) NULL," +
                "  VER           BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_ROLL_HIS PRIMARY KEY " +
                "    (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS (owner / 본 8 + PK 5 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_DEPT_INFO} — 본 7 + audit 9. 정책 #2 / Q-002 — EAI 폐기 + DMES 자체 부서 마스터 신설. */
    private void createTbMcmDeptInfoIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_DEPT_INFO")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_DEPT_INFO (" +
                "  DEPT_CD           VARCHAR(10)  NOT NULL," +
                "  DEPT_NM           VARCHAR(100) NULL," +
                "  DEPT_NM_EN        VARCHAR(100) NULL," +
                "  UPPER_DEPT_CD     VARCHAR(10)  NULL," +
                "  USE_TP            VARCHAR(1)   NULL," +
                "  START_ACTIVE_DATE DATETIME2    NULL," +
                "  END_ACTIVE_DATE   DATETIME2    NULL," +
                "  C_USR_ID          VARCHAR(100) NULL," +
                "  C_AT              DATETIME2    NULL," +
                "  C_SVC_ID          VARCHAR(100) NULL," +
                "  C_PGM_ID          VARCHAR(100) NULL," +
                "  U_USR_ID          VARCHAR(100) NULL," +
                "  U_AT              DATETIME2    NULL," +
                "  U_SVC_ID          VARCHAR(100) NULL," +
                "  U_PGM_ID          VARCHAR(100) NULL," +
                "  VER               BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_DEPT_INFO PRIMARY KEY (DEPT_CD)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_DEPT_INFO (owner / 본 7 + audit 9)");
    }

    /** MSSQL {@code sys.columns} 로 schema + table + column 존재 여부 확인. */
    private boolean columnExists(String schema, String table, String column) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.columns "
                + "WHERE object_id = OBJECT_ID(:fqn) AND name = :col")
                .setParameter("fqn", schema + "." + table)
                .setParameter("col", column)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /** MSSQL — PK 제약이 있으면 DROP (멱등). 이름 기반 매칭. */
    private void dropPkIfExists(String schema, String table, String pkName) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects "
                + "WHERE name = :pk AND type = 'PK' "
                + "  AND parent_object_id = OBJECT_ID(:fqn)")
                .setParameter("pk", pkName)
                .setParameter("fqn", schema + "." + table)
                .getSingleResult();
        if (cnt == null || cnt.intValue() == 0) return;
        nq(
                "ALTER TABLE " + schema + "." + table + " DROP CONSTRAINT " + pkName)
                .executeUpdate();
        log.info("[DataInitializer] DROP CONSTRAINT: {}.{}.{}", schema, table, pkName);
    }

    // ────────────────────────────────────────────────────────────────
    // W6 commPermMng — schema artifacts (owner 1 테이블 / W3 stub → full owner)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commPermMng schema artifacts — 멱등 적재 (2026-06-01 worker W6).
     *
     * <p>본 화면 owner 1 테이블:
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_PERM} — entity {@link com.dongkuk.dmes.mcm.entity.SecPerm} 정합.
     *       <ul>
     *         <li>W3 stub (PERMISSION_ID(PK) + PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM /
     *             POPUP_BTN / USE_TP — 6 컬럼 + PK 1) 이 존재 → PK 그대로 보존 (W6 entity PK 와 동일).
     *             누락 본 4 컬럼 (PERMISSION_DESC / PERMISSION_ACTION / START_ACTIVE_DATE / END_ACTIVE_DATE)
     *             + BIZ_SYSTEM_CODE (legacy 보존 — cross-cutting 정책 #1 entity 미반영 / DDL 잔존) + audit 9 컬럼
     *             ALTER ADD (멱등).</li>
     *         <li>W3 stub 미존재 시 → full DDL 신규 생성 (본 10 + BIZ_SYSTEM_CODE legacy + audit 9 = 20 컬럼).</li>
     *       </ul></li>
     * </ul>
     *
     * <p>본 화면이 사용하지만 다른 화면이 owner 인 테이블 (재생성 ✗, 기존 owner DDL 재사용):
     * <ul>
     *   <li>{@code TB_MCM_SEC_ROLE_MAPPING} (W3 owner) — read-only EXISTS 검증
     *       (deleteCommPermMng NOT EXISTS xml:91~95 + selectCommPermMng scalar subquery ROLE_ID xml:19~22)</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecPerm entity 로
     * 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommPermMngArtifacts() {
        ensureSchemaMcmapuser();
        upgradeTbMcmSecPermToFullOwner();
        log.info("[DataInitializer] MCM csa commPermMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_PERM W3 stub → W6 full owner / PK 보존 + 본 4 + BIZ_SYSTEM_CODE legacy + audit 9 ADD)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_PERM} 를 W6 owner (본 10 컬럼 + BIZ_SYSTEM_CODE legacy + audit 9) 로 보장.
     * <p>W3 stub (PERMISSION_ID(PK) + 5 컬럼) 이 존재하면 PK 동일 (변경 ✗) — 누락 컬럼만 ALTER ADD.
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     *
     * <p>분석리포트 §9.3.1 (DMES SEC_PERM 시트 29 컬럼) 중 To-Be 채택 10 컬럼 + BIZ_SYSTEM_CODE legacy
     * (cross-cutting 정책 #1 — entity 미반영 / DDL 잔존) + audit 9. PERMISSION_GROUP 은 As-Is mui Mapper
     * 미사용 → DDL 미반영.
     */
    private void upgradeTbMcmSecPermToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_PERM")) {
            // 신규 생성 — full DDL (본 10 + BIZ_SYSTEM_CODE legacy + audit 9)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_PERM (" +
                    "  PERMISSION_ID     VARCHAR(100)  NOT NULL," +
                    "  PERMISSION_NM     VARCHAR(100)  NULL," +
                    "  PERMISSION_DESC   VARCHAR(300)  NULL," +
                    "  PERMISSION_COMMON VARCHAR(500)  NULL," +
                    "  PERMISSION_CUSTOM VARCHAR(500)  NULL," +
                    "  POPUP_BTN         VARCHAR(1000) NULL," +
                    "  PERMISSION_ACTION VARCHAR(2000) NULL," + // 2026-07-30 500→2000 확장 (entity SecPerm length=2000 정합 — 액션 토큰 포화 해소)
                    "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존
                    "  USE_TP            VARCHAR(1)    NULL," +
                    "  START_ACTIVE_DATE DATETIME2     NULL," +
                    "  END_ACTIVE_DATE   DATETIME2     NULL," +
                    // audit 9 — McmAuditEntity 정합 (W1~W5 동일)
                    "  C_USR_ID          VARCHAR(100)  NULL," +
                    "  C_AT              DATETIME2     NULL," +
                    "  C_SVC_ID          VARCHAR(100)  NULL," +
                    "  C_PGM_ID          VARCHAR(100)  NULL," +
                    "  U_USR_ID          VARCHAR(100)  NULL," +
                    "  U_AT              DATETIME2     NULL," +
                    "  U_SVC_ID          VARCHAR(100)  NULL," +
                    "  U_PGM_ID          VARCHAR(100)  NULL," +
                    "  VER               BIGINT        NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_PERM PRIMARY KEY (PERMISSION_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_PERM (full owner / 본 10 + BIZ_SYSTEM_CODE legacy + audit 9)");
            return;
        }
        // W3 stub 호환 — PK 동일 (변경 ✗) / 누락 본 4 컬럼 + BIZ_SYSTEM_CODE legacy + audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "PERMISSION_DESC",   "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "PERMISSION_ACTION", "VARCHAR(500)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "BIZ_SYSTEM_CODE",   "VARCHAR(10)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "START_ACTIVE_DATE", "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "END_ACTIVE_DATE",   "DATETIME2");
        // audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_USR_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_AT",     "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_SVC_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_PGM_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_USR_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_AT",     "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_SVC_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_PGM_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "VER",      "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_PERM (W3 stub → W6 owner / PK 보존 + 본 4 + BIZ_SYSTEM_CODE legacy + audit 9 ADD)");
    }

    // ────────────────────────────────────────────────────────────────
    // W7 commUserRoleCopy — schema artifacts (신규 owner 없음 — W4/W5 owner 재사용 가드)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commUserRoleCopy schema artifacts — 멱등 보장 (2026-06-01 worker W7).
     *
     * <p>본 화면은 자체 owner 테이블 ✗ — 모두 기존 W4/W5 owner 재사용 (정책 #11):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER}          — W5 owner (commUserMng) / read-only</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING}  — W5 owner / read + write (SecUserMapping save)</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP}     — W4 owner (commRoleGrpMng) / read-only scalar subquery</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS} — W5 owner / write (SecUserRollHis save / 정책 #6)</li>
     *   <li>{@code MCMAPUSER.TB_MCM_DEPT_INFO}         — W5 owner / read-only JOIN (정책 #2 Q-004)</li>
     * </ul>
     *
     * <p>W5 의 {@link #initMcmCsaCommUserMngArtifacts()} 가 run() 체인의 앞단에서 IF NOT EXISTS 멱등으로
     * 5 owner 테이블 모두 보장 → 본 메서드는 명시적 DDL ✗ + 진입 로그만 남긴다.
     *
     * <p>본 worker 가 W5 보다 먼저 호출되거나 W5 가 제거된 경우 (이론적 — 본 cycle 미발생) 본 메서드가
     * W5 보장을 우회 호출할 책임이 있다. 현 cycle 에서는 run() 순서 (W1 → W2 → W3 → W4 → W5 → W6 → W7)
     * 가 명시 보장되므로 skeleton 로그로 충분.
     */
    private void initMcmCsaCommUserRoleCopyArtifacts() {
        log.info("[DataInitializer] MCM csa commUserRoleCopy schema artifacts — 자체 owner ✗ "
               + "(W4 TB_MCM_SEC_ROLEGROUP + W5 TB_MCM_SEC_USER / TB_MCM_SEC_USER_MAPPING / "
               + "TB_MCM_SEC_USER_ROLL_HIS / TB_MCM_DEPT_INFO 재사용 — 정책 #11)");
    }

    // ────────────────────────────────────────────────────────────────
    // W8 commSyncMng — schema artifacts (MCM_BACKUP TARGET schema 빈 복제)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commSyncMng schema artifacts — 멱등 적재 (2026-06-01 worker W8).
     *
     * <p>본 화면은 자체 owner 테이블 ✗ — cma 4 화면 (masterCodeMng) entity 재사용
     * (com.dongkuk.dmes.mcm.entity.TbMcmCode{Master|Category|Detail} — 정책 #6 (A) / Q-007 해소).
     *
     * <p>적재 대상 (멱등 — schema 별 SELECT INTO ... WHERE 1=0 빈 구조 복제):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_MASTER / _CATEGORY / _DETAIL} — 이미 cma 의
     *       {@link #initMcmCmaSyncSchemaArtifacts()} 가 적재 (멱등 skip)</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_MASTER} — 본 worker 가 신규 적재 (MA2 분기 대상 schema)</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_CATEGORY} — 본 worker 가 신규 적재</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_DETAIL} — 미적재 (As-Is java:115 백업 제외 정책 — Q-001 해소)</li>
     * </ul>
     *
     * <p>MCM_BACKUP schema 가 없으면 신규 생성. MSSQL 은 SELECT INTO 가 PK / index / DEFAULT 를
     * 복제하지 않으므로 audit 컬럼만 따라가는 read-only 백업 구조. 동기화 운영상 read 만 필요.
     *
     * <p>To-Be 정책 (분석 §11.0 / Q-001~Q-010 해소 2026-05-31):
     * <ul>
     *   <li>Q-001 — 본 화면 책임 = MASTER 3 테이블만 (RULE/RULE_JUDGE/INTERFACE/FORMAT/OBJECT 후속 위임)</li>
     *   <li>Q-002 — Oracle DB Link 폐기 → 단일 MSSQL 단일 업무 DB</li>
     *   <li>Q-005 — LOC 분기 유일화 (PRD No-op)</li>
     *   <li>Q-008 — INSERT INTO ... SELECT * 직후 audit UPDATE</li>
     * </ul>
     */
    private void initMcmCsaCommSyncMngArtifacts() {
        ensureSchemaMcmBackup();
        // MA2 분기 대상 — MCM_BACKUP.TB_MCM_CODE_MASTER + _CATEGORY 빈 복제
        // (DETAIL 은 As-Is java:115 백업 제외 정책으로 미적재 — Q-001 해소)
        copyEmptyTableIfAbsent("MCM_BACKUP", "TB_MCM_CODE_MASTER",   "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCM_BACKUP", "TB_MCM_CODE_CATEGORY", "MCM_SOURCE");
        log.info("[DataInitializer] MCM csa commSyncMng schema artifacts 멱등 적재 완료 "
               + "(MCM_BACKUP.TB_MCM_CODE_MASTER + _CATEGORY 빈 복제 / DETAIL 백업 제외 — Q-001)");
    }

    /** {@code MCM_BACKUP} schema 가 없으면 생성 (MSSQL — ensureSchemaMcmapuser 동일 패턴). */
    private void ensureSchemaMcmBackup() {
        nq(
                "IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'MCM_BACKUP') "
                + "EXEC('CREATE SCHEMA MCM_BACKUP')")
                .executeUpdate();
    }

    /**
     * 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 시드 — 개발체크리스트 ITEM-BE-05.
     *
     * <p><b>local/local-ph/local-kp tier 한정</b>(WildFly dev/prod·실운영 제외) — 사용자 결정 2026-06-05:
     * MSSQL 검증용으로 직결 프로파일에도 허용(구 mssql/dev → 신 local-ph/local-kp, 2026-07-07 개편).
     * <b>idempotent</b> — sentinel PK 'USD' 존재 시 skip (재부팅 누적 방지).
     *
     * <p>6 row 로 고정 필터 2종(분석 §6.1 / 기능 BR-002·BR-003)을 교차 검증:
     * USD/USDFWD/EUR/JPY 활성 + USDOFF(USE_TP='N', BR-003) + USDHIST(OLD_RULE_ID=RULE_ID, BR-002).
     * audit(C_USR_ID 등)는 인증 컨텍스트 없는 시드라 McmAuditListener 가 null 로 둠(C_AT/VER 만 채움).
     */
    private void initRuleMasterSampleData() {
        if (ruleMasterRepository == null) {
            return;   // mcm-core repository 빈 미등록 환경 — skip
        }
        // 시드 허용 = local/local-ph/local-kp (bootRun 직결 개발·검증 tier). WildFly JNDI(dev/prod) 및 실운영 제외.
        // 프로파일 개편 (2026-07-07 JNDI 전환 설계): 구 mssql→local-ph, 구 dev(직결)→local-kp.
        //   신 dev 는 WildFly JNDI 프로파일이 되어 시드 대상에서 제외 (가짜 시드가 개발계 WAS 기동으로 주입되는 것 방지).
        // acceptsProfiles — 프로파일 미지정 bootRun 의 default(local) 폴백도 인식.
        boolean seedAllowed = environment.acceptsProfiles(Profiles.of("local", "local-ph", "local-kp"));
        if (!seedAllowed) {
            return;   // dev/prod 등 WAS·실운영 — 가짜 시드 미주입
        }
        List<String> active = List.of(environment.getActiveProfiles());   // 로그 표기용
        if (ruleMasterRepository.existsById("USD")) {
            return;   // 이미 시드됨 — idempotent
        }

        List<RuleMaster> samples = List.of(
                rule("USD", null, "USD 미국 달러 환율 적용기준", "수출입 USD 환산 기준", "재무팀", "E0001", "Y"),
                rule("USDFWD", null, "USD 선물환 적용기준", "선물환 USD 헤지 기준", "재무팀", "E0002", "Y"),
                rule("EUR", null, "유로 환율 적용기준 EUR", "유럽향 EUR 환산 기준", "재무팀", "E0003", "Y"),
                rule("JPY", null, "엔화 환율 적용기준 JPY", "일본향 JPY 환산 기준", "재무팀", "E0004", "Y"),
                // BR-003 검증 — USE_TP='N' (검색어 USD 매칭이어도 제외돼야 정상)
                rule("USDOFF", null, "USD 사용중지 기준", "폐기된 USD 기준(미사용)", "재무팀", "E0005", "N"),
                // BR-002 검증 — OLD_RULE_ID=RULE_ID 이력행 (검색어 USD 매칭이어도 제외돼야 정상)
                rule("USDHIST", "USDHIST", "USD 구 환율기준(이력)", "이전 버전 USD 기준", "재무팀", "E0006", "Y")
        );
        ruleMasterRepository.saveAll(samples);
        log.info("[DataInitializer] 업무기준(TB_MCA_RULE_MASTER) 샘플 시드 완료 — {} row ({} profile·BR-002/003 검증용)",
                samples.size(), active);
    }

    /** RuleMaster 샘플 행 빌더 — RULE_TP='A'·RULE_VER=1 고정(As-Is rowAdd 기본값 xfdl:229·231). */
    private static RuleMaster rule(String ruleId, String oldRuleId, String ruleNm, String ruleDesc,
                                   String ownerDeptNm, String ownerEmpNo, String useTp) {
        RuleMaster e = new RuleMaster();
        e.setRuleId(ruleId);
        e.setOldRuleId(oldRuleId);
        e.setRuleNm(ruleNm);
        e.setRuleDesc(ruleDesc);
        e.setRuleVer(BigDecimal.ONE);
        e.setRuleTp("A");
        e.setRuleOwnerDeptNm(ownerDeptNm);
        e.setRuleOwnerEmpNo(ownerEmpNo);
        e.setUseTp(useTp);
        return e;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SQLite(개발자 Mac local 단독 부팅) 호환 레이어 — 2026-06-06
    //  · detectSqliteDialect       : 런타임 connection product name 으로 방언 1회 감지 (profile 비의존)
    //  · sanitize / nq             : 시드 native SQL 의 MSSQL 전용 토큰을 SQLite 로 흡수 (MSSQL 무영향)
    //  · createSecMenuFldForSqlite : entity 미보유 TB_MCM_SEC_MENU_FLD 보강 (그 외 SEC 테이블은 ddl-auto)
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
     * SQLite 일 때만 시드 native SQL 의 MSSQL 전용 토큰을 SQLite 호환으로 치환. MSSQL/dev/prod 는 원문 그대로 (no-op).
     * <ul>
     *   <li>{@code MCMAPUSER.} schema 접두 제거 — SQLite 는 schema 미지원(ddl-auto 도 schema 무시하고 단일 테이블 생성)</li>
     *   <li>{@code SYSDATETIME()} → {@code CURRENT_TIMESTAMP}</li>
     *   <li>{@code N'...'} 유니코드 리터럴 prefix 제거 — SQLite 는 N prefix 미지원.
     *       {@link McmAuditStatementInspector#stripUnicodeLiteralPrefix} 재사용(2026-08-07).
     *       구 정규식 {@code replaceAll("(?<![A-Za-z0-9_])N'", "'")} 은 <b>값 {@code 'N'} 자체를
     *       {@code ''} 로 바꿔버려</b> {@code SET USE_TP = 'N'} 시드가 빈 문자열을 적재했고,
     *       그 빈 값이 commMenuMng 조회·저장 전체를 죽이는 원인이 됐다.</li>
     * </ul>
     */
    private String sanitize(String sql) {
        if (!sqliteDialect) {
            return sql;
        }
        return McmAuditStatementInspector.stripUnicodeLiteralPrefix(
                sql.replace("MCMAPUSER.", "")
                   .replace("SYSDATETIME()", "CURRENT_TIMESTAMP"));
    }

    /** native query 생성 공통 진입점 — SQLite 면 sanitize 후 실행, MSSQL 은 원문(no-op). */
    private jakarta.persistence.Query nq(String sql) {
        return entityManager.createNativeQuery(sanitize(sql));
    }

    /**
     * SQLite(local 단독) 전용 — entity 미보유 {@code TB_MCM_SEC_MENU_FLD} 보강 생성.
     * <p>그 외 SEC/메뉴 테이블은 {@code @Entity} 가 있어 Hibernate ddl-auto=update 가 SQLite 에 자동 생성하지만,
     * 본 테이블만 entity 가 없어 MSSQL native DDL({@code createTbMcmSecMenuFldStubIfAbsent})에 의존한다. SQLite 에서는
     * 그 native DDL 이 skip 되므로 여기서 SQLite 호환 DDL 로 직접 생성한다(MSSQL owner DDL 과 동일 컬럼 집합 — stub 5 + upgrade 4).
     */
    private void createSecMenuFldForSqlite() {
        entityManager.createNativeQuery(
                "CREATE TABLE IF NOT EXISTS TB_MCM_SEC_MENU_FLD (" +
                "  MENU_ID         VARCHAR(30)  NOT NULL," +
                "  MENU_SEQ        VARCHAR(30)," +
                "  MENU_NM         VARCHAR(100)," +
                "  PARENT_MENU_ID  VARCHAR(30)," +
                "  BIZ_SYSTEM_CODE VARCHAR(10)," +
                "  FULL_SEQ        NUMERIC(10,0)," +
                "  USE_TP          VARCHAR(1)," +
                "  MENU_TP         VARCHAR(20)," +
                "  MENU_VIEW_YN    VARCHAR(1)," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU_FLD PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] SQLite — TB_MCM_SEC_MENU_FLD 보강 생성 (entity 미보유 테이블)");
    }
}
