package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.complementNonNull;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.exact;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.full;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.intersect;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.isBounded;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.isEmpty;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.isSubset;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.point;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.subtract;
import static kr.dongkuk.maru.mdm.engine.rule.ValueSets.union;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue.Severity;
import kr.dongkuk.maru.mdm.engine.rule.ValueSets.Bound;
import kr.dongkuk.maru.mdm.engine.rule.ValueSets.Domain;
import kr.dongkuk.maru.mdm.engine.rule.ValueSets.Interval;
import kr.dongkuk.maru.mdm.engine.rule.ValueSets.ValueSet;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;

/**
 * 겹침·빈틈·도달 불가 분석 — m-mdm {@code src/evalex/rule-analysis.ts} 의 {@code analyzeRule} 을 함수 경계·순회 순서 그대로 옮긴다
 * (TSK-08-02 design §6.6, TS 가 정본). 조건 열마다 셀을 값 집합으로 바꿔 행끼리 견준다. UNIQUE 표의 겹침은 오류, 나머지는 경고다(06:364).
 *
 * <p>공개 API(design §6.6.3, 08-04 가 그대로 쓴다): 상태 없음·스레드 안전·예외 없음(못 푸는 셀은 이슈로 낸다), 입력을 바꾸지 않고 불변
 * 리스트를 돌려준다. 이슈 순서는 ALL_NA_ROW → UNRESOLVED_CELL → 겹침 → UNREACHABLE → VALUE_GAP → NULL_GAP 이고 각 단계 안은 행·열
 * 순회 순서다. 저장 거부 여부는 분석기가 정하지 않는다.
 *
 * <p>TS 가 예외를 던지는 입력(값 칸이 없는 셀, NUMBER 열 IN 목록의 숫자 아닌 원소)은 못 푸는 셀·문자열 비교로 대신하고 던지지 않는다.
 */
public final class RuleAnalyzer {

    private RuleAnalyzer() {}

    /** 평문 십진(부호 선택). 지수·16진·공백 없음 — TS {@code PLAIN_DECIMAL}. */
    private static final Pattern PLAIN_DECIMAL = Pattern.compile("^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)$");

    private static final Pattern DIGITS = Pattern.compile("^\\d+$");

    /** 구간 op → [아래 끝 열림, 위 끝 열림]. */
    private static final Map<String, boolean[]> RANGE_OPS = Map.of(
            "<= 변수 <=", new boolean[] {false, false},
            "<= 변수 <", new boolean[] {false, true},
            "< 변수 <=", new boolean[] {true, false},
            "< 변수 <", new boolean[] {true, true});

    private static final Domain DECIMAL = new Domain(ValueSets.DECIMAL, null, null);
    private static final Domain INTEGER = new Domain(ValueSets.INTEGER, null, null);
    private static final Domain STRING = new Domain(ValueSets.STRING, null, null);
    private static final Domain BOOL_DOMAIN = new Domain(ValueSets.INTEGER, BigDecimal.ZERO, BigDecimal.ONE);

    private static final ValueSet UNKNOWN_NO_NULL = ValueSets.unknown(false);
    private static final ValueSet UNKNOWN_NULL = ValueSets.unknown(true);

    /** 조건 열과 그 값 영역. record 로 두지 않는다(ValueSets 주석). */
    private static final class Column {
        private final AnalysisVar v;
        private final Domain domain;

        Column(AnalysisVar v, Domain domain) {
            this.v = v;
            this.domain = domain;
        }

        AnalysisVar v() {
            return v;
        }

        Domain domain() {
            return domain;
        }
    }

    /** 규칙 분석. 이슈 순서는 아래 단계 호출 순서 그대로다. */
    public static List<RuleIssue> analyze(AnalysisRule rule) {
        List<Column> cols = columnsOf(rule);
        if (cols.isEmpty()) {
            return List.of();
        }
        HitPolicy policy = rule.hitPolicy() == null ? HitPolicy.FIRST : rule.hitPolicy();
        boolean unique = policy == HitPolicy.UNIQUE;
        boolean first = rule.ruleKind() == RuleKind.DECISION && policy == HitPolicy.FIRST;

        List<RuleIssue> issues = new ArrayList<>();
        List<RuleRow> rows = dropAllNaRows(rule, cols, issues);
        List<List<ValueSet>> sets = cellSets(rows, cols);
        checkUnresolvedCells(rows, cols, sets, issues);
        Set<String> overlaps = checkOverlaps(rows, cols, sets, unique, issues);
        if (first) {
            checkUnreachable(rows, sets, overlaps, cols, issues);
        }
        checkValueGaps(rows, cols, sets, issues);
        checkNullGaps(rows, cols, issues);
        return List.copyOf(issues);
    }

    /** 조건 열과 그 값 영역. */
    private static List<Column> columnsOf(AnalysisRule rule) {
        List<Column> cols = new ArrayList<>();
        for (AnalysisVar v : condVars(rule)) {
            cols.add(new Column(v, domainOf(v)));
        }
        return cols;
    }

    /** 1. 전부 NA 인 행 — 이슈로 내고 빼며, 남은 NORMAL 행을 돌려준다. */
    private static List<RuleRow> dropAllNaRows(AnalysisRule rule, List<Column> cols, List<RuleIssue> issues) {
        List<RuleRow> rows = new ArrayList<>();
        for (RuleRow r : normalRows(rule)) {
            boolean allNa = true;
            for (Column c : cols) {
                RuleCell cell = cell(r, c.v());
                if (cell == null || !"NA".equals(cell.op())) {
                    allNa = false;
                    break;
                }
            }
            if (allNa) {
                issues.add(issue(RuleIssueCode.ALL_NA_ROW, Severity.ERROR, List.of(r.rowId()), null, null, null,
                        r.rowId() + "행의 조건 셀이 모두 - 다"));
            } else {
                rows.add(r);
            }
        }
        return rows;
    }

    /** 행 × 열 셀 값 집합. */
    private static List<List<ValueSet>> cellSets(List<RuleRow> rows, List<Column> cols) {
        List<List<ValueSet>> sets = new ArrayList<>();
        for (RuleRow r : rows) {
            List<ValueSet> row = new ArrayList<>();
            for (Column c : cols) {
                row.add(cellSet(c.v(), c.domain(), cell(r, c.v())));
            }
            sets.add(row);
        }
        return sets;
    }

    /** 2. 못 푸는 셀(행 → 열 순). */
    private static void checkUnresolvedCells(List<RuleRow> rows, List<Column> cols, List<List<ValueSet>> sets, List<RuleIssue> issues) {
        for (int i = 0; i < rows.size(); i++) {
            for (int k = 0; k < cols.size(); k++) {
                RuleCell cell = cell(rows.get(i), cols.get(k).v());
                if (!sets.get(i).get(k).exact && cell != null) {
                    AnalysisVar v = cols.get(k).v();
                    issues.add(issue(RuleIssueCode.UNRESOLVED_CELL, Severity.WARNING, List.of(rows.get(i).rowId()), v.varId(), null, null,
                            rows.get(i).rowId() + "행 " + labelOf(v) + " 셀은 화면에서 겹침을 풀 수 없다(" + summary(v, cell) + ")"));
                }
            }
        }
    }

    /** 3. 겹침 — 확실히 겹치는 행 쌍 색인({@code i:j})을 돌려준다(도달 불가 판정용). */
    private static Set<String> checkOverlaps(List<RuleRow> rows, List<Column> cols, List<List<ValueSet>> sets, boolean unique,
            List<RuleIssue> issues) {
        Set<String> overlaps = new HashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            for (int j = i + 1; j < rows.size(); j++) {
                boolean maybe = false;
                boolean disjoint = false;
                for (int k = 0; k < cols.size(); k++) {
                    int x = crosses(sets.get(i).get(k), sets.get(j).get(k), cols.get(k).domain());
                    if (x == NO) {
                        disjoint = true;
                        break;
                    }
                    if (x == MAYBE) {
                        maybe = true;
                    }
                }
                if (disjoint) {
                    continue;
                }
                List<Integer> rowIds = List.of(rows.get(i).rowId(), rows.get(j).rowId());
                if (!maybe) {
                    overlaps.add(i + ":" + j);
                    issues.add(issue(RuleIssueCode.OVERLAP, unique ? Severity.ERROR : Severity.WARNING, rowIds, null, null, null,
                            rowIds.get(0) + "행·" + rowIds.get(1) + "행이 겹친다(" + describe(cols, rows.get(i), rows.get(j)) + ")"));
                } else {
                    issues.add(issue(RuleIssueCode.OVERLAP_UNRESOLVED, Severity.WARNING, rowIds, null, null, null,
                            rowIds.get(0) + "행·" + rowIds.get(1) + "행이 겹칠 수 있다"));
                }
            }
        }
        return overlaps;
    }

    /** 4. 도달 불가(FIRST 일 때만 부른다). */
    private static void checkUnreachable(List<RuleRow> rows, List<List<ValueSet>> sets, Set<String> overlaps, List<Column> cols,
            List<RuleIssue> issues) {
        boolean[] allExact = new boolean[rows.size()];
        for (int r = 0; r < rows.size(); r++) {
            allExact[r] = sets.get(r).stream().allMatch(s -> s.exact);
        }
        for (int r = 0; r < rows.size(); r++) {
            if (!allExact[r]) {
                continue;
            }
            List<Integer> prev = new ArrayList<>();
            for (int p = 0; p < r; p++) {
                if (allExact[p] && overlaps.contains(p + ":" + r)) {
                    prev.add(p);
                }
            }
            if (prev.isEmpty()) {
                continue;
            }
            Set<Integer> used = covered(sets, cols, r, prev, 0);
            if (used != null) {
                List<Integer> rowIds = new ArrayList<>();
                rowIds.add(rows.get(r).rowId());
                used.stream().sorted().forEach(p -> rowIds.add(rows.get(p).rowId()));
                issues.add(issue(RuleIssueCode.UNREACHABLE, Severity.WARNING, rowIds, null, null, null,
                        rows.get(r).rowId() + "행은 앞 행에 모두 덮여 적중하지 않는다"));
            }
        }
    }

    /** 5. 값 빈틈(Number 열, 소수 자리수 격자, 내부 빈틈만). */
    private static void checkValueGaps(List<RuleRow> rows, List<Column> cols, List<List<ValueSet>> sets, List<RuleIssue> issues) {
        for (int k = 0; k < cols.size(); k++) {
            AnalysisVar v = cols.get(k).v();
            Domain domain = cols.get(k).domain();
            if (domain.kind != ValueSets.DECIMAL || isExpressionColumn(v)) {
                continue;
            }
            int s = scaleOf(v, rows);
            BigDecimal step = BigDecimal.ONE.scaleByPowerOfTen(-s);
            for (List<Integer> members : gapGroups(rows, cols, k).values()) {
                List<ValueSet> parts = new ArrayList<>();
                for (int i : members) {
                    parts.add(sets.get(i).get(k));
                }
                if (parts.stream().anyMatch(p -> !p.exact)) {
                    continue;
                }
                ValueSet gaps = complementNonNull(union(parts, domain), domain);
                addGridGaps(members, rows, v, s, step, gaps, issues);
            }
        }
    }

    /** 열 k 를 뺀 나머지 열의 정규 키가 같은 행끼리 묶는다(첫 등장 순). */
    private static Map<String, List<Integer>> gapGroups(List<RuleRow> rows, List<Column> cols, int k) {
        Map<String, List<Integer>> groups = new LinkedHashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            StringBuilder key = new StringBuilder();
            for (int m = 0; m < cols.size(); m++) {
                if (m > 0) {
                    key.append('\u0001');
                }
                if (m != k) {
                    key.append(canonicalKey(cols.get(m).v(), cell(rows.get(i), cols.get(m).v())));
                }
            }
            groups.computeIfAbsent(key.toString(), x -> new ArrayList<>()).add(i);
        }
        return groups;
    }

    /** 한 묶음의 빈틈 구간마다 격자(소수 s 자리) 위 값이 하나라도 있으면 VALUE_GAP 을 낸다. 양끝 열린 빈틈은 건너뛴다. */
    private static void addGridGaps(List<Integer> members, List<RuleRow> rows, AnalysisVar v, int s, BigDecimal step, ValueSet gaps,
            List<RuleIssue> issues) {
        for (Interval iv : gaps.intervals) {
            if (!isBounded(iv)) {
                continue;
            }
            BigDecimal lo = (BigDecimal) iv.lo.v;
            BigDecimal hi = (BigDecimal) iv.hi.v;
            BigDecimal g1 = lo.setScale(s, RoundingMode.CEILING);
            if (iv.lo.open && g1.compareTo(lo) == 0) {
                g1 = g1.add(step);
            }
            BigDecimal g2 = hi.setScale(s, RoundingMode.FLOOR);
            if (iv.hi.open && g2.compareTo(hi) == 0) {
                g2 = g2.subtract(step);
            }
            if (g1.compareTo(g2) <= 0) {
                List<Integer> rowIds = members.stream().map(i -> rows.get(i).rowId()).toList();
                String lower = toFixed(g1, s);
                String upper = toFixed(g2, s);
                issues.add(issue(RuleIssueCode.VALUE_GAP, Severity.WARNING, rowIds, v.varId(), lower, upper,
                        labelOf(v) + ": " + lower + " ~ " + upper + " 에 맞는 행이 없다"));
            }
        }
    }

    /** 6. NULL 빈틈(열 단위). */
    private static void checkNullGaps(List<RuleRow> rows, List<Column> cols, List<RuleIssue> issues) {
        for (Column c : cols) {
            AnalysisVar v = c.v();
            if (isExpressionColumn(v)) {
                continue;
            }
            boolean coversNull = false;
            for (RuleRow r : rows) {
                RuleCell cell = cell(r, v);
                if (cell != null && ("NA".equals(cell.op()) || "IS_NULL".equals(cell.op()))) {
                    coversNull = true;
                    break;
                }
            }
            if (!coversNull) {
                issues.add(issue(RuleIssueCode.NULL_GAP, Severity.WARNING, List.of(), v.varId(), null, null,
                        labelOf(v) + " 이(가) NULL 이면 맞는 행이 없다"));
            }
        }
    }

    // ------------------------------------------------------------------ 모델 도우미(TS rule-model.ts)

    /** 조건 열 — seq 순(같으면 varId 순). */
    private static List<AnalysisVar> condVars(AnalysisRule rule) {
        List<AnalysisVar> out = new ArrayList<>();
        for (AnalysisVar v : nonNull(rule.vars())) {
            if (v.varKind() == VarKind.COND) {
                out.add(v);
            }
        }
        out.sort(Comparator.comparingInt(AnalysisVar::seq).thenComparingInt(AnalysisVar::varId));
        return out;
    }

    /** NORMAL 행 — seq 순(같으면 rowId 순). */
    private static List<RuleRow> normalRows(AnalysisRule rule) {
        List<RuleRow> out = new ArrayList<>();
        for (RuleRow r : nonNull(rule.rows())) {
            if (r.rowKind() == RowKind.NORMAL) {
                out.add(r);
            }
        }
        out.sort(Comparator.comparingInt(RuleRow::seq).thenComparingInt(RuleRow::rowId));
        return out;
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static RuleCell cell(RuleRow r, AnalysisVar v) {
        return r.cells() == null ? null : r.cells().get(v.varId());
    }

    /** Expression 조건 열인가(셀마다 불린 식). */
    private static boolean isExpressionColumn(AnalysisVar v) {
        return v.varKind() == VarKind.COND && v.dispType() == DispType.EXPRESSION;
    }

    private static String labelOf(AnalysisVar v) {
        return v.varName() != null ? v.varName() : "_V" + v.varId();
    }

    // ------------------------------------------------------------------ 셀 → 값 집합

    /** 조건 열의 값 영역. Expression 열의 셀은 NA 가 아니면 못 푸는 셀이라 영역은 자리만 채운다. */
    private static Domain domainOf(AnalysisVar v) {
        if (isExpressionColumn(v)) {
            return STRING;
        }
        if (v.dataType() == DataType.NUMBER) {
            return DECIMAL;
        }
        if (v.dataType() == DataType.BOOLEAN) {
            return BOOL_DOMAIN;
        }
        if (v.dateString() || v.dataType() == DataType.DATE) {
            return INTEGER;
        }
        return STRING;
    }

    /** 좌표. 영역에 맞지 않으면 null. */
    private static Object coord(String raw, AnalysisVar v, Domain domain) {
        if (raw == null) {
            return null;
        }
        switch (domain.kind) {
            case ValueSets.DECIMAL:
                return PLAIN_DECIMAL.matcher(raw).matches() ? new BigDecimal(raw) : null;
            case ValueSets.INTEGER:
                if (v.dataType() == DataType.BOOLEAN) {
                    String u = raw.toUpperCase(Locale.ROOT);
                    return u.equals("TRUE") ? BigDecimal.ONE : u.equals("FALSE") ? BigDecimal.ZERO : null;
                }
                return DIGITS.matcher(raw).matches() ? new BigDecimal(raw) : null;
            default:
                return raw;
        }
    }

    /** 셀 → 값 집합(TSK-03-04 design §6.8 표). 가드된 셀은 NULL 을 덮지 않는다. */
    private static ValueSet cellSet(AnalysisVar v, Domain domain, RuleCell cell) {
        if (cell == null || cell.op() == null) {
            return UNKNOWN_NULL;
        }
        String op = cell.op();
        switch (op) {
            case "NA":
                return full(domain, true);
            case "IS_NULL":
                return exact(List.of(), domain, true);
            case "NOT_NULL":
                return full(domain, false);
            case "CONTAINS":
            case "INSTR":
            case "CODE_IN":
                return UNKNOWN_NO_NULL;
            case "EQ": {
                if (domain.kind == ValueSets.DECIMAL || v.dataType() == DataType.BOOLEAN) {
                    Object x = coord(cell.left(), v, domain);
                    return x == null ? UNKNOWN_NO_NULL : point(x, domain);
                }
                if (cell.left() == null) {
                    return UNKNOWN_NO_NULL;
                }
                PatternShapes.Shape shape;
                try {
                    shape = PatternShapes.classify(cell.left());
                } catch (PatternShapes.PatternRejected e) {
                    return UNKNOWN_NO_NULL;
                }
                if (shape.kind == PatternShapes.EXACT) {
                    Object x = coord(shape.lit, v, domain);
                    return x == null ? UNKNOWN_NO_NULL : point(x, domain);
                }
                if (shape.kind == PatternShapes.PREFIX && domain.kind == ValueSets.STRING) {
                    String hi = PatternShapes.succ(shape.lit);
                    return hi == null ? UNKNOWN_NO_NULL
                            : exact(List.of(new Interval(new Bound(shape.lit, false), new Bound(hi, true))), domain, false);
                }
                return UNKNOWN_NO_NULL;
            }
            case "NE": {
                Object x = coord(cell.left(), v, domain);
                return x == null ? UNKNOWN_NO_NULL : subtract(full(domain, false), point(x, domain), domain);
            }
            case "LT":
                return ray(v, domain, cell.left(), true, true);
            case "LE":
                return ray(v, domain, cell.left(), true, false);
            case "GT":
                return ray(v, domain, cell.left(), false, true);
            case "GE":
                return ray(v, domain, cell.left(), false, false);
            case "IN":
            case "NOT_IN": {
                if (cell.list() == null) {
                    return UNKNOWN_NO_NULL;
                }
                List<ValueSet> pts = new ArrayList<>();
                for (String raw : cell.list()) {
                    Object x = coord(raw, v, domain);
                    if (x == null) {
                        return UNKNOWN_NO_NULL;
                    }
                    pts.add(point(x, domain));
                }
                ValueSet u = union(pts, domain);
                return op.equals("IN") ? u : complementNonNull(u, domain);
            }
            default:
                break;
        }
        boolean[] range = RANGE_OPS.get(op);
        if (range != null && cell.right() != null) {
            Object lo = coord(cell.left(), v, domain);
            Object hi = coord(cell.right(), v, domain);
            if (lo == null || hi == null) {
                return UNKNOWN_NO_NULL;
            }
            return exact(List.of(new Interval(new Bound(lo, range[0]), new Bound(hi, range[1]))), domain, false);
        }
        return UNKNOWN_NO_NULL;
    }

    private static ValueSet ray(AnalysisVar v, Domain domain, String raw, boolean below, boolean open) {
        Object x = coord(raw, v, domain);
        if (x == null) {
            return UNKNOWN_NO_NULL;
        }
        Interval iv = below ? new Interval(null, new Bound(x, open)) : new Interval(new Bound(x, open), null);
        return exact(List.of(iv), domain, false);
    }

    private static final int YES = 0;
    private static final int MAYBE = 1;
    private static final int NO = 2;

    /** 두 셀 집합이 교차하는가 — 확실히(YES), 못 정함(MAYBE), 아니다(NO). */
    private static int crosses(ValueSet a, ValueSet b, Domain domain) {
        if (a.exact && b.exact) {
            return !intersect(a, b, domain).intervals.isEmpty() || (a.hasNull && b.hasNull) ? YES : NO;
        }
        if (a.hasNull && b.hasNull) {
            return MAYBE;
        }
        return nonNullPossible(a) && nonNullPossible(b) ? MAYBE : NO;
    }

    private static boolean nonNullPossible(ValueSet s) {
        return !s.exact || !s.intervals.isEmpty();
    }

    // ------------------------------------------------------------------ 값 빈틈 도우미

    /** 정규 키(다축 빈틈 묶음) — EQ L 은 IN [L], 목록은 좌표 정렬·중복 제거, NUMBER 는 끝 0 제거. 같음 판정만 TS JSON 키와 맞춘다. */
    private static String canonicalKey(AnalysisVar v, RuleCell cell) {
        if (cell == null) {
            return "∅";
        }
        if (cell.expr() != null) {
            return json(List.of("EXPR", cell.expr()));
        }
        if (cell.op() == null) {
            List<Object> raw = new ArrayList<>();
            raw.add("CELL");
            raw.add(cell.left());
            raw.add(cell.right());
            raw.add(cell.list());
            raw.add(cell.val());
            return json(raw);
        }
        List<Object> payload = new ArrayList<>();
        payload.add(cell.op().equals("EQ") ? "IN" : cell.op());
        if (cell.op().equals("EQ")) {
            payload.add(sortList(v, Collections.singletonList(cell.left())));
        } else if (cell.list() != null) {
            payload.add(sortList(v, cell.list()));
        } else {
            if (cell.left() != null) {
                payload.add(norm(v, cell.left()));
            }
            if (cell.right() != null) {
                payload.add(norm(v, cell.right()));
            }
        }
        return json(payload);
    }

    /** NUMBER 평문 십진은 끝 0 을 지운 평문(decimal.js {@code toString()} 과 같이 지수 없음, 음의 0 은 {@code -0}). */
    private static String norm(AnalysisVar v, String raw) {
        if (raw == null || v.dataType() != DataType.NUMBER || !PLAIN_DECIMAL.matcher(raw).matches()) {
            return raw;
        }
        BigDecimal d = new BigDecimal(raw);
        if (d.signum() == 0) {
            return raw.startsWith("-") ? "-0" : "0";
        }
        return d.stripTrailingZeros().toPlainString();
    }

    private static List<String> sortList(AnalysisVar v, List<String> xs) {
        List<String> vals = new ArrayList<>(new LinkedHashSet<>(xs.stream().map(x -> norm(v, x)).toList()));
        if (v.dataType() == DataType.NUMBER) {
            vals.sort(RuleAnalyzer::numberOrder);
        } else {
            vals.sort(Comparator.nullsFirst(Comparator.naturalOrder()));
        }
        return vals;
    }

    /** 값 순서. 숫자가 아닌 원소가 끼면 TS 는 예외를 던지므로 여기서는 문자열 순서로 대신한다. */
    private static int numberOrder(String a, String b) {
        if (a != null && b != null && PLAIN_DECIMAL.matcher(a).matches() && PLAIN_DECIMAL.matcher(b).matches()) {
            return new BigDecimal(a).compareTo(new BigDecimal(b));
        }
        return Comparator.nullsFirst(Comparator.<String>naturalOrder()).compare(a, b);
    }

    private static String json(List<?> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            Object x = values.get(i);
            if (x == null) {
                sb.append("null");
            } else if (x instanceof List<?> list) {
                sb.append(json(list));
            } else {
                sb.append('"');
                for (char c : x.toString().toCharArray()) {
                    if (c == '"' || c == '\\') {
                        sb.append('\\').append(c);
                    } else if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
                sb.append('"');
            }
        }
        return sb.append(']').toString();
    }

    private static int scaleOf(AnalysisVar v, List<RuleRow> rows) {
        if (v.scale() != null) {
            return v.scale();
        }
        int s = 0;
        for (RuleRow r : rows) {
            RuleCell cell = cell(r, v);
            if (cell == null || cell.op() == null) {
                continue;
            }
            s = see(s, cell.left());
            s = see(s, cell.right());
            if (cell.list() != null) {
                for (String raw : cell.list()) {
                    s = see(s, raw);
                }
            }
        }
        return s;
    }

    private static int see(int s, String raw) {
        if (raw == null) {
            return s;
        }
        int dot = raw.indexOf('.');
        if (PLAIN_DECIMAL.matcher(raw).matches() && dot >= 0) {
            return Math.max(s, raw.length() - dot - 1);
        }
        return s;
    }

    /** decimal.js {@code toFixed(s)} — 소수 s 자리, 지수 없음, ROUND_HALF_EVEN. */
    private static String toFixed(BigDecimal d, int s) {
        return d.setScale(s, RoundingMode.HALF_EVEN).toPlainString();
    }

    // ------------------------------------------------------------------ 도달 불가

    /**
     * 행 r 의 열 k 이후가 앞 행 p 들의 합집합으로 모두 덮이는가. 덮이면 실제로 쓰인 앞 행 색인 집합, 아니면 null.
     * 열 k 의 집합을 앞 행들의 k 열 집합으로 조각내고(NULL 은 따로 한 조각), 조각마다 그 조각을 품는 앞 행만으로 다음 열을 본다.
     */
    private static Set<Integer> covered(List<List<ValueSet>> sets, List<Column> cols, int r, List<Integer> prev, int k) {
        if (k == cols.size()) {
            return prev.isEmpty() ? null : new LinkedHashSet<>(prev);
        }
        Domain domain = cols.get(k).domain();
        ValueSet target = sets.get(r).get(k);
        List<ValueSet> pieces = new ArrayList<>();
        for (ValueSet x : List.of(new ValueSet(true, target.intervals, false), new ValueSet(true, List.of(), target.hasNull))) {
            if (!isEmpty(x)) {
                pieces.add(x);
            }
        }
        for (int p : prev) {
            ValueSet cover = sets.get(p).get(k);
            List<ValueSet> next = new ArrayList<>();
            for (ValueSet x : pieces) {
                for (ValueSet y : List.of(intersect(x, cover, domain), subtract(x, cover, domain))) {
                    if (!isEmpty(y)) {
                        next.add(y);
                    }
                }
            }
            pieces = next;
        }
        Set<Integer> used = new LinkedHashSet<>();
        for (ValueSet piece : pieces) {
            List<Integer> holders = new ArrayList<>();
            for (int p : prev) {
                if (isSubset(piece, sets.get(p).get(k), domain)) {
                    holders.add(p);
                }
            }
            if (holders.isEmpty()) {
                return null;
            }
            Set<Integer> sub = covered(sets, cols, r, holders, k + 1);
            if (sub == null) {
                return null;
            }
            used.addAll(sub);
        }
        return used;
    }

    // ------------------------------------------------------------------ 문구(비교하지 않는다)

    private static String describe(List<Column> cols, RuleRow a, RuleRow b) {
        List<String> parts = new ArrayList<>();
        for (Column c : cols) {
            RuleCell x = cell(a, c.v());
            RuleCell y = cell(b, c.v());
            parts.add(labelOf(c.v()) + ": " + (x != null ? summary(c.v(), x) : "") + " / " + (y != null ? summary(c.v(), y) : ""));
        }
        return String.join(", ", parts);
    }

    /** TS {@code cellSummary} — Equal 열의 EQ 는 값만 쓴다. */
    private static String summary(AnalysisVar v, RuleCell cell) {
        if ("EQ".equals(cell.op()) && v.dispType() == DispType.EQUAL) {
            return cell.left() == null ? "" : cell.left();
        }
        return CellSummary.of(null, cell);
    }

    private static RuleIssue issue(RuleIssueCode code, Severity severity, List<Integer> rowIds, Integer varId, String lower, String upper,
            String message) {
        return new RuleIssue(code, severity, List.copyOf(rowIds), varId, lower, upper, message);
    }
}
