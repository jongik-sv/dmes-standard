package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 코드 참조(06:338) — 코드 도메인 변수의 {@code EQ}·{@code NE}·{@code IN}·{@code NOT_IN} 값이 그 마루 코드에 있는지 {@code MASTER(id, cate, key)} 와
 * 같은 판정(마루 코드 해석기, 카테고리 = 도메인의 유효 코드 참조, 없으면 BASE)으로 등록 시각에 본다. 없으면 경고만 한다(미래 적용 코드).
 * {@code CODE_IN} 값이 그 마루 코드의 카테고리가 아니면 거부한다(I16). 해석기는 검사 안에서만 만들고 빈으로 등록하지 않는다(D7, D-077).
 */
@Component
@Order(4)
public class CodeReferenceCheck implements RuleSaveCheck {

    private static final Set<String> VALUE_OPS = Set.of("EQ", "NE", "IN", "NOT_IN");

    private final MasterCodeLedgerQueries ledger;
    private final MdmEffectiveDomainResolver domains;
    private final Clock clock;

    public CodeReferenceCheck(MasterCodeLedgerQueries ledger, MdmEffectiveDomainResolver domains, Clock clock) {
        this.ledger = ledger;
        this.domains = domains;
        this.clock = clock;
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        CodeResolver codes = new DefaultCodeResolver(new MdmCodeLookup(ledger), CodeEffLookup.NONE);
        LocalDateTime at = LocalDateTime.now(clock);
        Map<Long, Optional<String>> cateByDomain = new HashMap<>();
        Map<String, List<String>> catesByCode = new HashMap<>();
        for (LedgerCells.Cell c : LedgerCells.cells(ctx)) {
            ResolvedVar var = c.var();
            String codeId = var.maruCodeId();
            if (codeId == null || !"COND".equals(var.varKind())) {
                continue;
            }
            String op = c.op();
            if ("CODE_IN".equals(op)) {
                String cate = str(c.cell().get("left"));
                List<String> cates = catesByCode.computeIfAbsent(codeId, id -> ledger.cates(id).stream().map(r -> r.cateId()).toList());
                if (cate != null && !cates.contains(cate)) {
                    out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.CODE_CATE_MISSING, RuleCheckReport.ERROR, c.row().rowId(), var,
                            "카테고리 " + cate + " 이(가) 마루 코드 " + codeId + " 에 없다"));
                }
                continue;
            }
            if (!VALUE_OPS.contains(op)) {
                continue;
            }
            String cate = var.domainId() == null ? null : cateByDomain.computeIfAbsent(var.domainId(), this::cateOf).orElse(null);
            for (String value : LedgerCells.conditionValues(c.cell())) {
                if (!codes.isMember(codeId, cate, value, at)) {
                    out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.CODE_VALUE_MISSING, RuleCheckReport.WARNING, c.row().rowId(), var,
                            "값 " + value + " 이(가) 마루 코드 " + codeId + (cate == null ? "" : "·" + cate) + " 에 지금(" + at + ") 없다"));
                }
            }
        }
        return out;
    }

    private Optional<String> cateOf(Long domainId) {
        try {
            MdmEffectiveDomain d = domains.resolve(domainId);
            return d == null || d.effectiveCodeRef() == null ? Optional.empty() : Optional.ofNullable(d.effectiveCodeRef().cateId());
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }
}
