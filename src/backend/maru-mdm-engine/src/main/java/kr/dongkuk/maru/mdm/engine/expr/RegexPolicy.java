package kr.dongkuk.maru.mdm.engine.expr;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * {@code STR_MATCHES} 정규식 저장 검사(06:346, evalex-guide §7, TSK-03-02 design §6.5).
 *
 * <p>화면 JS {@code RegExp}(u 플래그 없음)가 SyntaxError 를 내거나 글자 그대로 읽어 결과가 갈리는 Java 전용 문법과,
 * 화면에는 타임아웃이 없어 ReDoS 가 되는 중첩 수량자를 거부한다. 길이는 기준이 아니다(02 일자 정규식 219자).
 *
 * <p>한계: 겹치는 선택지({@code (a|aa)+})는 잡지 못한다. 중첩 수량자는 "무한 수량자를 품은 그룹에 반복 수량자가
 * 붙은 꼴"만 본다.
 */
public final class RegexPolicy {

    /** JS 에 없거나 뜻이 다른 이스케이프 글자. */
    private static final String JAVA_ONLY_ESCAPES = "QEAZzGpP";

    private RegexPolicy() {}

    /** 위반 설명 목록. 비었으면 통과다. */
    public static List<String> violations(String pattern) {
        List<String> out = new ArrayList<>();
        if (pattern == null || pattern.isEmpty()) {
            return out;
        }
        try {
            Pattern.compile(pattern);
        } catch (PatternSyntaxException e) {
            out.add("Java 정규식 문법 오류: " + e.getDescription());
            return out;
        }
        new Scanner(pattern, out).run();
        return out;
    }

    /** 한 번 훑으며 이스케이프·문자 클래스를 건너뛰고, 그룹 스택에 "안에 무한 수량자가 있었는가"를 쌓는다. */
    private static final class Scanner {
        private final String p;
        private final List<String> out;
        private final Deque<boolean[]> groups = new ArrayDeque<>();
        private int i;

        Scanner(String p, List<String> out) {
            this.p = p;
            this.out = out;
        }

        void run() {
            while (i < p.length()) {
                char c = p.charAt(i);
                if (c == '\\') {
                    escape();
                } else if (c == '[') {
                    charClass();
                } else if (c == '(') {
                    openGroup();
                } else if (c == ')') {
                    closeGroup();
                } else if (!quantifier()) {
                    i++;
                }
            }
        }

        private void escape() {
            if (i + 1 < p.length() && JAVA_ONLY_ESCAPES.indexOf(p.charAt(i + 1)) >= 0) {
                out.add("Java 전용 이스케이프 \\" + p.charAt(i + 1));
            }
            i += 2;
        }

        private void charClass() {
            int j = i + 1;
            if (j < p.length() && p.charAt(j) == '^') {
                j++;
            }
            if (j < p.length() && p.charAt(j) == ']') {
                j++;
            }
            int depth = 1;
            while (j < p.length() && depth > 0) {
                char c = p.charAt(j);
                if (c == '\\') {
                    j += 2;
                    continue;
                }
                if (c == '&' && j + 1 < p.length() && p.charAt(j + 1) == '&') {
                    out.add("문자 클래스 교집합 &&");
                    j += 2;
                    continue;
                }
                if (c == '[') {
                    depth++;
                } else if (c == ']') {
                    depth--;
                }
                j++;
            }
            i = j;
        }

        private void openGroup() {
            if (p.startsWith("(?>", i)) {
                out.add("원자 그룹 (?>");
            } else if (p.startsWith("(?", i) && inlineFlag(i + 2)) {
                out.add("인라인 플래그 " + p.substring(i, Math.min(p.length(), i + 6)));
            }
            groups.push(new boolean[] {false});
            i++;
        }

        /** {@code (?} 뒤에 영문자·{@code -} 가 이어지고 {@code )} 또는 {@code :} 로 끝나는가. */
        private boolean inlineFlag(int from) {
            int j = from;
            while (j < p.length() && (Character.isLetter(p.charAt(j)) || p.charAt(j) == '-')) {
                j++;
            }
            return j > from && j < p.length() && (p.charAt(j) == ')' || p.charAt(j) == ':');
        }

        private void closeGroup() {
            boolean infiniteInside = !groups.isEmpty() && groups.pop()[0];
            i++;
            int start = i;
            Quantifier q = Quantifier.read(p, i);
            if (q != null && infiniteInside && q.repeating) {
                out.add("중첩 수량자 " + p.substring(Math.max(0, start - 1), Math.min(p.length(), start + q.length)));
            }
            if (!groups.isEmpty() && (infiniteInside || (q != null && q.infinite))) {
                groups.peek()[0] = true;
            }
            if (q != null) {
                i += q.length;
                suffix();
            }
        }

        /** 원자(글자·이스케이프·클래스) 뒤의 수량자. 없으면 false. */
        private boolean quantifier() {
            Quantifier q = Quantifier.read(p, i);
            if (q == null) {
                return false;
            }
            if (q.infinite && !groups.isEmpty()) {
                groups.peek()[0] = true;
            }
            i += q.length;
            suffix();
            return true;
        }

        /** 수량자 뒤 {@code +} 는 소유 한정자(Java 전용), {@code ?} 는 게으른 수량자(JS 도 있다). */
        private void suffix() {
            if (i < p.length() && p.charAt(i) == '+') {
                out.add("소유 한정자 " + p.substring(Math.max(0, i - 1), i + 1));
                i++;
            } else if (i < p.length() && p.charAt(i) == '?') {
                i++;
            }
        }
    }

    /** {@code * + ? {n} {n,} {n,m}}. */
    private static final class Quantifier {
        private static final Pattern BRACES = Pattern.compile("\\{([0-9]+)(,([0-9]*))?}");

        final int length;
        /** 상한이 없다({@code * + {n,}}). */
        final boolean infinite;
        /** 두 번 이상 반복할 수 있다({@code ?}·{@code {0,1}}·{@code {1}} 이 아니다). */
        final boolean repeating;

        private Quantifier(int length, boolean infinite, boolean repeating) {
            this.length = length;
            this.infinite = infinite;
            this.repeating = repeating;
        }

        static Quantifier read(String p, int at) {
            if (at >= p.length()) {
                return null;
            }
            char c = p.charAt(at);
            if (c == '*' || c == '+') {
                return new Quantifier(1, true, true);
            }
            if (c == '?') {
                return new Quantifier(1, false, false);
            }
            if (c != '{') {
                return null;
            }
            var m = BRACES.matcher(p).region(at, p.length());
            if (!m.lookingAt()) {
                return null;
            }
            int length = m.end() - at;
            if (m.group(2) == null) {
                return new Quantifier(length, false, Long.parseLong(m.group(1)) >= 2);
            }
            if (m.group(3).isEmpty()) {
                return new Quantifier(length, true, true);
            }
            return new Quantifier(length, false, Long.parseLong(m.group(3)) >= 2);
        }
    }
}
