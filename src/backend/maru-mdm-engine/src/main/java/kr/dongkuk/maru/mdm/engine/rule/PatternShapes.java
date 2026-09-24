package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code =} 패턴(STRING 변수의 EQ 값) 모양 판정 — m-mdm {@code src/evalex/pattern.ts} 의 {@code tokenize}·{@code classify}·{@code succ} 이식
 * (TSK-08-02 design §2.1-E, TS 가 정본). 분석기가 쓰는 모양은 exact·prefix 둘뿐이라 나머지는 {@link #OTHER} 로 묶는다.
 */
final class PatternShapes {

    private PatternShapes() {}

    /** 접은 뒤 {@code %} 개수 상한(TS {@code MAX_PATTERN_WILDCARDS}). */
    static final int MAX_PATTERN_WILDCARDS = 3;

    private static final Object ANY_SEQ = new Object();
    private static final Object ANY_ONE = new Object();

    /** 저장 시 검사가 막는 패턴(홀로 선 {@code \}, {@code %} 만, 접은 뒤 {@code %} 가 3 개 초과). */
    static final class PatternRejected extends RuntimeException {
        PatternRejected(String message) {
            super(message);
        }
    }

    static final int EXACT = 0;
    static final int PREFIX = 1;
    static final int OTHER = 2;

    /** 모양. kind 는 {@link #EXACT}·{@link #PREFIX}·{@link #OTHER}(enum 으로 두지 않는다 — ValueSets 주석). */
    static final class Shape {
        final int kind;
        final String lit;

        Shape(int kind, String lit) {
            this.kind = kind;
            this.lit = lit;
        }
    }

    /** 토큰화: {@code \%}·{@code \_}·{@code \\} 는 글자, 그 밖의 {@code \x} 와 끝의 {@code \} 는 거부. 인접 글자는 합치고 연속 {@code %} 는 접는다. */
    static List<Object> tokenize(String p) {
        List<Object> out = new ArrayList<>();
        StringBuilder lit = new StringBuilder();
        for (int i = 0; i < p.length(); i++) {
            char c = p.charAt(i);
            if (c == '\\') {
                char n = i + 1 < p.length() ? p.charAt(i + 1) : 0;
                if (i + 1 >= p.length() || (n != '%' && n != '_' && n != '\\')) {
                    throw new PatternRejected("홀로 선 \\ 는 쓸 수 없다: " + p);
                }
                lit.append(n);
                i++;
            } else if (c == '%') {
                flush(out, lit);
                if (out.isEmpty() || out.get(out.size() - 1) != ANY_SEQ) {
                    out.add(ANY_SEQ);
                }
            } else if (c == '_') {
                flush(out, lit);
                out.add(ANY_ONE);
            } else {
                lit.append(c);
            }
        }
        flush(out, lit);
        return out;
    }

    private static void flush(List<Object> out, StringBuilder lit) {
        if (!lit.isEmpty()) {
            out.add(lit.toString());
        }
        lit.setLength(0);
    }

    /** 모양 판정. 거부 대상이면 {@link PatternRejected}. */
    static Shape classify(String p) {
        List<Object> t = tokenize(p);
        if (t.size() == 1 && t.get(0) == ANY_SEQ) {
            throw new PatternRejected("% 만 있는 패턴은 쓸 수 없다: " + p);
        }
        if (t.stream().filter(x -> x == ANY_SEQ).count() > MAX_PATTERN_WILDCARDS) {
            throw new PatternRejected("% 가 " + MAX_PATTERN_WILDCARDS + " 개를 넘는다: " + p);
        }
        if (t.stream().allMatch(x -> x instanceof String)) {
            return new Shape(EXACT, t.isEmpty() ? "" : (String) t.get(0));
        }
        if (t.size() == 2 && t.get(0) instanceof String s && t.get(1) == ANY_SEQ) {
            return new Shape(PREFIX, s);
        }
        return new Shape(OTHER, null);
    }

    /** 접두 구간의 위 끝 — {@code [A, succ(A))}. 마지막 코드 유닛이 0xD7FF–0xDFFF 이거나 0xFFFF 면 못 푼다(null). */
    static String succ(String a) {
        if (a.isEmpty()) {
            return null;
        }
        char u = a.charAt(a.length() - 1);
        if ((u >= 0xD7FF && u <= 0xDFFF) || u == 0xFFFF) {
            return null;
        }
        return a.substring(0, a.length() - 1) + (char) (u + 1);
    }
}
