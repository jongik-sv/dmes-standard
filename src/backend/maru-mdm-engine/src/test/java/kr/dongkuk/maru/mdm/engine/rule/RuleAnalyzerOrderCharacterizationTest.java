package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.Ex;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.L;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.O;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.R;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.S;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.col;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.num;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.r;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.row;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.rows;
import static kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzerTest.rule;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import org.junit.jupiter.api.Test;

/**
 * {@link RuleAnalyzer#analyze} 특성 테스트(리팩토링 항목 7) — 한 표에서 여러 단계 이슈가 함께 날 때의 순서와 문구까지 고정한다.
 * 기존 {@link RuleAnalyzerTest}·analysis-corpus 는 message 를 뺀 여섯 칸만 보고, 한 사례에 4종 이상이 함께 나는 경우가 없다.
 * 비어 있는 셀(cells 에 열 키가 없음)·Equal 열 EQ 요약·Expression 열 이름 대체·값 빈틈 묶음 건너뛰기도 여기서만 닿는다.
 */
class RuleAnalyzerOrderCharacterizationTest {

    /** "code|severity|rowIds|varId|lower|upper|message". */
    private static List<String> issues(AnalysisRule rule) {
        return RuleAnalyzer.analyze(rule).stream()
                .map(i -> i.code() + "|" + i.severity() + "|" + i.rowIds() + "|" + i.varId() + "|" + i.lower() + "|" + i.upper() + "|" + i.message())
                .toList();
    }

    @Test
    void FIRST_표의_여섯_단계_이슈는_ALL_NA_못푸는셀_겹침_도달불가_값빈틈_NULL빈틈_순서다() {
        // 3행(전부 NA)은 ALL_NA_ROW 로 빠지고 NULL 빈틈 판정에도 들지 않는다. 1·2·5·6행은 V2 가 A 로 같아 V1 값 빈틈 묶음 하나다.
        AnalysisRule x = rule(HitPolicy.FIRST, List.of(num(1, DispType.TWO, 1), col(2, DataType.STRING)), rows(
                r(R("<= 변수 <=", "0", "1"), L("IN", "A")),
                r(R("<= 변수 <=", "0.2", "0.5"), S("EQ", "A")),
                r(O("NA"), O("NA")),
                r(R("<= 변수 <=", "2", "3"), S("CONTAINS", "X")),
                r(R("<= 변수 <=", "2.5", "4"), L("IN", "A")),
                r(R("<= 변수 <=", "5", "6"), L("IN", "A"))));
        assertEquals(List.of(
                "ALL_NA_ROW|ERROR|[3]|null|null|null|3행의 조건 셀이 모두 - 다",
                "UNRESOLVED_CELL|WARNING|[4]|2|null|null|4행 V2 셀은 화면에서 겹침을 풀 수 없다(CONTAINS X)",
                "OVERLAP|WARNING|[1, 2]|null|null|null|1행·2행이 겹친다(V1: 0 <= 변수 <= 1 / 0.2 <= 변수 <= 0.5, V2: IN (A) / = A)",
                "OVERLAP_UNRESOLVED|WARNING|[4, 5]|null|null|null|4행·5행이 겹칠 수 있다",
                "UNREACHABLE|WARNING|[2, 1]|null|null|null|2행은 앞 행에 모두 덮여 적중하지 않는다",
                "VALUE_GAP|WARNING|[1, 2, 5, 6]|1|1.1|2.4|V1: 1.1 ~ 2.4 에 맞는 행이 없다",
                "VALUE_GAP|WARNING|[1, 2, 5, 6]|1|4.1|4.9|V1: 4.1 ~ 4.9 에 맞는 행이 없다",
                "NULL_GAP|WARNING|[]|1|null|null|V1 이(가) NULL 이면 맞는 행이 없다",
                "NULL_GAP|WARNING|[]|2|null|null|V2 이(가) NULL 이면 맞는 행이 없다"), issues(x));
    }

    @Test
    void UNIQUE_겹침_문구는_열마다_두_행_요약이고_Equal_열_EQ_는_값만_쓰며_빈_셀은_NULL_을_덮지_않는다() {
        // 3행은 V1 셀이 없다(cells 에 키 없음): 못 푸는 셀 이슈는 없고, 겹침은 정할 수 없으며, 빈틈 묶음 키는 따로다.
        AnalysisVar v1 = new AnalysisVar(1, VarKind.COND, DispType.EQUAL, 1, "V1", false,
                DataType.STRING, null, false, null);
        AnalysisVar v2 = num(2, DispType.ONE, 0);
        AnalysisRule x = new AnalysisRule("T", RuleKind.DECISION, HitPolicy.UNIQUE, List.of(v1, v2), List.of(
                row(1, 1, Map.of(1, S("EQ", "A"), 2, S("GE", "1"))),
                row(2, 2, Map.of(1, S("EQ", "A"), 2, S("LT", "5"))),
                row(3, 3, Map.of(2, S("EQ", "3")))));
        assertEquals(List.of(
                "OVERLAP|ERROR|[1, 2]|null|null|null|1행·2행이 겹친다(V1: A / A, V2: >= 1 / < 5)",
                "OVERLAP_UNRESOLVED|WARNING|[1, 3]|null|null|null|1행·3행이 겹칠 수 있다",
                "OVERLAP_UNRESOLVED|WARNING|[2, 3]|null|null|null|2행·3행이 겹칠 수 있다",
                "NULL_GAP|WARNING|[]|1|null|null|V1 이(가) NULL 이면 맞는 행이 없다",
                "NULL_GAP|WARNING|[]|2|null|null|V2 이(가) NULL 이면 맞는 행이 없다"), issues(x));
    }

    @Test
    void 못_푸는_셀은_행_다음_열_순이고_Expression_열은_이름_대신_밑줄_V_를_쓰며_못_푸는_칸이_낀_묶음은_값_빈틈을_건너뛴다() {
        // 2행 V1 이 숫자가 아니라 못 푸는 셀이다 — 1·2·3행이 한 묶음이라 (1,5) 빈틈을 내지 않는다.
        AnalysisRule x = rule(HitPolicy.UNIQUE,
                List.of(num(1, DispType.ONE, 0), col(2, DataType.STRING), col(3, DataType.BOOLEAN, DispType.EXPRESSION, null, false)),
                rows(
                        r(R("<= 변수 <=", "0", "1"), L("IN", "A"), Ex("X > 0")),
                        r(S("GT", "abc"), L("IN", "A"), Ex("X > 0")),
                        r(R("<= 변수 <=", "5", "6"), L("IN", "A"), Ex("X > 0"))));
        assertEquals(List.of(
                "UNRESOLVED_CELL|WARNING|[1]|3|null|null|1행 _V3 셀은 화면에서 겹침을 풀 수 없다(X > 0)",
                "UNRESOLVED_CELL|WARNING|[2]|1|null|null|2행 V1 셀은 화면에서 겹침을 풀 수 없다(> abc)",
                "UNRESOLVED_CELL|WARNING|[2]|3|null|null|2행 _V3 셀은 화면에서 겹침을 풀 수 없다(X > 0)",
                "UNRESOLVED_CELL|WARNING|[3]|3|null|null|3행 _V3 셀은 화면에서 겹침을 풀 수 없다(X > 0)",
                "OVERLAP_UNRESOLVED|WARNING|[1, 2]|null|null|null|1행·2행이 겹칠 수 있다",
                "OVERLAP_UNRESOLVED|WARNING|[2, 3]|null|null|null|2행·3행이 겹칠 수 있다",
                "NULL_GAP|WARNING|[]|1|null|null|V1 이(가) NULL 이면 맞는 행이 없다",
                "NULL_GAP|WARNING|[]|2|null|null|V2 이(가) NULL 이면 맞는 행이 없다"), issues(x));
    }
}
