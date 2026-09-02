package com.dongkuk.dmes.mcm.listener;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 역할 변경 이벤트 → BFF 캐시 무효화 트리거 — 02 §5-4 권고.
 *
 * <p>{@link RoleChangedEvent} 수신 시 BFF 의 {@code /api/mcm/internal/cache/invalidate-role}
 * 엔드포인트를 호출하여 in-process 권한 캐시를 즉시 무효화. 5분 TTL 대기 없이 권한 변경이 반영됨.
 *
 * <p>BFF 라우트는 강경민 매니저 영역. 본 listener 는 BE → BFF 호출 책임만.
 *
 * <p>호출 실패는 swallow (로그만). 실패해도 5분 TTL 만료 후 자동 재조회로 자연 복구.
 */
@Component
public class RoleChangedEventListener {

    private static final Logger log = LoggerFactory.getLogger(RoleChangedEventListener.class);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    private final String bffInvalidateUrl;
    private final String bffInternalKey;

    public RoleChangedEventListener(
            @Value("${mcm.bff.invalidate-role-url:http://localhost:3000/api/mcm/internal/cache/invalidate-role}") String bffInvalidateUrl,
            @Value("${mcm.bff.internal-call-header:X-Internal-Bff-Call: 1}") String bffInternalKey) {
        this.bffInvalidateUrl = bffInvalidateUrl;
        this.bffInternalKey = bffInternalKey;
    }

    @EventListener
    @Async
    public void onRoleChanged(RoleChangedEvent event) {
        if (event.getRoleIds() == null || event.getRoleIds().isEmpty()) return;
        for (String roleId : event.getRoleIds()) {
            invalidate(roleId);
        }
    }

    private void invalidate(String roleId) {
        try {
            String body = "{\"roleId\":\"" + escape(roleId) + "\"}";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(bffInvalidateUrl))
                    .timeout(Duration.ofSeconds(2))
                    .header("Content-Type", "application/json")
                    .header("X-Internal-Bff-Call", "1")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                log.warn("BFF invalidate-role 응답 {}: roleId={}", response.statusCode(), roleId);
            }
        } catch (Exception e) {
            log.warn("BFF invalidate-role 호출 실패 (swallow): roleId={}, msg={}", roleId, e.getMessage());
        }
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
