package com.dongkuk.dmes.mdm.dme.ruleMng;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleListRow;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleRegResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleMngService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleMngServiceTest」 — 조회(I29 서버 페이징·필터·RELEASED·미적용 칸)와 등록(I1·I2·I3, 수용 기준 1·2).
 * 현재 시각은 {@link DmeTestSupport#NOW}(2026-06-15 09:00 KST).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleMngServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleMngService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc.execute("DROP TRIGGER IF EXISTS TR_RULE_VER_FAIL");
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.rule(jdbc, "QLTY_GRD_JDG", "품질 등급 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.rule(jdbc, "BASE_SPD_LKP", "기본 속도 조회", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "BASE_SPD_LKP", 1, "FIRST", "2026-01-01 00:00:00", "2026-03-01 00:00:00");
        DmeTestSupport.released(jdbc, "BASE_SPD_LKP", 2, "UNIQUE", "2026-03-01 00:00:00", null);
        DmeTestSupport.rule(jdbc, "PROD_WGT_CALC", "제품 중량 계산", "DERIVE", "CREATED");
        DmeTestSupport.pending(jdbc, "PROD_WGT_CALC", 1, "DRAFT", "lee", null, null);
        DmeTestSupport.externalRule(jdbc, "EQP_CHK_JDG", "설비 점검 판정");
        DmeTestSupport.released(jdbc, "EQP_CHK_JDG", 3, "FIRST", "2026-02-01 00:00:00", null);
        DmeTestSupport.rule(jdbc, "FUTURE_JDG", "미래 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "FUTURE_JDG", 1, "FIRST", "2026-01-01 00:00:00", "2026-07-01 00:00:00");
        DmeTestSupport.released(jdbc, "FUTURE_JDG", 2, "PRIORITY", "2026-07-01 00:00:00", null);
    }

    private RuleSearchResult search(String keyword, String kind, String status, Integer page, Integer size) {
        RuleSearchRequest r = new RuleSearchRequest();
        r.setKeyword(keyword);
        r.setRuleKind(kind);
        r.setStatus(status);
        r.setPage(page);
        r.setSize(size);
        return service.search(r);
    }

    private static List<String> ids(RuleSearchResult r) {
        return r.getList().stream().map(RuleListRow::getMaruRuleId).toList();
    }

    // ── 조회 ──

    @Test
    void 조건이_없으면_룰_ID_순으로_전부_보이고_기본_크기는_20이다() {
        RuleSearchResult r = search(null, null, null, null, null);
        assertEquals(List.of("BASE_SPD_LKP", "EQP_CHK_JDG", "FUTURE_JDG", "PROD_WGT_CALC", "QLTY_GRD_JDG"), ids(r));
        assertEquals(5, r.getTotalCount());
        assertEquals(0, r.getPage());
        assertEquals(20, r.getSize());
    }

    @Test
    void 키워드는_ID_앞_ID_중간_소문자_룰명으로_찾는다() {
        assertEquals(List.of("QLTY_GRD_JDG"), ids(search("QLTY", null, null, null, null)));
        assertEquals(List.of("QLTY_GRD_JDG"), ids(search("GRD", null, null, null, null)));
        assertEquals(List.of("QLTY_GRD_JDG"), ids(search("qlty", null, null, null, null)));
        assertEquals(List.of("PROD_WGT_CALC"), ids(search("중량", null, null, null, null)));
        assertEquals(List.of("EQP_CHK_JDG", "FUTURE_JDG", "QLTY_GRD_JDG"), ids(search("_JDG", null, null, null, null)));
    }

    @Test
    void 키워드의_퍼센트와_밑줄은_글자_그대로다() {
        assertEquals(List.of(), ids(search("%", null, null, null, null)));
        assertEquals(List.of(), ids(search("품질_등급", null, null, null, null)));
    }

    @Test
    void 종류와_상태로_거른다() {
        assertEquals(List.of("PROD_WGT_CALC"), ids(search(null, "DERIVE", null, null, null)));
        assertEquals(List.of("PROD_WGT_CALC"), ids(search(null, null, "CREATED", null, null)));
        assertEquals(4, search(null, null, "INUSE", null, null).getTotalCount());
    }

    @Test
    void 페이지_경계와_totalCount_는_같은_필터로_센다() {
        RuleSearchResult first = search(null, null, null, 0, 2);
        assertEquals(List.of("BASE_SPD_LKP", "EQP_CHK_JDG"), ids(first));
        assertEquals(5, first.getTotalCount());
        assertEquals(List.of("QLTY_GRD_JDG"), ids(search(null, null, null, 2, 2)));
        RuleSearchResult filtered = search(null, null, "INUSE", 1, 2);
        assertEquals(List.of("FUTURE_JDG", "QLTY_GRD_JDG"), ids(filtered));
        assertEquals(4, filtered.getTotalCount());
        assertEquals(1, filtered.getPage());
    }

    @Test
    void 크기는_최대_100_이고_음수_페이지는_0_이다() {
        RuleSearchResult r = search(null, null, null, -3, 500);
        assertEquals(100, r.getSize());
        assertEquals(0, r.getPage());
        assertEquals(5, r.getList().size());
    }

    @Test
    void 현재_RELEASED_의_적중_정책과_미적용_버전_칸을_싣는다() {
        Map<String, RuleListRow> rows = new java.util.HashMap<>();
        search(null, null, null, null, null).getList().forEach(r -> rows.put(r.getMaruRuleId(), r));
        RuleListRow qlty = rows.get("QLTY_GRD_JDG");
        assertEquals("1.000", qlty.getReleasedVer());
        assertEquals("FIRST", qlty.getHitPolicy());
        assertEquals("2.000", qlty.getPendingVer());
        assertEquals("DRAFT", qlty.getPendingStatus());
        assertEquals("kim", qlty.getPendingOwnerId());
        RuleListRow base = rows.get("BASE_SPD_LKP");
        assertEquals("2.000", base.getReleasedVer());
        assertEquals("UNIQUE", base.getHitPolicy());
        assertNull(base.getPendingVer());
        RuleListRow future = rows.get("FUTURE_JDG");
        assertEquals("1.000", future.getReleasedVer());
        assertEquals("FIRST", future.getHitPolicy());
        assertEquals("2.000", future.getPendingVer());
        assertEquals("RELEASED", future.getPendingStatus());
        RuleListRow prod = rows.get("PROD_WGT_CALC");
        assertNull(prod.getReleasedVer());
        assertNull(prod.getHitPolicy());
        assertEquals("1.000", prod.getPendingVer());
        assertEquals("lee", prod.getPendingOwnerId());
        assertEquals("DERIVE", prod.getRuleKind());
        assertEquals("CREATED", prod.getStatus());
        assertEquals("EXTERNAL", rows.get("EQP_CHK_JDG").getSourceKind());
        assertEquals("MDM", qlty.getSourceKind());
        assertEquals("품질 등급 판정", qlty.getMaruRuleName());
    }

    // ── 등록 ──

    private static RuleRegRequest reg(String id, String name, String kind) {
        RuleRegRequest r = new RuleRegRequest();
        r.setMaruRuleId(id);
        r.setMaruRuleName(name);
        r.setRuleKind(kind);
        r.setDescription("설명");
        r.setUsageNote("활용처 메모");
        return r;
    }

    @Test
    void 등록은_CREATED_룰과_나의_VER_1_DRAFT_를_함께_쓴다() {
        RuleRegResult result = service.register(reg("NEW_JDG", "신규 판정", "DECISION"));
        assertEquals("NEW_JDG", result.getMaruRuleId());
        assertEquals("1.000", result.getVer());
        assertEquals(0L, result.getRowVersion());

        Map<String, Object> rule = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'NEW_JDG'");
        assertEquals("CREATED", rule.get("STATUS"));
        assertEquals("MDM", rule.get("SOURCE_KIND"));
        assertNull(rule.get("SOURCE_SYSTEM"));
        assertEquals("신규 판정", rule.get("MARU_RULE_NAME"));
        assertEquals("DECISION", rule.get("RULE_KIND"));
        assertEquals("설명", rule.get("DESCRIPTION"));
        assertEquals("활용처 메모", rule.get("USAGE_NOTE"));
        Map<String, Object> ver = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'NEW_JDG'");
        assertEquals(1, ((Number) ver.get("VER")).intValue());
        assertEquals("DRAFT", ver.get("STATUS"));
        assertEquals("kim", ver.get("OWNER_ID"));
        assertEquals(0, ((Number) ver.get("ROW_VERSION")).intValue());
        assertNull(ver.get("BASE_VER"));
        assertEquals("FIRST", ver.get("HIT_POLICY"));
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'NEW_JDG'"));
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'NEW_JDG'"));
    }

    @Test
    void 산출_룰의_적중_정책은_비운다() {
        service.register(reg("NEW_CALC", "신규 산출", "DERIVE"));
        assertNull(jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'NEW_CALC'", String.class));
    }

    @Test
    void 원천_EXTERNAL_요청은_거부하고_아무것도_쓰지_않는다() {
        RuleRegRequest r = reg("NEW_JDG", "신규 판정", "DECISION");
        r.setSourceKind("EXTERNAL");
        BusinessException e = assertThrows(BusinessException.class, () -> service.register(r));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'NEW_JDG'"));
    }

    @Test
    void 원천_MDM_이나_빈_값은_받는다() {
        RuleRegRequest mdm = reg("NEW_A", "가", "DECISION");
        mdm.setSourceKind("MDM");
        service.register(mdm);
        RuleRegRequest blank = reg("NEW_B", "나", "DECISION");
        blank.setSourceKind(" ");
        service.register(blank);
        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID IN ('NEW_A','NEW_B') AND SOURCE_KIND = 'MDM'"));
    }

    @Test
    void 룰_ID_가_물리명_규칙을_어기면_거부한다() {
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("qlty-bad", "이름", "DECISION"))).getErrorCode());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("QLTY__BAD", "이름", "DECISION"))).getErrorCode());
        assertEquals(ErrorCode.REQUIRED_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg(" ", "이름", "DECISION"))).getErrorCode());
    }

    @Test
    void 룰명과_종류를_검사한다() {
        assertEquals(ErrorCode.REQUIRED_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("NEW_JDG", " ", "DECISION"))).getErrorCode());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("NEW_JDG", "가".repeat(101), "DECISION"))).getErrorCode());
        service.register(reg("NEW_100", "가".repeat(100), "DECISION"));
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("NEW_JDG", "이름", "LOOKUP"))).getErrorCode());
        assertEquals(ErrorCode.REQUIRED_VALUE, assertThrows(BusinessException.class,
                () -> service.register(reg("NEW_JDG", "이름", null))).getErrorCode());
    }

    @Test
    void 같은_ID_는_DUPLICATE_DATA_다() {
        assertEquals(ErrorCode.DUPLICATE_DATA, assertThrows(BusinessException.class,
                () -> service.register(reg("QLTY_GRD_JDG", "중복", "DECISION"))).getErrorCode());
    }

    @Test
    void 담당자_역할이_없으면_MDM013_이고_아무것도_쓰지_않는다() {
        currentUser.set("stdadmin", STD_ADMIN);
        BusinessException e = assertThrows(BusinessException.class, () -> service.register(reg("NEW_JDG", "신규 판정", "DECISION")));
        assertEquals("MDM013", e.getErrors().get(0).code());
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'NEW_JDG'"));
    }

    @Test
    void 버전_INSERT_가_실패하면_룰_행도_롤백된다() {
        jdbc.execute("CREATE TRIGGER TR_RULE_VER_FAIL BEFORE INSERT ON TB_MDM_RULE_VER "
                + "WHEN NEW.MARU_RULE_ID = 'NEW_FAIL' BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
        try {
            assertThrows(RuntimeException.class, () -> service.register(reg("NEW_FAIL", "실패", "DECISION")));
            assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'NEW_FAIL'"));
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS TR_RULE_VER_FAIL");
        }
    }

    @Test
    void 등록한_룰은_목록에_미적용_DRAFT_로_보인다() {
        service.register(reg("NEW_JDG", "신규 판정", "DECISION"));
        RuleListRow row = search("NEW_JDG", null, null, null, null).getList().get(0);
        assertEquals("1.000", row.getPendingVer());
        assertEquals("kim", row.getPendingOwnerId());
        assertTrue(row.getReleasedVer() == null);
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }
}
