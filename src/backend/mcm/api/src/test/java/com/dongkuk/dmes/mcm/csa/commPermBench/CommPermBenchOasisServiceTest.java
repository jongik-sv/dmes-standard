/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 11 action 끝에서 끝 시험 — OASIS 실제 경로(BPMN → commPermBenchService) + Oracle 시험 PDB(네이티브 SQL 실행 포함)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.GridResult;
import com.dongkuk.dmes.mcm.adapter.McmBusinessErrorTranslator;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.init.seed.McmMenuSeeder;
import com.dongkuk.dmes.mcm.init.seed.SeedSupport;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.repository.SecPermHisDtlRepository;
import com.dongkuk.dmes.mcm.repository.SecPermHisRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * commPermBench(권한 작업대) 11 action 을 OASIS 실제 경로로 부르는 끝에서 끝 시험.
 *
 * <p>조립은 {@code MenuCatalogOasisSaveIntegrationTest} 와 같다: {@link OasisAutoConfiguration#serviceStarter}(transactional +
 * multi-tx, 기본 매니저 {@code txBiz} = JPA) → {@link OasisServiceExecutor} → 실제 {@code services/csa/commPermBench/commPermBench.bpmn}
 * → {@code commPermBenchService}. 응답 변환기에는 운영처럼 {@link McmBusinessErrorTranslator} 를 넣어 mcm-core 업무 예외가
 * {@code meta.success=false}·{@code meta.message="CODE: 상세"} 로 나가는지 본다.
 * 빈은 운영 그대로 컴포넌트 스캔한다 — {@code csa.commPermBench}(서비스·저장소) + {@code csa.commPerm}(SysadminGuard)
 * + {@code security.perm}(V2 로더·계산기·설명 서비스).
 *
 * <p>DB 는 Oracle 시험 PDB(Flyway 기준선 + V20·V21). 이 시험이 CommPermBenchQueryRepository·PermScopeRowRepository·
 * PermHistoryRepository·PermApplyRepository·PermDraftRowLockRepository·PermImpactNameRepository 의 네이티브 SQL 을 실제로 돌린다.
 * 권한 작업대 OBJECT·메뉴는 c4 시더({@link McmMenuSeeder#seedPermBenchMenu()})로 넣는다.
 *
 * <p>응답 모양: grid 하나인 action = {@code grids.<grid>.rows}, grid 여럿인 action = {@code data.result.<grid>}.
 *
 * <p>시험 자료: admin(SYSADMIN, 그룹 G_ADMIN) · u1(사용 중, 그룹 G_VIEW) · u_off(사용 안 함, 그룹 G_VIEW).
 * G_VIEW → R_VIEW. R_VIEW 퍼미션 = commPermBench(searchBench,explain) · objA(search). 메뉴 = 공통관리(mcm) › 시스템관리(csa) ›
 * 권한 작업대(commPermBench) · 화면A(objA).
 */
@Execution(ExecutionMode.SAME_THREAD)
class CommPermBenchOasisServiceTest {

    private static final String SVC = "commPermBench";

    private static AnnotationConfigApplicationContext ctx;
    private static OasisServiceExecutor executor;
    private static TransactionTemplate tx;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void startContext() {
        McmOraTestDb.resetSchemas();
        ctx = new AnnotationConfigApplicationContext(Config.class);
        executor = new OasisServiceExecutor(starter(), ctx, new CactusRequestConverter(),
                new CactusResponseConverter(List.of(new McmBusinessErrorTranslator())));
        tx = new TransactionTemplate(ctx.getBean("transactionManager", PlatformTransactionManager.class));
        jdbc = new JdbcTemplate(ctx.getBean(DataSource.class));
    }

    @AfterAll
    static void stopContext() {
        if (ctx != null) {
            ctx.close();
        }
    }

    @BeforeEach
    void seed() {
        TestIdentity.user = "admin";
        for (String t : List.of("TB_MCM_SEC_PERM_HIS_DTL", "TB_MCM_SEC_PERM_HIS", "TB_MCM_SEC_PERM_DRAFT",
                "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_USER_MAPPING", "TB_MCM_SEC_ROLEGROUP_MAPPING",
                "TB_MCM_SEC_MENU", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_OBJ", "TB_MCM_SEC_ROLE", "TB_MCM_SEC_ROLEGROUP",
                "TB_MCM_SEC_USER", "TB_MCM_DEPT_INFO")) {
            jdbc.update("DELETE FROM " + t);
        }
        jdbc.update("INSERT INTO TB_MCM_DEPT_INFO (DEPT_CD, DEPT_NM, USE_TP) VALUES ('D1', '생산팀', 'Y')");
        user("admin", "관리자", "Y");
        user("u1", "홍길동", "Y");
        user("u_off", "퇴사자", "N");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP) VALUES ('SYSADMIN', '시스템 관리자', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP) VALUES ('R_VIEW', '조회 역할', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES ('G_ADMIN', '관리 그룹', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES ('G_VIEW', '조회 그룹', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES ('G_ADMIN', 'SYSADMIN')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES ('G_VIEW', 'R_VIEW')");
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES ('admin', 'G_ADMIN')");
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES ('u1', 'G_VIEW')");
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES ('u_off', 'G_VIEW')");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN)"
                + " VALUES ('mcm', '1', '공통관리', NULL, 'Y', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN)"
                + " VALUES ('csa', '1', '시스템관리', 'mcm', 'Y', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, USE_TP, BTN_PERM, POPUP_PERM)"
                + " VALUES ('objA', '화면A', 'mcm', 'Y', 'search,save,excelDown', NULL)");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, MENU_TP, OBJECT_ID, USE_TP, MENU_VIEW_YN, PARENT_MENU_ID)"
                + " VALUES ('M_A', '002', '화면A', 'S', 'objA', 'Y', 'Y', 'csa')");
        // c4 시더 — 권한 작업대 OBJECT(BTN_PERM = 11 action) + 메뉴 leaf(csa/commPermBench) + 옛 SYSADMIN 매핑
        tx.executeWithoutResult(s -> new McmMenuSeeder(new SeedSupport(
                SharedEntityManagerCreator.createSharedEntityManager(ctx.getBean(EntityManagerFactory.class))))
                .seedPermBenchMenu());
        // 시더는 START_ACTIVE_DATE = SYSTIMESTAMP(DB 시계)이고 계산기는 JVM 시계로 판정한다 — DB 시계가 조금이라도 앞서면
        // 막 넣은 오브젝트가 「아직 시작 전」(OBJ_UNUSED)이 된다. 시험은 지난 날짜로 고정한다.
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET START_ACTIVE_DATE = TIMESTAMP '2026-01-01 00:00:00' WHERE OBJECT_ID = 'commPermBench'");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM) VALUES ('R_VIEW', 'commPermBench', 'searchBench,explain')");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM) VALUES ('R_VIEW', 'objA', 'search')");
    }

    // ── 1단계 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("searchBench — data.result 에 users·groups·roles·userGroups·groupRoles·me, 그룹으로 좁히기, SYSADMIN 이면 ME_SYSADMIN=Y")
    void searchBench() {
        CactusResponse res = ok(call("searchBench", Map.of(), Map.of()));
        Map<String, Object> result = result(res);
        assertThat(result.keySet()).containsExactly("users", "groups", "roles", "userGroups", "groupRoles", "me");
        assertThat(rows(result, "users")).extracting(r -> r.get("USER_ID")).containsExactly("admin", "u1", "u_off");
        assertThat(rows(result, "users").get(1)).containsEntry("USER_NM", "홍길동").containsEntry("DEPT_NM", "생산팀");
        assertThat(rowWith(rows(result, "groups"), "ROLE_GROUP_ID", "G_VIEW")).satisfies(x -> assertNum(x, "USER_CNT", 2));
        assertThat(rowWith(rows(result, "roles"), "ROLE_ID", "R_VIEW"))
                .satisfies(x -> assertNum(x, "GROUP_CNT", 1)).satisfies(x -> assertNum(x, "USER_CNT", 2)).satisfies(x -> assertNum(x, "PERM_CNT", 2));
        assertThat(rows(result, "groupRoles")).hasSize(2);
        assertThat(rows(result, "me")).containsExactly(Map.of("ME_SYSADMIN", "Y"));

        Map<String, Object> narrowed = result(ok(call("searchBench", Map.of("roleGroupId", "G_VIEW", "userQ", "홍"), Map.of())));
        assertThat(rows(narrowed, "users")).extracting(r -> r.get("USER_ID")).containsExactly("u1");
        assertThat(rows(narrowed, "userGroups")).containsExactly(Map.of("USER_ID", "u1", "ROLE_GROUP_ID", "G_VIEW"));

        TestIdentity.user = "u1";
        assertThat(rows(result(ok(call("searchBench", Map.of(), Map.of()))), "me")).containsExactly(Map.of("ME_SYSADMIN", "N"));
    }

    @Test
    @DisplayName("searchMenuTree — grids.menus.rows: 사람 기준·역할 기준 CUR, 사용 안 함 사용자 NO_ROLE, 끝 칸 OBJ_USE_TP")
    void searchMenuTree() {
        List<Map<String, Object>> byUser = grid(ok(call("searchMenuTree", Map.of("userId", "u1", "source", "CUR"), Map.of())), "menus");
        assertThat(byUser).extracting(r -> r.get("MENU_ID")).contains("mcm", "csa", "commPermBench", "M_A");
        assertThat(rowWith(byUser, "MENU_ID", "commPermBench")).containsEntry("VISIBLE", "Y").containsEntry("REASON", null)
                .containsEntry("OBJ_USE_TP", "Y");
        assertThat(rowWith(byUser, "MENU_ID", "csa")).containsEntry("VISIBLE", "Y").containsEntry("OBJ_USE_TP", null);
        assertThat(new ArrayList<>(byUser.get(0).keySet())).containsExactly(
                "MENU_ID", "PARENT_MENU_ID", "MENU_NM", "OBJECT_ID", "SORT_SEQ", "SHOW_TP", "USE_TP", "VISIBLE", "REASON", "OBJ_USE_TP");

        List<Map<String, Object>> byRole = grid(ok(call("searchMenuTree", Map.of("roleId", "R_VIEW"), Map.of())), "menus");
        assertThat(rowWith(byRole, "MENU_ID", "M_A")).containsEntry("VISIBLE", "Y");

        List<Map<String, Object>> off = grid(ok(call("searchMenuTree", Map.of("userId", "u_off"), Map.of())), "menus");
        assertThat(off).allSatisfy(r -> assertThat(r).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_ROLE"));
    }

    @Test
    @DisplayName("searchMenuTree·searchRolePerm·explain DRAFT — 저장된 초안(ROLE_OBJ DEL)이 겹친다, CUR 은 그대로")
    void draftSource() {
        ok(call("saveDraft", Map.of(), Map.of("changes", List.of(change("ROLE_OBJ", "R_VIEW", "objA", "DEL", null)))));

        List<Map<String, Object>> cur = grid(ok(call("searchMenuTree", Map.of("userId", "u1", "source", "CUR"), Map.of())), "menus");
        List<Map<String, Object>> draft = grid(ok(call("searchMenuTree", Map.of("userId", "u1", "source", "DRAFT"), Map.of())), "menus");
        assertThat(rowWith(cur, "MENU_ID", "M_A")).containsEntry("VISIBLE", "Y");
        assertThat(rowWith(draft, "MENU_ID", "M_A")).containsEntry("VISIBLE", "N").containsEntry("REASON", "NO_PERM");

        List<Map<String, Object>> roleDraft = grid(ok(call("searchMenuTree", Map.of("roleId", "R_VIEW", "source", "DRAFT"), Map.of())), "menus");
        assertThat(rowWith(roleDraft, "MENU_ID", "M_A")).containsEntry("VISIBLE", "N");

        List<Map<String, Object>> perms = grid(ok(call("searchRolePerm",
                Map.of("roleId", "R_VIEW", "menuFolderId", "csa", "source", "DRAFT"), Map.of())), "perms");
        assertThat(rowWith(perms, "OBJECT_ID", "objA")).containsEntry("BTN_PERM", null);

        Map<String, Object> ex = result(ok(call("explain", Map.of("userId", "u1", "objectId", "objA", "source", "DRAFT"), Map.of())));
        assertThat(rows(ex, "buttons")).allSatisfy(b -> assertThat(b).containsEntry("GRANTED", "N"));
        assertThat(rows(ex, "paths")).isEmpty();
    }

    @Test
    @DisplayName("explain — data.result.buttons·paths: 켠 버튼 PERM·잠긴 버튼 NO_PERM, 길 G_VIEW→R_VIEW, 빠진 objectId 는 PERM_REQUIRED")
    void explain() {
        Map<String, Object> result = result(ok(call("explain", Map.of("userId", "u1", "objectId", "commPermBench"), Map.of())));
        List<Map<String, Object>> buttons = rows(result, "buttons");
        assertThat(rowWith(buttons, "CODE", "searchBench")).containsEntry("KIND", "BTN").containsEntry("ALLOWED", "Y")
                .containsEntry("GRANTED", "Y").containsEntry("REASON", "PERM").containsEntry("ROLES", "R_VIEW").containsEntry("GROUPS", "G_VIEW");
        assertThat(rowWith(buttons, "CODE", "apply")).containsEntry("GRANTED", "N").containsEntry("REASON", "NO_PERM");
        assertThat(rows(result, "paths")).singleElement().satisfies(p -> assertThat(p)
                .containsEntry("ROLE_GROUP_ID", "G_VIEW").containsEntry("ROLE_ID", "R_VIEW")
                .containsEntry("BTN_PERM", "searchBench,explain").containsEntry("POPUP_PERM", null));

        CactusResponse bad = call("explain", Map.of("userId", "u1"), Map.of());
        assertError(bad, "PERM_REQUIRED:");
    }

    @Test
    @DisplayName("searchRolePerm — grids.perms.rows: 폴더 아래 오브젝트 전부, MENU_PATH, OBJ_READ_PERM(readPreset), 없는 역할 PERM_BAD_VALUE")
    void searchRolePerm() {
        List<Map<String, Object>> perms = grid(ok(call("searchRolePerm", Map.of("roleId", "R_VIEW", "menuFolderId", "csa"), Map.of())), "perms");
        assertThat(perms).extracting(r -> r.get("OBJECT_ID")).containsExactlyInAnyOrder("commPermBench", "objA");
        Map<String, Object> bench = rowWith(perms, "OBJECT_ID", "commPermBench");
        assertThat(bench).containsEntry("OBJECT_NM", "권한 작업대").containsEntry("MENU_PATH", "공통관리 › 시스템관리 › 권한 작업대")
                .containsEntry("BTN_PERM", "searchBench,explain");
        assertThat(String.valueOf(bench.get("OBJ_BTN_PERM")).split(",")).hasSize(11).contains("apply", "searchHistoryDtl");
        assertThat(String.valueOf(bench.get("OBJ_READ_PERM")).split(","))
                .containsExactlyInAnyOrder("explain", "searchBench", "searchHistory", "searchHistoryDtl", "searchMenuTree", "searchRolePerm");
        assertThat(rowWith(perms, "OBJECT_ID", "objA")).containsEntry("BTN_PERM", "search").containsEntry("OBJ_READ_PERM", "search");

        assertError(call("searchRolePerm", Map.of("roleId", "R_NONE"), Map.of()), "PERM_BAD_VALUE:");
    }

    // ── 2단계 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("loadDraft·saveDraft(grids.changes.rows)·discardDraft — grids.draft.rows 한 줄, 오브젝트 밖 값은 PERM_NOT_IN_OBJ")
    void draftLifecycle() {
        assertThat(grid(ok(call("loadDraft", Map.of(), Map.of())), "draft").get(0)).satisfies(x -> assertNum(x, "CHANGE_CNT", 0));

        List<Map<String, Object>> saved = grid(ok(call("saveDraft", Map.of(),
                Map.of("changes", List.of(change("ROLE_OBJ", "R_VIEW", "objA", "UPD", "search,save"))))), "draft");
        assertThat(saved).singleElement().satisfies(r -> assertThat(r).satisfies(x -> assertNum(x, "CHANGE_CNT", 1)));
        assertThat(String.valueOf(saved.get(0).get("CHANGES_JSON"))).contains("ROLE_OBJ", "search,save");
        assertThat(grid(ok(call("loadDraft", Map.of(), Map.of())), "draft").get(0)).satisfies(x -> assertNum(x, "CHANGE_CNT", 1));

        assertError(call("saveDraft", Map.of(), Map.of("changes", List.of(change("ROLE_OBJ", "R_VIEW", "objA", "UPD", "delete")))),
                "PERM_NOT_IN_OBJ:");

        ok(call("discardDraft", Map.of(), Map.of()));
        assertThat(grid(ok(call("loadDraft", Map.of(), Map.of())), "draft").get(0)).satisfies(x -> assertNum(x, "CHANGE_CNT", 0));
    }

    @Test
    @DisplayName("impact — data.result.summary·impacts: 그룹에서 u1 을 빼면 잃는 사람 1(사용 안 함 u_off 는 영향 없음)")
    void impact() {
        ok(call("saveDraft", Map.of(), Map.of("changes", List.of(change("USER_GRP", "u1", "G_VIEW", "DEL", null)))));
        Map<String, Object> result = result(ok(call("impact", Map.of(), Map.of())));
        assertThat(rows(result, "summary")).singleElement().satisfies(r -> assertThat(r)
                .satisfies(x -> assertNum(x, "LOSE_USER_CNT", 1)).satisfies(x -> assertNum(x, "GAIN_USER_CNT", 0)));
        assertThat(rows(result, "impacts")).isNotEmpty().allSatisfy(r -> assertThat(r).containsEntry("USER_ID", "u1"));
    }

    @Test
    @DisplayName("apply — 잃는 사람이 있으면 PERM_NEED_CONFIRM, confirmLoss=Y 면 grids.result.rows 와 DB 반영·초안 삭제, 이력 searchHistory·searchHistoryDtl")
    void applyAndHistory() {
        ok(call("saveDraft", Map.of(), Map.of("changes", List.of(change("USER_GRP", "u1", "G_VIEW", "DEL", null)))));

        assertError(call("apply", Map.of("confirmLoss", "N"), Map.of()), "PERM_NEED_CONFIRM: 1");
        assertThat(count("TB_MCM_SEC_USER_MAPPING WHERE USER_ID = 'u1'")).as("거절이면 쓰지 않는다").isEqualTo(1);

        List<Map<String, Object>> result = grid(ok(call("apply", Map.of("confirmLoss", "Y", "memo", "u1 조회 회수"), Map.of())), "result");
        assertThat(result).singleElement().satisfies(r -> assertThat(r).satisfies(x -> assertNum(x, "CHANGE_CNT", 1)));
        String applyId = String.valueOf(result.get(0).get("APPLY_ID"));
        assertThat(count("TB_MCM_SEC_USER_MAPPING WHERE USER_ID = 'u1'")).isZero();
        assertThat(count("TB_MCM_SEC_PERM_DRAFT")).as("적용하면 초안을 비운다").isZero();

        List<Map<String, Object>> his = grid(ok(call("searchHistory", Map.of("applyUserId", "admin"), Map.of())), "his");
        assertThat(rowWith(his, "APPLY_ID", applyId)).containsEntry("APPLY_USER_ID", "admin").satisfies(x -> assertNum(x, "CHANGE_CNT", 1))
                .satisfies(x -> assertNum(x, "LOSE_USER_CNT", 1)).containsEntry("APPLY_MEMO", "u1 조회 회수");

        List<Map<String, Object>> dtl = grid(ok(call("searchHistoryDtl", Map.of("applyId", applyId), Map.of())), "dtl");
        assertThat(dtl).singleElement().satisfies(r -> assertThat(r).satisfies(x -> assertNum(x, "SEQ_NO", 1)).containsEntry("TARGET_TP", "USER_GRP")
                .containsEntry("KEY1", "u1").containsEntry("KEY2", "G_VIEW").containsEntry("OP_TP", "DEL"));

        assertError(call("apply", Map.of(), Map.of()), "VALIDATION_ERROR:");
    }

    @Test
    @DisplayName("apply — 초안 저장 뒤 같은 범위(역할 R_VIEW 퍼미션)를 다른 경로가 바꾸면 PERM_CONFLICT, 아무것도 쓰지 않는다")
    void applyConflict() {
        ok(call("saveDraft", Map.of(), Map.of("changes", List.of(change("ROLE_OBJ", "R_VIEW", "objA", "UPD", "search,save")))));
        jdbc.update("UPDATE TB_MCM_SEC_ROLE_PERM SET BTN_PERM = 'search,excelDown' WHERE ROLE_ID = 'R_VIEW' AND OBJECT_ID = 'objA'");

        CactusResponse res = call("apply", Map.of("confirmLoss", "Y"), Map.of());
        assertError(res, "PERM_CONFLICT:");
        assertThat(res.getMeta().message()).contains("role:R_VIEW");
        assertThat(jdbc.queryForObject("SELECT BTN_PERM FROM TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'R_VIEW' AND OBJECT_ID = 'objA'",
                String.class)).isEqualTo("search,excelDown");
        assertThat(count("TB_MCM_SEC_PERM_HIS")).isZero();
    }

    // ── 도우미 ─────────────────────────────────────────────────────────

    private static CactusResponse call(String action, Map<String, Object> params, Map<String, List<Map<String, Object>>> grids) {
        Map<String, GridData> g = new LinkedHashMap<>();
        grids.forEach((k, v) -> g.put(k, new GridData(new ArrayList<>(v))));
        return executor.execute(SVC, action, new CactusRequest(new RequestMeta(TestIdentity.user, "commPermBench"),
                new HashMap<>(params), g));
    }

    private static CactusResponse ok(CactusResponse res) {
        assertThat(res.getMeta().success()).as("응답 %s %s", res.getMeta().code(), res.getMeta().message()).isTrue();
        return res;
    }

    private static void assertError(CactusResponse res, String messagePrefix) {
        assertThat(res.getMeta().success()).as("실패해야 한다: %s", res.getMeta().message()).isFalse();
        assertThat(res.getMeta().message()).startsWith(messagePrefix);
    }

    /** grid 하나인 action — {@code grids.<grid>.rows}. */
    private static List<Map<String, Object>> grid(CactusResponse res, String name) {
        GridResult g = res.getGrids() == null ? null : res.getGrids().get(name);
        assertThat(g).as("grids.%s (grids=%s data=%s)", name, res.getGrids(), res.getData()).isNotNull();
        return g.getRows();
    }

    /** grid 여럿인 action — {@code data.result}. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> result(CactusResponse res) {
        Object r = res.getData() == null ? null : res.getData().get("result");
        assertThat(r).as("data.result (data=%s grids=%s)", res.getData(), res.getGrids()).isInstanceOf(Map.class);
        return (Map<String, Object>) r;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> result, String grid) {
        return (List<Map<String, Object>>) result.get(grid);
    }

    /** 숫자 칸은 출처(엔티티·네이티브 SQL)에 따라 Integer·Long·BigDecimal — 값으로 비교한다. */
    private static void assertNum(Map<String, Object> row, String key, long expected) {
        assertThat(row.get(key)).as("%s (%s)", key, row).isInstanceOf(Number.class);
        assertThat(((Number) row.get(key)).longValue()).as("%s (%s)", key, row).isEqualTo(expected);
    }

    private static Map<String, Object> rowWith(List<Map<String, Object>> rows, String key, String value) {
        return rows.stream().filter(r -> value.equals(r.get(key))).findFirst()
                .orElseThrow(() -> new AssertionError(key + "=" + value + " 행이 없다: " + rows));
    }

    private static Map<String, Object> change(String tp, String key1, String key2, String op, String btn) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("TP", tp);
        m.put("KEY1", key1);
        m.put("KEY2", key2);
        m.put("OP", op);
        m.put("BTN_PERM", btn);
        m.put("POPUP_PERM", null);
        return m;
    }

    private static void user(String id, String nm, String useTp) {
        jdbc.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES (?, ?, 'D1', ?)", id, nm, useTp);
    }

    private static int count(String fromWhere) {
        Integer n = jdbc.queryForObject("SELECT COUNT(1) FROM " + fromWhere, Integer.class);
        return n == null ? 0 : n;
    }

    /** 운영과 같은 조립 — {@link OasisAutoConfiguration#serviceStarter} 의 transactional + multi-tx 분기. */
    private static com.dongkuk.oasis.service.ServiceStarter starter() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties txProps = new CactusTxProperties();
        txProps.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        txProps.setDefaultManager("txBiz");
        return new OasisAutoConfiguration().serviceStarter(props, txProps, ctx);
    }

    /** 로그인 사용자 — 시험이 바꾼다. */
    static final class TestIdentity implements SecurityIdentity {
        static volatile String user = "admin";

        @Override public String currentUserId() { return user; }
        @Override public boolean hasAuthority(String authority) { return false; }
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = SecPermDraftRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecPermDraftRepository.class, SecPermHisRepository.class, SecPermHisDtlRepository.class,
                    SecRolePermRepository.class, SecUserMappingRepository.class, SecRoleGroupMappingRepository.class,
                    SecObjRepository.class, SecUserRepository.class, SecRoleGroupRepository.class, SecRoleRepository.class}),
            transactionManagerRef = "transactionManager")
    @ComponentScan(
            basePackages = {"com.dongkuk.dmes.mcm.csa.commPermBench", "com.dongkuk.dmes.mcm.csa.commPerm",
                    "com.dongkuk.dmes.mcm.security.perm"},
            excludeFilters = @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class))
    static class Config {

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("comm-perm-bench-oasis");
        }

        /** 운영 JpaConfig 와 같은 Hibernate 설정, 엔티티는 mcm entity 패키지 전부(저장소 JPQL 검증용). 단위 이름 default. */
        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(McmOraTestDb.jpaProperties(Map.of()));
            em.setPersistenceUnitName("default");
            em.setPackagesToScan("com.dongkuk.dmes.mcm.entity");
            em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
            return em;
        }

        /** OASIS 기본 매니저 txBiz = 운영의 primary JPA 매니저 별칭. */
        @Bean(name = {"transactionManager", "txBiz"})
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        SecurityIdentity securityIdentity() {
            return new TestIdentity();
        }
    }
}
