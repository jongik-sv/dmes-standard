package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 값 집합 대수 — m-mdm {@code src/evalex/value-set.ts} 이식(TSK-08-02 design §6.6.1, TS 가 정본). 값 공간은 {@code 도메인 값 ∪ {NULL}} 이다.
 *
 * <p>영역: DECIMAL(NUMBER, 연속), INTEGER(일자 String·Boolean, 1 단위 이산), STRING(그 밖의 STRING, UTF-16 코드 유닛 순서).
 * INTEGER 영역은 만들 때 열린 끝을 닫힌 정수 끝으로 바꾼다. 좌표는 {@link BigDecimal}(비교는 {@code compareTo} 만) 또는 {@link String} 이다.
 * 이 파일의 타입은 record·enum 으로 두지 않는다 — 엔진 계약 대응표(EngineContractSchemaTest)가 rule 패키지의 record·enum 을 전수 대조한다.
 */
final class ValueSets {

    private ValueSets() {}

    /** 영역 종류. enum 으로 두지 않는다 — 엔진 계약 대응표(EngineContractSchemaTest)가 rule 패키지의 enum 을 전수 대조한다. */
    static final int DECIMAL = 0;
    static final int INTEGER = 1;
    static final int STRING = 2;

    static final class Domain {
        final int kind;
        final BigDecimal min;
        final BigDecimal max;

        Domain(int kind, BigDecimal min, BigDecimal max) {
            this.kind = kind;
            this.min = min;
            this.max = max;
        }
    }

    /** 구간 끝. null 은 무한이다. */
    static final class Bound {
        final Object v;
        final boolean open;

        Bound(Object v, boolean open) {
            this.v = v;
            this.open = open;
        }
    }

    static final class Interval {
        final Bound lo;
        final Bound hi;

        Interval(Bound lo, Bound hi) {
            this.lo = lo;
            this.hi = hi;
        }
    }

    /** exact 이면 구간 목록이 값 집합이고, 아니면(unknown) 정적으로 못 푸는 셀이다. */
    static final class ValueSet {
        final boolean exact;
        final List<Interval> intervals;
        final boolean hasNull;

        ValueSet(boolean exact, List<Interval> intervals, boolean hasNull) {
            this.exact = exact;
            this.intervals = intervals;
            this.hasNull = hasNull;
        }
    }

    static ValueSet unknown(boolean hasNull) {
        return new ValueSet(false, List.of(), hasNull);
    }

    static int cmp(Object a, Object b) {
        if (a instanceof String || b instanceof String) {
            return Integer.signum(String.valueOf(a).compareTo(String.valueOf(b)));
        }
        return ((BigDecimal) a).compareTo((BigDecimal) b);
    }

    private static boolean nonEmpty(Interval iv) {
        if (iv.lo == null || iv.hi == null) {
            return true;
        }
        int c = cmp(iv.lo.v, iv.hi.v);
        return c < 0 || (c == 0 && !iv.lo.open && !iv.hi.open);
    }

    /** 두 아래 끝 가운데 큰 쪽(같으면 열림 우선). */
    private static Bound maxLo(Bound a, Bound b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        int c = cmp(a.v, b.v);
        if (c != 0) {
            return c > 0 ? a : b;
        }
        return new Bound(a.v, a.open || b.open);
    }

    /** 두 위 끝 가운데 작은 쪽(같으면 열림 우선). */
    private static Bound minHi(Bound a, Bound b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        int c = cmp(a.v, b.v);
        if (c != 0) {
            return c < 0 ? a : b;
        }
        return new Bound(a.v, a.open || b.open);
    }

    private static final Comparator<Interval> BY_LO = (a, b) -> {
        if (a.lo == null) {
            return b.lo != null ? -1 : 0;
        }
        if (b.lo == null) {
            return 1;
        }
        int c = cmp(a.lo.v, b.lo.v);
        if (c != 0) {
            return c;
        }
        return Boolean.compare(a.lo.open, b.lo.open);
    };

    /** 정렬·병합·정수 끝 정규화. */
    static List<Interval> normalize(List<Interval> intervals, Domain domain) {
        List<Interval> list = intervals;
        if (domain.kind == INTEGER) {
            list = new ArrayList<>();
            for (Interval iv : intervals) {
                Bound lo = iv.lo == null ? null
                        : new Bound(iv.lo.open
                                ? ((BigDecimal) iv.lo.v).setScale(0, RoundingMode.FLOOR).add(BigDecimal.ONE)
                                : ((BigDecimal) iv.lo.v).setScale(0, RoundingMode.CEILING), false);
                Bound hi = iv.hi == null ? null
                        : new Bound(iv.hi.open
                                ? ((BigDecimal) iv.hi.v).setScale(0, RoundingMode.CEILING).subtract(BigDecimal.ONE)
                                : ((BigDecimal) iv.hi.v).setScale(0, RoundingMode.FLOOR), false);
                if (domain.min != null && (lo == null || ((BigDecimal) lo.v).compareTo(domain.min) < 0)) {
                    lo = new Bound(domain.min, false);
                }
                if (domain.max != null && (hi == null || ((BigDecimal) hi.v).compareTo(domain.max) > 0)) {
                    hi = new Bound(domain.max, false);
                }
                list.add(new Interval(lo, hi));
            }
        }
        List<Interval> sorted = new ArrayList<>();
        for (Interval iv : list) {
            if (nonEmpty(iv)) {
                sorted.add(iv);
            }
        }
        sorted.sort(BY_LO);
        List<Interval> out = new ArrayList<>();
        for (Interval iv : sorted) {
            Interval last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && touches(last, iv, domain)) {
                Bound hi = last.hi == null || iv.hi == null ? null
                        : cmp(iv.hi.v, last.hi.v) > 0 || (cmp(iv.hi.v, last.hi.v) == 0 && !iv.hi.open) ? iv.hi : last.hi;
                out.set(out.size() - 1, new Interval(last.lo, hi));
            } else {
                out.add(new Interval(iv.lo, iv.hi));
            }
        }
        return out;
    }

    /** 앞 구간 a 와 뒤 구간 b(b.lo ≥ a.lo)가 겹치거나 맞닿는가. */
    private static boolean touches(Interval a, Interval b, Domain domain) {
        if (a.hi == null || b.lo == null) {
            return true;
        }
        int c = cmp(b.lo.v, a.hi.v);
        if (domain.kind == INTEGER) {
            return ((BigDecimal) b.lo.v).compareTo(((BigDecimal) a.hi.v).add(BigDecimal.ONE)) <= 0;
        }
        return c < 0 || (c == 0 && !(a.hi.open && b.lo.open));
    }

    static ValueSet full(Domain domain, boolean hasNull) {
        return exact(List.of(new Interval(null, null)), domain, hasNull);
    }

    static ValueSet exact(List<Interval> intervals, Domain domain, boolean hasNull) {
        return new ValueSet(true, normalize(intervals, domain), hasNull);
    }

    static ValueSet point(Object v, Domain domain) {
        return exact(List.of(new Interval(new Bound(v, false), new Bound(v, false))), domain, false);
    }

    static ValueSet intersect(ValueSet a, ValueSet b, Domain domain) {
        List<Interval> out = new ArrayList<>();
        for (Interval x : a.intervals) {
            for (Interval y : b.intervals) {
                Interval iv = new Interval(maxLo(x.lo, y.lo), minHi(x.hi, y.hi));
                if (nonEmpty(iv)) {
                    out.add(iv);
                }
            }
        }
        return exact(out, domain, a.hasNull && b.hasNull);
    }

    static ValueSet union(List<ValueSet> list, Domain domain) {
        List<Interval> all = new ArrayList<>();
        boolean hasNull = false;
        for (ValueSet s : list) {
            all.addAll(s.intervals);
            hasNull |= s.hasNull;
        }
        return exact(all, domain, hasNull);
    }

    /** 비NULL 여집합(NULL 은 싣지 않는다). */
    static ValueSet complementNonNull(ValueSet a, Domain domain) {
        List<Interval> out = new ArrayList<>();
        Bound lo = null;
        boolean first = true;
        for (Interval iv : a.intervals) {
            if (first) {
                first = false;
                if (iv.lo != null) {
                    out.add(new Interval(null, new Bound(iv.lo.v, !iv.lo.open)));
                }
            } else if (iv.lo != null) {
                out.add(new Interval(lo, new Bound(iv.lo.v, !iv.lo.open)));
            }
            lo = iv.hi != null ? new Bound(iv.hi.v, !iv.hi.open) : null;
            if (iv.hi == null) {
                return exact(out, domain, false);
            }
        }
        if (first) {
            return full(domain, false);
        }
        out.add(new Interval(lo, null));
        return exact(out, domain, false);
    }

    static ValueSet subtract(ValueSet a, ValueSet b, Domain domain) {
        ValueSet s = intersect(a, complementNonNull(b, domain), domain);
        return new ValueSet(true, s.intervals, a.hasNull && !b.hasNull);
    }

    static boolean isEmpty(ValueSet a) {
        return a.intervals.isEmpty() && !a.hasNull;
    }

    /** a ⊆ b. */
    static boolean isSubset(ValueSet a, ValueSet b, Domain domain) {
        return isEmpty(subtract(a, b, domain));
    }

    /** 격자 계산용 — 유한한 두 끝을 가진 구간인가. */
    static boolean isBounded(Interval iv) {
        return iv.lo != null && iv.hi != null;
    }
}
