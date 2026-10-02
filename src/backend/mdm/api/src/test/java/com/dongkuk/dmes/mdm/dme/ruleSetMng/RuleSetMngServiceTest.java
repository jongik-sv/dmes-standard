package com.dongkuk.dmes.mdm.dme.ruleSetMng;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetListRow;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegResult;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.service.RuleSetMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-06 design §2.2 「RuleSetMngServiceTest」 — ruleSetMng 의 search(조건 넷·계산 칸·페이징)·register(빈 세트 등록).
 * 불변 규칙 I1(세트 ID 규칙·유일)·I2(등록 = 부모 CREATED + 1.000 DRAFT {@code []}·ROW_VERSION 0·등록자 소유, 담당자만 — D-144 2단계 J12)·
 * I19(담당자 판단 한 곳).
 *
 * <p>룰 픽스처(모두 VER 1 RELEASED, 조건은 이름 조건 열, 결과 하나): 사전 SET_THK·SET_WID. R_GRD(SET_THK → S_GRD), R_FCT(S_GRD·SET_WID → S_FCT),
 * R_SPD(S_FCT → S_SPD), R_DUP(SET_WID → S_GRD), R_CYA(S_CYB → S_CYA)·R_CYB(S_CYA → S_CYB), R_OLD(DEPRECATED, SET_THK → S_OLD).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetMngServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetMngService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc.execute("DROP TRIGGER IF EXISTS TR_RULE_VER_FAIL");
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetMngMenu", "ruleSetMng"));

        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SET_WID", DmeTestSupport.domain(jdbc, "SET_WID_D", "QTY", "NUMBER", 0));
        rule("R_GRD", "INUSE", "S_GRD", "SET_THK");
        rule("R_FCT", "INUSE", "S_FCT", "S_GRD", "SET_WID");
        rule("R_SPD", "INUSE", "S_SPD", "S_FCT");
        rule("R_DUP", "INUSE", "S_GRD", "SET_WID");
        rule("R_CYA", "INUSE", "S_CYA", "S_CYB");
        rule("R_CYB", "INUSE", "S_CYB", "S_CYA");
        rule("R_OLD", "DEPRECATED", "S_OLD", "SET_THK");

        DmeTestSupport.ruleSet(jdbc, "S_CHAIN", "사슬 세트", "[\"R_GRD\",\"R_FCT\",\"R_SPD\"]", "INUSE", 3);
        DmeTestSupport.ruleSet(jdbc, "S_BADORD", "순서 뒤집힌 세트", "[\"R_FCT\",\"R_GRD\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_DUP", "중복 대입 세트", "[\"R_GRD\",\"R_DUP\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_HASOLD", "폐기 룰 세트", "[\"R_OLD\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_EMPTY", "빈 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_OLDSET", "폐기 세트", "[\"R_CYA\",\"R_CYB\"]", "DEPRECATED", 2);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    /** VER 1 RELEASED 룰 — 이름 조건 열(사전에 없으면 NONE)과 STRING 결과 열 하나. */
    private void rule(String id, String status, String result, String... conds) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", status);
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        int varId = 1;
        for (String c : conds) {
            DmeTestSupport.var(jdbc, id, 1, varId, "COND", "1", c, varId);
            varId++;
        }
        DmeTestSupport.var(jdbc, id, 1, varId, "RESULT", "Value", result, 1, "STRING");
    }

    // ── 요청·검증 도우미 ──

    private RuleSetSearchResult search(String keyword, String ruleId, String resultVar, String status, Integer page, Integer size) {
        RuleSetSearchRequest r = new RuleSetSearchRequest();
        r.setKeyword(keyword);
        r.setRuleId(ruleId);
        r.setResultVar(resultVar);
        r.setStatus(status);
        r.setPage(page);
        r.setSize(size);
        return service.search(r);
    }

    private static List<String> ids(RuleSetSearchResult result) {
        return result.getRows().stream().map(RuleSetListRow::getSetId).toList();
    }

    private static RuleSetListRow row(RuleSetSearchResult result, String setId) {
        return result.getRows().stream().filter(r -> r.getSetId().equals(setId)).findFirst().orElseThrow();
    }

    private static RuleSetRegRequest regReq(String id, String name, String desc) {
        RuleSetRegRequest r = new RuleSetRegRequest();
        r.setSetId(id);
        r.setSetName(name);
        r.setDescription(desc);
        return r;
    }

    static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    /** 거부 — 세트·룰 테이블이 그대로인지 본다. */
    private BusinessException refuse(Executable call) {
        List<Object> sets = setTables();
        List<Integer> rules = ruleCounts();
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals(sets, setTables(), "거부는 세트 테이블을 바꾸지 않는다");
        assertEquals(rules, ruleCounts());
        return e;
    }

    /** 세트 부모·버전 행 전부(D-144 2단계). */
    private List<Object> setTables() {
        return List.of(
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET ORDER BY MARU_RULE_SET_ID"),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET_VER ORDER BY MARU_RULE_SET_ID, VER"));
    }

    private List<Integer> ruleCounts() {
        return List.of(DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE"),
                DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER"),
                DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR"),
                DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW"));
    }

    // ── search ──

    @Test
    void 조건이_없으면_전부를_세트_ID_순으로_준다() {
        RuleSetSearchResult all = search(null, null, null, null, null, null);
        assertEquals(List.of("S_BADORD", "S_CHAIN", "S_DUP", "S_EMPTY", "S_HASOLD", "S_OLDSET"), ids(all));
        assertEquals(6, all.getTotalCount());
        assertEquals(ids(all), ids(search(" ", "", "  ", "", null, null)), "빈 값은 조건 없음이다");
    }

    @Test
    void 세트_조건은_ID_대소문자_무시_또는_세트명_부분_일치다() {
        assertEquals(List.of("S_CHAIN"), ids(search("chain", null, null, null, null, null)));
        assertEquals(List.of("S_BADORD"), ids(search("뒤집힌", null, null, null, null, null)));
        assertEquals(List.of("S_HASOLD", "S_OLDSET"), ids(search("폐기", null, null, null, null, null)));
        assertEquals(List.of(), ids(search("NO_SUCH_SET", null, null, null, null, null)));
        assertEquals(0, search("NO_SUCH_SET", null, null, null, null, null).getTotalCount());
    }

    @Test
    void 담은_룰_조건은_멤버_룰_ID_부분_일치다() {
        assertEquals(List.of("S_BADORD", "S_CHAIN", "S_DUP"), ids(search(null, "r_gr", null, null, null, null)));
        assertEquals(List.of("S_HASOLD"), ids(search(null, "OLD", null, null, null, null)));
        assertEquals(List.of(), ids(search(null, "R_NONE", null, null, null, null)));
    }

    @Test
    void 결과_변수_조건은_중간_결과까지_정확_일치다() {
        // S_CHAIN 의 S_GRD 는 R_FCT 가 읽는 중간 결과다.
        assertEquals(List.of("S_BADORD", "S_CHAIN", "S_DUP"), ids(search(null, null, "s_grd", null, null, null)));
        assertEquals(List.of("S_CHAIN"), ids(search(null, null, "S_SPD", null, null, null)));
        assertEquals(List.of(), ids(search(null, null, "S_GR", null, null, null)), "부분 일치가 아니다");
        assertEquals(List.of("S_OLDSET"), ids(search(null, null, "S_CYA", null, null, null)));
    }

    @Test
    void 상태_조건과_조건_여럿은_모두_만족하는_세트다() {
        assertEquals(List.of("S_OLDSET"), ids(search(null, null, null, "DEPRECATED", null, null)));
        assertEquals(List.of("S_BADORD", "S_CHAIN", "S_DUP", "S_EMPTY", "S_HASOLD"), ids(search(null, null, null, "INUSE", null, null)));
        assertEquals(List.of("S_CHAIN"), ids(search("S_CH", "R_GRD", "S_GRD", "INUSE", null, null)));
        assertEquals(List.of(), ids(search(null, "R_CYA", null, "INUSE", null, null)));
    }

    @Test
    void 상태는_계산_상태이고_멤버는_표시_버전의_것이다() {
        // 저장 CREATED 인데 적용된 RELEASED 가 있으면 INUSE(룰 목록과 같은 계산 상태). 표시 버전은 지금 적용 중인 RELEASED 다 — DRAFT 2.000 이
        // 더 커도 목록은 1.000 으로 계산한다.
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'CREATED' WHERE MARU_RULE_SET_ID = 'S_CHAIN'");
        DmeTestSupport.ruleSetDraft(jdbc, "S_CHAIN", "2.000", "kim", "[\"R_GRD\"]", 0);

        RuleSetListRow chain = row(search("S_CHAIN", null, null, null, null, null), "S_CHAIN");
        assertEquals("INUSE", chain.getStatus());
        assertEquals("1.000", chain.getVer());
        assertEquals(3, chain.getRuleCount());
        assertEquals(List.of("S_CHAIN"), ids(search("S_CHAIN", null, null, "INUSE", null, null)));
        assertEquals(List.of(), ids(search("S_CHAIN", null, null, "CREATED", null, null)));
    }

    @Test
    void 계산_칸은_멤버_룰의_입출력과_저장_시_검사에서_온다() {
        RuleSetSearchResult all = search(null, null, null, null, null, null);

        RuleSetListRow chain = row(all, "S_CHAIN");
        assertEquals("사슬 세트", chain.getSetName());
        assertEquals("INUSE", chain.getStatus());
        assertEquals("1.000", chain.getVer(), "표시 버전(J11)");
        assertEquals(3, chain.getRuleCount());
        assertEquals(List.of("S_SPD"), chain.getFinalResults());
        assertEquals(2, chain.getInputCount(), "SET_THK·SET_WID");
        assertEquals(0, chain.getRejectCount());
        assertEquals(0, chain.getWarnCount());

        RuleSetListRow badOrder = row(all, "S_BADORD");
        assertEquals(List.of("S_FCT", "S_GRD"), badOrder.getFinalResults(), "앞 룰이 먼저 읽은 이름은 readers 가 아니다");
        assertEquals(3, badOrder.getInputCount(), "S_GRD·SET_WID·SET_THK");
        assertEquals(1, badOrder.getRejectCount(), "ORDER");
        assertEquals(0, badOrder.getWarnCount());

        RuleSetListRow dup = row(all, "S_DUP");
        assertEquals(0, dup.getRejectCount());
        assertEquals(1, dup.getWarnCount(), "DUP_RESULT");

        assertEquals(1, row(all, "S_HASOLD").getRejectCount(), "RULE_DEPRECATED");

        RuleSetListRow empty = row(all, "S_EMPTY");
        assertEquals(0, empty.getRuleCount());
        assertEquals(List.of(), empty.getFinalResults());
        assertEquals(0, empty.getInputCount());
        assertEquals(1, empty.getRejectCount(), "EMPTY");
    }

    @Test
    void DEPRECATED_세트는_검사_수가_0이고_입출력은_계산한다() {
        RuleSetListRow old = row(search(null, null, null, null, null, null), "S_OLDSET");
        assertEquals("DEPRECATED", old.getStatus());
        assertEquals(2, old.getRuleCount());
        assertEquals(List.of("S_CYB"), old.getFinalResults());
        assertEquals(1, old.getInputCount(), "S_CYB");
        assertEquals(0, old.getRejectCount(), "순환이 있어도 DEPRECATED 는 검사하지 않는다");
        assertEquals(0, old.getWarnCount());
    }

    @Test
    void 페이지는_size_기본_20_최대_100이고_totalCount_는_같은_조건_전체다() {
        for (int i = 1; i <= 101; i++) {
            DmeTestSupport.ruleSet(jdbc, String.format("PG_%03d", i), "페이지 " + i, "[]", "INUSE", 0);
        }
        RuleSetSearchResult first = search("PG_", null, null, null, null, null);
        assertEquals(20, first.getRows().size());
        assertEquals(101, first.getTotalCount());
        assertEquals("PG_001", first.getRows().get(0).getSetId());

        assertEquals(100, search("PG_", null, null, null, 0, 500).getRows().size(), "100 을 넘으면 100");
        assertEquals(20, search("PG_", null, null, null, 0, 0).getRows().size(), "1 보다 작으면 기본 20");
        assertEquals(List.of("PG_021", "PG_022"), ids(search("PG_", null, null, null, 10, 2)));
        RuleSetSearchResult last = search("PG_", null, null, null, 5, 20);
        assertEquals(List.of("PG_101"), ids(last));
        assertEquals(101, last.getTotalCount());
        assertEquals("PG_001", search("PG_", null, null, null, -1, 20).getRows().get(0).getSetId(), "음수 page 는 0");
        assertEquals(List.of(), ids(search("PG_", null, null, null, 9, 20)));
    }

    // ── register ──

    @Test
    void 등록은_CREATED_부모와_빈_목록_ROW_VERSION_0_인_등록자_소유_1_000_DRAFT_버전이다() {
        List<Integer> rules = ruleCounts();
        RuleSetRegResult result = service.register(regReq("S_NEW", "새 세트", "설명 한 줄"));

        assertEquals("S_NEW", result.getSetId());
        assertEquals(0L, result.getRowVersion());
        assertEquals("1.000", result.getVer());
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_NEW'");
        assertEquals("새 세트", row.get("MARU_RULE_SET_NAME"));
        assertEquals("설명 한 줄", row.get("DESCRIPTION"));
        assertEquals("CREATED", row.get("STATUS"));
        assertEquals("kim", row.get("C_USR_ID"));
        // D-144 2단계(J12) — 흐름·행 버전은 1.000 MAJOR DRAFT 버전 행에 있고 소유자는 등록자다(룰 등록의 VER 1 DRAFT 선점과 같다).
        assertEquals("[]", DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "RULE_IDS"));
        assertEquals(0L, Long.parseLong(DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "ROW_VERSION")));
        assertEquals("DRAFT", DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "STATUS"));
        assertEquals("kim", DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "OWNER_ID"));
        assertEquals("MAJOR", DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "VER_KIND"));
        assertNull(DmeTestSupport.setVerValue(jdbc, "S_NEW", "1.000", "APPLY_FROM"));
        assertEquals(1, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_NEW'"));
        assertEquals(7, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET"));
        assertEquals(rules, ruleCounts(), "룰 테이블은 쓰지 않는다");

        RuleSetListRow listed = row(search("S_NEW", null, null, null, null, null), "S_NEW");
        assertEquals("CREATED", listed.getStatus());
        assertEquals("1.000", listed.getVer());
        assertEquals(0, listed.getRuleCount());
        assertEquals(1, listed.getRejectCount(), "빈 세트는 EMPTY 거부 1");
    }

    @Test
    void 설명이_비면_null_로_저장하고_세트명은_앞뒤_공백을_뗀다() {
        service.register(regReq("S_NODESC", "  설명 없는 세트  ", "  "));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_NODESC'");
        assertNull(row.get("DESCRIPTION"));
        assertEquals("설명 없는 세트", row.get("MARU_RULE_SET_NAME"));
    }

    @Test
    void 세트_ID_는_컬럼_물리명_규칙과_50자_이하를_따른다() {
        for (String bad : List.of("qlty-bad", "A__B", "1ABC", "A".repeat(51))) {
            BusinessException e = refuse(() -> service.register(regReq(bad, "세트", null)));
            assertEquals("INVALID_VALUE", code(e), bad);
            assertTrue(e.getMessage().contains("룰 세트 ID"), e.getMessage());
        }
        assertEquals("REQUIRED_VALUE", code(refuse(() -> service.register(regReq(" ", "세트", null)))));
        assertEquals("REQUIRED_VALUE", code(refuse(() -> service.register(regReq(null, "세트", null)))));

        service.register(regReq("A".repeat(50), "경계 세트", null));
        service.register(regReq("QLTY_GRD_2", "숫자 섞인 세트", null));
        assertEquals(8, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET"));
    }

    @Test
    void 같은_세트_ID_는_DUPLICATE_DATA_다() {
        BusinessException e = refuse(() -> service.register(regReq("S_CHAIN", "다른 이름", null)));
        assertEquals("DUPLICATE_DATA", code(e));
        assertTrue(e.getMessage().contains("S_CHAIN"), e.getMessage());
    }

    @Test
    void 세트명은_필수이고_100자_이하다() {
        assertEquals("REQUIRED_VALUE", code(refuse(() -> service.register(regReq("S_NONAME", "  ", null)))));
        assertEquals("REQUIRED_VALUE", code(refuse(() -> service.register(regReq("S_NONAME", null, null)))));
        assertEquals("INVALID_VALUE", code(refuse(() -> service.register(regReq("S_LONG", "가".repeat(101), null)))));
        service.register(regReq("S_LONG", "가".repeat(100), null));
        assertEquals("가".repeat(100), jdbc.queryForObject(
                "SELECT MARU_RULE_SET_NAME FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_LONG'", String.class));
    }

    @Test
    void 담당자가_아니면_등록이_MDM013_이다() {
        currentUser.set("park", STD_ADMIN);
        assertEquals("MDM013", code(refuse(() -> service.register(regReq("S_NEW", "새 세트", null)))));
        assertEquals(6, search(null, null, null, null, null, null).getTotalCount(), "조회는 담당자가 아니어도 된다");
    }

    @Test
    void META_등록은_기록하지_않는다() {
        // D-144 2단계 — 등록은 부모 CREATED + 1.000 DRAFT 다. RELEASED 가 없어 피드 값(RELEASED 버전 목록)이 바뀌지 않는다
        MetaRevTestSupport.clear(jdbc);
        service.register(regReq("S_META", "메타 세트", null));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
}
