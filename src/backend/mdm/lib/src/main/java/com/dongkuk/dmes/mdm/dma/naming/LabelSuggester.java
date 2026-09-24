package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 표시명 3종 제안(TSK-04-04 design.md §6.8, 불변 규칙 I10). 긴 = 논리명(24자 초과면 빈 값), 중간·짧은 = 논리명 →
 * 공백 제거 → 앞 단어부터 하나씩 떼고 공백 제거 순으로 12·6자 이하인 첫 후보. 길이는 code point 수다.
 */
public final class LabelSuggester {

    private LabelSuggester() {
    }

    public static LabelSuggestion suggest(String logicalName) {
        String name = NamingRules.normalizeLogicalName(logicalName);
        if (name.isEmpty()) {
            return new LabelSuggestion("", "", "");
        }
        List<String> candidates = candidates(name);
        String labelLong = NamingRules.length(name) <= NamingRules.LABEL_LONG_MAX ? name : "";
        return new LabelSuggestion(labelLong,
                pick(candidates, NamingRules.LABEL_MID_MAX), pick(candidates, NamingRules.LABEL_SHORT_MAX));
    }

    private static List<String> candidates(String name) {
        String[] words = name.split(" ");
        List<String> out = new ArrayList<>();
        out.add(name);
        out.add(name.replace(" ", ""));
        for (int k = 1; k < words.length; k++) {
            out.add(String.join("", Arrays.asList(words).subList(k, words.length)));
        }
        return out;
    }

    private static String pick(List<String> candidates, int limit) {
        for (String candidate : candidates) {
            if (NamingRules.length(candidate) <= limit) {
                return candidate;
            }
        }
        return "";
    }
}
