package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdModelDeletion;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ERD 2차 §7.2 모델 관리 계약 — search 새 칸·kind=SCHEMAS, delete kind=MODEL(권한·연쇄 삭제·구독자 알림), copyDiagram(복사·되돌리기).
 * HTTP 는 BPMN 까지 태운다(역할·사용자는 헤더). copyDiagram 은 명령 서비스를 바로 부른다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdModelManageTest.KEY)
@ActiveProfiles("local")
class ErdModelManageTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-manage-key";
    /** FK 순서(ROUTE·NODE → DIAGRAM). */
    static final List<String> TABLES = List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE",
            "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL");
    static final String P1 = "[{\"x\":10,\"y\":20},{\"x\":30,\"y\":-40}]";

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    @Autowired ErdModelDeletion deletion;
    @Autowired PlatformTransactionManager tm;
    ErdTestClient c;

    @BeforeEach
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM " + t);
        c = new ErdTestClient(port, KEY);
    }

    // ── 준비 ──────────────────────────────────────────────────────────

    /** 모델 mcm(소유자 owner) — 아래 {@link #seed}. */
    void seedFull() throws Exception {
        seed("mcm", "d-1");
    }

    /**
     * 모델 m(소유자 owner) + 표 2·관계 1·다이어그램 d(노드 2, t-m 접기 KEYS, r-1 꺾임점) + 공동 편집자 kim + 작업 중 표시. 명령 4건.
     * baseRev 는 등록 직후 rev 에서 센다 — 같은 id 를 지운 뒤 다시 만들면 rev 가 0 이 아니다(§7.2 b2 fixes).
     */
    void seed(String m, String d) throws Exception {
        versions.createModel(m, m, "MCMAPUSER", m.toUpperCase(), "owner");
        long b = rev(m);
        ok(m, b, """
                [{"op":"addTable","audit":false,"id":"t-r","phys":"TB_ROLE","logical":"역할"},
                 {"op":"addColumn","id":"c-r1","table":"t-r","phys":"ROLE_ID","logical":"역할아이디","dataType":"VARCHAR2","length":30,"notNull":true},
                 {"op":"setPrimaryKey","table":"t-r","columns":["c-r1"]},
                 {"op":"addTable","audit":false,"id":"t-m","phys":"TB_MAPPING","logical":"매핑"}]""");
        ok(m, b + 1, "[{\"op\":\"addRelation\",\"id\":\"r-1\",\"child\":\"t-m\",\"parent\":\"t-r\"}]");
        ok(m, b + 2, ("""
                [{"op":"addDiagram","id":"D","areaName":"a","diagramName":"하나","sortSeq":3},
                 {"op":"placeTables","diagram":"D","nodes":[{"table":"t-r","x":0,"y":0},{"table":"t-m","x":300,"y":40}]},
                 {"op":"setFold","diagram":"D","tables":["t-m"],"foldMode":"KEYS"}]""").replace("\"D\"", "\"" + d + "\""));
        ok(m, b + 3, "[{\"op\":\"setRoute\",\"diagram\":\"" + d + "\",\"relation\":\"r-1\",\"points\":" + P1 + "}]");
        versions.addEditor(m, "kim", "owner");
        assertThat(hub.claim(m, "t-r", "s-kim-" + m, "kim", 600)).isTrue();
    }

    ErdApplyResult apply(long baseRev, String json) throws Exception {
        return commands.apply("mcm", baseRev, "owner", "ui", "UI", c.cmd(json));
    }

    ErdApplyResult ok(long baseRev, String json) throws Exception {
        return ok("mcm", baseRev, json);
    }

    ErdApplyResult ok(String m, long baseRev, String json) throws Exception {
        ErdApplyResult r = commands.apply(m, baseRev, "owner", "ui", "UI", c.cmd(json));
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        return r;
    }

    long rev() {
        return rev("mcm");
    }

    long rev(String m) {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?", Long.class, m);
    }

    /** 표마다 행 수(전체). */
    Map<String, Integer> counts() {
        Map<String, Integer> m = new HashMap<>();
        for (String t : TABLES) m.put(t, jdbc.queryForObject("SELECT COUNT(*) FROM " + t, Integer.class));
        return m;
    }

    /** 표마다 그 모델의 행 수. ROUTE·NODE 는 그 모델의 다이어그램으로 센다. */
    Map<String, Integer> counts(String model) {
        Map<String, Integer> m = new HashMap<>();
        for (String t : TABLES) {
            String where = t.endsWith("_ROUTE") || t.endsWith("_NODE")
                    ? "DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)" : "ERD_MODEL_ID = ?";
            m.put(t, jdbc.queryForObject("SELECT COUNT(*) FROM " + t + " WHERE " + where, Integer.class, model));
        }
        return m;
    }

    /** 버전 행 하나를 더한다(DRAFT 의 JSON 복사). 적용 시작 = 어제. */
    void addVersion(String ver, String status) {
        addVersion(ver, status, "SYSTIMESTAMP - 1");
    }

    /** DRAFT 가 아니면 적용 기간이 있어야 한다(CK_TB_MDM_ERD_MODEL_VER_APPLY). applyFrom 은 SQL 식이다. */
    void addVersion(String ver, String status, String applyFrom) {
        jdbc.update("""
                INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, MODEL_JSON, ROW_VERSION)
                SELECT ERD_MODEL_ID, ?, 'MAJOR', ?, OWNER_ID, """ + applyFrom + """
                , TIMESTAMP '9999-12-31 00:00:00', MODEL_JSON, 0
                  FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'""", new BigDecimal(ver), status);
    }

    JsonNode deleteModel(String user, String role) throws Exception {
        return c.call("delete", user, role, Map.of("modelId", "mcm", "kind", "MODEL"));
    }

    static List<String> kinds(ErdApplyResult r) {
        return r.changes().stream().map(x -> x.kind() + "|" + x.id() + "|" + x.op()).toList();
    }

    /** 다른 트랜잭션(스레드)에서 work 를 하고 커밋하지 않은 채 holdMs 동안 쥔다. 돌려준 스레드를 join 하면 커밋이 끝난 것이다. */
    Thread holdUncommitted(Runnable work, long holdMs) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        Thread t = new Thread(() -> new TransactionTemplate(tm).executeWithoutResult(s -> {
            work.run();
            done.countDown();
            try {
                Thread.sleep(holdMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }), "erd-hold");
        t.start();
        assertThat(done.await(20, TimeUnit.SECONDS)).as("다른 트랜잭션이 시작되지 않았습니다").isTrue();
        return t;
    }

    /** 모델 m 의 행을 FK 순서로 지운다(삭제 서비스를 흉내 — 커밋 전 경합 시험용). */
    void rawDelete(String m) {
        jdbc.update("DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ?", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ?", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ?", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = ?", m);
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?", m);
    }

    // ── search ────────────────────────────────────────────────────────

    @Test
    void searchRowsCarryStatusReleasedVerAndCreatedBy() throws Exception {
        JsonNode reg = c.call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"));
        assertThat(reg.at("/meta/success").asBoolean()).as(reg.toString()).isTrue();
        JsonNode row = c.call("search", "viewer", Map.of()).at("/grids/result/rows/0");
        assertThat(row.path("modelId").asText()).as(row.toString()).isEqualTo("mcm");
        assertThat(row.path("status").asText()).isEqualTo("CREATED");
        assertThat(row.path("createdBy").asText()).isEqualTo("owner");
        assertThat(row.path("draftVer").asText()).isEqualTo("1.000");
        // 확정본이 없으면 칸은 있고 값이 null 이다(CLI 는 칸 없음을 「확인 불가」로 본다)
        assertThat(row.has("releasedVer")).as(row.toString()).isTrue();
        assertThat(row.get("releasedVer").isNull()).as(row.toString()).isTrue();
        // 적용 시각 전의 확정본만 있으면 계산 상태도 CREATED(룰 화면과 같은 계산값, RuleVersions.effectiveStatus)
        addVersion("2.000", "RELEASED", "SYSTIMESTAMP + 1");
        JsonNode future = c.call("search", "viewer", Map.of()).at("/grids/result/rows/0");
        assertThat(future.path("status").asText()).as(future.toString()).isEqualTo("CREATED");
        assertThat(future.path("releasedVer").asText()).isEqualTo("2.000");
        // 최신 확정본 = RELEASED 중 가장 큰 번호(숫자 비교 — 10.000 > 9.000). REQUESTED·APPROVED 는 확정본이 아니다.
        // 적용 시각이 지난 확정본이 있으면 저장 상태가 CREATED 여도 INUSE 다.
        addVersion("9.000", "RELEASED");
        addVersion("10.000", "RELEASED");
        addVersion("11.000", "REQUESTED");
        JsonNode after = c.call("search", "viewer", Map.of()).at("/grids/result/rows/0");
        assertThat(after.path("releasedVer").asText()).as(after.toString()).isEqualTo("10.000");
        assertThat(after.path("status").asText()).isEqualTo("INUSE");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", String.class)).isEqualTo("CREATED");
        assertThat(after.path("draftVer").asText()).isEqualTo("1.000");
        // 모르는 kind 는 입력 오류
        assertThat(c.call("search", "viewer", Map.of("kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
    }

    @Test
    void searchSchemasListsNonOracleMaintainedUsers() throws Exception {
        JsonNode res = c.call("search", "viewer", Map.of("kind", "SCHEMAS"));
        assertThat(res.at("/meta/success").asBoolean()).as(res.toString()).isTrue();
        List<String> names = new ArrayList<>();
        res.at("/grids/result/rows").forEach(r -> names.add(r.path("schemaName").asText()));
        String me = jdbc.queryForObject("SELECT USER FROM DUAL", String.class);
        assertThat(names).contains(me).doesNotContain("SYS", "SYSTEM", "XDB").isSorted();
    }

    // ── delete kind=MODEL ─────────────────────────────────────────────

    @Test
    void adminDeletesOnlyThatModelAndSubscribersGetReloadThenClose() throws Exception {
        for (String role : List.of("MDM_STD_ADMIN", "SYSADMIN")) {
            clean();
            seedFull();
            seed("mes", "d-mes");                                                    // 다른 모델 — 남아야 한다
            addVersion("2.000", "RELEASED");
            addVersion("3.000", "APPROVED");
            Map<String, Integer> other = counts("mes");
            assertThat(counts("mcm").values()).allMatch(n -> n > 0);
            assertThat(other.values()).allMatch(n -> n > 0);
            var q = c.open("mcm", "ui-watch-" + role, -1, "owner");
            c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-watch-" + role) != null);  // 구독이 살아 있다
            var qOther = c.open("mes", "ui-other-" + role, -1, "owner");
            c.next(qOther, "presence", l -> ErdTestClient.entry(l, "ui-other-" + role) != null);
            long revBefore = rev();
            JsonNode del = deleteModel("boss", role);
            assertThat(del.at("/meta/success").asBoolean()).as(role + " " + del).isTrue();
            assertThat(del.at("/data/result/ok").asBoolean()).as(del.toString()).isTrue();
            assertThat(counts("mcm").values()).as(role + " " + counts("mcm")).allMatch(n -> n == 0);
            assertThat(counts("mes")).as("다른 모델 행").isEqualTo(other);
            assertThat(counts()).as("남은 행은 모두 다른 모델의 것").isEqualTo(other);
            // 구독자는 reload 를 받고(화면은 다시 읽고 MDM029 를 받아 시작 화면으로 간다) 스트림이 닫힌다. rev 는 삭제 직전 rev + 1.
            JsonNode reload = c.next(q, "reload", b -> true);
            assertThat(reload.path("rev").asLong()).isEqualTo(revBefore + 1);
            c.next(q, ErdTestClient.END, b -> true);
            // 다른 모델의 구독은 그대로다
            c.assertNone(qOther, "reload", 300);
            c.assertNone(qOther, ErdTestClient.END, 1);
            // 다시 읽으면 ERD_MODEL_NOT_FOUND
            assertThat(c.call("view", "owner", Map.of("modelId", "mcm")).at("/meta/code").asText()).isEqualTo("MDM029");
            assertThat(c.call("search", "viewer", Map.of()).at("/grids/result/rows").size()).isEqualTo(1);
            // 같은 id·모듈로 다시 등록할 수 있다. rev 는 0 부터가 아니라 지운 모델 뒤에서 이어지고 표시 행이 있다 —
            // 옛 rev 를 든 클라이언트(sinceRev·baseRev)는 조용히 이어 받지 않고 reload·거절을 받는다.
            JsonNode again = c.call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"));
            assertThat(again.at("/meta/success").asBoolean()).as(again.toString()).isTrue();
            assertThat(rev()).isGreaterThan(revBefore + 1);
            for (long stale : List.of(0L, revBefore, revBefore + 1)) {
                assertThat(commands.changesSince("mcm", stale).reload()).as("sinceRev " + stale).isTrue();
            }
            var staleSave = apply(revBefore, "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-z\",\"phys\":\"TB_Z\",\"logical\":\"제트\"}]");
            assertThat(staleSave.applied()).isFalse();
            assertThat(staleSave.rejection().code()).isEqualTo("INVALID");
            assertThat(c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result/model").asText()).doesNotContain("TB_Z");
            rawDelete("mcm");
            rawDelete("mes");
        }
    }

    @Test
    void ownerDeletesModelThatHasOnlyDraftAndCancelled() throws Exception {
        seedFull();
        addVersion("2.000", "CANCELLED");
        JsonNode del = deleteModel("owner", "MDM_STEWARD");
        assertThat(del.at("/data/result/ok").asBoolean()).as(del.toString()).isTrue();
        assertThat(counts().values()).as(counts().toString()).allMatch(n -> n == 0);
        assertThat(c.call("view", "owner", Map.of("modelId", "mcm")).at("/meta/code").asText()).isEqualTo("MDM029");
    }

    @Test
    void nonAdminRefusalsLeaveEverythingAndSendNothing() throws Exception {
        seedFull();
        var q = c.open("mcm", "ui-refused", -1, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-refused") != null);
        Map<String, Integer> before = counts();
        long rev = rev();
        // 공동 편집자라도 DRAFT 소유자가 아니면 거절(MDM003). 요청 칸 userId 로 소유자를 자칭해도, 관리자 비슷한 역할 이름이어도 같다.
        for (JsonNode notOwner : List.of(deleteModel("kim", "MDM_STEWARD"),
                c.call("delete", "kim", "SYSADMIN_X", Map.of("modelId", "mcm", "kind", "MODEL", "userId", "owner")),
                c.call("delete", "kim", "MDM_STD_ADMIN_X", Map.of("modelId", "mcm", "kind", "MODEL", "userId", "owner")))) {
            assertThat(notOwner.at("/meta/success").asBoolean()).isFalse();
            assertThat(notOwner.at("/meta/code").asText()).as(notOwner.toString()).isEqualTo("MDM003");
            assertThat(counts()).isEqualTo(before);
        }
        // 소유자라도 RELEASED·REQUESTED·APPROVED 가 하나라도 있으면 거절(MDM003)
        for (String status : List.of("RELEASED", "REQUESTED", "APPROVED")) {
            addVersion("2.000", status);
            JsonNode refused = deleteModel("owner", "MDM_STEWARD");
            assertThat(refused.at("/meta/code").asText()).as(status + " " + refused).isEqualTo("MDM003");
            assertThat(refused.toString()).contains(status);
            jdbc.update("DELETE FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND VER = 2");
            assertThat(counts()).isEqualTo(before);
        }
        // 소유자가 없는 DRAFT(해제 뒤)면 소유자 아님(MDM003) — 문구가 그 사정을 말한다
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET OWNER_ID = NULL WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'");
        JsonNode ownerless = deleteModel("owner", "MDM_STEWARD");
        assertThat(ownerless.at("/meta/code").asText()).as(ownerless.toString()).isEqualTo("MDM003");
        assertThat(ownerless.at("/meta/message").asText()).contains("소유자가 없는 DRAFT");
        // DRAFT 가 없으면(취소본만) 관리자만 지운다(MDM016)
        jdbc.update("DELETE FROM TB_MDM_ERD_EDITOR");
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS = 'CANCELLED', APPLY_FROM = SYSTIMESTAMP - 1, "
                + "APPLY_TO = TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID = 'mcm'");
        JsonNode noDraft = deleteModel("owner", "MDM_STEWARD");
        assertThat(noDraft.at("/meta/code").asText()).as(noDraft.toString()).isEqualTo("MDM016");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL", Integer.class)).isEqualTo(1);
        assertThat(rev()).isEqualTo(rev);
        // 거절은 아무것도 보내지 않고 스트림도 열려 있다
        c.assertNone(q, "reload", 500);
        c.assertNone(q, ErdTestClient.END, 1);
    }

    /** 권한을 지난 삭제가 롤백되면(바깥 트랜잭션) 행·알림 모두 그대로다 — 알림은 커밋 뒤에만 나간다. */
    @Test
    void rolledBackDeleteKeepsRowsAndSendsNothing() throws Exception {
        seedFull();
        var q = c.open("mcm", "ui-rb", -1, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-rb") != null);
        Map<String, Integer> before = counts();
        new TransactionTemplate(tm).executeWithoutResult(s -> {
            deletion.delete("mcm", "boss", Set.of("MDM_STD_ADMIN"));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL", Integer.class)).isZero(); // 안에서는 지워졌다
            s.setRollbackOnly();
        });
        assertThat(counts()).isEqualTo(before);
        c.assertNone(q, "reload", 800);
        c.assertNone(q, ErdTestClient.END, 1);
        // 롤백된 삭제는 rev 이어 쓰기 기억도 남기지 않는다 — 그대로 저장이 이어진다
        ok(rev(), "[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-r\",\"x\":1,\"y\":1}]}]");
    }

    /** 커밋 안 된 작업 중 표시가 삭제와 겹쳐도 삭제가 끝난다(삭제가 FK 오류로 통째 롤백되지 않는다). */
    @Test
    void deleteSurvivesClaimCommittedMidway() throws Exception {
        seedFull();
        Thread t = holdUncommitted(() -> jdbc.update("""
                INSERT INTO TB_MDM_ERD_CLAIM (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
                VALUES ('mcm', 't-m', 's-late', 'kim', SYSTIMESTAMP + 1, 'kim', SYSTIMESTAMP, 'kim', SYSTIMESTAMP, 0)"""), 1500);
        deletion.delete("mcm", "boss", Set.of("MDM_STD_ADMIN"));
        t.join();
        assertThat(counts().values()).as(counts().toString()).allMatch(n -> n == 0);
    }

    /** 커밋 안 된 모델 삭제와 겹친 작업 중 표시·공동 편집자 추가는 FK 오류(S001)가 아니라 ERD_MODEL_NOT_FOUND 다. */
    @Test
    void claimAndAddEditorRacingDeleteGetModelNotFound() throws Exception {
        seedFull();
        Thread t = holdUncommitted(() -> rawDelete("mcm"), 1500);
        assertThatThrownBy(() -> hub.claimFor("mcm", "t-m", "s-race", "kim", 600))
                .isInstanceOf(BusinessException.class).hasMessageContaining("ERD 모델이 없습니다");
        t.join();
        seedFull();
        Thread t2 = holdUncommitted(() -> rawDelete("mcm"), 1500);
        assertThatThrownBy(() -> versions.addEditor("mcm", "lee", "owner"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("ERD 모델이 없습니다");
        t2.join();
        assertThat(counts().values()).allMatch(n -> n == 0);
    }

    @Test
    void deleteKindsAndMissingModel() throws Exception {
        assertThat(deleteModel("boss", "MDM_STD_ADMIN").at("/meta/code").asText()).isEqualTo("MDM029");
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        // kind 없음 = DRAFT 삭제(지금처럼 ver·rowVersion 필수 — 빠지면 기존 오류 그대로이고 아무것도 지우지 않는다)
        JsonNode noVer = c.call("delete", "owner", Map.of("modelId", "mcm"));
        assertThat(noVer.at("/meta/success").asBoolean()).as(noVer.toString()).isFalse();
        assertThat(c.call("delete", "owner", Map.of("modelId", "mcm", "kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL", Integer.class)).isEqualTo(1);
    }

    // ── copyDiagram ───────────────────────────────────────────────────

    @Test
    void copyDiagramCopiesNodesFoldAndRoutesInOneRevAndUndoes() throws Exception {
        seedFull();
        long base = rev();
        var r = ok(base, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-c\",\"areaName\":\"b\",\"diagramName\":\"하나 복사\"}]");
        assertThat(r.rev()).isEqualTo(base + 1);
        assertThat(kinds(r)).containsExactlyInAnyOrder("diagram|d-c|upsert", "diagramNode|d-c:t-r|upsert",
                "diagramNode|d-c:t-m|upsert", "diagramRoute|d-c:r-1|upsert");
        ErdChange d = r.changes().stream().filter(x -> x.kind().equals("diagram")).findFirst().orElseThrow();
        assertThat(d.value()).isEqualTo(c.om.readTree("{\"id\":\"d-c\",\"areaName\":\"b\",\"diagramName\":\"하나 복사\",\"sortSeq\":3}"));
        assertThat(nodes("d-c")).isEqualTo(nodes("d-1")).containsExactly("t-m|300|40|KEYS", "t-r|0|0|NONE");
        assertThat(c.om.readTree(jdbc.queryForObject(
                "SELECT POINTS_JSON FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-c' AND REL_UUID = 'r-1'", String.class)))
                .isEqualTo(c.om.readTree(P1));
        ErdChange route = r.changes().stream().filter(x -> x.kind().equals("diagramRoute")).findFirst().orElseThrow();
        assertThat(route.value()).isEqualTo(c.om.readTree("{\"diagram\":\"d-c\",\"relation\":\"r-1\",\"points\":" + P1 + "}"));
        // 되돌리기 1번이면 복사본만 사라지고 원본은 그대로다
        var undo = commands.undo("mcm", base + 1, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(kinds(undo)).containsExactlyInAnyOrder("diagram|d-c|delete", "diagramNode|d-c:t-r|delete",
                "diagramNode|d-c:t-m|delete", "diagramRoute|d-c:r-1|delete");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = 'd-c'", Integer.class)).isZero();
        assertThat(nodes("d-c")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-c'", Integer.class)).isZero();
        assertThat(nodes("d-1")).containsExactly("t-m|300|40|KEYS", "t-r|0|0|NONE");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-1'", Integer.class)).isEqualTo(1);
    }

    @Test
    void copyDiagramDefaultsAndRejections() throws Exception {
        seedFull();
        long base = rev();
        // id·이름을 빼면 새 d- id, 원본 업무영역, 「<이름> 복사」
        var r = ok(base, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\"}]");
        ErdChange d = r.changes().stream().filter(x -> x.kind().equals("diagram")).findFirst().orElseThrow();
        assertThat(d.id()).startsWith("d-").isNotEqualTo("d-1");
        assertThat(d.value().path("areaName").asText()).isEqualTo("a");
        assertThat(d.value().path("diagramName").asText()).isEqualTo("하나 복사");
        assertThat(nodes(d.id())).isEqualTo(nodes("d-1"));
        // 같은 묶음 뒤 명령이 새 다이어그램을 쓸 수 있다
        ok(base + 1, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-c2\",\"areaName\":\"a\",\"diagramName\":\"둘\"},"
                + "{\"op\":\"moveNodes\",\"diagram\":\"d-c2\",\"nodes\":[{\"table\":\"t-r\",\"x\":9,\"y\":9}]}]");
        assertThat(nodes("d-c2")).containsExactly("t-m|300|40|KEYS", "t-r|9|9|NONE");
        assertThat(nodes("d-1")).containsExactly("t-m|300|40|KEYS", "t-r|0|0|NONE");
        for (String bad : List.of(
                "{\"op\":\"copyDiagram\",\"from\":\"d-none\",\"id\":\"d-x\",\"areaName\":\"a\",\"diagramName\":\"x\"}",
                "{\"op\":\"copyDiagram\",\"id\":\"d-x\",\"areaName\":\"a\",\"diagramName\":\"x\"}",
                "{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"x\"}",
                "{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"bad id\",\"areaName\":\"a\",\"diagramName\":\"x\"}",
                "{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-x\",\"areaName\":\" \",\"diagramName\":\"x\"}",
                "{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-x\",\"areaName\":\"a\",\"diagramName\":\"" + "가".repeat(201) + "\"}")) {
            var rej = apply(base + 2, "[" + bad + "]");
            assertThat(rej.applied()).as(bad).isFalse();
            assertThat(rej.rejection().code()).as(bad).isEqualTo("INVALID");
        }
        assertThat(rev()).isEqualTo(base + 2);
        // 원본 이름이 길어도(199자) 기본 이름은 200자 안으로 자른다
        ok(base + 2, "[{\"op\":\"updateDiagram\",\"id\":\"d-1\",\"set\":{\"diagramName\":\"" + "나".repeat(199) + "\"}}]");
        var longCopy = ok(base + 3, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-long\"}]");
        String name = longCopy.changes().stream().filter(x -> x.kind().equals("diagram")).findFirst().orElseThrow()
                .value().path("diagramName").asText();
        assertThat(name).hasSize(200).isEqualTo("나".repeat(197) + " 복사");
    }

    /** 노드 "표|x|y|접기" (표 id 순). */
    List<String> nodes(String diagram) {
        return jdbc.query("SELECT TABLE_UUID, POS_X, POS_Y, FOLD_MODE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? ORDER BY TABLE_UUID",
                (rs, i) -> rs.getString(1) + "|" + rs.getInt(2) + "|" + rs.getInt(3) + "|" + rs.getString(4), diagram);
    }
}
