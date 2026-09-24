package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * 변경 분류와 저장 전 diff(TSK-04-03 design.md §3.3, D6, 불변 I9). 구조 칼럼이 하나라도 바뀌면 STRUCTURAL(S01 거부),
 * 값 정의 칼럼이 바뀌면 NARROW_OR_WIDEN(하위 재검사), 호환 칼럼만이면 COMPATIBLE, 신규는 NEW.
 * 식의 좁힘·넓힘 방향은 판정하지 않는다 — {@code DIRECTION} 은 길이·소수 숫자 비교에서만 NARROW/WIDEN 이다.
 */
@Component
public class DomainChangeClassifier {

    public static final String NEW = "NEW";
    public static final String COMPATIBLE = "COMPATIBLE";
    public static final String NARROW_OR_WIDEN = "NARROW_OR_WIDEN";
    public static final String STRUCTURAL = "STRUCTURAL";

    private enum Category { STRUCTURAL, VALUE, COMPATIBLE }

    private record Column(String field, String label, Category category,
                          Function<DomainNode, Object> before, Function<DomainDraft, Object> after) {}

    private static final List<Column> COLUMNS = List.of(
            new Column("DOMAIN_KIND", "종류", Category.STRUCTURAL, DomainNode::domainKind, DomainDraft::domainKind),
            new Column("DATA_TYPE", "데이터 타입", Category.STRUCTURAL, DomainNode::dataType, DomainDraft::dataType),
            new Column("UNIT_CODE", "단위", Category.STRUCTURAL, DomainNode::unitCode, DomainDraft::unitCode),
            new Column("PARENT_DOMAIN_ID", "부모 도메인", Category.STRUCTURAL, DomainNode::parentDomainId, DomainDraft::parentDomainId),
            new Column("LENGTH", "길이", Category.VALUE, DomainNode::length, DomainDraft::length),
            new Column("SCALE", "소수 자리", Category.VALUE, DomainNode::scale, DomainDraft::scale),
            new Column("STD_RULE", "표준 검증식", Category.VALUE, DomainNode::stdRule, DomainDraft::stdRule),
            new Column("BIZ_RULE", "비즈니스 검증식", Category.VALUE, DomainNode::bizRule, DomainDraft::bizRule),
            new Column("MARU_CODE_ID", "코드 참조 — 마루 코드", Category.VALUE, DomainNode::maruCodeId, DomainDraft::maruCodeId),
            new Column("CATE_ID", "코드 참조 — 카테고리", Category.VALUE, DomainNode::cateId, DomainDraft::cateId),
            new Column("DOMAIN_NAME", "도메인명", Category.COMPATIBLE, DomainNode::domainName, DomainDraft::domainName),
            new Column("STD_NAME", "표준명", Category.COMPATIBLE, DomainNode::stdName, DomainDraft::stdName),
            new Column("DESCRIPTION", "정의", Category.COMPATIBLE, DomainNode::description, DomainDraft::description),
            new Column("EXAMPLES", "예시 값", Category.COMPATIBLE,
                    n -> DomainTestCases.examplesToJson(DomainTestCases.examplesFromJson(n.examplesJson())),
                    d -> DomainTestCases.examplesToJson(d.examples())),
            new Column("TEST_CASES", "테스트 케이스", Category.COMPATIBLE,
                    n -> DomainTestCases.toJson(DomainTestCases.fromJson(n.testCasesJson())),
                    d -> DomainTestCases.toJson(d.testCases())));

    public record Classification(String kind, List<Map<String, Object>> diff) {}

    public Classification classify(DomainNode before, DomainDraft after) {
        if (before == null) {
            return new Classification(NEW, List.of());
        }
        List<Map<String, Object>> diff = new ArrayList<>();
        boolean structural = false;
        boolean value = false;
        for (Column c : COLUMNS) {
            Object b = norm(c.before().apply(before));
            Object a = norm(c.after().apply(after));
            if (Objects.equals(b, a)) {
                continue;
            }
            structural |= c.category() == Category.STRUCTURAL;
            value |= c.category() == Category.VALUE;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("FIELD", c.field());
            row.put("LABEL", c.label());
            row.put("BEFORE", b);
            row.put("AFTER", a);
            row.put("DIRECTION", direction(c, b, a));
            diff.add(row);
        }
        String kind = structural ? STRUCTURAL : value ? NARROW_OR_WIDEN : COMPATIBLE;
        return new Classification(kind, diff);
    }

    private static String direction(Column c, Object before, Object after) {
        return switch (c.category()) {
            case STRUCTURAL -> "STRUCTURAL";
            case COMPATIBLE -> "COMPATIBLE";
            case VALUE -> before instanceof Integer b && after instanceof Integer a ? (a < b ? "NARROW" : "WIDEN") : "CHANGE";
        };
    }

    private static Object norm(Object v) {
        if (v instanceof String s) {
            return s.isBlank() ? null : s.trim();
        }
        return v;
    }
}
