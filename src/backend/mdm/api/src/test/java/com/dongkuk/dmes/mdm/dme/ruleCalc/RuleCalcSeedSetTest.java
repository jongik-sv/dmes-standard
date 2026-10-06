package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.service.RuleCalcService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.ActiveProfiles;

/**
 * 조업 계산기 {@code ruleCalc} 를 <b>로컬 샘플 시드</b>({@code src/backend/mdm/sample/mdm-local-sample.sql} 의 M47 룰 7건과 세트
 * {@code M47_COAT_WT}, 모두 RELEASED)에 대고 확인한다. 시드 SQL 을 시험 DB(SQLite, 공유 임시 파일)에 JDBC 로 올린 뒤 서비스를 부른다.
 * 기댓값은 시드의 시험 사례(TB_MDM_RULE_TEST_CASE) 입력·기대값 또는 시드 식으로 손계산한 값이다. 공용 로컬 DB 는 쓰지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcSeedSetTest extends AbstractMdmSharedDbTest {

    /** 시험 작업 디렉터리(api/) 기준 샘플 위치(MdmLocalSampleLoaderTest 와 같다). */
    private static final Path SAMPLE = Path.of("../sample/mdm-local-sample.sql");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {
    };

    @Autowired RuleCalcService service;
    @Autowired JdbcTemplate jdbc;

    /** 부모의 {@code @BeforeAll}(공유 DB 초기화) 다음에 돈다. 샘플은 sqlite3 셸용 점 명령·BEGIN/COMMIT 을 빼고 한 트랜잭션으로 올린다. */
    @BeforeAll
    static void loadSeed(@Autowired DataSource dataSource) throws Exception {
        String sql = Files.readString(SAMPLE.toAbsolutePath().normalize(), StandardCharsets.UTF_8).lines()
                .filter(l -> {
                    String t = l.strip();
                    return !t.startsWith(".") && !t.equalsIgnoreCase("BEGIN;") && !t.equalsIgnoreCase("COMMIT;");
                })
                .collect(Collectors.joining("\n"));
        try (Connection c = dataSource.getConnection()) {
            boolean auto = c.getAutoCommit();
            c.setAutoCommit(false);
            try {
                ScriptUtils.executeSqlScript(c, new EncodedResource(new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8), "sample"),
                        StandardCharsets.UTF_8));
                c.commit();
            } catch (RuntimeException | SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(auto);
            }
        }
    }

    // ── 도우미 ──────────────────────────────────────────────────────────────

    private static RuleCalcRequest req(String tp, String id, Map<String, Object> values) {
        RuleCalcRequest r = new RuleCalcRequest();
        r.setTargetTp(tp);
        r.setTargetId(id);
        r.setValues(values);
        return r;
    }

    private static List<String> names(List<RuleCalcIoResult.Item> items) {
        return items.stream().map(RuleCalcIoResult.Item::getName).toList();
    }

    private static List<String> codes(List<RuleCalcMessage> messages) {
        return messages.stream().map(RuleCalcMessage::getCode).toList();
    }

    private static String text(RuleCalcRunResult r) {
        return r.getMessages().stream().map(m -> m.getCode() + ": " + m.getText()).collect(Collectors.joining(" | "));
    }

    /** 숫자 비교 — 응답은 toPlainString 이라 "46" 이든 "46.0" 이든 값으로 같으면 통과. */
    private static void assertNum(String expected, Object actual, String what) {
        assertNotNull(actual, what + " 가 null");
        assertEquals(0, new BigDecimal(expected).compareTo(new BigDecimal(actual.toString())), what + ": 기대 " + expected + " 실제 " + actual);
    }

    /** 시드 시험 사례 한 건(룰 ID·사례 번호) → {input, expected}. */
    private Map<String, Map<String, Object>> seedCase(String ruleId, int caseId) throws Exception {
        Map<String, Object> row = jdbc.queryForMap("SELECT INPUT_JSON, EXPECTED_JSON FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = ? AND CASE_ID = ?",
                ruleId, caseId);
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        out.put("input", JSON.readValue((String) row.get("INPUT_JSON"), MAP));
        out.put("expected", JSON.readValue((String) row.get("EXPECTED_JSON"), MAP));
        return out;
    }

    // ── (1) io — 세트 ──────────────────────────────────────────────────────

    @Test
    void io_세트_M47_COAT_WT_는_앞_룰_결과를_입력에서_빼고_입력_8개와_단계_순서를_돌려준다() {
        RuleCalcIoResult r = service.io(req("SET", "M47_COAT_WT", null));

        assertTrue(r.isOk(), "messages=" + codes(r.getMessages()));
        assertEquals("SET", r.getTarget().getTp());
        assertEquals("M47_COAT_WT", r.getTarget().getId());
        assertEquals("코일코팅중량 계산", r.getTarget().getName());
        assertEquals("1.000", r.getTarget().getVer());
        assertEquals("RELEASED", r.getTarget().getVerStatus());

        List<String> in = names(r.getInputs());
        System.out.println("[seed-io] SET inputs=" + in + " outputs=" + names(r.getOutputs())
                + " steps=" + r.getSteps().stream().map(RuleCalcIoResult.Step::getRuleId).toList());
        assertFalse(in.contains("GOT_ATT_AMT"), "앞 룰(M47C0007) 결과 GOT_ATT_AMT 는 입력이 아니다: " + in);
        assertEquals(8, in.size(), "입력 수: " + in);
        assertTrue(in.containsAll(List.of("PROC_CD", "ORD_USG_CD", "PNT_FLM_THK_FRN_TOT", "PNT_FLM_THK_BAK_TOT",
                "SHT_LTH", "COIL_WTH", "SHT_CNT", "COIL_LTH")), "입력: " + in);
        assertTrue(r.getInputs().stream().allMatch(RuleCalcIoResult.Item::isRequired));

        assertEquals(List.of("M47C0007", "M47C0006"), r.getSteps().stream().map(RuleCalcIoResult.Step::getRuleId).toList());
        assertEquals(List.of("COIL_COT_WGT"), names(r.getOutputs()), "세트 최종 결과");
        assertEquals(List.of("GOT_ATT_AMT"), names(r.getSteps().get(0).getOutputs()));
        assertEquals(List.of("COIL_COT_WGT"), names(r.getSteps().get(1).getOutputs()));
    }

    // ── (2) run — 세트 ─────────────────────────────────────────────────────

    private Map<String, Object> setValues(String proc, String usg, String frn, String bak, String shtLth, String wth, String shtCnt, String coilLth) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("PROC_CD", proc);
        v.put("ORD_USG_CD", usg);
        v.put("PNT_FLM_THK_FRN_TOT", frn);
        v.put("PNT_FLM_THK_BAK_TOT", bak);
        v.put("SHT_LTH", shtLth);
        v.put("COIL_WTH", wth);
        v.put("SHT_CNT", shtCnt);
        v.put("COIL_LTH", coilLth);
        return v;
    }

    private RuleCalcRunResult runSet(Map<String, Object> values) {
        RuleCalcRunResult r = service.run(req("SET", "M47_COAT_WT", values));
        System.out.println("[seed-run] SET in=" + values + " → ok=" + r.isOk() + " result=" + r.getResult() + " steps="
                + r.getSteps().stream().map(s -> s.getRuleId() + "in=" + s.getInputs() + "out=" + s.getOutputs() + "hit=" + s.isHit() + "/def=" + s.isDefaultApplied()).toList()
                + " messages=" + text(r));
        return r;
    }

    @Test
    void run_세트_Sheet_공정61_도막_20_10_이면_도장부착량53_코팅중량16() {
        // M47C0007 사례 3(그 밖·전면 20 후면 10 → 53) + M47C0006 행 1(Sheet): 53×2438/1000×1219/1,000,000×100 = 15.75 → 16
        RuleCalcRunResult r = runSet(setValues("61", "A00000", "20", "10", "2438.0", "1219.0", "100", "1500"));

        assertTrue(r.isOk(), text(r));
        assertEquals(2, r.getSteps().size());
        assertEquals("M47C0007", r.getSteps().get(0).getRuleId());
        assertEquals("M47C0006", r.getSteps().get(1).getRuleId());
        assertNum("53", r.getSteps().get(0).getOutputs().get("GOT_ATT_AMT"), "1단계 GOT_ATT_AMT");
        assertFalse(r.getSteps().get(0).isHit(), "A00000 는 용도코드 4행에 안 맞아 그 밖(DEFAULT) 행");
        assertTrue(r.getSteps().get(0).isDefaultApplied());
        // steps[].inputs 는 조건 칸이 읽은 값만 싣는다(식 칸이 읽는 GOT_ATT_AMT·도막두께는 안 나온다 — 관찰, 서비스 결함 여부는 보고서 참조)
        assertEquals("A00000", String.valueOf(r.getSteps().get(0).getInputs().get("ORD_USG_CD")));
        assertEquals("61", String.valueOf(r.getSteps().get(1).getInputs().get("PROC_CD")));
        assertNum("16", r.getSteps().get(1).getOutputs().get("COIL_COT_WGT"), "2단계 COIL_COT_WGT");
        assertTrue(r.getSteps().get(1).isHit(), "Sheet 행 1 적중");
        assertNum("16", r.getResult().get("COIL_COT_WGT"), "최종 COIL_COT_WGT");
    }

    @Test
    void run_세트_Coil_공정41_도막_20_10_이면_도장부착량53_코팅중량97() {
        // 그 밖 행: 53×1500×1219/1,000,000 = 96.91 → 97
        RuleCalcRunResult r = runSet(setValues("41", "A00000", "20", "10", "2438.0", "1219.0", "100", "1500"));

        assertTrue(r.isOk(), text(r));
        assertEquals(2, r.getSteps().size());
        assertNum("53", r.getSteps().get(0).getOutputs().get("GOT_ATT_AMT"), "GOT_ATT_AMT");
        assertNum("97", r.getSteps().get(1).getOutputs().get("COIL_COT_WGT"), "COIL_COT_WGT");
        assertFalse(r.getSteps().get(1).isHit(), "그 밖(DEFAULT) 행이라 NORMAL 행은 적중하지 않는다");
        assertTrue(r.getSteps().get(1).isDefaultApplied());
        assertNum("97", r.getResult().get("COIL_COT_WGT"), "최종 COIL_COT_WGT");
    }

    @Test
    void run_세트_도막_없는_용도코드_L0801N_은_부착량0_코팅중량0() {
        RuleCalcRunResult r = runSet(setValues("41", "L0801N", "20", "10", "2438.0", "1219.0", "100", "1500"));

        assertTrue(r.isOk(), text(r));
        assertNum("0", r.getSteps().get(0).getOutputs().get("GOT_ATT_AMT"), "GOT_ATT_AMT");
        assertTrue(r.getSteps().get(0).isHit());
        assertNum("0", r.getResult().get("COIL_COT_WGT"), "COIL_COT_WGT");
    }

    @Test
    void run_세트_M47C0006_시드_시험_사례_1_2_를_세트로_재현한다() throws Exception {
        // 사례 1(Coil 41: GOT 25 → 46), 사례 2(Sheet 61: GOT 25 → 7). GOT_ATT_AMT 25 는 세트에서는 M47C0007 이 만든다: 전면 14×1.78 = 24.92 → 25.
        for (int caseId : new int[] {1, 2}) {
            Map<String, Map<String, Object>> c = seedCase("M47C0006", caseId);
            Map<String, Object> in = new LinkedHashMap<>(c.get("input"));
            assertEquals("25", String.valueOf(in.remove("GOT_ATT_AMT")));
            in.put("ORD_USG_CD", "A00000");
            in.put("PNT_FLM_THK_FRN_TOT", "14");
            in.put("PNT_FLM_THK_BAK_TOT", "0");
            in.putIfAbsent("SHT_LTH", "1");        // 사례가 안 쓰는 쪽 입력(분기 밖) — 세트는 모든 입력을 받으므로 채운다
            in.putIfAbsent("SHT_CNT", "1");
            in.putIfAbsent("COIL_LTH", "1");

            RuleCalcRunResult r = runSet(in);

            assertTrue(r.isOk(), "사례 " + caseId + ": " + text(r));
            assertNum("25", r.getSteps().get(0).getOutputs().get("GOT_ATT_AMT"), "사례 " + caseId + " GOT_ATT_AMT");
            assertNum(String.valueOf(c.get("expected").get("COIL_COT_WGT")), r.getResult().get("COIL_COT_WGT"), "사례 " + caseId + " COIL_COT_WGT");
        }
    }

    /**
     * 계약(docs/widget-2026-10/rule-calc-api.md §2.1·§3 70행): 세트 {@code outputs} 는 세트 밖으로 나오는 최종 결과만이고 중간 결과는
     * {@code steps[].outputs} 에서만 본다. 그런데 {@code run} 의 {@code result} 는 {@code finalValues} 에서 입력 키만 빼서 만들기 때문에
     * 중간값 GOT_ATT_AMT 도 같이 나온다 — io.outputs 와 어긋난다(서비스 결함 의심, 이 시험은 그 차이를 드러낸다).
     */
    @Test
    void run_세트_result_키는_io_outputs_와_같아야_한다_중간값_GOT_ATT_AMT_제외() {
        List<String> outputs = names(service.io(req("SET", "M47_COAT_WT", null)).getOutputs());
        RuleCalcRunResult r = runSet(setValues("41", "A00000", "20", "10", "2438.0", "1219.0", "100", "1500"));

        assertTrue(r.isOk(), text(r));
        assertEquals(outputs, List.copyOf(r.getResult().keySet()), "result 키 " + r.getResult().keySet() + " 가 io.outputs " + outputs + " 와 다르다");
    }

    @Test
    void run_세트_입력이_빠지면_엔진을_부르지_않고_INPUT_MISSING() {
        Map<String, Object> v = setValues("41", "A00000", "20", "10", "2438.0", "1219.0", "100", "1500");
        v.remove("COIL_LTH");
        RuleCalcRunResult r = service.run(req("SET", "M47_COAT_WT", v));

        assertFalse(r.isOk());
        assertEquals(List.of("INPUT_MISSING"), codes(r.getMessages()));
        assertTrue(r.getResult().isEmpty());
    }

    // ── (3) run — 룰 M47C0001 ──────────────────────────────────────────────

    /** M47C0001 의 입력 전체(io 가 알려 준 이름)를 시험 사례 입력 + 안 쓰는 칸 채움 값으로 만든다. */
    private Map<String, Object> ruleValues(Map<String, Object> caseInput) {
        RuleCalcIoResult io = service.io(req("RULE", "M47C0001", null));
        assertTrue(io.isOk());
        Map<String, Object> v = new LinkedHashMap<>();
        for (RuleCalcIoResult.Item it : io.getInputs()) {
            Object given = caseInput.get(it.getName());
            v.put(it.getName(), given != null ? given : ("NUMBER".equals(it.getDataType()) ? "1" : "X"));
        }
        return v;
    }

    @Test
    void io_룰_M47C0001_입력_결과() {
        RuleCalcIoResult r = service.io(req("RULE", "M47C0001", null));

        assertTrue(r.isOk());
        assertEquals("코일원판중량", r.getTarget().getName());
        assertEquals("RELEASED", r.getTarget().getVerStatus());
        System.out.println("[seed-io] RULE M47C0001 inputs=" + names(r.getInputs()) + " outputs=" + names(r.getOutputs()));
        assertEquals(List.of("COIL_ORN_PLT_WGT"), names(r.getOutputs()));
        assertTrue(names(r.getInputs()).containsAll(List.of("PROC_CD", "OP_GRD", "PASS_BOD_PAK_MTL_TP", "PLTCM_SET_THK_TRV", "COIL_WTH",
                "COIL_LTH", "GRA", "SLIT_GRP_CNT", "COIL_THK", "SHT_LTH", "SHT_CNT", "ORD_UNIT_WGT")), "입력: " + names(r.getInputs()));
    }

    @Test
    void run_룰_M47C0001_시드_시험_사례_8건을_모두_재현한다() throws Exception {
        for (int caseId = 1; caseId <= 8; caseId++) {
            Map<String, Map<String, Object>> c = seedCase("M47C0001", caseId);
            Map<String, Object> values = ruleValues(c.get("input"));

            RuleCalcRunResult r = service.run(req("RULE", "M47C0001", values));
            System.out.println("[seed-run] RULE M47C0001 case " + caseId + " in=" + values + " → ok=" + r.isOk() + " result=" + r.getResult()
                    + " expected=" + c.get("expected") + " steps=" + r.getSteps().size() + " hit=" + (r.getSteps().isEmpty() ? null : r.getSteps().get(0).isHit())
                    + " messages=" + text(r));

            assertTrue(r.isOk(), "사례 " + caseId + ": " + text(r));
            assertEquals(1, r.getSteps().size(), "사례 " + caseId);
            assertEquals("M47C0001", r.getSteps().get(0).getRuleId());
            assertNum(String.valueOf(c.get("expected").get("COIL_ORN_PLT_WGT")), r.getResult().get("COIL_ORN_PLT_WGT"), "사례 " + caseId + " COIL_ORN_PLT_WGT");
        }
    }

    @Test
    void run_룰_M47C0001_사례1_공정75_슬릿2조는_31400() {
        Map<String, Object> in = new LinkedHashMap<>();
        in.put("PROC_CD", "75");
        in.put("OP_GRD", "A");
        in.put("PASS_BOD_PAK_MTL_TP", "N");
        in.put("PLTCM_SET_THK_TRV", "1.0");
        in.put("COIL_WTH", "1000");
        in.put("COIL_LTH", "2000");
        in.put("GRA", "7.85");
        in.put("SLIT_GRP_CNT", "2");
        RuleCalcRunResult r = service.run(req("RULE", "M47C0001", ruleValues(in)));

        assertTrue(r.isOk(), text(r));
        assertNum("31400", r.getResult().get("COIL_ORN_PLT_WGT"), "COIL_ORN_PLT_WGT");     // 1×1000×2000×7.85/1000×2
        assertTrue(r.getSteps().get(0).isHit());
    }
}
