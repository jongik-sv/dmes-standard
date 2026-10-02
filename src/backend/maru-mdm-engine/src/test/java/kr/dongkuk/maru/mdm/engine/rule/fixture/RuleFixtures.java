package kr.dongkuk.maru.mdm.engine.rule.fixture;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 룰 정의를 짧게 만드는 정적 도우미(TSK-03-03 design §2.2). op-code·Value 셀의 {@code text} 는 비워 두고
 * {@code CellTextGenerator.withTexts} 로 채운다. Expression 셀은 {@code text = expr}(스냅샷 모양, DefinitionLookup.RuleCell).
 */
public final class RuleFixtures {

    public static final LocalDateTime FOREVER = LocalDateTime.of(9999, 12, 31, 0, 0);
    public static final String ENGINE_VERSION = "0.1.0-SNAPSHOT";

    private RuleFixtures() {}

    // ------------------------------------------------------------------ 변수

    /** 이름 조건 변수. */
    public static RuleVar condVar(int varId, DispType disp, String name, DataType type, int seq) {
        return new RuleVar(varId, VarKind.COND, disp, name, null, null, null, type, null, null, null, null, null, null,
                null, seq);
    }

    /** 이름 조건 변수 + 도메인(CODE_IN 용). */
    public static RuleVar condVar(int varId, DispType disp, String name, DataType type, String domainId, int seq) {
        return new RuleVar(varId, VarKind.COND, disp, name, null, null, null, type, null, domainId, null, null, null,
                null, null, seq);
    }

    /** 식 변수({@code _V<varId>}). */
    public static RuleVar exprVar(int varId, DispType disp, String exprText, List<String> refVars, DataType type,
            int seq) {
        return new RuleVar(varId, VarKind.COND, disp, null, exprText, Map.of("type", "EXPR_VAR"), refVars, type, null,
                null, null, null, null, null, null, seq);
    }

    /** Expression 조건 열(varName·dataType 없음). */
    public static RuleVar exprCondVar(int varId, int seq) {
        return new RuleVar(varId, VarKind.COND, DispType.EXPRESSION, null, null, null, null, null, null, null, null,
                null, null, null, null, seq);
    }

    /** 결과 변수. */
    public static RuleVar resultVar(int varId, DispType disp, String name, DataType type, int seq) {
        return new RuleVar(varId, VarKind.RESULT, disp, name, null, null, null, type, null, null, null, null, null,
                null, null, seq);
    }

    /** 결과 변수 + 도메인. */
    public static RuleVar resultVar(int varId, DispType disp, String name, DataType type, String domainId, int seq) {
        return new RuleVar(varId, VarKind.RESULT, disp, name, null, null, null, type, null, domainId, null, null, null,
                null, null, seq);
    }

    public static RuleVar withCollect(RuleVar v, CollectAgg agg) {
        return new RuleVar(v.varId(), v.varKind(), v.dispType(), v.varName(), v.exprText(), v.exprAst(), v.refVars(),
                v.dataType(), v.scale(), v.domainId(), agg, v.prioList(), v.resGrp(), v.grpCond(), v.grpCondAst(),
                v.seq());
    }

    public static RuleVar withPrio(RuleVar v, String... prio) {
        return new RuleVar(v.varId(), v.varKind(), v.dispType(), v.varName(), v.exprText(), v.exprAst(), v.refVars(),
                v.dataType(), v.scale(), v.domainId(), v.collectAgg(), List.of(prio), v.resGrp(), v.grpCond(),
                v.grpCondAst(), v.seq());
    }

    /** 결과 열 그룹. {@code grpCond} 가 null 이면 기본 열. */
    public static RuleVar withGroup(RuleVar v, String resGrp, String grpCond) {
        return new RuleVar(v.varId(), v.varKind(), v.dispType(), v.varName(), v.exprText(), v.exprAst(), v.refVars(),
                v.dataType(), v.scale(), v.domainId(), v.collectAgg(), v.prioList(), resGrp, grpCond,
                grpCond == null ? null : Map.of("type", "GRP_COND"), v.seq());
    }

    // ------------------------------------------------------------------ 셀

    public static RuleCell na() {
        return new RuleCell("NA", null, null, null, null, null, null, null);
    }

    public static RuleCell op(String op) {
        return new RuleCell(op, null, null, null, null, null, null, null);
    }

    public static RuleCell op(String op, String left) {
        return new RuleCell(op, left, null, null, null, null, null, null);
    }

    public static RuleCell range(String op, String left, String right) {
        return new RuleCell(op, left, right, null, null, null, null, null);
    }

    public static RuleCell in(String... list) {
        return new RuleCell("IN", null, null, List.of(list), null, null, null, null);
    }

    public static RuleCell notIn(String... list) {
        return new RuleCell("NOT_IN", null, null, List.of(list), null, null, null, null);
    }

    /** Expression 셀(조건·결과). text = expr. */
    public static RuleCell expr(String expr) {
        return new RuleCell(null, null, null, null, expr, Map.of("type", "EXPR"), null, expr);
    }

    /** 결과 Value 셀. */
    public static RuleCell val(String val) {
        return new RuleCell(null, null, null, null, null, null, val, null);
    }

    /** 텍스트를 직접 정한 셀(생성기를 거치지 않는다). */
    public static RuleCell withText(RuleCell c, String text) {
        return new RuleCell(c.op(), c.left(), c.right(), c.list(), c.expr(), c.ast(), c.val(), text);
    }

    // ------------------------------------------------------------------ 행

    /** NORMAL 행. {@code varIdCellPairs} = varId, cell, varId, cell, … */
    public static RuleRow row(int rowId, int seq, Object... varIdCellPairs) {
        return new RuleRow(rowId, seq, RowKind.NORMAL, cells(varIdCellPairs));
    }

    public static RuleRow defaultRow(int rowId, Object... varIdCellPairs) {
        return new RuleRow(rowId, 0, RowKind.DEFAULT, cells(varIdCellPairs));
    }

    private static Map<Integer, RuleCell> cells(Object... pairs) {
        Map<Integer, RuleCell> m = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            m.put((Integer) pairs[i], (RuleCell) pairs[i + 1]);
        }
        return Collections.unmodifiableMap(m);
    }

    // ------------------------------------------------------------------ 계약

    public static VarType vt(String name, DataType type) {
        return new VarType(name, type, null, null);
    }

    public static List<VarType> vts(Object... nameTypePairs) {
        List<VarType> out = new ArrayList<>();
        for (int i = 0; i < nameTypePairs.length; i += 2) {
            out.add(vt((String) nameTypePairs[i], (DataType) nameTypePairs[i + 1]));
        }
        return List.copyOf(out);
    }

    public static RowContract rowContract(int rowId, List<VarType> required, List<VarType> optional) {
        return new RowContract(rowId, "row " + rowId, required, optional);
    }

    public static RowContract rowContract(int rowId, List<VarType> required) {
        return rowContract(rowId, required, List.of());
    }

    public static InputContract contract(List<VarType> always, RowContract... rows) {
        return new InputContract(always, List.of(rows));
    }

    // ------------------------------------------------------------------ 정의

    /** 정수 major 버전(예 1 → 1.000)으로 룰을 만든다. */
    public static RuleDefinition decision(String ruleId, int ver, HitPolicy policy, LocalDateTime applyFrom,
            List<RuleVar> vars, InputContract contract, RuleRow... rows) {
        return decision(ruleId, major(ver), policy, applyFrom, vars, contract, rows);
    }

    public static RuleDefinition decision(String ruleId, BigDecimal ver, HitPolicy policy, LocalDateTime applyFrom,
            List<RuleVar> vars, InputContract contract, RuleRow... rows) {
        return new RuleDefinition(ruleId, ver, RuleKind.DECISION, policy, applyFrom, FOREVER, ENGINE_VERSION,
                List.copyOf(vars), contract, Arrays.asList(rows));
    }

    public static RuleDefinition derive(String ruleId, int ver, LocalDateTime applyFrom, List<RuleVar> vars,
            InputContract contract, RuleRow... rows) {
        return derive(ruleId, major(ver), applyFrom, vars, contract, rows);
    }

    public static RuleDefinition derive(String ruleId, BigDecimal ver, LocalDateTime applyFrom, List<RuleVar> vars,
            InputContract contract, RuleRow... rows) {
        return new RuleDefinition(ruleId, ver, RuleKind.DERIVE, null, applyFrom, FOREVER, ENGINE_VERSION,
                List.copyOf(vars), contract, Arrays.asList(rows));
    }

    private static BigDecimal major(int ver) {
        return BigDecimal.valueOf(ver).setScale(3);
    }

    // ------------------------------------------------------------------ 레코드·위반

    /** 레코드(키 순서 유지, null 값 허용). {@code kv} = 키, 값, 키, 값, … */
    public static Map<String, Object> rec(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    /** 위반을 {@code STAGE/CODE/ruleId/rowId/name} 문자열로(순서 유지). */
    public static List<String> violations(EngineEvaluationException e) {
        List<String> out = new ArrayList<>();
        for (EngineEvaluationException.Violation v : e.violations()) {
            out.add(v.stage() + "/" + v.code() + "/" + v.ruleId() + "/" + v.rowId() + "/" + v.name());
        }
        return out;
    }

    /** 정의의 한 셀을 바꾼 새 정의(생성 뒤 텍스트를 일부러 바꿀 때). */
    public static RuleDefinition replaceCell(RuleDefinition d, int rowId, int varId, RuleCell cell) {
        List<RuleRow> rows = new ArrayList<>();
        for (RuleRow r : d.rows()) {
            if (r.rowId() == rowId) {
                Map<Integer, RuleCell> m = new LinkedHashMap<>(r.cells());
                m.put(varId, cell);
                rows.add(new RuleRow(r.rowId(), r.seq(), r.rowKind(), Collections.unmodifiableMap(m)));
            } else {
                rows.add(r);
            }
        }
        return new RuleDefinition(d.ruleId(), d.ver(), d.ruleKind(), d.hitPolicy(), d.applyFrom(), d.applyTo(),
                d.engineVersion(), d.vars(), d.contract(), rows);
    }
}
