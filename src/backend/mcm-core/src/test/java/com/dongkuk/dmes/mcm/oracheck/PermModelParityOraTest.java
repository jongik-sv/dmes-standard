package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.security.perm.load.LegacyPermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.load.V2PermGraphLoader;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-core c3 — 옛 모델(legacy 로더)과 새 모델(V21 로 옮긴 행 + v2 로더)의 런타임 키 대조.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 같은 옛 픽스처를 옛 표에 넣고, V21 의 MERGE 두 문장을 <b>파일 그대로</b> 돌려 새 표를 만든다. 두 로더의 loadAll 그래프에
 * 같은 {@link DefaultPermResolver}(고정 시각)를 돌려 사람마다 키 {@code lower(SYSTEM_CODE ?: mcm)/lower(OBJECT_ID)/action}(D26)을 비교한다.
 * 다른 키는 아래 규칙으로 「의도된 차이」 분류를 붙여 {@code build/perm-parity/diff.txt} 에 적고, 분류가 안 되는 차이가 있으면 실패한다.
 *
 * <p>분류 규칙(옛 쪽에만 있는 키 = 그 키를 옛 계산에서 준 경로 사람→그룹→역할 하나하나에 이유를 붙인다. 모든 경로에 이유가 있어야 분류된다):
 * <ul>
 *   <li>OBJ_UNUSED — 오브젝트 USE_TP≠Y (D35). VALIDITY — 오브젝트·그룹·역할이 유효 기간 밖 (D35)</li>
 *   <li>GROUP_UNUSED — 그룹 USE_TP≠Y (D35). ROLE_UNUSED — 역할 USE_TP≠Y (D35)</li>
 *   <li>ORPHAN_ROLE — 그룹에 매달렸지만 TB_MCM_SEC_ROLE 에 없는 역할의 옛 줄. V21 이 건너뛴다 (D19)</li>
 *   <li>SYSADMIN_PATH — SYSADMIN 경로이고 action 이 옛 허용 값(옛 줄 전체 토큰)에는 있고 새 허용 값(PERM_ALL 아닌 토큰 ∪ 카탈로그)에는 없다 (D12·D13).
 *       새 쪽에만 있는 키도 SYSADMIN 경로이고 action 이 새 허용 값에만 있을 때 이것이다</li>
 *   <li>PERM_ALL_INTERSECTION — 그 역할·오브젝트의 PERM_ALL 묶음에서만 온 action 이고 V21 카탈로그(같은 종류 BTN/POPUP)에 없다 (D12)</li>
 *   <li>EMPTY_BTN — V21 이 행을 건너뜀: D12 를 거친 BTN 토큰이 하나도 없다(팝업만 있는 묶음 등, D14)</li>
 * </ul>
 * INACTIVE_USER — 두 로더 모두 TB_MCM_SEC_USER 를 읽지 않는다. 사람의 사용 여부는 키 차이를 만들 수 없으므로 「같음」을 따로 확인한다.
 */
@SpringJUnitConfig(PermModelParityOraTest.Config.class)
class PermModelParityOraTest {

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() { return McmCoreOraTestDb.appDataSource("perm-parity"); }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            return McmCoreOraTestDb.entityManagerFactory(ds, "com.dongkuk.dmes.mcm.entity");
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory emf) { return new JpaTransactionManager(emf); }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean V2PermGraphLoader v2PermGraphLoader() { return new V2PermGraphLoader(); }
        @Bean LegacyPermGraphLoader legacyPermGraphLoader() { return new LegacyPermGraphLoader(); }
    }

    @Autowired V2PermGraphLoader v2Loader;
    @Autowired LegacyPermGraphLoader legacyLoader;
    @Autowired JdbcTemplate jdbc;

    static final String V21 = "db/migration/oracle/mcmapuser/V21__perm_model_backfill.sql";
    static final Path DIFF_FILE = Path.of("build", "perm-parity", "diff.txt");
    static final Path EDGE_FILE = Path.of("build", "perm-parity", "diff-edge.txt");
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 27, 12, 0);
    static final Set<String> SYSADMIN_IDS = Set.of("SYSADMIN", "ROLE_SYSADMIN");   // PermEvaluator.SYSADMIN_ROLE_IDS 와 같다
    static final String PERM_ALL = "PERM_ALL";

    private static final List<String> TABLES = List.of(
            "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_PERM", "TB_MCM_SEC_USER_MAPPING",
            "TB_MCM_SEC_ROLEGROUP_MAPPING", "TB_MCM_SEC_ROLEGROUP", "TB_MCM_SEC_ROLE",
            "TB_MCM_SEC_MENU", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_OBJ");
    private static final String USERS = "'u_normal', 'u_plain', 'u_sys', 'u_misc', 'u_ghost', 'u_inactive', 'u_edge'";

    enum Cat { OBJ_UNUSED, VALIDITY, GROUP_UNUSED, ROLE_UNUSED, ORPHAN_ROLE, SYSADMIN_PATH, PERM_ALL_INTERSECTION, EMPTY_BTN }

    @BeforeEach
    @AfterEach
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM MCMAPUSER." + t);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID IN (" + USERS + ")");
    }

    // ── 픽스처 ─────────────────────────────────────────────────────────

    private static Timestamp ts(int y, int m, int d, int h) {
        return Timestamp.valueOf(LocalDateTime.of(y, m, d, h, 0));
    }

    /** BTN_PERM·POPUP_PERM 은 비워 둔다 — V21 둘째 문장이 채운다. */
    private void obj(String id, String sys, String useTp, Timestamp start, Timestamp end) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, SERVICE, FORM_URL, PARAM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) "
                + "VALUES (?, ?, ?, 'svc', '/u', 'p', ?, ?, ?)", id, id, sys, useTp, start, end);
    }

    private void role(String id, String useTp, Timestamp start, Timestamp end) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) VALUES (?, ?, ?, ?, ?)",
                id, id, useTp, start, end);
    }

    private void group(String id, String useTp, Timestamp start, String... roles) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, START_ACTIVE_DATE) VALUES (?, ?, ?, ?)",
                id, id, useTp, start);
        for (String r : roles) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", id, r);
        }
    }

    private void user(String id, String useTp, String... groups) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP) VALUES (?, ?, ?)", id, id, useTp);
        for (String g : groups) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", id, g);
        }
    }

    private void bundle(String id, String common, String custom, String action, String popup) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN, USE_TP) "
                + "VALUES (?, ?, ?, ?, ?, ?, 'Y')", id, id, common, custom, action, popup);
    }

    private void map(String role, String obj, String... permIds) {
        for (String p : permIds) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES (?, ?, ?)", role, obj, p);
        }
    }

    /**
     * 대표 옛 픽스처. 오브젝트는 V21 카탈로그에 있는 실제 ID(commObjMng·commRoleMng·commUserMng·dataMng·termRegPop·noticeBoard·logViewer)와
     * 카탈로그에 없는 custScreen.
     */
    private void legacyFixture() {
        obj("commObjMng", "mcm", "Y", null, null);
        obj("commRoleMng", "MCM", "Y", null, null);
        obj("commUserMng", null, "Y", null, null);            // SYSTEM_CODE 없음 → 키 mcm
        obj("dataMng", "MDM", "Y", null, null);
        obj("termRegPop", " ", "Y", null, null);              // 공백 SYSTEM_CODE → 키 mcm
        obj("custScreen", "MQC", "Y", null, null);            // 카탈로그에 없음
        obj("noticeBoard", "mcm", "Y", null, ts(2026, 1, 1, 10));   // 유효 기간 지남
        obj("logViewer", "mcm", "N", null, null);              // 사용 안 함

        bundle(PERM_ALL, "search,save,delete,lov", "excel", "searchObjMenu,approve", "zoomPop");
        bundle("P_READ", "search", null, " lov , searchSystemLov,", null);
        bundle("P_EDIT", "save", "excelUp", "saveCmUser", "userPop");
        bundle("P_POP", null, null, null, "roleGrpPop");       // 팝업만
        bundle("P_MDM", null, null, "reg, search", null);
        bundle("P_SYS", "search", null, "sysExtra", null);

        // 보통 역할: 한 오브젝트에 묶음 여럿(COMMON/CUSTOM/ACTION/POPUP 합집합) + 고아 줄(없는 오브젝트·없는 묶음, D19)
        role("R_NORMAL", "Y", ts(2026, 1, 1, 0), ts(2026, 11, 27, 0));   // 끝 = 오늘 자정 → 오늘 끝까지 쓴다
        map("R_NORMAL", "commUserMng", "P_READ", "P_EDIT", "P_POP");
        map("R_NORMAL", "commObjMng", "P_READ");
        map("R_NORMAL", "dataMng", "P_MDM");
        map("R_NORMAL", "custScreen", "P_EDIT");
        map("R_NORMAL", "goneObj", "P_READ");                  // 고아: 오브젝트 없음
        map("R_NORMAL", "commRoleMng", "P_GONE");              // 고아: 묶음 없음
        // SYSADMIN 아닌 역할의 PERM_ALL (D12 교집합)
        role("R_ALL", "Y", null, null);
        map("R_ALL", "commObjMng", PERM_ALL, "P_READ");
        map("R_ALL", "commRoleMng", PERM_ALL);
        map("R_ALL", "custScreen", PERM_ALL);                 // 카탈로그 없음 → 교집합 빔 → 행 없음
        // SYSADMIN (D13: 행 없이 obj.BTN ∪ obj.POPUP)
        role("SYSADMIN", "Y", null, null);
        map("SYSADMIN", "commObjMng", PERM_ALL);
        map("SYSADMIN", "commRoleMng", PERM_ALL, "P_SYS");
        // 팝업만 가진 역할 (D14 빈 BTN → V21 건너뜀)
        role("R_POP", "Y", null, null);
        map("R_POP", "termRegPop", "P_POP");
        // D35: 사용 안 함·유효 기간
        role("R_OFF", "N", null, null);
        map("R_OFF", "commRoleMng", "P_READ");
        role("R_EXPIRED", "Y", null, ts(2026, 6, 30, 18));
        map("R_EXPIRED", "dataMng", "P_READ");
        role("R_OBJOFF", "Y", null, null);
        map("R_OBJOFF", "logViewer", "P_READ");
        map("R_OBJOFF", "noticeBoard", "P_READ");
        role("R_GRP_OFF", "Y", null, null);
        map("R_GRP_OFF", "commRoleMng", "P_READ");
        map("R_GRP_OFF", "commUserMng", "P_MDM");
        role("R_FUT", "Y", null, null);
        map("R_FUT", "commObjMng", "P_EDIT");
        // 고아 역할: 그룹에는 매달렸지만 TB_MCM_SEC_ROLE 에 없음 (D19)
        map("R_GHOST", "commUserMng", "P_EDIT", "P_SYS");

        group("G_MAIN", "Y", null, "R_NORMAL", "R_ALL");
        group("G_MAIN2", "Y", null, "R_NORMAL");               // 같은 역할에 두 그룹으로 닿는다
        group("G_PLAIN", "Y", ts(2026, 1, 1, 0), "R_NORMAL");
        group("G_SYS", "Y", null, "SYSADMIN");
        group("G_MISC", "Y", null, "R_OFF", "R_EXPIRED", "R_OBJOFF", "R_POP");
        group("G_OFF", "N", null, "R_GRP_OFF");
        group("G_FUTURE", "Y", ts(2027, 1, 1, 0), "R_FUT");
        group("G_GHOST", "Y", null, "R_GHOST");

        user("u_normal", "Y", "G_MAIN", "G_MAIN2");
        user("u_plain", "Y", "G_MAIN2", "G_PLAIN");
        user("u_sys", "Y", "G_SYS");
        user("u_misc", "Y", "G_MISC", "G_OFF", "G_FUTURE");
        user("u_ghost", "Y", "G_GHOST");
        user("u_inactive", "N", "G_MAIN2");                   // 사용 안 함인 사람
    }

    // ── 시험 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("legacy 로더 vs V21+v2 로더 — 같은 resolver 의 사람×오브젝트 키는 같고, 다른 키는 모두 의도된 차이로 분류된다")
    void parity() throws IOException {
        legacyFixture();
        runV21();
        Result r = compare();
        writeDiff(DIFF_FILE, r);

        assertThat(r.unclassified).as("분류 안 된 차이 (" + DIFF_FILE.toAbsolutePath() + ")").isEmpty();
        // 분류기가 모든 분류를 실제로 거친다
        assertThat(r.counts.keySet()).as("픽스처가 만든 분류").containsAll(Set.of(Cat.values()));
        // 평범한 경우는 키가 같다
        assertThat(r.legacy.get("u_plain")).isNotEmpty().isEqualTo(r.v2.get("u_plain"));
        assertThat(r.legacy.get("u_inactive")).as("INACTIVE_USER: 사람 USE_TP 는 두 로더 모두 안 본다")
                .isNotEmpty().isEqualTo(r.v2.get("u_inactive"));
        for (String obj : List.of("commUserMng", "dataMng")) {
            assertThat(onObject(r.legacy.get("u_normal"), obj)).isNotEmpty().isEqualTo(onObject(r.v2.get("u_normal"), obj));
        }
        assertThat(onObject(r.v2.get("u_normal"), "commUserMng"))
                .containsExactlyInAnyOrder("mcm/commusermng/search", "mcm/commusermng/lov", "mcm/commusermng/searchSystemLov",
                        "mcm/commusermng/save", "mcm/commusermng/excelUp", "mcm/commusermng/saveCmUser",
                        "mcm/commusermng/userPop", "mcm/commusermng/roleGrpPop");
        // D12: PERM_ALL 은 카탈로그와 겹치는 것만 남는다
        assertThat(onObject(r.v2.get("u_normal"), "commObjMng"))
                .containsExactlyInAnyOrder("mcm/commobjmng/search", "mcm/commobjmng/save", "mcm/commobjmng/lov",
                        "mcm/commobjmng/searchObjMenu", "mcm/commobjmng/searchSystemLov");
        // D13: SYSADMIN 행은 옮기지 않는다
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'SYSADMIN'", Integer.class)).isZero();

        // explain 도 사람 사용 여부를 보지 않는다(로그인 단계가 막는다)
        Explain ex = new DefaultPermResolver(clock()).explain(r.v2Graph, "u_inactive", "commUserMng");
        assertThat(ex.visible()).isTrue();
    }

    /**
     * 가장자리: 대소문자가 다른 SYSADMIN 이름의 역할. V21 은 {@code UPPER(ROLE_ID) NOT IN ('SYSADMIN','ROLE_SYSADMIN')} 로 건너뛰지만
     * resolver(PermEvaluator.SYSADMIN_ROLE_IDS)와 옛 런타임은 정확히 같은 글자만 SYSADMIN 으로 본다 → 보통 역할의 권한이 사라진다.
     */
    @Test
    @DisplayName("가장자리: 대소문자 다른 SYSADMIN 이름 역할(Sysadmin)의 옛 줄도 권한이 같다")
    void mixedCaseSysadminRole() throws IOException {
        obj("commObjMng", "mcm", "Y", null, null);
        bundle("P_READ", "search", null, "lov", null);
        role("Sysadmin", "Y", null, null);
        map("Sysadmin", "commObjMng", "P_READ");
        group("G_EDGE", "Y", null, "Sysadmin");
        user("u_edge", "Y", "G_EDGE");
        runV21();
        Result r = compare();
        writeDiff(EDGE_FILE, r);

        assertThat(r.unclassified).as("분류 안 된 차이 (" + EDGE_FILE.toAbsolutePath() + ")").isEmpty();
    }

    // ── V21 실행 ───────────────────────────────────────────────────────

    static String v21Text() throws IOException {
        try (InputStream in = PermModelParityOraTest.class.getClassLoader().getResourceAsStream(V21)) {
            assertThat(in).as(V21).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** V21 을 문장으로 나눈다: 줄 주석을 떼고 문장 끝 {@code ;} 로 자른다(생성 파일이라 ; 는 문장 끝에만 있다). COMMIT 은 뺀다. */
    static List<String> v21Statements(String text) {
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\\R")) {
            if (line.stripLeading().startsWith("--")) continue;
            sb.append(line).append('\n');
        }
        List<String> out = new ArrayList<>();
        for (String s : sb.toString().split(";")) {
            String t = s.strip();
            if (!t.isEmpty() && !t.equalsIgnoreCase("COMMIT")) out.add(t);
        }
        return out;
    }

    private void runV21() throws IOException {
        List<String> stmts = v21Statements(v21Text());
        assertThat(stmts).hasSize(2).allMatch(s -> s.startsWith("MERGE INTO"));
        for (String s : stmts) jdbc.execute(s);
    }

    /** V21 첫 문장의 CAT(오브젝트 → [BTN 집합, POPUP 집합]). 분류 규칙에만 쓴다. */
    static Map<String, List<Set<String>>> catalog(String text) {
        String first = v21Statements(text).get(0);
        String cat = first.substring(first.indexOf("WITH CAT AS"), first.indexOf(", N AS"));
        Pattern p = Pattern.compile("SELECT '([^']+)'(?: AS OBJECT_ID)?, (?:'([^']*)'|NULL)(?: AS BTN_CSV)?, (?:'([^']*)'|NULL|CAST\\(NULL AS [^)]*\\)\\))");
        Matcher m = p.matcher(cat);
        Map<String, List<Set<String>>> out = new HashMap<>();
        while (m.find()) {
            out.put(m.group(1), List.of(new LinkedHashSet<>(PermTokens.parse(m.group(2))), new LinkedHashSet<>(PermTokens.parse(m.group(3)))));
        }
        assertThat(out).as("V21 카탈로그").containsKeys("commObjMng", "commRoleMng");
        return out;
    }

    // ── 비교·분류 ──────────────────────────────────────────────────────

    record Diff(String userId, String key, String side, String objectId, String action, String category, String detail) { }

    static final class Result {
        Map<String, Set<String>> legacy = new TreeMap<>();
        Map<String, Set<String>> v2 = new TreeMap<>();
        List<Diff> diffs = new ArrayList<>();
        List<Diff> unclassified = new ArrayList<>();
        Map<Cat, Integer> counts = new TreeMap<>();
        PermGraph v2Graph;
        int users;
        int equalKeys;
    }

    private static Clock clock() {
        return Clock.fixed(NOW.atZone(KST).toInstant(), KST);
    }

    private Result compare() throws IOException {
        PermGraph lg = legacyLoader.loadAll();
        PermGraph vg = v2Loader.loadAll();
        DefaultPermResolver resolver = new DefaultPermResolver(clock());
        Facts f = new Facts(lg, vg, catalog(v21Text()));

        Result r = new Result();
        r.v2Graph = vg;
        Set<String> users = new TreeSet<>(lg.userGroups().keySet());
        users.addAll(vg.userGroups().keySet());
        r.users = users.size();
        for (String u : users) {
            Map<String, String[]> lk = keys(lg, resolver.actionsOf(lg, u));
            Map<String, String[]> vk = keys(vg, resolver.actionsOf(vg, u));
            r.legacy.put(u, new TreeSet<>(lk.keySet()));
            r.v2.put(u, new TreeSet<>(vk.keySet()));
            for (String k : new TreeSet<>(lk.keySet())) {
                if (vk.containsKey(k)) { r.equalKeys++; continue; }
                add(r, u, k, "LEGACY_ONLY", lk.get(k), f.explainLegacyOnly(u, lk.get(k)[0], lk.get(k)[1]));
            }
            for (String k : new TreeSet<>(vk.keySet())) {
                if (lk.containsKey(k)) continue;
                add(r, u, k, "V2_ONLY", vk.get(k), f.explainV2Only(u, vk.get(k)[0], vk.get(k)[1]));
            }
        }
        return r;
    }

    private static void add(Result r, String u, String key, String side, String[] oa, List<String> pathReasons) {
        // pathReasons: 경로마다 "그룹>역할:이유+이유" 또는 이유가 없으면 "그룹>역할:?"
        Set<Cat> cats = new TreeSet<>();
        boolean ok = !pathReasons.isEmpty();
        for (String pr : pathReasons) {
            String reasons = pr.substring(pr.indexOf(':') + 1);
            if (reasons.equals("?")) { ok = false; continue; }
            for (String c : reasons.split("\\+")) cats.add(Cat.valueOf(c));
        }
        String category = ok ? String.join("+", cats.stream().map(Enum::name).toList()) : "UNCLASSIFIED";
        Diff d = new Diff(u, key, side, oa[0], oa[1], category, pathReasons.isEmpty() ? "(경로 없음)" : String.join(" | ", pathReasons));
        r.diffs.add(d);
        if (ok) {
            for (Cat c : cats) r.counts.merge(c, 1, Integer::sum);
        } else {
            r.unclassified.add(d);
        }
    }

    /** objectId → action 결과를 런타임 키(D26)로. 값 = [objectId, action]. */
    private static Map<String, String[]> keys(PermGraph g, Map<String, Set<String>> actions) {
        Map<String, String[]> out = new LinkedHashMap<>();
        actions.forEach((obj, acts) -> {
            ObjMeta m = g.objects().get(obj);
            String sys = m == null || m.systemCode() == null ? "mcm" : m.systemCode();
            for (String a : acts) {
                out.put(sys.toLowerCase(Locale.ROOT) + "/" + obj.toLowerCase(Locale.ROOT) + "/" + a, new String[]{obj, a});
            }
        });
        return out;
    }

    private static Set<String> onObject(Set<String> keys, String objectId) {
        String mid = "/" + objectId.toLowerCase(Locale.ROOT) + "/";
        Set<String> out = new TreeSet<>();
        for (String k : keys) if (k.contains(mid)) out.add(k);
        return out;
    }

    private void writeDiff(Path file, Result r) throws IOException {
        Files.createDirectories(file.getParent());
        List<String> lines = new ArrayList<>();
        lines.add("# PermModelParityOraTest — legacy(옛 표 + LegacyPermGraphLoader) vs v2(V21 + V2PermGraphLoader), 같은 DefaultPermResolver, 기준 시각 " + NOW);
        lines.add("# 사람 " + r.users + "명 · 같은 키 " + r.equalKeys + " · 다른 키 " + r.diffs.size() + " · 분류 안 됨 " + r.unclassified.size());
        lines.add("# 분류별(키 하나가 분류 여럿이면 각각 센다): " + r.counts);
        lines.add("# INACTIVE_USER: 두 로더 모두 TB_MCM_SEC_USER 를 읽지 않는다 → 사람 사용 여부로 생기는 키 차이 = 0 (u_inactive 키 같음을 따로 확인)");
        lines.add("# 칸: category<TAB>side<TAB>user<TAB>key<TAB>paths(그룹>역할:이유)");
        for (Diff d : r.diffs) {
            lines.add(d.category() + "\t" + d.side() + "\t" + d.userId() + "\t" + d.key() + "\t" + d.detail());
        }
        Files.write(file, lines, StandardCharsets.UTF_8);
    }

    /** 분류에 쓰는 사실들. 옛 표의 원래 칸(USE_TP·유효 기간)은 legacy 그래프가 지우므로 DB 에서 다시 읽는다. */
    final class Facts {
        final PermGraph lg;
        final PermGraph vg;
        final Map<String, List<Set<String>>> cat;
        final Map<String, Object[]> roleRaw = new HashMap<>();
        final Map<String, Object[]> groupRaw = new HashMap<>();
        final Map<String, Object[]> objRaw = new HashMap<>();
        /** permId → [BTN 토큰, POPUP 토큰] */
        final Map<String, List<Set<String>>> bundles = new HashMap<>();
        /** role → obj → permIds */
        final Map<String, Map<String, Set<String>>> oldRows = new HashMap<>();

        Facts(PermGraph lg, PermGraph vg, Map<String, List<Set<String>>> cat) {
            this.lg = lg;
            this.vg = vg;
            this.cat = cat;
            jdbc.query("SELECT ROLE_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE FROM MCMAPUSER.TB_MCM_SEC_ROLE",
                    rs -> { roleRaw.put(rs.getString(1), new Object[]{rs.getString(2), rs.getTimestamp(3), rs.getTimestamp(4)}); });
            jdbc.query("SELECT ROLE_GROUP_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP",
                    rs -> { groupRaw.put(rs.getString(1), new Object[]{rs.getString(2), rs.getTimestamp(3), rs.getTimestamp(4)}); });
            jdbc.query("SELECT OBJECT_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE FROM MCMAPUSER.TB_MCM_SEC_OBJ",
                    rs -> { objRaw.put(rs.getString(1), new Object[]{rs.getString(2), rs.getTimestamp(3), rs.getTimestamp(4)}); });
            jdbc.query("SELECT PERMISSION_ID, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN FROM MCMAPUSER.TB_MCM_SEC_PERM", rs -> {
                Set<String> b = new LinkedHashSet<>();
                b.addAll(PermTokens.parse(rs.getString(2)));
                b.addAll(PermTokens.parse(rs.getString(3)));
                b.addAll(PermTokens.parse(rs.getString(4)));
                bundles.put(rs.getString(1), List.of(b, new LinkedHashSet<>(PermTokens.parse(rs.getString(5)))));
            });
            jdbc.query("SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING", rs -> {
                oldRows.computeIfAbsent(rs.getString(1), k -> new HashMap<>())
                        .computeIfAbsent(rs.getString(2), k -> new LinkedHashSet<>()).add(rs.getString(3));
            });
        }

        /** PermEvaluator.active 와 같은 규칙(끝 값이 자정이면 그날 끝까지). */
        boolean inWindow(Object[] raw) {
            LocalDateTime start = raw[1] == null ? null : ((Timestamp) raw[1]).toLocalDateTime();
            LocalDateTime end = raw[2] == null ? null : ((Timestamp) raw[2]).toLocalDateTime();
            if (start != null && NOW.isBefore(start)) return false;
            if (end == null) return true;
            if (end.toLocalTime().equals(LocalTime.MIDNIGHT)) return NOW.isBefore(end.plusDays(1));
            return !NOW.isAfter(end);
        }

        /** D35 이유(오브젝트 → 그룹 → 역할 순). raw 가 없으면(메타 없음) 쓰는 것으로 본다 — resolver 와 같다. */
        void usage(Set<Cat> out, Object[] raw, Cat unused) {
            if (raw == null) return;
            if (!"Y".equals(raw[0])) out.add(unused);
            else if (!inWindow(raw)) out.add(Cat.VALIDITY);
        }

        /** 한 역할·오브젝트의 옛 묶음 토큰. kind 0 = BTN, 1 = POPUP. allBundle = PERM_ALL 만 / 아닌 것만. */
        Set<String> tokens(String role, String obj, int kind, Boolean allBundle) {
            Set<String> out = new LinkedHashSet<>();
            for (String p : oldRows.getOrDefault(role, Map.of()).getOrDefault(obj, Set.of())) {
                if (allBundle != null && allBundle != PERM_ALL.equals(p)) continue;
                List<Set<String>> t = bundles.get(p);
                if (t != null) out.addAll(t.get(kind));
            }
            return out;
        }

        Set<String> allowed(PermGraph g, String obj) {
            ObjMeta m = g.objects().get(obj);
            Set<String> out = new LinkedHashSet<>();
            if (m != null) { out.addAll(m.btnPerm()); out.addAll(m.popupPerm()); }
            return out;
        }

        Set<String> catTokens(String obj, int kind) {
            List<Set<String>> c = cat.get(obj);
            return c == null ? Set.of() : c.get(kind);
        }

        /** 옛 쪽에만 있는 키: 옛 계산에서 그 action 을 준 경로마다 v2 가 그 경로로 주지 않는 이유. */
        List<String> explainLegacyOnly(String user, String obj, String action) {
            List<String> out = new ArrayList<>();
            for (String g : lg.userGroups().getOrDefault(user, Set.of())) {
                for (String role : lg.groupRoles().getOrDefault(g, Set.of())) {
                    boolean sys = SYSADMIN_IDS.contains(role);
                    boolean grants = sys ? allowed(lg, obj).contains(action)
                            : tokens(role, obj, 0, null).contains(action) || tokens(role, obj, 1, null).contains(action);
                    if (!grants) continue;
                    Set<Cat> why = new TreeSet<>();
                    usage(why, objRaw.get(obj), Cat.OBJ_UNUSED);
                    usage(why, groupRaw.get(g), Cat.GROUP_UNUSED);
                    usage(why, roleRaw.get(role), Cat.ROLE_UNUSED);
                    if (why.isEmpty()) {
                        if (sys) {
                            if (!allowed(vg, obj).contains(action)) why.add(Cat.SYSADMIN_PATH);
                        } else if (!roleRaw.containsKey(role)) {
                            why.add(Cat.ORPHAN_ROLE);
                        } else {
                            boolean fromOther = tokens(role, obj, 0, false).contains(action) || tokens(role, obj, 1, false).contains(action);
                            boolean allDropped = (tokens(role, obj, 0, true).contains(action) && !catTokens(obj, 0).contains(action))
                                    || (tokens(role, obj, 1, true).contains(action) && !catTokens(obj, 1).contains(action));
                            boolean allKept = (tokens(role, obj, 0, true).contains(action) && catTokens(obj, 0).contains(action))
                                    || (tokens(role, obj, 1, true).contains(action) && catTokens(obj, 1).contains(action));
                            boolean noRow = !vg.rolePerms().getOrDefault(role, Map.of()).containsKey(obj);
                            Set<String> survivingBtn = new LinkedHashSet<>(tokens(role, obj, 0, false));
                            for (String t : tokens(role, obj, 0, true)) if (catTokens(obj, 0).contains(t)) survivingBtn.add(t);
                            if (!fromOther && !allKept && allDropped) why.add(Cat.PERM_ALL_INTERSECTION);
                            else if (noRow && survivingBtn.isEmpty()) why.add(Cat.EMPTY_BTN);
                        }
                    }
                    out.add(g + ">" + role + ":" + (why.isEmpty() ? "?" : String.join("+", why.stream().map(Enum::name).toList())));
                }
            }
            return out;
        }

        /** 새 쪽에만 있는 키: SYSADMIN 경로(쓰는 그룹·역할·오브젝트)이고 action 이 새 허용 값에만 있을 때만 의도된 차이. */
        List<String> explainV2Only(String user, String obj, String action) {
            List<String> out = new ArrayList<>();
            for (String g : vg.userGroups().getOrDefault(user, Set.of())) {
                for (String role : vg.groupRoles().getOrDefault(g, Set.of())) {
                    Set<Cat> probe = new TreeSet<>();
                    usage(probe, objRaw.get(obj), Cat.OBJ_UNUSED);
                    usage(probe, groupRaw.get(g), Cat.GROUP_UNUSED);
                    usage(probe, roleRaw.get(role), Cat.ROLE_UNUSED);
                    if (!probe.isEmpty()) continue;   // v2 에서 쓰지 않는 경로 = 이 키를 주지 않았다
                    boolean sysGrant = SYSADMIN_IDS.contains(role) && allowed(vg, obj).contains(action) && !allowed(lg, obj).contains(action);
                    out.add(g + ">" + role + ":" + (sysGrant ? Cat.SYSADMIN_PATH.name() : "?"));
                }
            }
            // v2 에서 이 키를 줄 수 있는 경로가 SYSADMIN 만이어야 한다: 보통 역할 경로가 섞이면 "?" 가 붙어 분류 안 됨
            return out.stream().anyMatch(s -> s.endsWith(":" + Cat.SYSADMIN_PATH.name()))
                    ? out.stream().filter(s -> s.endsWith(":" + Cat.SYSADMIN_PATH.name())).toList()
                    : out;
        }
    }
}
