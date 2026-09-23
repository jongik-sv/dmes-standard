package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 약어 제안(TSK-04-04 design.md §6.10, 불변 규칙 I19). 영문명에서 영숫자만 남긴 대문자 {@code base0} 의 앞 세 글자,
 * 이어서 한 글자씩 늘린 접두, 이어서 {@code base0 + 2..9} 순으로 후보를 만들고 사용 중(대소문자 무시)이 아닌
 * 후보를 최대 3개 고른다.
 */
public final class AbbrSuggester {

    private static final int BASE_LENGTH = 3;
    private static final int MAX_ALTERNATIVES = 3;

    private AbbrSuggester() {
    }

    public static AbbrSuggestion suggest(String engName, Set<String> used) {
        String base0 = engName == null ? "" : engName.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        if (base0.isEmpty() || base0.charAt(0) < 'A' || base0.charAt(0) > 'Z') {
            return new AbbrSuggestion(null, false, null, List.of());
        }
        Set<String> usedUpper = new HashSet<>();
        if (used != null) {
            for (String abbr : used) {
                if (abbr != null) {
                    usedUpper.add(abbr.trim().toUpperCase(Locale.ROOT));
                }
            }
        }
        List<String> candidates = new ArrayList<>();
        for (int length = Math.min(BASE_LENGTH, base0.length()); length <= base0.length(); length++) {
            candidates.add(base0.substring(0, length));
        }
        for (int n = 2; n <= 9; n++) {
            candidates.add(base0 + n);
        }
        String base = candidates.get(0);
        List<String> alternatives = new ArrayList<>();
        for (String candidate : candidates) {
            if (alternatives.size() == MAX_ALTERNATIVES) {
                break;
            }
            if (!usedUpper.contains(candidate) && !alternatives.contains(candidate)) {
                alternatives.add(candidate);
            }
        }
        return new AbbrSuggestion(base, usedUpper.contains(base),
                alternatives.isEmpty() ? null : alternatives.get(0), List.copyOf(alternatives));
    }
}
