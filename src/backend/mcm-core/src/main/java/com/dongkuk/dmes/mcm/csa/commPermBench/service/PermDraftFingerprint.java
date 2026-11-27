/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 초안 범위 지문(D22) — 초안이 건드린 범위의 현재 행 SHA-256. 저장(b2)과 적용 때 충돌 검사(b4)가 함께 쓴다
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * 범위 지문. 범위 키는 변경 한 줄이 <b>고치는 행의 주인</b>이다.
 * <ul>
 *   <li>USER_GRP(key1=사람, key2=그룹) → {@code user:사람} (그 사람의 그룹 목록)</li>
 *   <li>GRP_ROLE(key1=그룹, key2=역할) → {@code group:그룹} (그 그룹의 역할 목록)</li>
 *   <li>ROLE_OBJ(key1=역할, key2=오브젝트) → {@code role:역할} (그 역할의 퍼미션 행 전부)</li>
 * </ul>
 * 지문 = SHA-256(정렬한 줄들을 줄바꿈으로 이은 UTF-8, 16진 소문자). 줄 모양은 {@link PermScopeRowSource}.
 * 행이 하나도 없는 범위도 지문이 있다(빈 문자열의 해시) — 「없던 것이 생김」도 충돌로 잡힌다.
 *
 * <p>알려진 오탐: 줄은 DB 에 저장된 글자 그대로 비교하므로 뜻이 같아도 글자가 다르면(예 {@code save,find} ↔ {@code find,save})
 * 충돌로 본다. 옛 화면이 값을 다시 저장해도 충돌로 잡히는 쪽이 안전해 그대로 둔다.
 *
 * <p>저장된 모양(BASE_FP_JSON) = {@code {"group:G":"hex","role:R":"hex","user:U":"hex"}}, 키 정렬.
 */
@Component
public class PermDraftFingerprint {

    public static final String USER = "user:";
    public static final String GROUP = "group:";
    public static final String ROLE = "role:";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final PermScopeRowSource rows;

    public PermDraftFingerprint(PermScopeRowSource rows) {
        this.rows = rows;
    }

    /** 변경 목록이 건드리는 범위 키(정렬·중복 제거). 알 수 없는 tp 는 건너뛴다. */
    public static TreeSet<String> scopeKeys(Collection<PermChange> changes) {
        TreeSet<String> keys = new TreeSet<>();
        if (changes == null) {
            return keys;
        }
        for (PermChange c : changes) {
            if (c == null || c.tp() == null || c.key1() == null) {
                continue;
            }
            switch (c.tp()) {
                case PermChange.USER_GRP -> keys.add(USER + c.key1());
                case PermChange.GRP_ROLE -> keys.add(GROUP + c.key1());
                case PermChange.ROLE_OBJ -> keys.add(ROLE + c.key1());
                default -> { }
            }
        }
        return keys;
    }

    /** 줄 목록의 지문. 줄 순서와 무관하다(정렬 뒤 해시). */
    public static String hashRows(Collection<String> lines) {
        List<String> sorted = new ArrayList<>(lines == null ? List.of() : lines);
        sorted.sort(null);
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(String.join("\n", sorted).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 은 모든 JVM 이 가진다
        }
    }

    /** 범위 키들의 지금 지문(키 정렬). */
    public Map<String, String> compute(Collection<String> scopeKeys) {
        Map<String, String> out = new TreeMap<>();
        if (scopeKeys == null || scopeKeys.isEmpty()) {
            return out;
        }
        Map<String, List<String>> now = rows.rowsOf(scopeKeys);
        for (String k : scopeKeys) {
            out.put(k, hashRows(now.getOrDefault(k, List.of())));
        }
        return out;
    }

    /**
     * 저장 때 기준 지문 갱신(D22): {@code keys}(새 변경 목록의 범위)에 이미 있는 기준은 <b>그대로 둔다</b>(처음 건드렸을 때의 값),
     * 새 범위만 지금 지문을 계산해 더하고, 더 이상 쓰이지 않는 범위는 뺀다.
     */
    public Map<String, String> extend(Map<String, String> base, Collection<String> keys) {
        Map<String, String> out = new TreeMap<>();
        List<String> fresh = new ArrayList<>();
        for (String k : keys) {
            String old = base == null ? null : base.get(k);
            if (old != null) {
                out.put(k, old);
            } else {
                fresh.add(k);
            }
        }
        out.putAll(compute(fresh));
        return out;
    }

    /** 저장된 기준과 지금 지문이 다른 범위 키(정렬). 기준에 있는 키만 본다. */
    public static List<String> differing(Map<String, String> base, Map<String, String> now) {
        List<String> out = new ArrayList<>();
        for (Map.Entry<String, String> e : new TreeMap<>(base).entrySet()) {
            if (!e.getValue().equals(now.get(e.getKey()))) {
                out.add(e.getKey());
            }
        }
        return out;
    }

    /** 적용 때 호출(b4): 저장된 BASE_FP_JSON 을 지금 값과 비교해 충돌 범위 키를 돌려준다. 비면 충돌 없음. */
    public List<String> conflicts(String baseFpJson) {
        Map<String, String> base = fromJson(baseFpJson);
        return differing(base, compute(base.keySet()));
    }

    public static String toJson(Map<String, String> fp) {
        try {
            return JSON.writeValueAsString(new TreeMap<>(fp == null ? Map.of() : fp));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "PERM_DRAFT_CORRUPT: 기준 지문을 JSON 으로 만들 수 없습니다");
        }
    }

    /** null·빈 문자열 = 빈 맵. 깨진 JSON = {@code PERM_DRAFT_CORRUPT}. */
    public static Map<String, String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return new TreeMap<>();
        }
        try {
            return new TreeMap<>(JSON.readValue(json, new TypeReference<Map<String, String>>() { }));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "PERM_DRAFT_CORRUPT: 기준 지문(BASE_FP_JSON)을 읽을 수 없습니다");
        }
    }
}
