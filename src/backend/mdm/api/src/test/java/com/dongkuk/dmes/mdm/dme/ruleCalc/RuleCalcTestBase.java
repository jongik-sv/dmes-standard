package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.service.RuleCalcService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * {@code ruleCalc} 서비스 시험의 공통 시드(SQLite) — {@link RuleCalcServiceTest}·{@link RuleCalcSubsetTest} 가 쓴다. 하위 클래스는
 * {@code @SpringBootTest}·{@code @ActiveProfiles}·{@code @Import} 를 직접 붙인다(같은 설정이라 컨텍스트 하나를 나눠 쓴다).
 *
 * <ul>
 *   <li>{@code R_PRE} — COIL_THK(사전, MM) 구간 → PRE_FCT(NUMBER). v1 RELEASED(1.05, 기본 0.90), v2 kim DRAFT(2.00, 결과 PRE_NOTE 가 더 있다)</li>
 *   <li>{@code R_POST} — PRE_FCT(앞 룰 결과)·COIL_WID(사전, MM) → FINAL_WT(사전, KG). RELEASED</li>
 *   <li>{@code S_CALC} — [R_PRE, R_POST] 세트(한 줄 흐름). RELEASED</li>
 *   <li>{@code R_ONLY_DRAFT} — kim 의 DRAFT 만. {@code R_DEP} — DEPRECATED. {@code R_UNQ} — UNIQUE 인데 두 행이 같이 맞는다</li>
 * </ul>
 * 로그인 사용자는 kim, 현재 시각은 2026-06-15 09:00(KST).
 */
abstract class RuleCalcTestBase extends AbstractMdmSharedDbTest {

    @Autowired RuleCalcService service;
    @Autowired MutableCurrentUser currentUser;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        jdbc.update("DELETE FROM TB_MDM_UNIT WHERE UNIT_CODE IN ('MM', 'KG')");
        jdbc.update("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('MM', 'LENGTH', 'MM', 1, 0)");
        jdbc.update("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('KG', 'WEIGHT', 'KG', 1, 0)");
        column("COIL_THK", "COIL_THK_D", 3, "MM", "두께");
        column("COIL_WID", "COIL_WID_D", 0, "MM", "폭");
        column("FINAL_WT", "FINAL_WT_D", 2, "KG", "최종 중량");

        // R_PRE — COIL_THK 구간 → PRE_FCT(NUMBER). 선언만 있는 결과(사전에 없음 → 단위 ""). v2(DRAFT)는 PRE_NOTE 결과가 더 있어 v1 과 모양이 다르다.
        DmeTestSupport.rule(jdbc, "R_PRE", "사전 계수", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_PRE", 1, "FIRST", "2026-01-01 00:00:00", null);
        preFactor(1, "1.05", null);
        DmeTestSupport.pending(jdbc, "R_PRE", 2, "DRAFT", "kim", "FIRST", 1);
        preFactor(2, "2.00", "draft");

        // R_POST — PRE_FCT(R_PRE 가 만든다) 와 COIL_WID 를 읽어 FINAL_WT.
        DmeTestSupport.rule(jdbc, "R_POST", "최종 중량", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_POST", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 1, "COND", "1", "PRE_FCT", 1, null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 2, "COND", "1", "COIL_WID", 2, null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 3, "RESULT", "Value", "FINAL_WT", 1, null);          // 타입은 컬럼 사전에서(라벨·소수 자리·단위)
        DmeTestSupport.row(jdbc, "R_POST", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},\"3\":{\"val\":\"12.34\"}}");
        DmeTestSupport.row(jdbc, "R_POST", 1, 2, 0, "DEFAULT", "{\"3\":{\"val\":\"0.50\"}}");

        DmeTestSupport.ruleSet(jdbc, "S_CALC", "계산 세트", "[\"R_PRE\",\"R_POST\"]", "INUSE", 0);

        DmeTestSupport.rule(jdbc, "R_ONLY_DRAFT", "초안만", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_ONLY_DRAFT", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "R_ONLY_DRAFT", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_ONLY_DRAFT", 1, 2, "RESULT", "Value", "OD_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_ONLY_DRAFT", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"draft\"}}");

        DmeTestSupport.rule(jdbc, "R_DEP", "폐기 룰", "DECISION", "DEPRECATED");
        DmeTestSupport.released(jdbc, "R_DEP", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DEP", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_DEP", 1, 2, "RESULT", "Value", "DEP_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_DEP", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"old\"}}");

        DmeTestSupport.rule(jdbc, "R_UNQ", "겹치는 행", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_UNQ", 1, "UNIQUE", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_UNQ", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_UNQ", 1, 2, "RESULT", "Value", "U_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_UNQ", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"1\"},\"2\":{\"val\":\"A\"}}");
        DmeTestSupport.row(jdbc, "R_UNQ", 1, 2, 2, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"1\"},\"2\":{\"val\":\"B\"}}");

        currentUser.set("kim", STEWARD);
    }

    protected void column(String phys, String domain, int scale, String unit, String label) {
        long id = DmeTestSupport.domain(jdbc, domain, "QTY", "NUMBER", scale);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET UNIT_CODE = ? WHERE DOMAIN_ID = ?", unit, id);
        DmeTestSupport.column(jdbc, phys, id);
        jdbc.update("UPDATE TB_MDM_COLUMN SET LABEL_MID = ? WHERE PHYS_NAME = ?", label, phys);
    }

    /**
     * 버전 {@code ver} 의 R_PRE 정의 — COIL_THK 구간(1.6 이상 2.5 미만)이면 {@code factor}, 아니면 기본 0.90. {@code note} 가 있으면 결과
     * PRE_NOTE(STRING)를 두 행 모두에 더 만든다(버전마다 모양이 달라지게).
     */
    protected void preFactor(int ver, String factor, String note) {
        DmeTestSupport.var(jdbc, "R_PRE", ver, 1, "COND", "2", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_PRE", ver, 2, "RESULT", "Value", "PRE_FCT", 1, "NUMBER");
        String noteCell = "";
        if (note != null) {
            DmeTestSupport.var(jdbc, "R_PRE", ver, 3, "RESULT", "Value", "PRE_NOTE", 2, "STRING");
            noteCell = ",\"3\":{\"val\":\"" + note + "\"}";
        }
        DmeTestSupport.row(jdbc, "R_PRE", ver, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"val\":\"" + factor + "\"}" + noteCell + "}");
        DmeTestSupport.row(jdbc, "R_PRE", ver, 2, 0, "DEFAULT", "{\"2\":{\"val\":\"0.90\"}" + noteCell + "}");
    }

    protected static RuleCalcRequest req(String tp, String id, boolean preview) {
        RuleCalcRequest r = new RuleCalcRequest();
        r.setTargetTp(tp);
        r.setTargetId(id);
        r.setPreview(preview);
        return r;
    }

    protected static RuleCalcRequest run(String tp, String id, Object thk, Object wid) {
        RuleCalcRequest r = req(tp, id, false);
        Map<String, Object> values = new LinkedHashMap<>();
        if (thk != null) {
            values.put("COIL_THK", thk);
        }
        if (wid != null) {
            values.put("COIL_WID", wid);
        }
        r.setValues(values);
        return r;
    }

    protected static List<String> names(List<RuleCalcIoResult.Item> items) {
        return items.stream().map(RuleCalcIoResult.Item::getName).toList();
    }

    protected static List<String> codes(List<RuleCalcMessage> messages) {
        return messages.stream().map(RuleCalcMessage::getCode).toList();
    }
}
