package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import com.ezylang.evalex.data.EvaluationValue;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.ValidationResult;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.expr.ValueConversionException;
import kr.dongkuk.maru.mdm.engine.expr.ValueConverter;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;
import org.springframework.stereotype.Component;

/**
 * 테스트 케이스·예시 값·미리보기 판정(TSK-04-03 design.md §3.4·§3.5). 판정은 엔진 {@link DefaultDomainValidator} 의미를 그대로
 * 쓴다 — 공백→NULL→필수→타입 변환→유효 표준식(CODE 는 자동 MASTER)→요구 변수→유효 비즈니스식(불변 I15). 검증기는 도메인마다
 * 새로 만들고 합성 {@link DefinitionLookup} 한 칼럼만 준다.
 *
 * <p>평가는 엔진이 가상 스레드에서 하므로 DB 를 부르지 않는 순수 계산이다 — 필요한 값은 호출자가 스냅샷으로 먼저 읽는다(I11).
 * 서버 {@code CodeLookup} 이 없고 식에 MASTER 가 있거나 CODE 종류면 기대값과 비교하지 않고 UNDECIDED(D2).
 */
@Component
public class DomainTestCaseRunner {

    /** 합성 정의의 테이블 이름. */
    public static final String TEST_TABLE = "DOMAIN_TEST";

    private final MdmEvaluator evaluator;
    private final MdmCodeLookupAvailability availability;
    private final Clock clock;

    public DomainTestCaseRunner(MdmEvaluator evaluator, MdmCodeLookupAvailability availability, Clock clock) {
        this.evaluator = evaluator;
        this.availability = availability;
        this.clock = clock;
    }

    /** @param result MATCH·MISMATCH·UNDECIDED·ERROR */
    public record CaseResult(String result, Boolean actual, String message) {}

    public CaseResult run(EffectiveDomainView view, String column, DomainTestCase c) {
        if (c.problem() != null) {
            return new CaseResult("ERROR", null, c.problem());
        }
        if (undecided(view)) {
            return new CaseResult("UNDECIDED", null, DomainIssueCode.W02.label());
        }
        Map<String, Object> record = new HashMap<>();
        if (c.vars() != null) {
            record.putAll(c.vars());
        }
        record.put(column, c.value());
        ColumnDefinition def = definition(view, column, view.chainStdExpr(), view.bizExpr(), view.bizRequiredVars(),
                view.codeRef(), kind(view.domainKind()));
        try {
            ValidationResult r = new DefaultDomainValidator(single(def), evaluator)
                    .validate(TEST_TABLE, column, record, Instant.now(clock));
            String message = r.failures().stream().map(f -> f.step() + ": " + f.message()).collect(Collectors.joining("; "));
            return new CaseResult(Boolean.valueOf(r.valid()).equals(c.expect()) ? "MATCH" : "MISMATCH", r.valid(), message);
        } catch (EngineEvaluationException e) {
            return new CaseResult("ERROR", null, e.getMessage());
        }
    }

    /** 서버 코드 원장이 없고 CODE 이거나 유효 AST 에 MASTER·MASTER_AT 이 있으면 판정 불가(D2). */
    public boolean undecided(EffectiveDomainView view) {
        if (availability.available()) {
            return false;
        }
        return "CODE".equals(view.domainKind()) || hasMaster(view.stdAst()) || hasMaster(view.bizAst());
    }

    /**
     * R03·W03 — 자기 식을 예시 값·테스트 케이스 값으로 한 번씩 평가해 결과가 불린도 NULL 도 아니면 R03. 식이 있는데 예시도
     * 케이스도 없으면 W03. 비즈니스식은 케이스 변수가 요구 변수를 다 갖춘 경우만 평가한다.
     */
    public List<DomainIssue> checkResultTypes(DomainDraft d) {
        List<DomainIssue> out = new ArrayList<>();
        if (d.stdRule() == null && d.bizRule() == null) {
            return out;
        }
        if (d.examples().isEmpty() && d.testCases().isEmpty()) {
            out.add(DomainIssue.of(DomainIssueCode.W03, null, null));
            return out;
        }
        DataType type = dataType(d.dataType());
        List<Sample> samples = new ArrayList<>();
        d.examples().forEach(v -> samples.add(new Sample(v, Map.of())));
        d.testCases().stream().filter(c -> c.value() != null && !c.value().isBlank())
                .forEach(c -> samples.add(new Sample(c.value(), c.vars() == null ? Map.of() : c.vars())));
        boolean stdBad = false;
        boolean bizBad = false;
        for (Sample s : samples) {
            Object value;
            try {
                value = type == null ? s.value() : ValueConverter.convert(s.value(), type);
            } catch (ValueConversionException e) {
                continue;
            }
            Map<String, Object> ctx = new HashMap<>(s.vars());
            ctx.put(ReservedNames.DOMAIN_VALUE, value);
            if (!stdBad && d.stdRule() != null && notBoolean(d.stdRule(), ctx)) {
                stdBad = true;
                out.add(DomainIssue.of(DomainIssueCode.R03, "STD_RULE", "입력 " + s.value()));
            }
            if (!bizBad && d.bizRule() != null && hasAllVars(d.bizRule(), s.vars()) && notBoolean(d.bizRule(), ctx)) {
                bizBad = true;
                out.add(DomainIssue.of(DomainIssueCode.R03, "BIZ_RULE", "입력 " + s.value()));
            }
        }
        return out;
    }

    /**
     * 서버 미리보기 한 번(action {@code execute}) — 표준·비즈니스를 따로 판정한다. {@code RESULT} 는 {@code true|false|UNDECIDED|ERROR},
     * 식이 없으면 그 칸은 null. {@code valid} 는 판정 불가가 있으면 null, {@code step} 은 첫 실패 단계.
     */
    public Map<String, Object> preview(EffectiveDomainView view, String column, String value, Map<String, Object> vars) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> record = new HashMap<>(vars);
        record.put(column, value);
        boolean hasStd = view.chainStdExpr() != null || ("CODE".equals(view.domainKind()) && view.codeRef() != null);
        Judged std = null;
        if (hasStd) {
            std = hasMaster(view.stdAst()) && !availability.available() || "CODE".equals(view.domainKind()) && !availability.available()
                    ? Judged.undecided()
                    : judge(definition(view, column, view.chainStdExpr(), null, List.of(), view.codeRef(), kind(view.domainKind())), column, record);
        }
        Judged biz = null;
        if (view.bizExpr() != null) {
            biz = hasMaster(view.bizAst()) && !availability.available()
                    ? Judged.undecided()
                    : judge(definition(view, column, null, view.bizExpr(), view.bizRequiredVars(), null, DomainKind.TEXT), column, record);
        }
        out.put("std", std == null ? null : std.toRow());
        out.put("biz", biz == null ? null : biz.toRow());
        boolean undecided = (std != null && std.result.equals("UNDECIDED")) || (biz != null && biz.result.equals("UNDECIDED"));
        boolean failed = (std != null && std.failed()) || (biz != null && biz.failed());
        out.put("valid", undecided && !failed ? null : !failed);
        out.put("step", std != null && std.step != null ? std.step : biz == null ? null : biz.step);
        return out;
    }

    private Judged judge(ColumnDefinition def, String column, Map<String, Object> record) {
        try {
            ValidationResult r = new DefaultDomainValidator(single(def), evaluator)
                    .validate(TEST_TABLE, column, record, Instant.now(clock));
            if (r.valid()) {
                return new Judged("true", null, null);
            }
            var f = r.failures().get(0);
            return new Judged("false", f.step().name(), f.message());
        } catch (EngineEvaluationException e) {
            return new Judged("ERROR", "ERROR", e.getMessage());
        }
    }

    private record Judged(String result, String step, String message) {
        static Judged undecided() {
            return new Judged("UNDECIDED", null, DomainIssueCode.W02.label());
        }

        boolean failed() {
            return result.equals("false") || result.equals("ERROR");
        }

        Map<String, Object> toRow() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("RESULT", result);
            m.put("MESSAGE", message);
            return m;
        }
    }

    private record Sample(String value, Map<String, Object> vars) {}

    private boolean notBoolean(String text, Map<String, Object> ctx) {
        try {
            EvaluationValue r = evaluator.evaluate(text, ctx, Instant.now(clock));
            return !r.isNullValue() && !r.isBooleanValue();
        } catch (ExpressionFailure e) {
            return false;
        }
    }

    private boolean hasAllVars(String bizRule, Map<String, Object> vars) {
        try {
            return evaluator.usedVariables(bizRule).stream()
                    .filter(v -> !v.equalsIgnoreCase(ReservedNames.DOMAIN_VALUE))
                    .allMatch(v -> vars.keySet().stream().anyMatch(k -> k.equalsIgnoreCase(v)));
        } catch (ExpressionFailure | IllegalStateException e) {
            return false;
        }
    }

    private static ColumnDefinition definition(EffectiveDomainView view, String column, String std, String biz,
                                               List<String> bizVars, DefinitionLookup.CodeRef codeRef, DomainKind kind) {
        DataType type = dataType(view.dataType());
        return new ColumnDefinition(TEST_TABLE, column, kind, type == null ? DataType.STRING : type, view.scale(), true,
                std, biz, bizVars, codeRef, null, null, null);
    }

    private static DefinitionLookup single(ColumnDefinition def) {
        return new DefinitionLookup() {
            @Override
            public Optional<ColumnDefinition> column(String table, String column) {
                return TEST_TABLE.equals(table) && def.column().equals(column) ? Optional.of(def) : Optional.empty();
            }

            @Override
            public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleSetDefinition> ruleSet(String setId) {
                return Optional.empty();
            }
        };
    }

    private static DomainKind kind(String k) {
        try {
            return k == null ? DomainKind.TEXT : DomainKind.valueOf(k);
        } catch (IllegalArgumentException e) {
            return DomainKind.TEXT;
        }
    }

    private static DataType dataType(String t) {
        try {
            return t == null ? null : DataType.valueOf(t.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    static boolean hasMaster(Map<String, Object> node) {
        if (node == null) {
            return false;
        }
        if ("FUNCTION".equals(node.get("type"))) {
            String name = String.valueOf(node.get("value")).toUpperCase(Locale.ROOT);
            if (name.equals("MASTER") || name.equals("MASTER_AT")) {
                return true;
            }
        }
        if (node.get("params") instanceof List<?> children) {
            for (Object c : children) {
                if (c instanceof Map<?, ?> m && hasMaster((Map<String, Object>) m)) {
                    return true;
                }
            }
        }
        return false;
    }
}
