/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 퇴직자 담당 데이터 — MDM 내부 API(/internal/mdm/userOwnership/*) 서버 간 호출
 */
package com.dongkuk.dmes.mcm.security.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 담당 데이터(MDM).
 * <ul>
 *   <li><b>MDM</b> — 서버 간 호출 {@code POST {cactus.mdm.base-url}/internal/mdm/userOwnership/{summary|handover|releaseClaims}}.
 *       헤더 {@code X-Client-Key}({@code cactus.mdm.client-key}) · {@code X-Authenticated-User: system:mcm} ·
 *       {@code X-Authenticated-Role: SYSTEM}. 응답은 감싸지 않은 JSON({@code items}·{@code cnt}).
 *       MDM 담당 칸은 모두 사용자 ID 이고 초안(DRAFT)만 넘긴다(확정본의 소유자는 이력이라 두는 것이 MDM 규칙).</li>
 * </ul>
 * MDM 주소({@code cactus.mdm.base-url})가 비면 아무것도 하지 않는다(빈 목록·0). MDM 호출이 실패하면 {@link UnavailableException}.
 *
 * <p>MCM 쪽 사번 담당 칸(옛 {@code TB_MCM_CODE_MASTER.CODE_OWNER_EMP_NO})은 V17 에서 표를 지워 남은 것이 없다.
 * {@code MCAAPUSER.TB_MCA_RULE_MASTER.RULE_OWNER_EMP_NO}(룰 담당 사번)는 다른 스키마이고 앱 코드가 쓰지 않아 다루지 않는다.
 */
@Component
public class DefaultUserOwnershipClient implements UserOwnershipClient {

    private static final Logger log = LoggerFactory.getLogger(DefaultUserOwnershipClient.class);
    static final String PATH = "/internal/mdm/userOwnership/";
    private final RestClient rest;
    private final String baseUrl;

    public DefaultUserOwnershipClient(@Value("${cactus.mdm.base-url:}") String baseUrl,
                                      @Value("${cactus.mdm.client-key:}") String clientKey) {
        this.baseUrl = baseUrl == null || baseUrl.isBlank() ? null
                : (baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
        if (this.baseUrl == null) {
            this.rest = null;
            return;
        }
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(2000);
        f.setReadTimeout(10000);
        RestClient.Builder b = RestClient.builder().requestFactory(f)
                .defaultHeader("X-Authenticated-User", "system:mcm")
                .defaultHeader("X-Authenticated-Role", "SYSTEM");
        if (clientKey != null && !clientKey.isBlank()) b.defaultHeader("X-Client-Key", clientKey);
        this.rest = b.build();
    }

    @Override
    public List<Owned> summary(List<Person> users) {
        List<Owned> out = new ArrayList<>();
        if (rest == null || users == null || users.isEmpty()) return out;
        List<Map<String, Object>> body = new ArrayList<>();
        for (Person p : users) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", p.userId());
            m.put("empNo", p.empNo());
            body.add(m);
        }
        Map<String, Object> res = post("summary", Map.of("users", body));
        for (Map<String, Object> it : items(res)) {
            out.add(new Owned(str(it.get("userId")), str(it.get("kind")), str(it.get("kindNm")), num(it.get("cnt")), false));
        }
        return out;
    }

    @Override
    public List<Owned> handover(Person from, Person to) {
        List<Owned> out = new ArrayList<>();
        if (rest == null) return out;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fromUserId", from.userId());
        body.put("fromEmpNo", from.empNo());
        body.put("toUserId", to.userId());
        body.put("toEmpNo", to.empNo());
        for (Map<String, Object> it : items(post("handover", body))) {
            out.add(new Owned(from.userId(), str(it.get("kind")), str(it.get("kindNm")), num(it.get("cnt")),
                    Boolean.TRUE.equals(it.get("skipped"))));
        }
        return out;
    }

    @Override
    public long releaseClaims(String userId) {
        if (rest == null || userId == null) return 0;
        return num(post("releaseClaims", Map.of("userId", userId)).get("cnt"));
    }

    // ── MDM 호출 ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> post(String action, Object body) {
        try {
            Map<String, Object> res = rest.post()
                    .uri(baseUrl + PATH + action)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            return res == null ? Map.of() : res;
        } catch (RestClientException ex) {
            log.warn("[UserOwnership] MDM {} 호출 실패: {}", action, ex.getMessage());
            throw new UnavailableException("MDM " + action + " 호출 실패: " + ex.getMessage(), ex);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> res) {
        Object v = res.get("items");
        if (!(v instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : v.toString();
    }

    private static long num(Object v) {
        if (v instanceof Number n) return n.longValue();
        try {
            return v == null ? 0 : Long.parseLong(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
