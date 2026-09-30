package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.defaultRow;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.in;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.na;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.notIn;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.range;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withCollect;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withGroup;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;

/**
 * 06 샘플 룰 넷 + LS_A3 2·3단계 + 세트 둘(TSK-03-03 design §6.15). 변수 ID·seq·표시 타입·데이터 타입·도메인·셀은 원천 값 그대로다.
 * 셀 텍스트는 손으로 쓰지 않고 {@link CellTextGenerator#withTexts} 로 채운다(스냅샷 조립과 같은 경로, design §3.3).
 *
 * <p>출처: QLTY_GRD_JDG 06:1295-1329·H:440-449, COIL_WGT_CALC H:456-461·520-521, PROD_WGT_CALC H:465-474·522-527·06:226-229,
 * BASE_SPD_LKP 06:71-79·H:476-497·528-531. {@code SPD_EXC}·{@code SPD_JOIN} 은 원천에 행·셀이 없어 설계가 정의했다(D10).
 * H = design/basic/html/06-business-rule.html.
 */
public final class SampleRules {

    /** 모든 샘플 판정의 평가 시각 2026-10-01T00:00:00+09:00(design §3.3). */
    public static final Instant EVAL_TS = Instant.parse("2026-09-30T15:00:00Z");

    /** 도메인 → 마루 코드. 샘플에는 CODE_IN 이 없어 {@code PROC_CD_DOM} 하나만 안다(design §6.15). */
    public static final Function<String, String> MARU_CODE = d -> "PROC_CD_DOM".equals(d) ? "PROC_CD" : null;

    private static final LocalDateTime SEP_01 = LocalDateTime.of(2026, 9, 1, 0, 0);

    private SampleRules() {}

    private static RuleDefinition texts(RuleDefinition d) {
        return CellTextGenerator.withTexts(d, MARU_CODE);
    }

    /** QLTY_GRD_JDG v1 — FIRST(06:1295-1329). 3행 결과 식은 0.98(D11 ①). */
    public static RuleDefinition qltyGrdJdg() {
        return texts(decision("QLTY_GRD_JDG", 1, HitPolicy.FIRST, SEP_01,
                List.of(condVar(1, DispType.TWO, "COIL_THK", NUMBER, 1),
                        condVar(2, DispType.ONE, "COIL_WID", NUMBER, 2),
                        condVar(3, DispType.ONE, "SURF_GRD", STRING, 3),
                        resultVar(4, DispType.VALUE, "QLTY_GRD", STRING, "QLTY_GRD_CD", 1),
                        resultVar(5, DispType.EXPRESSION, "PRC_FCT", NUMBER, "FCT", 2)),
                contract(vts("COIL_THK", NUMBER, "COIL_WID", NUMBER, "SURF_GRD", STRING),
                        rowContract(1, List.of()), rowContract(2, List.of()),
                        rowContract(3, vts("BASE_FCT", NUMBER)), rowContract(4, List.of())),
                row(1, 1, 1, range("<= 변수 <", "1.6", "2.5"), 2, op("GT", "1000"), 3, in("A"),
                        4, val("A"), 5, expr("1.05")),
                row(2, 2, 1, range("<= 변수 <", "1.6", "2.5"), 2, op("GT", "1000"), 3, in("B"),
                        4, val("B"), 5, expr("1.00")),
                row(3, 3, 1, op("GE", "2.5"), 2, na(), 3, notIn("C"),
                        4, val("B"), 5, expr("ROUND(BASE_FCT * 0.98, 2)")),
                defaultRow(4, 4, val("C"), 5, expr("0.90"))));
    }

    /** COIL_WGT_CALC v1 — DERIVE(H:456-461). */
    public static RuleDefinition coilWgtCalc() {
        return texts(derive("COIL_WGT_CALC", 1, LocalDateTime.of(2026, 9, 15, 0, 0),
                List.of(resultVar(1, DispType.EXPRESSION, "COIL_WGT", NUMBER, "WGT_KG", 1)),
                contract(List.of(),
                        rowContract(1, vts("COIL_THK", NUMBER, "COIL_WID", NUMBER, "COIL_LEN", NUMBER, "SPEC_GRAV", NUMBER))),
                row(1, 1, 1, expr("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)"))));
    }

    /** PROD_WGT_CALC v1 — UNIQUE(H:465-474, 06:207·226-229). CALC_BASIS 는 var 3 이지만 열 seq 2 다. */
    public static RuleDefinition prodWgtCalc() {
        return texts(decision("PROD_WGT_CALC", 1, HitPolicy.UNIQUE, LocalDateTime.of(2026, 9, 20, 0, 0),
                List.of(condVar(1, DispType.EQUAL, "PROD_TYPE", STRING, 1),
                        condVar(3, DispType.EQUAL, "CALC_BASIS", STRING, 2),
                        resultVar(2, DispType.EXPRESSION, "PROD_WGT", NUMBER, "WGT_KG", 1)),
                contract(vts("PROD_TYPE", STRING, "CALC_BASIS", STRING),
                        rowContract(1, vts("COIL_THK", NUMBER, "COIL_WID", NUMBER, "COIL_LEN", NUMBER, "SPEC_GRAV", NUMBER)),
                        rowContract(3, vts("COIL_WID", NUMBER, "COIL_OUT_DIA", NUMBER, "COIL_IN_DIA", NUMBER,
                                "COIL_VOID_RT", NUMBER, "SPEC_GRAV", NUMBER)),
                        rowContract(2, vts("COIL_THK", NUMBER, "COIL_WID", NUMBER, "SHEET_LEN", NUMBER, "SHEET_CNT", NUMBER,
                                "SPEC_GRAV", NUMBER))),
                row(1, 1, 1, op("EQ", "COIL"), 3, op("EQ", "LEN"),
                        2, expr("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)")),
                row(3, 2, 1, op("EQ", "COIL"), 3, op("EQ", "DIA"),
                        2, expr("ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID"
                                + " * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)")),
                row(2, 3, 1, op("EQ", "SHEET"), 3, na(),
                        2, expr("ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)"))));
    }

    private static final String[][] THK_BANDS = {
        {"< 변수 <=", "0", "0.5"},
        {"< 변수 <", "0.5", "0.6"},
        {"<= 변수 <", "0.6", "0.7"},
        {"<= 변수 <", "0.7", "0.8"},
        {"<= 변수 <", "0.8", "0.9"},
        {"<= 변수 <", "0.9", "1"},
        {"<= 변수 <=", "1", "1.2"},
    };

    /** H:486-487 — 행마다 TEXTURE AKZO FLUORO WXL1 WXL2 BACK1 BACK2 GENERAL. */
    private static final String[][] SPD_VALS = {
        {"100", "100", "90", "110", "110", "110", "110", "120"},
        {"100", "100", "90", "110", "110", "110", "110", "110"},
        {"90", "90", "80", "100", "100", "100", "100", "100"},
        {"80", "80", "70", "90", "90", "90", "90", "90"},
        {"70", "70", "60", "80", "80", "80", "80", "80"},
        {"60", "60", "50", "70", "70", "70", "70", "70"},
        {"50", "50", "50", "70", "70", "60", "60", "60"},
    };

    /** BASE_SPD_LKP v1 — UNIQUE + 결과 열 그룹 BASE_SPD(06:71-79, H:476-497). */
    public static RuleDefinition baseSpdLkp() {
        String[][] cols = {
            {"TEXTURE", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")"},
            {"AKZO", "STR_STARTS_WITH(TOP_RESIN_CD, \"6\")"},
            {"FLUORO", "TOP_RESIN_CD == \"F\""},
            {"WXL1", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"1\""},
            {"WXL2", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"2\""},
            {"BACK1", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"1\""},
            {"BACK2", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"2\""},
            {"GENERAL", null},
        };
        List<RuleVar> vars = new ArrayList<>();
        vars.add(condVar(1, DispType.TWO, "COIL_THK", NUMBER, 1));
        for (int j = 0; j < cols.length; j++) {
            vars.add(withGroup(resultVar(j + 2, DispType.VALUE, cols[j][0], NUMBER, "SPEED_MPM", j + 1), "BASE_SPD",
                    cols[j][1]));
        }
        RuleRow[] rows = new RuleRow[THK_BANDS.length];
        for (int i = 0; i < THK_BANDS.length; i++) {
            Object[] pairs = new Object[2 + 2 * cols.length];
            pairs[0] = 1;
            pairs[1] = range(THK_BANDS[i][0], THK_BANDS[i][1], THK_BANDS[i][2]);
            for (int j = 0; j < cols.length; j++) {
                pairs[2 + 2 * j] = j + 2;
                pairs[3 + 2 * j] = val(SPD_VALS[i][j]);
            }
            rows[i] = row(i + 1, i + 1, pairs);
        }
        return texts(decision("BASE_SPD_LKP", 1, HitPolicy.UNIQUE, SEP_01, vars,
                contract(vts("COIL_THK", NUMBER, "TOP_RESIN_CD", STRING, "COAT_SIDE", STRING),
                        rowContract(1, List.of()), rowContract(2, List.of()), rowContract(3, List.of()),
                        rowContract(4, List.of()), rowContract(5, List.of()), rowContract(6, List.of()),
                        rowContract(7, List.of())),
                rows));
    }

    /** SPD_EXC v1 — COLLECT(LIST). 메타 H:532·WR:33, 행·셀은 설계 정의(D10). */
    public static RuleDefinition spdExc() {
        return texts(decision("SPD_EXC", 1, HitPolicy.COLLECT, LocalDateTime.of(2026, 8, 1, 0, 0),
                List.of(exprCondVar(1, 1),
                        withCollect(resultVar(2, DispType.VALUE, "EXC_SPD", NUMBER, 1), CollectAgg.LIST)),
                contract(vts("BASE_SPD", NUMBER, "COIL_WID", NUMBER), rowContract(1, List.of()), rowContract(2, List.of())),
                row(1, 1, 1, expr("COIL_WID >= 1250"), 2, val("70")),
                row(2, 2, 1, expr("BASE_SPD > 80 && COIL_WID >= 1200"), 2, val("85"))));
    }

    /** SPD_JOIN v1 — DERIVE. 메타 H:533·WR:34, 결합식은 설계 정의(D10, E8 의 IF 가드). */
    public static RuleDefinition spdJoin() {
        return texts(derive("SPD_JOIN", 1, LocalDateTime.of(2026, 8, 1, 0, 0),
                List.of(resultVar(1, DispType.EXPRESSION, "LINE_SPD", NUMBER, 1)),
                contract(List.of(), rowContract(1, vts("BASE_SPD", NUMBER), vts("EXC_SPD", NUMBER))),
                row(1, 1, 1, expr("IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))"))));
    }

    /** LS_A3 = BASE_SPD_LKP → SPD_EXC → SPD_JOIN, INUSE(06:1087·1324). */
    public static RuleSetDefinition lsA3() {
        return new RuleSetDefinition("LS_A3", List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"), SetStatus.INUSE, null);
    }

    /** WID_OLD — 폐기 세트(H:540). WID_CHK 정의는 두지 않는다(룰을 조회하지 않아야 한다). */
    public static RuleSetDefinition widOld() {
        return new RuleSetDefinition("WID_OLD", List.of("WID_CHK"), SetStatus.DEPRECATED, null);
    }

    public static List<RuleDefinition> all() {
        return List.of(qltyGrdJdg(), coilWgtCalc(), prodWgtCalc(), baseSpdLkp(), spdExc(), spdJoin());
    }

    /** 샘플 전부 + 세트 둘. */
    public static InMemoryDefinitionLookup lookup() {
        return new InMemoryDefinitionLookup().add(all().toArray(RuleDefinition[]::new)).addSet(lsA3(), widOld());
    }
}
