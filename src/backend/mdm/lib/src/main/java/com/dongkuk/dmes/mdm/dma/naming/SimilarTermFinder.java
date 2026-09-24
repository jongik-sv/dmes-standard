package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 유사어 1차 문자열 추천(TSK-04-04 design.md §6.9, 불변 규칙 I27). 용어마다 해당하는 근거 중 최고 점수를 쓰고,
 * 점수 내림 → 표기 → 의미 번호 순으로 최대 20건을 돌려준다. 임베딩 2차 추천은 TSK-04-02 몫이다(F22).
 */
public final class SimilarTermFinder {

    public static final int MAX_RESULTS = 20;

    private static final Comparator<SimilarTerm> ORDER = Comparator
            .comparingDouble(SimilarTerm::score).reversed()
            .thenComparing(s -> s.term().termName(), Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparingInt(s -> s.term().senseNo());

    private SimilarTermFinder() {
    }

    public static List<SimilarTerm> find(String termName, String engName, TermDictionary dict) {
        String t = NamingRules.normalizeKey(termName);
        String eng = engName == null ? "" : engName.trim().toLowerCase(Locale.ROOT);
        List<SimilarTerm> out = new ArrayList<>();
        for (TermEntry term : dict.all()) {
            String reason = null;
            double score = 0;
            String nameKey = NamingRules.normalizeKey(term.termName());
            if (!t.isEmpty() && nameKey.equals(t)) {
                reason = "EXACT";
                score = 1.0;
            }
            String termEng = term.engName() == null ? "" : term.engName().trim().toLowerCase(Locale.ROOT);
            if (!eng.isEmpty() && !termEng.isEmpty()) {
                double s = termEng.equals(eng) ? 0.95 : containsEither(termEng, eng, 3) ? 0.6 : 0;
                if (s > score) {
                    reason = "ENG_NAME";
                    score = s;
                }
            }
            if (!t.isEmpty()) {
                for (String key : dict.synonymAliasKeys(term)) {
                    double s = key.equals(t) ? 0.9 : containsEither(key, t, 2) ? 0.75 : 0;
                    if (s > score) {
                        reason = "SYNONYM_ALIAS";
                        score = s;
                    }
                }
                if (0.8 > score && !nameKey.equals(t) && containsEither(nameKey, t, 2)) {
                    reason = "NAME_PARTIAL";
                    score = 0.8;
                }
                if (0.7 > score && NamingRules.length(nameKey) >= 2 && NamingRules.length(t) >= 2
                        && levenshtein(nameKey, t) <= 1) {
                    reason = "NAME_SIMILAR";
                    score = 0.7;
                }
            }
            if (score > 0) {
                out.add(new SimilarTerm(term, reason, score));
            }
        }
        out.sort(ORDER);
        return out.size() > MAX_RESULTS ? List.copyOf(out.subList(0, MAX_RESULTS)) : List.copyOf(out);
    }

    /** 한쪽이 다른 쪽을 포함하고, 짧은 쪽이 minShorter 글자 이상. */
    private static boolean containsEither(String a, String b, int minShorter) {
        String shorter = NamingRules.length(a) <= NamingRules.length(b) ? a : b;
        if (NamingRules.length(shorter) < minShorter) {
            return false;
        }
        return a.contains(b) || b.contains(a);
    }

    /** code point 기준 Levenshtein 거리. */
    static int levenshtein(String a, String b) {
        int[] x = a.codePoints().toArray();
        int[] y = b.codePoints().toArray();
        int[] prev = new int[y.length + 1];
        int[] cur = new int[y.length + 1];
        for (int j = 0; j <= y.length; j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= x.length; i++) {
            cur[0] = i;
            for (int j = 1; j <= y.length; j++) {
                int cost = x[i - 1] == y[j - 1] ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] swap = prev;
            prev = cur;
            cur = swap;
        }
        return prev[y.length];
    }
}
