package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads.Names;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 룰 세트 순서(06:327, TSK-08-04 design §6.4). 이 룰을 담은 INUSE 세트마다 이 룰은 저장하려는 정의, 나머지 룰은 최신 RELEASED 버전으로
 * 읽는 이름·만드는 이름({@link RuleDefinitionReads})을 견준다. RELEASED 가 없는 룰은 건너뛴다(판정 시 입력 키 확인이 잡는다).
 * 이 룰이 뒤 룰의 결과를 읽거나 앞 룰이 이 룰의 결과를 읽으면 SET_ORDER, 두 룰이 서로의 결과를 읽으면 위치와 무관하게 SET_CYCLE 하나(ERROR),
 * 같은 결과 변수를 두 룰이 대입하면 SET_DUP_RESULT(WARNING).
 */
@Component
@Order(1)
public class RuleSetOrderCheck implements RuleSaveCheck {

    private final RuleQueries queries;

    public RuleSetOrderCheck(RuleQueries queries) {
        this.queries = queries;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Names self = RuleDefinitionReads.of(ctx.rawVars(), LedgerCells.rowCells(ctx.rows()));
        String me = ctx.ruleId();
        for (MdmRuleSet set : queries.allSets()) {
            if (!"INUSE".equals(set.getStatus())) {
                continue;
            }
            List<String> members = new ArrayList<>(new LinkedHashSet<>(DomainJson.readList(set.getRuleIds()).stream().map(String::valueOf).toList()));
            int i = members.indexOf(me);
            if (i < 0) {
                continue;
            }
            String s = set.getMaruRuleSetId();
            Map<String, Integer> released = queries.latestReleasedVers(members);
            for (int j = 0; j < members.size(); j++) {
                String other = members.get(j);
                if (j == i || !released.containsKey(other)) {
                    continue;
                }
                int ver = released.get(other);
                Names o = RuleDefinitionReads.of(queries.vars(other, ver),
                        queries.rows(other, ver).stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList());
                Set<String> readsOther = common(self.reads(), o.produces());
                Set<String> readByOther = common(self.produces(), o.reads());
                if (!readsOther.isEmpty() && !readByOther.isEmpty()) {
                    out.add(error(RuleSaveIssueCode.SET_CYCLE, "세트 " + s + ": " + me + "와(과) " + other + "가 서로의 결과를 읽는다(" + me + " ← "
                            + readsOther + ", " + other + " ← " + readByOther + ") — 순서로 풀리지 않는 순환이다"));
                } else if (!readsOther.isEmpty() && j > i) {
                    out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": " + me + "이(가) 뒤에 있는 " + other + "의 결과 " + readsOther
                            + "를 읽는다. " + other + "를 앞으로 옮긴다"));
                } else if (!readByOther.isEmpty() && j < i) {
                    out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": 앞에 있는 " + other + "이(가) 이 룰의 결과 " + readByOther
                            + "를 읽는다. 이 룰을 " + other + " 앞으로 옮긴다"));
                }
                Set<String> dup = common(self.produces(), o.produces());
                if (!dup.isEmpty()) {
                    out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_DUP_RESULT.name(), RuleCheckReport.WARNING, List.of(), null,
                            "세트 " + s + ": " + other + "도 결과 " + dup + "를 대입한다"));
                }
            }
        }
        return out;
    }

    private static Map<String, Object> error(RuleSaveIssueCode code, String message) {
        return RuleCheckReport.issue(code.name(), RuleCheckReport.ERROR, List.of(), null, message);
    }

    private static Set<String> common(Set<String> a, Set<String> b) {
        Set<String> out = new LinkedHashSet<>(a);
        out.retainAll(b);
        return out;
    }
}
