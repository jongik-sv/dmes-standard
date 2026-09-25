package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * MDM 참조(06:339) — Expression 셀·결과 식 셀의 {@code ast}, 식 변수 {@code VAR_AST}, 결과 열 조건 {@code GRP_COND_AST} 를 훑어
 * {@code MASTER(id, cate, key[, attr])}·{@code MASTER_AT(id, cate, key, ts[, attr])} 의 대상 ID 가 TB_MDM_CODE 또는 TB_MDM_DATA 에 있고,
 * 카테고리가 그 아래 있고, {@code attr} 이 있으면 그 대상의 그 번호에 라벨이 있는지 본다. 어긋나면 거부한다(I17). 인자 수·리터럴 모양은
 * {@code ExpressionChecker} 가 이미 보므로 리터럴이 아닌 인자는 건너뛴다.
 */
@Component
@Order(5)
public class MasterReferenceCheck implements RuleSaveCheck {

    private static final Pattern ATTR = Pattern.compile("attr(\\d{2})", Pattern.CASE_INSENSITIVE);

    private final RuleLedgerReads reads;

    public MasterReferenceCheck(RuleLedgerReads reads) {
        this.reads = reads;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (LedgerCells.Cell c : LedgerCells.cells(ctx)) {
            if (c.cell().get("ast") instanceof Map<?, ?> ast) {
                walk(ast, (code, message) -> out.add(RuleCheckReport.cellIssue(code, RuleCheckReport.ERROR, c.row().rowId(), c.var(), message)));
            }
        }
        for (MdmRuleVar v : ctx.rawVars()) {
            for (String json : new String[] {v.getVarAst(), v.getGrpCondAst()}) {
                if (json != null && !json.isBlank()) {
                    String where = "열 " + (v.getLabel() != null && !v.getLabel().isBlank() ? v.getLabel() : v.getVarName());
                    walk(DomainJson.readMap(json), (code, message) -> out.add(RuleCheckReport.issue(code.name(), RuleCheckReport.ERROR, List.of(),
                            v.getVarId(), where + ": " + message)));
                }
            }
        }
        return out;
    }

    private void walk(Map<?, ?> node, BiConsumer<RuleSaveIssueCode, String> problem) {
        if (node == null) {
            return;
        }
        List<?> params = node.get("params") instanceof List<?> p ? p : List.of();
        String fn = "FUNCTION".equals(node.get("type")) && node.get("value") != null ? String.valueOf(node.get("value")).toUpperCase(Locale.ROOT) : "";
        if (fn.equals("MASTER") || fn.equals("MASTER_AT")) {
            int attrAt = fn.equals("MASTER") ? 3 : 4;
            check(fn, literal(params, 0), literal(params, 1), params.size() > attrAt ? literal(params, attrAt) : null, problem);
        }
        for (Object child : params) {
            if (child instanceof Map<?, ?> m) {
                walk(m, problem);
            }
        }
    }

    private void check(String fn, String id, String cate, String attr, BiConsumer<RuleSaveIssueCode, String> problem) {
        if (id == null) {
            return;
        }
        boolean code = reads.codeExists(id);
        if (!code && !reads.dataExists(id)) {
            problem.accept(RuleSaveIssueCode.MASTER_TARGET_MISSING, fn + " 대상 " + id + " 이(가) TB_MDM_CODE·TB_MDM_DATA 에 없다");
            return;
        }
        if (cate != null && !(code ? reads.codeCateExists(id, cate) : reads.dataCateExists(id, cate))) {
            problem.accept(RuleSaveIssueCode.MASTER_CATE_MISSING, fn + " 카테고리 " + cate + " 이(가) " + id + " 에 없다");
        }
        if (attr != null) {
            Matcher m = ATTR.matcher(attr);
            int no = m.matches() ? Integer.parseInt(m.group(1)) : 0;
            if (no < 1 || no > 10) {
                problem.accept(RuleSaveIssueCode.MASTER_ATTR_LABEL_MISSING, fn + " attr 인자 " + attr + " 은(는) attr01-attr10 중 하나여야 한다");
            } else if (reads.attrName(code, id, no) == null) {
                problem.accept(RuleSaveIssueCode.MASTER_ATTR_LABEL_MISSING, fn + " " + id + " 의 " + attr + " 에 라벨이 없다");
            }
        }
    }

    private static String literal(List<?> params, int i) {
        if (i >= params.size() || !(params.get(i) instanceof Map<?, ?> p) || !"STRING_LITERAL".equals(p.get("type"))) {
            return null;
        }
        return p.get("value") == null ? null : String.valueOf(p.get("value"));
    }
}
