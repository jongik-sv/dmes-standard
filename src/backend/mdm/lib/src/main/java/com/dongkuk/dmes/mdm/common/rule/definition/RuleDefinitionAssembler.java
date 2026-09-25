package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.rule.InputContracts;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 원장 모양(변수·행) → 엔진 {@code RuleDefinition}(TSK-08-04 design §2.3, 매핑은 TSK-08-01 design §6.4). 값 테스트(저장된 버전·요청 본문)와
 * 저장 시 검사(08-04 B6 {@code ExprTypeByCaseCheck})가 함께 쓴다.
 *
 * <ul>
 *   <li>DISP_TYPE 06 표기 → enum({@code Equal→EQUAL, 1→ONE, 2→TWO, Expression→EXPRESSION, Value→VALUE}), DOMAIN_ID Long → String.</li>
 *   <li>식 변수({@code ResolvedVar.exprVar})와 Expression 조건 열은 {@code varName = null}. 식 변수는 {@code exprText} = 저장 식(trim),
 *       {@code exprAst} = VAR_AST, {@code refVars} = {@code InputContracts.usedVariables(exprAst)} — 엔진의 참조 변수 NULL 가드가 돌고
 *       계약은 화면(AST 를 걷는다)과 같다(B1 인계). AST 가 없으면 null.</li>
 *   <li>결과 열 {@code resGrp} 는 공백뿐이면 null·아니면 저장값 그대로, {@code grpCond} 는 공백뿐이면 null, 그 AST 는 GRP_COND_AST.</li>
 *   <li>셀 텍스트는 셀마다 {@code CellTextGenerator} 로 만든다({@code withTexts} 는 첫 실패에서 멈춘다). 실패한 셀이 든 행은 정의에서 빼고
 *       {@link CellFailure} 로 돌려준다(D5 — 셀 하나를 지우면 NA 가 되어 행 뜻이 바뀐다).</li>
 *   <li>입력 계약은 {@code InputContracts.compute} 에 {@code ResolvedVar.label} 을 넘겨 계산한다. 타입은 이 룰의 이름 변수 → {@code externalType}
 *       (컬럼 사전·다른 룰 결과) → STRING 순으로 찾는다(화면 {@code contract-view.ts} 와 같은 기본값).</li>
 * </ul>
 */
public final class RuleDefinitionAssembler {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, DispType> DISP = Map.of(
            "Equal", DispType.EQUAL, "1", DispType.ONE, "2", DispType.TWO, "Expression", DispType.EXPRESSION, "Value", DispType.VALUE);

    private RuleDefinitionAssembler() {
    }

    /** 텍스트를 만들지 못한 셀. */
    public record CellFailure(int rowId, int varId, String message) {
    }

    /**
     * @param definition  실패한 셀이 든 행을 뺀 정의(계약 포함)
     * @param skippedRows 뺀 행
     */
    public record Assembled(RuleDefinition definition, List<CellFailure> failures, Set<Integer> skippedRows) {
    }

    /**
     * @param rawVars      그 버전의 TB_MDM_RULE_VAR(VAR_AST·RES_GRP·GRP_COND·COLLECT_AGG·PRIO_LIST)
     * @param vars         해석된 변수(타입·라벨·코드) — {@code rawVars} 와 같은 var_id
     * @param rows         행(셀은 파싱한 맵). 새 행이면 임시 번호 그대로 싣는다
     * @param externalType 룰 밖 이름 → 타입. 모르면 null
     */
    public static Assembled assemble(String ruleId, int ver, String ruleKind, String hitPolicy, LocalDateTime applyFrom, LocalDateTime applyTo,
                                     List<MdmRuleVar> rawVars, List<ResolvedVar> vars, List<DraftRow> rows,
                                     Function<String, VarType> externalType) {
        Map<Integer, MdmRuleVar> rawById = new HashMap<>();
        rawVars.forEach(v -> rawById.put(v.getVarId(), v));
        List<RuleVar> engineVars = new ArrayList<>(vars.size());
        Map<Integer, RuleVar> byId = new LinkedHashMap<>();
        Map<Integer, ResolvedVar> resolvedById = new HashMap<>();
        Map<Integer, String> labels = new HashMap<>();
        for (ResolvedVar v : vars) {
            RuleVar ev = toRuleVar(v, rawById.get(v.varId()));
            engineVars.add(ev);
            byId.put(v.varId(), ev);
            resolvedById.put(v.varId(), v);
            if (v.label() != null) {
                labels.put(v.varId(), v.label());
            }
        }

        List<RuleRow> engineRows = new ArrayList<>(rows.size());
        List<CellFailure> failures = new ArrayList<>();
        Set<Integer> skipped = new LinkedHashSet<>();
        for (DraftRow row : rows) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            boolean broken = false;
            for (Map.Entry<Integer, Map<String, Object>> e : row.cells().entrySet()) {
                RuleVar var = byId.get(e.getKey());
                if (var == null) {
                    failures.add(new CellFailure(row.rowId(), e.getKey(), "변수 정의에 없는 var_id"));
                    broken = true;
                    continue;
                }
                try {
                    cells.put(e.getKey(), cell(var, resolvedById.get(e.getKey()), e.getValue()));
                } catch (RuntimeException ex) {
                    failures.add(new CellFailure(row.rowId(), e.getKey(), "식을 만들 수 없다: " + ex.getMessage()));
                    broken = true;
                }
            }
            if (broken) {
                skipped.add(row.rowId());
                continue;
            }
            engineRows.add(new RuleRow(row.rowId(), row.seq(), RowKind.valueOf(row.rowKind()), Collections.unmodifiableMap(cells)));
        }

        RuleKind kind = RuleKind.valueOf(ruleKind);
        Function<String, VarType> types = typeResolver(vars, externalType);
        RuleDefinition def = new RuleDefinition(ruleId, ver, kind, hitPolicy == null || hitPolicy.isBlank() ? null : HitPolicy.valueOf(hitPolicy.trim()),
                applyFrom, applyTo, null, List.copyOf(engineVars),
                InputContracts.compute(engineVars, engineRows, kind, types, labels), List.copyOf(engineRows));
        return new Assembled(def, List.copyOf(failures), Collections.unmodifiableSet(skipped));
    }

    private static RuleVar toRuleVar(ResolvedVar v, MdmRuleVar raw) {
        VarKind kind = VarKind.valueOf(v.varKind());
        DispType disp = v.dispType() == null ? (kind == VarKind.COND ? DispType.ONE : DispType.VALUE) : DISP.get(v.dispType());
        boolean exprColumn = kind == VarKind.COND && disp == DispType.EXPRESSION;
        boolean nameless = v.exprVar() || exprColumn;
        String exprText = kind == VarKind.COND && v.exprVar() && v.varName() != null ? v.varName().trim() : null;
        Map<String, Object> exprAst = exprText == null || raw == null ? null : map(raw.getVarAst());
        String resGrp = null;
        String grpCond = null;
        Map<String, Object> grpCondAst = null;
        CollectAgg agg = null;
        List<String> prio = null;
        if (kind == VarKind.RESULT && raw != null) {
            resGrp = raw.getResGrp() == null || raw.getResGrp().isBlank() ? null : raw.getResGrp();
            grpCond = raw.getGrpCond() == null || raw.getGrpCond().isBlank() ? null : raw.getGrpCond();
            grpCondAst = grpCond == null ? null : map(raw.getGrpCondAst());
            agg = raw.getCollectAgg() == null || raw.getCollectAgg().isBlank() ? null : CollectAgg.valueOf(raw.getCollectAgg().trim());
            prio = list(raw.getPrioList());
        }
        return new RuleVar(v.varId(), kind, disp, nameless ? null : v.varName(), exprText, exprAst,
                exprAst == null ? null : InputContracts.usedVariables(exprAst), dataType(v), v.scale(),
                v.domainId() == null ? null : String.valueOf(v.domainId()), agg, prio, resGrp, grpCond, grpCondAst, v.seq());
    }

    private static RuleCell cell(RuleVar var, ResolvedVar resolved, Map<String, Object> c) {
        RuleCell bare = new RuleCell(str(c.get("op")), str(c.get("left")), str(c.get("right")), strings(c.get("list")), str(c.get("expr")),
                astOf(c.get("ast")), str(c.get("val")), null);
        String text;
        if (var.varKind() == VarKind.RESULT) {
            text = CellTextGenerator.resultText(bare, var.dataType());
        } else {
            boolean opCell = bare.op() != null && !bare.op().equals("NA");
            String subject = !opCell ? null : var.varName() == null && var.exprText() == null
                    ? ReservedNames.EXPR_VAR_PREFIX + var.varId() : CellTextGenerator.subject(var);
            text = CellTextGenerator.conditionText(bare, subject, var.dataType(), "CODE_IN".equals(bare.op()) ? resolved.maruCodeId() : null);
        }
        return new RuleCell(bare.op(), bare.left(), bare.right(), bare.list(), bare.expr(), bare.ast(), bare.val(), text);
    }

    private static Function<String, VarType> typeResolver(List<ResolvedVar> vars, Function<String, VarType> externalType) {
        Map<String, ResolvedVar> byName = new HashMap<>();
        for (ResolvedVar v : vars) {
            if (v.varName() != null && !v.exprVar()) {
                byName.put(v.varName().toUpperCase(Locale.ROOT), v);
            }
        }
        return name -> {
            ResolvedVar v = byName.get(name.toUpperCase(Locale.ROOT));
            if (v != null) {
                return new VarType(name, dataType(v), v.scale(), v.domainId() == null ? null : String.valueOf(v.domainId()));
            }
            VarType t = externalType.apply(name);
            return t != null ? t : new VarType(name, DataType.STRING, null, null);
        };
    }

    private static DataType dataType(ResolvedVar v) {
        return v.dataType() == null ? DataType.STRING : DataType.valueOf(v.dataType());
    }

    private static Map<String, Object> map(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return JSON.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("저장된 AST 를 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    private static List<String> list(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return JSON.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("저장된 우선순위 목록을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> astOf(Object ast) {
        return ast instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    private static List<String> strings(Object list) {
        return list instanceof List<?> l ? l.stream().map(x -> x == null ? null : x.toString()).toList() : null;
    }

    private static String str(Object value) {
        return value == null ? null : value.toString();
    }
}
