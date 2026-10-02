package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions.Stored;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 입력 계약 변경(06:328) — 지금 RELEASED 버전(VER 최대)과 저장하려는 정의의 입력 계약({@code InputContracts})을 견준다. 필요 변수
 * (always ∪ 행별 필수·선택)가 늘거나, 선택이던 변수(어느 자리에서도 필수가 아니던 것)가 필수가 되면 경고한다. 막지는 않는다(I15).
 * 저장뿐 아니라 상신·확정(TSK-08-05, 적용 지점 STORED)에서도 돈다(06:232).
 */
@Component
@Order(2)
public class ContractChangeCheck implements RuleSaveCheck {

    private final StoredRuleDefinitions stored;
    private final RuleQueries queries;

    public ContractChangeCheck(StoredRuleDefinitions stored, RuleQueries queries) {
        this.stored = stored;
        this.queries = queries;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        BigDecimal releasedVer = queries.latestReleasedVers(List.of(ctx.ruleId())).get(ctx.ruleId());
        if (releasedVer == null || VersionNumbers.same(releasedVer, ctx.ver())) {
            return List.of();
        }
        Optional<Stored> released = stored.read(ctx.ruleId(), releasedVer);
        if (released.isEmpty()) {
            return List.of();
        }
        InputContract before = stored.assemble(ctx.ruleId(), ctx.ruleKind(), released.get()).definition().contract();
        InputContract after = RuleDefinitionAssembler.assemble(ctx.ruleId(), ctx.ver(), ctx.ruleKind(), ctx.hitPolicy(), null, null, ctx.rawVars(),
                ctx.vars(), LedgerCells.draftRows(ctx.rows()), stored.externalTypes(ctx.ruleId(), ctx.ver())).definition().contract();

        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> added = new LinkedHashSet<>(needed(after));
        added.removeAll(needed(before));
        if (!added.isEmpty()) {
            out.add(warning("입력 계약 변경: 지금 RELEASED 버전 " + VersionNumbers.label(releasedVer) + " 에 없던 입력 변수 " + added + " 이(가) 필요해진다"));
        }
        Set<String> promoted = new LinkedHashSet<>(needed(before));
        promoted.removeAll(required(before));
        promoted.retainAll(required(after));
        if (!promoted.isEmpty()) {
            out.add(warning("입력 계약 변경: 지금 RELEASED 버전 " + VersionNumbers.label(releasedVer) + " 에서 선택이던 입력 변수 " + promoted + " 이(가) 필수가 된다"));
        }
        return out;
    }

    private static Map<String, Object> warning(String message) {
        return RuleCheckReport.issue(RuleSaveIssueCode.CONTRACT_CHANGED.name(), RuleCheckReport.WARNING, List.of(), null, message);
    }

    private static Set<String> required(InputContract c) {
        Set<String> out = new LinkedHashSet<>();
        c.always().forEach(v -> out.add(v.name()));
        for (RowContract r : c.rows()) {
            r.required().forEach(v -> out.add(v.name()));
        }
        return out;
    }

    private static Set<String> needed(InputContract c) {
        Set<String> out = required(c);
        for (RowContract r : c.rows()) {
            for (VarType v : r.optional()) {
                out.add(v.name());
            }
        }
        return out;
    }
}
