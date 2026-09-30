package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.FlowKeysProbe;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 흐름도 2단계 P-D7·P3 — 세트 저장 검사 {@code COND_UNTYPED} 의 선언 집합 사실 확인. 분석기는 {@link RuleIoReader} 의 {@code conds ∪ results}
 * 이름을 "세트 안 룰이 타입을 선언한 이름"으로 본다. 엔진 쪽은 공식을 다시 쓰지 않고 실제 {@code new FlowKeys(defs, evaluator)} 의
 * {@code condTypes} 에 후보 이름을 모두 쓰는 조건식을 넣어 선언된 이름을 얻는다({@link FlowKeysProbe}, 엔진과 같은 패키지의 테스트 도우미).
 * 두 집합(대문자)이 같아야 경고가 엔진의 실제 비교 방식과 맞는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleIoDeclaredNamesTest extends AbstractMdmSharedDbTest {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    RuleIoReader reader;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    MdmEvaluator evaluator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @BeforeEach
    void seed() throws Exception {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SET_SURF", DmeTestSupport.domain(jdbc, "SET_SURF_D", "TEXT", "STRING", null));
        DmeTestSupport.column(jdbc, "D_REQ", DmeTestSupport.domain(jdbc, "D_REQ_D", "QTY", "NUMBER", 0));
        DmeTestSupport.column(jdbc, "D_OPT", DmeTestSupport.domain(jdbc, "D_OPT_D", "QTY", "NUMBER", 0));
        DmeTestSupport.column(jdbc, "SET_WID", DmeTestSupport.domain(jdbc, "SET_WID_D", "QTY", "NUMBER", 0));

        // DECISION — 조건 열 2(SET_THK·SET_SURF), 결과 열 1(S_GRD).
        DmeTestSupport.rule(jdbc, "R_DEC", "판정 룰", "DECISION", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 3, LAST_ROW_ID = 2 WHERE MARU_RULE_ID = 'R_DEC'");
        DmeTestSupport.released(jdbc, "R_DEC", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 1, "COND", "2", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 2, "COND", "1", "SET_SURF", 2, null);
        DmeTestSupport.var(jdbc, "R_DEC", 1, 3, "RESULT", "Value", "S_GRD", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_DEC", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1\",\"right\":\"2\"},\"2\":{\"op\":\"IN\",\"list\":[\"A\"]},\"3\":{\"val\":\"A\"}}");
        DmeTestSupport.row(jdbc, "R_DEC", 1, 2, 0, "DEFAULT", "{\"3\":{\"val\":\"C\"}}");

        // DERIVE — 조건 열 1(SET_THK), 결과 Expression 열 S_SPD: COALESCE(D_OPT, 0) + D_REQ → 행 required D_REQ · optional D_OPT.
        DmeTestSupport.rule(jdbc, "R_DRV", "파생 룰", "DERIVE", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 2, LAST_ROW_ID = 1 WHERE MARU_RULE_ID = 'R_DRV'");
        DmeTestSupport.released(jdbc, "R_DRV", 1, null, "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DRV", 1, 1, "COND", "1", "SET_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_DRV", 1, 2, "RESULT", "Expression", "S_SPD", 1, "NUMBER");
        String expr = "COALESCE(D_OPT, 0) + D_REQ";
        String ast = JSON.writeValueAsString(AstExporter.export(expr, evaluator.configuration()));
        DmeTestSupport.row(jdbc, "R_DRV", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"GT\",\"left\":\"0\"},\"2\":{\"expr\":\"" + expr + "\",\"ast\":" + ast + "}}");
    }

    @Test
    void RuleIo_의_conds_와_results_는_엔진이_타입을_선언한_이름과_같다() {
        Map<String, RuleIo> io = reader.read(List.of("R_DEC", "R_DRV"));

        Map<String, RuleDefinition> all = new LinkedHashMap<>();
        Set<String> allIo = new TreeSet<>();
        for (String id : List.of("R_DEC", "R_DRV")) {
            RuleIo r = io.get(id);
            assertTrue(r.exists() && r.releasedVer() != null, id + " 입출력");
            Set<String> fromIo = upper(names(r));
            RuleDefinition def = stored.assemble(id, r.ruleKind(), stored.read(id, r.releasedVer()).orElseThrow()).definition();
            all.put(id, def);
            allIo.addAll(fromIo);

            // 엔진 FlowKeys 가 실제로 선언으로 치는 이름 — 후보는 RuleIo 이름 ∪ 정의에 나오는 모든 이름 ∪ 미끼(선언 안 된 사전 컬럼·없는 이름)
            Set<String> fromEngine = FlowKeysProbe.declaredAmong(Map.of(id, def), evaluator, candidates(fromIo, def));
            assertEquals(fromEngine, fromIo, id + " 엔진 FlowKeys 선언 이름 = RuleIo conds ∪ results");
        }
        Set<String> candidates = new TreeSet<>(allIo);
        all.values().forEach(def -> candidates.addAll(candidates(Set.of(), def)));
        assertEquals(FlowKeysProbe.declaredAmong(all, evaluator, candidates(candidates, null)), allIo, "세트 전체 선언 이름");
        // 사례가 비지 않았는지 — 두 룰 모두 조건·결과가 있고 DERIVE 는 행 required·optional 을 갖는다.
        assertEquals(Set.of("SET_THK", "SET_SURF", "S_GRD"), Set.copyOf(names(io.get("R_DEC"))));
        assertEquals(Set.of("SET_THK", "D_OPT", "D_REQ", "S_SPD"), Set.copyOf(names(io.get("R_DRV"))));
        RuleDefinition drv = stored.assemble("R_DRV", "DERIVE", stored.read("R_DRV", 1).orElseThrow()).definition();
        assertEquals(List.of("D_REQ"), drv.contract().rows().get(0).required().stream().map(VarType::name).toList());
        assertEquals(List.of("D_OPT"), drv.contract().rows().get(0).optional().stream().map(VarType::name).toList());
    }

    /** 조건식에 넣을 후보 — 주어진 이름 ∪ 정의에 나오는 모든 이름(종류·타입 무관, 거르지 않는다) ∪ 미끼 둘. */
    private static Set<String> candidates(Set<String> base, RuleDefinition def) {
        Set<String> out = new TreeSet<>(base);
        if (def != null) {
            if (def.contract() != null) {
                def.contract().always().forEach(t -> out.add(t.name()));
                for (RowContract rc : def.contract().rows()) {
                    rc.required().forEach(t -> out.add(t.name()));
                    rc.optional().forEach(t -> out.add(t.name()));
                }
            }
            for (RuleVar v : def.vars()) {
                if (v.varName() != null) {
                    out.add(v.varName());
                }
                if (v.resGrp() != null && !v.resGrp().isBlank()) {
                    out.add(v.resGrp());
                }
            }
        }
        out.add("SET_WID");                                     // 사전에는 있지만 어느 룰도 읽지 않는다
        out.add("ZZ_UNDECLARED");
        return out;
    }

    private static Set<String> upper(List<String> names) {
        Set<String> out = new TreeSet<>();
        names.forEach(n -> out.add(n.toUpperCase(Locale.ROOT)));
        return out;
    }

    private static List<String> names(RuleIo r) {
        return java.util.stream.Stream.concat(r.conds().stream(), r.results().stream()).map(IoName::name).toList();
    }
}
