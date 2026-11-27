package com.dongkuk.dmes.mcm.security.perm;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 퍼미션 토큰 도구.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 쉼표 구분 토큰 문자열 처리. 순수 정적 메서드만 둔다.
 */
public final class PermTokens {
    private static final List<String> READ_PREFIXES = List.of("search", "find", "get", "list", "lov");
    private static final List<String> READ_EXACT = List.of("view", "query");

    private PermTokens() {
    }

    /** 쉼표로 쪼개 trim·빈 값 제거·중복 제거(처음 순서 유지). null 이면 빈 목록. 결과는 불변. */
    public static List<String> parse(String csv) {
        if (csv == null) {
            return List.of();
        }
        Set<String> out = new LinkedHashSet<>();
        for (String t : csv.split(",")) {
            String s = t.trim();
            if (!s.isEmpty()) {
                out.add(s);
            }
        }
        return List.copyOf(out);
    }

    /** 공백 없이 쉼표로 잇는다. null·빈 목록은 빈 문자열(""), null 원소는 건너뛴다. */
    public static String join(Collection<String> tokens) {
        if (tokens == null || tokens.isEmpty()) {
            return "";
        }
        List<String> out = new ArrayList<>();
        for (String t : tokens) {
            if (t != null) {
                out.add(t);
            }
        }
        return String.join(",", out);
    }

    /** values 중 allowed 에 없는 값(values 순서 유지). */
    public static List<String> notIn(Collection<String> values, Collection<String> allowed) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        Set<String> ok = allowed == null ? Set.of() : new LinkedHashSet<>(allowed);
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (!ok.contains(v)) {
                out.add(v);
            }
        }
        return out;
    }

    /**
     * 「조회만」 프리셋(D18). allowed 중 이름 규칙에 맞는 것만 allowed 순서대로 돌려준다.
     * 규칙: 접두 search·find·get·list·lov / 접미 Lov / 정확히 view·query.
     * 접두는 대소문자를 구분하는 단순 startsWith 라서 searchable 같은 단어도 맞는 것으로 본다.
     */
    public static List<String> readPreset(Collection<String> allowed) {
        if (allowed == null) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String a : allowed) {
            if (a != null && isReadOnly(a)) {
                out.add(a);
            }
        }
        return out;
    }

    private static boolean isReadOnly(String name) {
        if (READ_EXACT.contains(name) || name.endsWith("Lov")) {
            return true;
        }
        for (String p : READ_PREFIXES) {
            if (name.startsWith(p)) {
                return true;
            }
        }
        return false;
    }
}
