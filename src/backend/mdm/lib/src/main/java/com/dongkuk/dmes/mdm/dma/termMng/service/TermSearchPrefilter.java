package com.dongkuk.dmes.mdm.dma.termMng.service;

import com.dongkuk.dmes.mdm.entity.MdmTerm;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.List;
import java.util.Locale;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

/**
 * 용어 검색의 DB 1차 거르기 — 키워드·상황 조건을 SQL {@code LIKE} 로 먼저 줄이고, 최종 판정은 {@link TermMngService} 의 Java 비교가 한다.
 *
 * <p><b>필요조건만 건다(MUST).</b> 여기 조건은 Java 비교가 남길 행을 하나도 빼면 안 된다. 남는 행이 더 있어도 Java 가 걸러낸다.
 * 그래서 다음을 지킨다.
 * <ul>
 *   <li>Java 는 {@code toUpperCase(Locale.ROOT)} 뒤 부분 포함으로 비교한다. 이 변환은 SQL {@code UPPER} 와 다르다 — SQLite 는 ASCII 만
 *       접고, Java 는 ß→SS·ſ→S·ı→I·ﬁ→FI 처럼 ASCII 밖 글자를 ASCII 로 바꾸기도 한다. 그래서 대문자 키워드 전체가 아니라, 대문자로 바꿔
 *       자기가 되는 원본 글자가 자기 자신과 ASCII 소문자뿐인 글자(이하 "안전 글자")만 이어진 가장 긴 구간을 바늘로 쓴다. 안전 글자 구간이
 *       없으면 그 조건은 DB 에서 거르지 않는다.</li>
 *   <li>JSON 목록 칸(SYNONYMS·ALIASES)은 Java 가 파싱한 원소 값으로 비교한다. 이스케이프({@code \\uXXXX}·{@code \"}·{@code \\})로 저장된
 *       원소는 원문에 원소 값이 그대로 없으므로, 원문에 역슬래시가 있는 행은 늘 남긴다.</li>
 *   <li>{@code %}·{@code _} 는 글자 그대로 비교해야 하므로 {@code ESCAPE '!'} 로 이스케이프한다. 역슬래시를 이스케이프 문자로 쓰지 않는
 *       것은 방언마다 문자열 리터럴의 역슬래시 해석이 달라서다. 함수는 Oracle·PostgreSQL·SQLite 공통인 {@code UPPER}·{@code LIKE} 만 쓴다.</li>
 *   <li>원문에 {@code null} 이 든 행을 남기는 조건({@code %null%}). D1 수정(fix) 뒤로 JSON {@code null} 리터럴 칸은 빈 목록이라
 *       Java 비교에서 NPE 없이 걸러진다. 남은 이유는 원소 null({@code [null]}, 결함 D2)이다.
 *       <ul>
 *         <li>시스템: 시스템 칸에 null 원소가 있으면 시스템 조건 비교({@code equalsIgnoreCase})가 NPE 를 낸다(특성 시험이 고정). Java 는
 *             키워드 → 시스템 → 상황 순서로 보므로, 시스템 조건이 있을 때 상황 조건이 그 행을 미리 빼면 예외가 사라져 동작이 바뀐다.
 *             그래서 상황 조건은 시스템 원문에 {@code null} 이 든 행을 남긴다. D2 를 고치는 커밋에서 뺀다.</li>
 *         <li>동의어·별칭: 키워드 비교는 null 원소를 건너뛰어 NPE 가 없고, null 리터럴은 빈 목록이다. 그래서 키워드 조건과 상황 조건의
 *             동의어·별칭 {@code %null%} 는 이제 동치에 필요 없고 남는 행만 늘린다(Java 가 걸러 결과는 같다). 이 커밋의 변경을
 *             작게 두려고 남겨 두었고, D2 를 고치는 커밋에서 함께 뺀다.</li>
 *       </ul>
 *   </li>
 * </ul>
 */
final class TermSearchPrefilter {

    /** 정렬 — 예전 {@code findAll()} 이 SQLite 에서 돌려주던 TERM_ID 오름차순을 명시한다. */
    static final Sort ORDER = Sort.by(Sort.Direction.ASC, "termId");

    static final char ESCAPE = '!';
    private static final String CONTAINS_BACKSLASH = "%\\%";
    private static final String CONTAINS_NULL_LITERAL = "%null%";

    private TermSearchPrefilter() {
    }

    /**
     * @param keywordUpper    {@code toUpperCase(Locale.ROOT)} 한 키워드, 조건이 없으면 null. 바늘이 없어 DB 에서 거르지 않을 때도
     *                        키워드 조건이 있다는 사실은 상황 조건의 동의어·별칭 {@code %null%} 조건에 쓴다(D1 수정 뒤로는 남는 행만
     *                        늘린다 — 클래스 설명 참고)
     * @param contextUpper    {@code toUpperCase(Locale.ROOT)} 한 상황 조건, 조건이 없으면 null
     * @param systemsFiltered 시스템 조건이 있는지 — 상황 조건이 시스템 조건의 NPE(null 원소, D2)를 가리지 않게 하는 데 쓴다
     */
    static Specification<MdmTerm> of(String keywordUpper, String contextUpper, boolean systemsFiltered) {
        String keywordPattern = containsPattern(safeNeedle(keywordUpper));
        String contextPattern = containsPattern(safeNeedle(contextUpper));
        boolean keywordFiltered = keywordUpper != null;
        return (root, query, cb) -> {
            List<Predicate> and = new ArrayList<>(2);
            if (keywordPattern != null) {
                and.add(cb.or(
                        likeUpper(cb, root.get("termName"), keywordPattern),
                        likeUpper(cb, root.get("engAbbr"), keywordPattern),
                        jsonListMayContain(cb, root, "synonyms", keywordPattern),
                        jsonListMayContain(cb, root, "aliases", keywordPattern)));
            }
            if (contextPattern != null) {
                // Java 는 키워드·시스템 조건을 상황 조건보다 먼저 본다. 시스템 조건 비교에서 NPE 가 날 행(시스템에 null 원소, D2)은
                // 상황 조건으로 미리 빼지 않는다(기존 결함 보존). 동의어·별칭 쪽은 D1 수정 뒤 NPE 가 없어 남는 행만 늘린다.
                List<Predicate> or = new ArrayList<>(4);
                or.add(likeUpper(cb, root.get("context"), contextPattern));
                if (keywordFiltered) {
                    or.add(like(cb, root.get("synonyms"), CONTAINS_NULL_LITERAL));
                    or.add(like(cb, root.get("aliases"), CONTAINS_NULL_LITERAL));
                }
                if (systemsFiltered) {
                    or.add(like(cb, root.get("systems"), CONTAINS_NULL_LITERAL));
                }
                and.add(or.size() == 1 ? or.get(0) : cb.or(or.toArray(Predicate[]::new)));
            }
            return cb.and(and.toArray(Predicate[]::new));
        };
    }

    private static Predicate jsonListMayContain(CriteriaBuilder cb, Root<MdmTerm> root, String attribute, String pattern) {
        Expression<String> column = root.get(attribute);
        return cb.or(
                likeUpper(cb, column, pattern),
                like(cb, column, CONTAINS_BACKSLASH),
                like(cb, column, CONTAINS_NULL_LITERAL));
    }

    private static Predicate likeUpper(CriteriaBuilder cb, Expression<String> column, String pattern) {
        return cb.like(cb.upper(column), pattern, ESCAPE);
    }

    private static Predicate like(CriteriaBuilder cb, Expression<String> column, String pattern) {
        return cb.like(column, pattern, ESCAPE);
    }

    /** 바늘을 {@code %…%} 부분 포함 패턴으로 만든다. {@code !}·{@code %}·{@code _} 는 {@code !} 로 이스케이프한다. null 이면 null. */
    static String containsPattern(String needle) {
        if (needle == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(needle.length() + 4).append('%');
        for (int i = 0; i < needle.length(); i++) {
            char c = needle.charAt(i);
            if (c == ESCAPE || c == '%' || c == '_') {
                sb.append(ESCAPE);
            }
            sb.append(c);
        }
        return sb.append('%').toString();
    }

    /**
     * 대문자 조건 값에서 안전 글자만 이어진 가장 긴 구간(같으면 앞쪽)을 돌려준다. 값이 null 이거나 안전 글자가 없으면 null.
     * 코드 포인트 단위로 자르므로 대리 쌍을 쪼개지 않는다.
     */
    static String safeNeedle(String upper) {
        if (upper == null) {
            return null;
        }
        int bestStart = 0;
        int bestEnd = 0;
        int runStart = -1;
        int i = 0;
        while (i <= upper.length()) {
            int cp = i < upper.length() ? upper.codePointAt(i) : -1;
            boolean safe = cp >= 0 && isSafe(cp);
            if (safe && runStart < 0) {
                runStart = i;
            } else if (!safe && runStart >= 0) {
                if (upper.codePointCount(runStart, i) > upper.codePointCount(bestStart, bestEnd)) {
                    bestStart = runStart;
                    bestEnd = i;
                }
                runStart = -1;
            }
            i += cp >= 0 ? Character.charCount(cp) : 1;
        }
        return bestEnd > bestStart ? upper.substring(bestStart, bestEnd) : null;
    }

    /**
     * 안전 글자 — 대문자로 바꿔도 자기이고, 대문자 변환 결과에 이 글자를 내는 원본이 자기 자신과 ASCII 소문자뿐인 글자.
     * 이런 글자로만 된 구간은 Java 대문자 변환 뒤 값에 들어 있으면, 원본에도 같은 자리에 같은 글자나 ASCII 소문자로 들어 있어 SQL
     * {@code UPPER(칸) LIKE} 가 반드시 찾는다.
     */
    static boolean isSafe(int codePoint) {
        if (UnsafeTargets.SET.get(codePoint)) {
            return false;
        }
        String s = new String(Character.toChars(codePoint));
        return s.toUpperCase(Locale.ROOT).equals(s);
    }

    /** ASCII 소문자가 아닌 원본이 {@code toUpperCase(Locale.ROOT)} 로 내는 글자 모음 — 처음 쓸 때 한 번 계산한다. */
    private static final class UnsafeTargets {
        static final BitSet SET = compute();

        private static BitSet compute() {
            BitSet set = new BitSet(Character.MAX_CODE_POINT + 1);
            for (int cp = 0; cp <= Character.MAX_CODE_POINT; cp++) {
                if ((cp >= 'a' && cp <= 'z') || !Character.isDefined(cp)) {
                    continue;
                }
                String source = new String(Character.toChars(cp));
                String upper = source.toUpperCase(Locale.ROOT);
                if (!upper.equals(source)) {
                    upper.codePoints().forEach(set::set);
                }
            }
            return set;
        }
    }
}
