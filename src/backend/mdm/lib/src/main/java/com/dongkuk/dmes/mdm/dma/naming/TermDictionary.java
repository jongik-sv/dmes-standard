package com.dongkuk.dmes.mdm.dma.naming;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 용어 목록 → 표면형 색인·약어 색인(TSK-04-04 design.md §6.4).
 *
 * <p>표면형 = 표기(NAME) + 동의어(SYNONYM) + 별칭(ALIAS)(불변 규칙 I5). 키는 {@link NamingRules#normalizeKey}.
 * 동의어·별칭 JSON 은 D3 관대 파서로 읽는다: 문자열 원소는 끝의 {@code (시스템)} 을 떼고, 객체 원소는
 * {@code name}, 없으면 {@code term} 문자열을 쓴다. 그 밖의 모양과 파싱 오류는 조용히 건너뛴다.
 *
 * <p>요청마다 새로 만든다(캐시 없음, 불변 규칙 I26).
 */
public final class TermDictionary {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern TRAILING_PAREN = Pattern.compile("\\s*\\([^()]*\\)\\s*$");

    /** 후보 정렬: via → senseNo → termId(불변 규칙 I6). */
    private static final Comparator<TermCandidate> CANDIDATE_ORDER = Comparator
            .comparing((TermCandidate c) -> c.via().ordinal())
            .thenComparingInt(c -> c.term().senseNo())
            .thenComparing(c -> c.term().termId(), Comparator.nullsLast(Comparator.naturalOrder()));

    private final List<TermEntry> all;
    private final Map<String, List<TermCandidate>> surfaces;
    private final Map<Long, List<String>> synonymAliasKeys;
    private final Map<String, TermEntry> abbrs;
    private final int maxSurfaceLength;
    private final int maxAbbrParts;

    private TermDictionary(List<TermEntry> all, Map<String, List<TermCandidate>> surfaces,
                           Map<Long, List<String>> synonymAliasKeys, Map<String, TermEntry> abbrs,
                           int maxSurfaceLength, int maxAbbrParts) {
        this.all = all;
        this.surfaces = surfaces;
        this.synonymAliasKeys = synonymAliasKeys;
        this.abbrs = abbrs;
        this.maxSurfaceLength = maxSurfaceLength;
        this.maxAbbrParts = maxAbbrParts;
    }

    public static TermDictionary of(List<TermEntry> terms) {
        List<TermEntry> all = terms == null ? List.of() : List.copyOf(terms);
        Map<String, List<TermCandidate>> raw = new HashMap<>();
        Map<Long, List<String>> synonymAliasKeys = new HashMap<>();
        Map<String, TermEntry> abbrs = new HashMap<>();
        int maxSurface = 0;
        int maxParts = 0;
        for (TermEntry term : all) {
            maxSurface = Math.max(maxSurface, put(raw, NamingRules.normalizeKey(term.termName()), term, MatchVia.NAME));
            List<String> keys = new ArrayList<>();
            for (String synonym : parseSurfaces(term.synonymsJson())) {
                String key = NamingRules.normalizeKey(synonym);
                maxSurface = Math.max(maxSurface, put(raw, key, term, MatchVia.SYNONYM));
                addKey(keys, key);
            }
            for (String alias : parseSurfaces(term.aliasesJson())) {
                String key = NamingRules.normalizeKey(alias);
                maxSurface = Math.max(maxSurface, put(raw, key, term, MatchVia.ALIAS));
                addKey(keys, key);
            }
            synonymAliasKeys.put(term.termId(), List.copyOf(keys));
            String abbr = term.engAbbr();
            if (abbr != null && !abbr.isBlank()) {
                String upper = abbr.trim().toUpperCase(Locale.ROOT);
                abbrs.merge(upper, term, (a, b) -> smallerId(a, b));
                maxParts = Math.max(maxParts, NamingRules.physTokens(upper).size());
            }
        }
        Map<String, List<TermCandidate>> surfaces = new HashMap<>();
        raw.forEach((key, list) -> surfaces.put(key, dedupe(list)));
        return new TermDictionary(all, surfaces, synonymAliasKeys, abbrs, maxSurface, maxParts);
    }

    /** 표면형 후보. 키는 정규화해서 찾는다. 정렬·termId 중복 제거가 끝난 목록이다. */
    public List<TermCandidate> candidates(String surface) {
        return surfaces.getOrDefault(NamingRules.normalizeKey(surface), List.of());
    }

    /** 이미 정규화된 키로 찾는다(분해 내부용). */
    List<TermCandidate> candidatesByKey(String key) {
        return surfaces.getOrDefault(key, List.of());
    }

    boolean hasKey(String key) {
        return surfaces.containsKey(key);
    }

    /** 약어(대소문자 무시)로 용어를 찾는다. 없으면 null. */
    public TermEntry byAbbr(String abbr) {
        if (abbr == null) {
            return null;
        }
        return abbrs.get(abbr.trim().toUpperCase(Locale.ROOT));
    }

    /** 용어의 동의어·별칭 정규화 키. */
    public List<String> synonymAliasKeys(TermEntry term) {
        return synonymAliasKeys.getOrDefault(term.termId(), List.of());
    }

    public Set<String> usedAbbrUpper() {
        return Collections.unmodifiableSet(new HashSet<>(abbrs.keySet()));
    }

    public List<TermEntry> all() {
        return all;
    }

    public int maxSurfaceLength() {
        return maxSurfaceLength;
    }

    public int maxAbbrParts() {
        return maxAbbrParts;
    }

    /** D3 관대 파서 — 동의어·별칭 JSON 에서 표면형 문자열만 뽑는다. */
    static List<String> parseSurfaces(String json) {
        List<String> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        JsonNode root;
        try {
            root = JSON.readTree(json);
        } catch (Exception e) {
            return out;
        }
        if (root == null || !root.isArray()) {
            return out;
        }
        for (JsonNode element : root) {
            String text = null;
            if (element.isTextual()) {
                text = element.asText();
            } else if (element.isObject()) {
                JsonNode name = element.get("name");
                if (name == null || !name.isTextual()) {
                    name = element.get("term");
                }
                if (name != null && name.isTextual()) {
                    text = name.asText();
                }
            }
            if (text != null) {
                String stripped = TRAILING_PAREN.matcher(text).replaceFirst("").trim();
                if (!stripped.isEmpty()) {
                    out.add(stripped);
                }
            }
        }
        return out;
    }

    private static int put(Map<String, List<TermCandidate>> index, String key, TermEntry term, MatchVia via) {
        if (key.isEmpty()) {
            return 0;
        }
        index.computeIfAbsent(key, k -> new ArrayList<>()).add(new TermCandidate(term, via));
        return key.length();
    }

    private static void addKey(List<String> keys, String key) {
        if (!key.isEmpty() && !keys.contains(key)) {
            keys.add(key);
        }
    }

    private static List<TermCandidate> dedupe(List<TermCandidate> list) {
        List<TermCandidate> sorted = new ArrayList<>(list);
        sorted.sort(CANDIDATE_ORDER);
        Map<Long, TermCandidate> byId = new LinkedHashMap<>();
        Set<TermCandidate> noId = new LinkedHashSet<>();
        for (TermCandidate candidate : sorted) {
            Long id = candidate.term().termId();
            if (id == null) {
                noId.add(candidate);
            } else {
                byId.putIfAbsent(id, candidate);
            }
        }
        List<TermCandidate> out = new ArrayList<>(byId.values());
        out.addAll(noId);
        return List.copyOf(out);
    }

    private static TermEntry smallerId(TermEntry a, TermEntry b) {
        if (a.termId() == null) {
            return b;
        }
        if (b.termId() == null) {
            return a;
        }
        return a.termId() <= b.termId() ? a : b;
    }
}
