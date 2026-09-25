package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.CHECKER;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.EVALUATOR;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.at;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cond;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.expr;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.exprColumn;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.issueCodes;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.na;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.op;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.range;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.result;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.row;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.val;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

/** TSK-08-04 design §2.2 「RuleSaveValidator」·§6.1 적용 지점 표·§7.1·§7.12 — 순서·적용 지점·거부 예외. */
class RuleSaveValidatorTest {

    private static final ResolvedVar THK = cond(1, "2", "COIL_THK", "NUMBER");
    private static final ResolvedVar EX = exprColumn(2, "두께 조건");
    private static final ResolvedVar GRD = result(3, 1, "Value", "QLTY_GRD", "STRING");
    private static final List<ResolvedVar> VARS = List.of(THK, EX, GRD);

    /** 이름 하나를 해석할 때 EXT_COL 만 컬럼 사전에 있다고 답한다. */
    private static RuleVarTypeResolver resolver() {
        RuleVarTypeResolver resolver = mock(RuleVarTypeResolver.class);
        when(resolver.resolve(anyString(), anyInt(), anyList())).thenAnswer(inv -> {
            List<MdmRuleVar> vars = inv.getArgument(2);
            String name = vars.get(0).getVarName();
            String source = "EXT_COL".equals(name) ? "COLUMN" : "UNRESOLVED";
            return List.of(new ResolvedVar(0, "COND", "Equal", 0, name, false, null, "STRING", null, false, null, null, null, source, null));
        });
        return resolver;
    }

    /** 부른 적용 지점을 적어 두는 검사 빈. */
    private static final class Recording implements RuleSaveCheck {
        private final Set<RuleSaveTarget> targets;
        private final List<RuleSaveContext> calls = new ArrayList<>();
        private final List<Map<String, Object>> answer;

        Recording(Set<RuleSaveTarget> targets, List<Map<String, Object>> answer) {
            this.targets = targets;
            this.answer = answer;
        }

        @Override
        public List<Map<String, Object>> check(RuleSaveContext context) {
            calls.add(context);
            return answer;
        }

        @Override
        public Set<RuleSaveTarget> targets() {
            return targets;
        }
    }

    @SuppressWarnings("unchecked")
    private static RuleSaveValidator validator(RuleSaveCheck... checks) {
        ObjectProvider<RuleSaveCheck> provider = mock(ObjectProvider.class);
        when(provider.orderedStream()).thenAnswer(inv -> Stream.of(checks));
        return new RuleSaveValidator(CHECKER, EVALUATOR, resolver(), provider);
    }

    private static RuleCheckInput input(String hit, RuleSaveTarget target, DraftRow... rows) {
        return new RuleCheckInput("R1", 2, "DECISION", hit, List.of(), VARS, List.of(rows), target);
    }

    private static DraftRow good(int rowId, int seq, String lower, String upper) {
        return row(rowId, seq, "NORMAL", at(1, range("<= 변수 <", lower, upper)), at(2, na()), at(3, val("A")));
    }

    @Test
    void 정규화한_셀로_생성해_보고_정규화한_행을_돌려준다() {
        RuleCheckReport report = validator().validate(input("FIRST", RuleSaveTarget.TABLE,
                row(-1, 1, "NORMAL", at(1, range("<= 변수 <", "2.5", "")), at(2, na()), at(3, val("A")))));
        assertEquals(List.of(), report.errors());
        assertEquals(Map.of("op", "GE", "left", "2.5"), report.normalizedRows().get(0).cells().get(1));
    }

    @Test
    void 식_셀의_참조_변수는_컬럼_사전과_이_룰의_조건_변수에서_찾는다() {
        RuleCheckReport ok = validator().validate(input("FIRST", RuleSaveTarget.TABLE,
                row(1, 1, "NORMAL", at(1, na()), at(2, expr("EXT_COL > COIL_THK")), at(3, val("A")))));
        assertEquals(List.of(), ok.errors());
        assertTrue(ok.normalizedRows().get(0).cells().get(2).containsKey("ast"), "서버 AST 를 싣는다");
        RuleCheckReport bad = validator().validate(input("FIRST", RuleSaveTarget.TABLE,
                row(1, 1, "NORMAL", at(1, na()), at(2, expr("NO_SUCH > 1")), at(3, val("A")))));
        assertEquals(List.of("EXPR_UNKNOWN_VAR"), issueCodes(bad.errors()));
    }

    @Test
    void 셀_오류가_있는_셀은_생성해_보지_않는다() {
        RuleCheckReport report = validator().validate(input("FIRST", RuleSaveTarget.TABLE,
                row(1, 1, "NORMAL", at(1, range("<= 변수 <", "2.5", "1.6")), at(2, na()), at(3, val("A")))));
        assertEquals(List.of("BOUND_ORDER"), issueCodes(report.issues()));
    }

    @Test
    void 도달_불가_행은_분석기_ERROR_로_거부한다() {
        RuleCheckReport report = validator().validate(input("FIRST", RuleSaveTarget.TABLE, good(1, 1, "1", "2"),
                row(2, 2, "NORMAL", at(1, na()), at(2, na()), at(3, val("B")))));
        assertTrue(report.hasErrors());
        assertTrue(issueCodes(report.errors()).contains("ALL_NA_ROW"));
        assertEquals(List.of(), report.nonAnalysisIssues());
    }

    @Test
    void UNIQUE_겹침은_거부하고_FIRST_겹침은_경고다() {
        RuleCheckReport unique = validator().validate(input("UNIQUE", RuleSaveTarget.TABLE, good(1, 1, "1", "3"), good(2, 2, "2", "4")));
        assertTrue(issueCodes(unique.errors()).contains("OVERLAP"));
        RuleCheckReport first = validator().validate(input("FIRST", RuleSaveTarget.TABLE, good(1, 1, "1", "3"), good(2, 2, "2", "4")));
        assertFalse(first.hasErrors());
        assertTrue(issueCodes(first.issues()).contains("OVERLAP"));
    }

    @Test
    void 미완성은_분석보다_먼저_거부하고_분석을_돌리지_않는다() {
        RuleCheckReport report = validator().validate(input("FIRST", RuleSaveTarget.TABLE,
                row(1, 1, "NORMAL", at(1, na()), at(3, val("A")))));
        assertEquals(List.of("INCOMPLETE_COND"), issueCodes(report.issues()));
    }

    @Test
    void 검사_빈은_적용_지점이_맞을_때만_부르고_기본_단계_ERROR_가_있으면_부르지_않는다() {
        Map<String, Object> warning = RuleCheckReport.issue("DOMAIN_RANGE", RuleCheckReport.WARNING, List.of(1), 1, "경고");
        Recording table = new Recording(EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.STORED), List.of(warning));
        Recording columns = new Recording(EnumSet.of(RuleSaveTarget.COLUMNS), List.of());
        RuleCheckReport report = validator(table, columns).validate(input("FIRST", RuleSaveTarget.TABLE, good(-1, 1, "1", "2")));
        assertEquals(1, table.calls.size());
        assertEquals(0, columns.calls.size());
        assertEquals(RuleSaveTarget.TABLE, table.calls.get(0).target());
        assertEquals("{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1\",\"right\":\"2\"},\"2\":{\"op\":\"NA\"},\"3\":{\"val\":\"A\"}}",
                table.calls.get(0).rows().get(0).cells());
        assertEquals(-1, table.calls.get(0).rows().get(0).rowId());
        assertFalse(report.hasErrors());
        assertEquals(List.of(warning), report.nonAnalysisIssues());

        validator(table, columns).validate(input("FIRST", RuleSaveTarget.TABLE, good(1, 1, "2", "1")));
        assertEquals(1, table.calls.size(), "BOUND_ORDER 가 있으면 빈을 부르지 않는다");
    }

    @Test
    void COLUMNS_는_기본_단계를_돌리지_않고_빈만_부른다() {
        Recording columns = new Recording(EnumSet.of(RuleSaveTarget.COLUMNS), List.of());
        Recording table = new Recording(EnumSet.of(RuleSaveTarget.TABLE), List.of());
        DraftRow incomplete = row(1, 1, "NORMAL", at(1, range("<= 변수 <", "2", "1")));
        RuleCheckReport report = validator(columns, table).validate(input("FIRST", RuleSaveTarget.COLUMNS, incomplete));
        assertEquals(List.of(), report.issues());
        assertEquals(1, columns.calls.size());
        assertEquals(0, table.calls.size());
        assertEquals(incomplete.cells(), report.normalizedRows().get(0).cells());
    }

    @Test
    void TEST_BODY_는_셀_식_생성만_돌려_깨진_행을_모은다() {
        Recording table = new Recording(EnumSet.of(RuleSaveTarget.TABLE), List.of());
        RuleCheckReport report = validator(table).validate(input("UNIQUE", RuleSaveTarget.TEST_BODY,
                good(1, 1, "1", "3"), good(2, 2, "2", "4"),
                row(-1, 3, "NORMAL", at(1, op("GE", "abc")), at(2, na()), at(3, val("A"))),
                row(-2, 4, "NORMAL", at(1, na()), at(3, val("A"))),
                row(-3, 5, "NORMAL", at(1, na()), at(2, expr("COIL_THK >")), at(3, val("A")))));
        assertEquals(Set.of(-1, -3), report.brokenRowIds());
        assertEquals(List.of("TYPE_LITERAL", "EXPR_PARSE"), issueCodes(report.issues()));
        assertEquals(0, table.calls.size());
    }

    @Test
    void 분석기가_예외를_던지면_ANALYSIS_FAILED_로_막는다() {
        RuleCheckInput bad = new RuleCheckInput("R1", 2, "DECISION", "NOPE", List.of(), VARS, List.of(good(1, 1, "1", "2")), RuleSaveTarget.TABLE);
        RuleCheckReport report = validator().validate(bad);
        assertEquals(List.of("ANALYSIS_FAILED"), issueCodes(report.errors()));
    }

    @Test
    void 거부_예외는_MDM021_에_ERROR_이슈만_싣는다() {
        List<Map<String, Object>> issues = List.of(
                RuleCheckReport.cellIssue(RuleSaveIssueCode.BOUND_ORDER, RuleCheckReport.ERROR, -1, THK, "하한이 상한보다 크다"),
                RuleCheckReport.issue("DOMAIN_RANGE", RuleCheckReport.WARNING, List.of(2), 1, "도메인 경고"),
                RuleCheckReport.issue("OVERLAP", RuleCheckReport.ERROR, List.of(1, 2), null, "겹친다"));
        BusinessException e = RuleSaveRejections.reject(issues);
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertEquals("룰 저장 거부: BOUND_ORDER 새 행 -1·COIL_THK: 하한이 상한보다 크다; OVERLAP 겹친다", e.getMessage());
        assertEquals(3, e.getErrors().size());
        assertEquals("MDM021", e.getErrors().get(0).code());
        assertEquals("row:-1", e.getErrors().get(1).rowKey());
        assertEquals("var:1", e.getErrors().get(1).field());
        assertEquals("row:1,2", e.getErrors().get(2).rowKey());
    }
}
