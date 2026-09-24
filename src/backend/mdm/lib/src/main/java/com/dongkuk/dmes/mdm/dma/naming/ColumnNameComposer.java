package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 한국어 논리명 → 표준 물리명 분해({@link #forward})와 물리명 → 논리명 역분해({@link #reverse})
 * (TSK-04-04 design.md §6.5·§6.6, 원천 02-term-domain-column.md 「컬럼명 속성」).
 */
public final class ColumnNameComposer {

    private final TermDictionary dict;

    public ColumnNameComposer(TermDictionary dict) {
        this.dict = dict;
    }

    /**
     * 정방향 분해. 덩어리마다 왼쪽부터 최장 일치(불변 규칙 I2)로 자르고, 일치가 없으면 다음에 사전 표면형이
     * 시작되는 위치 직전까지를 미등록 토큰 하나로 묶는다(I3).
     */
    public NameComposition forward(String input) {
        String normalized = NamingRules.normalizeLogicalName(input);
        List<NameToken> tokens = new ArrayList<>();
        for (String chunk : NamingRules.CHUNK_SEPARATOR.split(normalized)) {
            if (chunk.isEmpty()) {
                continue;
            }
            splitChunk(chunk, tokens);
        }
        List<String> logical = new ArrayList<>(tokens.size());
        List<String> phys = new ArrayList<>(tokens.size());
        boolean placeholder = false;
        for (NameToken token : tokens) {
            logical.add(token.selected() != null ? token.selected().termName() : token.surface());
            phys.add(token.abbr());
            placeholder |= isPlaceholder(token.status());
        }
        return new NameComposition(Direction.FORWARD, input, List.copyOf(tokens),
                String.join(" ", logical), String.join("_", phys), placeholder);
    }

    /** 역분해. {@code _} 조각 여러 개로 된 약어까지 최장 일치하고 대소문자를 무시한다(불변 규칙 I8). */
    public NameComposition reverse(String input) {
        String normalized = input == null ? "" : input.trim().toUpperCase(Locale.ROOT);
        List<String> parts = NamingRules.physTokens(normalized);
        List<NameToken> tokens = new ArrayList<>();
        int i = 0;
        while (i < parts.size()) {
            TermEntry matched = null;
            int used = 0;
            for (int n = Math.min(dict.maxAbbrParts(), parts.size() - i); n >= 1; n--) {
                TermEntry term = dict.byAbbr(String.join("_", parts.subList(i, i + n)));
                if (term != null) {
                    matched = term;
                    used = n;
                    break;
                }
            }
            int seq = tokens.size() + 1;
            if (matched != null) {
                String abbr = String.join("_", parts.subList(i, i + used));
                tokens.add(new NameToken(seq, abbr, TokenStatus.MATCHED, matched, abbr,
                        List.of(new TermCandidate(matched, MatchVia.NAME))));
                i += used;
            } else {
                tokens.add(new NameToken(seq, parts.get(i), TokenStatus.UNKNOWN, null, parts.get(i), List.of()));
                i += 1;
            }
        }
        List<String> logical = new ArrayList<>(tokens.size());
        boolean placeholder = false;
        for (NameToken token : tokens) {
            if (token.status() == TokenStatus.UNKNOWN) {
                logical.add(NamingRules.PLACEHOLDER);
                placeholder = true;
            } else {
                logical.add(token.selected().termName());
            }
        }
        return new NameComposition(Direction.REVERSE, input, List.copyOf(tokens),
                String.join(" ", logical), normalized, placeholder);
    }

    /** UNKNOWN·NO_ABBR 은 물리명에서 {@code ***} 자리다(불변 규칙 I1). */
    public static boolean isPlaceholder(TokenStatus status) {
        return status == TokenStatus.UNKNOWN || status == TokenStatus.NO_ABBR;
    }

    private void splitChunk(String chunk, List<NameToken> tokens) {
        String key = chunk.toUpperCase(Locale.ROOT);
        int i = 0;
        while (i < key.length()) {
            int length = longestMatchAt(key, i);
            if (length > 0) {
                tokens.add(resolved(tokens.size() + 1, chunk.substring(i, i + length),
                        dict.candidatesByKey(key.substring(i, i + length))));
                i += length;
                continue;
            }
            int j = i + 1;
            while (j < key.length() && longestMatchAt(key, j) == 0) {
                j++;
            }
            tokens.add(new NameToken(tokens.size() + 1, chunk.substring(i, j), TokenStatus.UNKNOWN, null,
                    NamingRules.PLACEHOLDER, List.of()));
            i = j;
        }
    }

    private int longestMatchAt(String key, int start) {
        for (int length = Math.min(dict.maxSurfaceLength(), key.length() - start); length >= 1; length--) {
            if (dict.hasKey(key.substring(start, start + length))) {
                return length;
            }
        }
        return 0;
    }

    private static NameToken resolved(int seq, String surface, List<TermCandidate> candidates) {
        TermCandidate first = candidates.get(0);
        TokenStatus status;
        if (candidates.size() > 1) {
            status = TokenStatus.AMBIGUOUS;
        } else {
            status = first.via() == MatchVia.SYNONYM ? TokenStatus.SYNONYM : TokenStatus.MATCHED;
        }
        TermEntry selected = first.term();
        String abbr = selected.engAbbr();
        if (abbr == null || abbr.isBlank()) {
            status = TokenStatus.NO_ABBR;
            abbr = NamingRules.PLACEHOLDER;
        }
        return new NameToken(seq, surface, status, selected, abbr, candidates);
    }
}
