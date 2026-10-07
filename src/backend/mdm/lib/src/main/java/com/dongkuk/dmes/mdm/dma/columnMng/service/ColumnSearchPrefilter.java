package com.dongkuk.dmes.mdm.dma.columnMng.service;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import jakarta.persistence.criteria.AbstractQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/**
 * 컬럼 검색의 DB 1차 거르기 — 검색어·도메인 키워드를 SQL {@code LIKE} 로 먼저 줄이고, 최종 판정은 {@link ColumnMngService} 의 Java 비교가
 * 한다(용어 검색의 {@code TermSearchPrefilter} 와 같은 방식).
 *
 * <p><b>필요조건만 건다(MUST).</b> 여기 조건은 Java 비교가 남길 컬럼을 하나도 빼면 안 된다. 남는 컬럼이 더 있어도 Java 가 걸러낸다.
 * 그래서 다음을 지킨다.
 * <ul>
 *   <li>Java 는 {@code toLowerCase(Locale.ROOT)} 뒤 부분 포함으로 비교한다. 이 변환은 SQL {@code LOWER} 와 다르다 — DB 마다 접는 범위가
 *       다르고(SQLite 는 ASCII 만, Oracle 은 문자 집합 규칙), Java 는 Ä→ä·İ→i̇·K(켈빈)→k 처럼 ASCII 밖 글자도 접는다. 그래서 소문자 조건 전체가 아니라, 소문자로 바꿔 자기가 되는 원본
 *       글자가 자기 자신과 ASCII 대문자뿐인 글자(이하 "안전 글자")만 이어진 가장 긴 구간을 바늘로 쓴다. 안전 글자 구간이 없으면 그 조건은
 *       DB 에서 글자로 거르지 않는다. 그리스 어말 시그마(ς)는 글자 하나씩 바꿔서는 나오지 않고 문자열 문맥으로만 나오므로 따로 뺀다.</li>
 *   <li>{@code %}·{@code _}·{@code \} 는 글자 그대로 비교해야 하므로 {@code ESCAPE '!'} 로 {@code !}·{@code %}·{@code _} 를
 *       이스케이프한다. 역슬래시를 이스케이프 문자로 쓰지 않는 것은 방언마다 문자열 리터럴의 역슬래시 해석이 달라서다. 함수는
 *       Oracle·PostgreSQL·SQLite 공통인 {@code LOWER}·{@code LIKE} 만 쓴다.</li>
 *   <li>검색어는 논리명·표준 물리명·그 컬럼의 시스템별 실제 필드명 중 하나에 걸리면 된다. 실제 필드명은 {@code EXISTS} 로 보므로 매핑이
 *       여러 개 걸려도 컬럼은 한 번만 나온다.</li>
 *   <li>도메인 키워드는 도메인 행이 있는 컬럼만 남긴다({@code EXISTS} 로 도메인 행을 본다). Java 는 도메인 ID 의 10진 문자열에도 맞추므로,
 *       조건이 숫자와 {@code -} 로만 되어 있으면 도메인명·표준명 글자로는 거르지 않는다(CAST 를 쓰지 않으려고 넓게 남긴다).</li>
 *   <li>하위 조회는 모두 상관 {@code EXISTS} 로 쓴다. Criteria 의 {@code expr.in(subquery)} 는 Hibernate 가 {@code IN ((select …))} 로
 *       그려 Oracle 에서 단일 행 하위 조회로 읽힐 수 있다.</li>
 * </ul>
 */
final class ColumnSearchPrefilter {

    static final char ESCAPE = '!';
    /** 그리스 어말 시그마 — {@code "Σ".toLowerCase()} 는 σ 지만 낱말 끝에서는 문자열 문맥으로 ς 가 된다. */
    private static final int GREEK_FINAL_SIGMA = 0x03C2;

    private ColumnSearchPrefilter() {
    }

    /**
     * 후보 컬럼.
     *
     * @param needleLower       {@code trim().toLowerCase(Locale.ROOT)} 한 검색어, 조건이 없으면 빈 문자열
     * @param domainNeedleLower {@code trim().toLowerCase(Locale.ROOT)} 한 도메인 키워드, 조건이 없으면 빈 문자열
     */
    static Specification<MdmColumn> columns(String needleLower, String domainNeedleLower) {
        Conditions conditions = Conditions.of(needleLower, domainNeedleLower);
        return (root, query, cb) -> conditions.predicate(root, query, cb);
    }

    /** 후보 컬럼({@link #columns} 와 같은 조건)의 시스템 매핑 전부 — Java 판정이 걸린 매핑만이 아니라 컬럼의 매핑 전체를 본다. */
    static Specification<MdmColumnSystem> mappingsOfColumns(String needleLower, String domainNeedleLower) {
        Conditions conditions = Conditions.of(needleLower, domainNeedleLower);
        return (root, query, cb) -> {
            Subquery<Long> candidate = query.subquery(Long.class);
            Root<MdmColumn> column = candidate.from(MdmColumn.class);
            candidate.select(column.get("columnId")).where(
                    cb.equal(column.get("columnId"), root.get("columnId")),
                    conditions.predicate(column, candidate, cb));
            return cb.exists(candidate);
        };
    }

    /** 미리 만든 LIKE 패턴들. null 이면 그 글자 조건을 걸지 않는다. */
    private record Conditions(String keywordPattern, boolean domainFiltered, String domainPattern) {

        static Conditions of(String needleLower, String domainNeedleLower) {
            boolean domainFiltered = !domainNeedleLower.isEmpty();
            String domainPattern = !domainFiltered || mayMatchDomainId(domainNeedleLower) ? null
                    : containsPattern(safeNeedle(domainNeedleLower));
            String keywordPattern = needleLower.isEmpty() ? null : containsPattern(safeNeedle(needleLower));
            return new Conditions(keywordPattern, domainFiltered, domainPattern);
        }

        Predicate predicate(Root<MdmColumn> column, AbstractQuery<?> query, CriteriaBuilder cb) {
            List<Predicate> and = new ArrayList<>(2);
            if (keywordPattern != null) {
                Subquery<Long> mapped = query.subquery(Long.class);
                Root<MdmColumnSystem> mapping = mapped.from(MdmColumnSystem.class);
                mapped.select(mapping.get("columnId")).where(
                        cb.equal(mapping.get("columnId"), column.get("columnId")),
                        likeLower(cb, mapping.get("physName"), keywordPattern));
                and.add(cb.or(
                        likeLower(cb, column.get("columnName"), keywordPattern),
                        likeLower(cb, column.get("physName"), keywordPattern),
                        cb.exists(mapped)));
            }
            if (domainFiltered) {
                Subquery<Long> domains = query.subquery(Long.class);
                Root<MdmDomain> domain = domains.from(MdmDomain.class);
                Predicate sameDomain = cb.equal(domain.get("domainId"), column.get("domainId"));
                domains.select(domain.get("domainId")).where(domainPattern == null ? sameDomain : cb.and(sameDomain, cb.or(
                        likeLower(cb, domain.get("domainName"), domainPattern),
                        likeLower(cb, domain.get("stdName"), domainPattern))));
                and.add(cb.exists(domains));
            }
            return cb.and(and.toArray(Predicate[]::new));
        }
    }

    /** Java 는 도메인 ID 를 {@code String.valueOf(Long)} 로 비교한다 — 조건이 숫자와 {@code -} 로만 되어 있을 때만 ID 에 맞을 수 있다. */
    static boolean mayMatchDomainId(String needle) {
        return needle.chars().allMatch(c -> (c >= '0' && c <= '9') || c == '-');
    }

    private static Predicate likeLower(CriteriaBuilder cb, Expression<String> value, String pattern) {
        return cb.like(cb.lower(value), pattern, ESCAPE);
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
     * 소문자 조건 값에서 안전 글자만 이어진 가장 긴 구간(같으면 앞쪽)을 돌려준다. 값이 null 이거나 안전 글자가 없으면 null.
     * 코드 포인트 단위로 자르므로 대리 쌍을 쪼개지 않는다.
     */
    static String safeNeedle(String lower) {
        if (lower == null) {
            return null;
        }
        int bestStart = 0;
        int bestEnd = 0;
        int runStart = -1;
        int i = 0;
        while (i <= lower.length()) {
            int cp = i < lower.length() ? lower.codePointAt(i) : -1;
            boolean safe = cp >= 0 && isSafe(cp);
            if (safe && runStart < 0) {
                runStart = i;
            } else if (!safe && runStart >= 0) {
                if (lower.codePointCount(runStart, i) > lower.codePointCount(bestStart, bestEnd)) {
                    bestStart = runStart;
                    bestEnd = i;
                }
                runStart = -1;
            }
            i += cp >= 0 ? Character.charCount(cp) : 1;
        }
        return bestEnd > bestStart ? lower.substring(bestStart, bestEnd) : null;
    }

    /**
     * 안전 글자 — 소문자로 바꿔도 자기이고, 소문자 변환 결과에 이 글자를 내는 원본이 자기 자신과 ASCII 대문자뿐인 글자.
     * 이런 글자로만 된 구간이 Java 소문자 변환 뒤 값에 들어 있으면, 원본에도 같은 자리에 같은 글자나 ASCII 대문자로 들어 있어 SQL
     * {@code LOWER(칸) LIKE} 가 반드시 찾는다.
     */
    static boolean isSafe(int codePoint) {
        if (codePoint == GREEK_FINAL_SIGMA || UnsafeTargets.SET.get(codePoint)) {
            return false;
        }
        String s = new String(Character.toChars(codePoint));
        return s.toLowerCase(Locale.ROOT).equals(s);
    }

    /** ASCII 대문자가 아닌 원본이 {@code toLowerCase(Locale.ROOT)} 로 내는 글자 모음 — 처음 쓸 때 한 번 계산한다. */
    private static final class UnsafeTargets {
        static final BitSet SET = compute();

        private static BitSet compute() {
            BitSet set = new BitSet(Character.MAX_CODE_POINT + 1);
            for (int cp = 0; cp <= Character.MAX_CODE_POINT; cp++) {
                if ((cp >= 'A' && cp <= 'Z') || !Character.isDefined(cp)) {
                    continue;
                }
                String source = new String(Character.toChars(cp));
                String lower = source.toLowerCase(Locale.ROOT);
                if (!lower.equals(source)) {
                    lower.codePoints().forEach(set::set);
                }
            }
            return set;
        }
    }
}
