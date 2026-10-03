package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;
import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 도메인 범위(06:337) — 셀 리터럴 값(조건 op-code 셀의 비교·경계·목록 값, 결과 Value 셀)마다 변수 도메인의 유효 표준 식을 {@code value} 하나로
 * 평가해(G12, {@code DefaultDomainValidator} 와 같은 방식) 참이 아니면 경고한다. CODE 종류는 건너뛰고 비즈니스 식은 평가하지 않는다(I16).
 * String 의 {@code =} 패턴 값(막지 않은 {@code %}·{@code _})은 값 하나가 아니라 보지 않는다.
 */
@Component
@Order(3)
public class DomainRangeCheck implements RuleSaveCheck {

    private static final Pattern WILDCARD = Pattern.compile("(?<!\\\\)[%_]");

    private final MdmEffectiveDomainResolver domains;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public DomainRangeCheck(MdmEffectiveDomainResolver domains, MdmEvaluator evaluator, Clock clock) {
        this.domains = domains;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<Long, Optional<String>> stdByDomain = new HashMap<>();
        Instant ts = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        for (LedgerCells.Cell c : LedgerCells.cells(ctx)) {
            ResolvedVar var = c.var();
            if (var.domainId() == null || var.maruCodeId() != null || var.exprVar()) {
                continue;
            }
            List<String> values = values(c);
            if (values.isEmpty()) {
                continue;
            }
            Optional<String> std = stdByDomain.computeIfAbsent(var.domainId(), this::standardExpr);
            if (std.isEmpty()) {
                continue;
            }
            for (String value : values) {
                if (!passes(std.get(), typed(var.dataType(), value), ts)) {
                    out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.DOMAIN_RANGE, RuleCheckReport.WARNING, c.row().rowId(), var,
                            "값 " + value + " 이(가) 도메인 " + (var.domainName() == null ? var.domainId() : var.domainName()) + " 의 표준 식 '"
                                    + std.get() + "' 을(를) 통과하지 못한다 — 참이 될 수 없는 셀인지 확인한다"));
                }
            }
        }
        return out;
    }

    private List<String> values(LedgerCells.Cell c) {
        if ("RESULT".equals(c.var().varKind())) {
            String val = str(c.cell().get("val"));
            return val == null || val.isBlank() || c.cell().get("expr") != null ? List.of() : List.of(val);
        }
        boolean string = !"NUMBER".equals(c.var().dataType()) && !"BOOLEAN".equals(c.var().dataType());
        if (string && "EQ".equals(c.op()) && WILDCARD.matcher(String.valueOf(c.cell().get("left"))).find()) {
            return List.of();
        }
        return LedgerCells.conditionValues(c.cell());
    }

    /** CODE 종류(유효 코드 참조가 있는 도메인)·표준 식 없음·도메인 없음은 빈 값. */
    private Optional<String> standardExpr(Long domainId) {
        MdmEffectiveDomain d;
        try {
            d = domains.resolve(domainId);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        if (d == null || d.effectiveCodeRef() != null || d.effectiveStdExpr() == null || d.effectiveStdExpr().isBlank()) {
            return Optional.empty();
        }
        return Optional.of(d.effectiveStdExpr());
    }

    private boolean passes(String std, Object value, Instant ts) {
        Map<String, Object> ctx = new HashMap<>();
        ctx.put(ReservedNames.DOMAIN_VALUE, value);
        try {
            EvaluationValue v = evaluator.evaluate(std, ctx, ts);
            return v.isBooleanValue() && v.getBooleanValue();
        } catch (Exception e) {
            return false;
        }
    }

    private static Object typed(String dataType, String value) {
        if ("NUMBER".equals(dataType)) {
            try {
                return new BigDecimal(value.trim());
            } catch (NumberFormatException e) {
                return value;
            }
        }
        if ("BOOLEAN".equals(dataType)) {
            return Boolean.valueOf(value.trim().toUpperCase(Locale.ROOT).equals("TRUE"));
        }
        return value;
    }
}
