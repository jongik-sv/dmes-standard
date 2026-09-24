package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.List;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.testsupport.DomainFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1·§6.5 — {@code STR_MATCHES} 정규식 저장 검사(06:346, evalex-guide §7).
 * Java 전용 문법·중첩 수량자·Java 문법 오류를 거부한다. 화면 {@code RegExp} 와 같은 뜻으로 읽히는 패턴만 받는다.
 */
class RegexPolicyTest {

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            // 인라인 플래그
            "(?i)abc", "(?i:abc)",
            // 소유 한정자
            "a++", "a*+", "a?+", "a{2,}+",
            // 원자 그룹
            "(?>ab)",
            // Java 전용 이스케이프
            "\\Qa.b\\E", "\\Aabc", "abc\\z", "abc\\Z", "\\Gabc", "\\p{Lu}",
            // 문자 클래스 교집합
            "[a-z&&[^b]]",
            // 중첩 수량자
            "(a+)+", "(a*)*", "(\\w+\\s?)+", "([a-z]+)*$", "(a{1,})+",
            // Java 문법 오류
            "["})
    void 거부하는_패턴(String pattern) {
        assertFalse(RegexPolicy.violations(pattern).isEmpty(), pattern + " 를 받았다");
    }

    static Stream<String> 받는_패턴_목록() {
        return Stream.of(DomainFixtures.DATE_REGEX, "^[A-Z0-9]{10,20}$", "^(S|B)$", "^KR$", "(a{2})+", "[+*?]+",
                "\\+\\*", "^(?:ab|cd){1,3}$");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("받는_패턴_목록")
    void 받는_패턴(String pattern) {
        assertEquals(List.of(), RegexPolicy.violations(pattern));
    }

    private static final ExpressionChecker CHECKER = new ExpressionChecker(new MdmEvaluator(InMemoryLookups.create().build()));

    private static List<String> kinds(List<Problem> problems) {
        return problems.stream().map(Problem::kind).toList();
    }

    @Test
    void STR_MATCHES_리터럴에_Java_전용_문법이_있으면_검사가_거부한다() {
        assertEquals(List.of(ExpressionChecker.REGEX), kinds(CHECKER.check("STR_MATCHES(value, \"(?i)a\")", Slot.DOMAIN_STD)));
    }

    @Test
    void STR_MATCHES_패턴이_리터럴이_아니면_거부한다() {
        assertEquals(List.of(ExpressionChecker.REGEX), kinds(CHECKER.check("STR_MATCHES(value, PAT)", Slot.RULE_COND_EXPR)));
    }
}
