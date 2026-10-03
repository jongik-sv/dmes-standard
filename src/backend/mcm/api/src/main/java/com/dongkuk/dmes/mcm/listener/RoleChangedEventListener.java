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
 *
 * <p>BFF 는 이 경로를 세션 대신 BE → BFF 전용 비밀({@code mcm.bff.internal-secret} ← 환경변수 {@code BFF_INTERNAL_SECRET})로만
 * 연다. 이 비밀을 {@value #INTERNAL_SECRET_HEADER} 헤더에 싣는다. BFF → BE 마스터 비밀({@code BACKEND_CLIENT_KEY} =
 * {@code cactus.security.client-key}, BE 에서 아무 사용자로 인증된다)은 보내지 않는다 — BFF 주소가 잘못 잡히면 그 주소의 아무
 * 프로세스가 마스터 비밀을 받게 되기 때문이다(2026-10-03 보안 지적). 옛 {@code X-Internal-Bff-Call: 1} 표식도 보내지 않는다.
 *
 * <p>BFF 주소({@code mcm.bff.invalidate-role-url} ← {@code BFF_INVALIDATE_ROLE_URL})에는 코드 기본값이 없다. 주소나 비밀이
 * 비어 있으면 부르지 않고 디버그 로그 한 줄만 남긴다(비밀은 로그에 남기지 않는다). 그때 권한 변경은 BFF 캐시 TTL(5분)로 반영된다.
 * 로컬은 application-local.yml 이 두 값을 채운다.
 */
@Component
public class RoleChangedEventListener {

    private static final Logger log = LoggerFactory.getLogger(RoleChangedEventListener.class);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    /** BE → BFF 내부 호출 비밀을 싣는 요청 헤더. BFF lib/http/internal-call.ts 의 INTERNAL_SECRET_HEADER 와 같다. */
    static final String INTERNAL_SECRET_HEADER = "X-Bff-Internal-Secret";

    private final String bffInvalidateUrl;
    /** BE → BFF 전용 비밀 — BFF 가 {@value #INTERNAL_SECRET_HEADER} 로 내부 호출을 확인한다. 로그에 남기지 않는다. */
    private final String internalSecret;

    public RoleChangedEventListener(
            @Value("${mcm.bff.invalidate-role-url:}") String bffInvalidateUrl,
            @Value("${mcm.bff.internal-secret:}") String internalSecret) {
        this.bffInvalidateUrl = bffInvalidateUrl == null ? "" : bffInvalidateUrl.trim();
        this.internalSecret = internalSecret == null ? "" : internalSecret;
    }

    @EventListener
    @Async
    public void onRoleChanged(RoleChangedEvent event) {
        if (event.getRoleIds() == null || event.getRoleIds().isEmpty()) return;
        if (bffInvalidateUrl.isEmpty() || internalSecret.isBlank()) {
            log.debug("BFF 권한 캐시 무효화 생략 — mcm.bff.invalidate-role-url 또는 mcm.bff.internal-secret 미설정(BFF 캐시 TTL 5분으로 반영): roleIds={}",
                    event.getRoleIds());
            return;
        }
        for (String roleId : event.getRoleIds()) {
            invalidate(roleId);
        }
    }

    private void invalidate(String roleId) {
        try {
            String body = "{\"roleId\":\"" + escape(roleId) + "\"}";
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(bffInvalidateUrl))
                    .timeout(Duration.ofSeconds(2))
                    .header("Content-Type", "application/json")
                    .header(INTERNAL_SECRET_HEADER, internalSecret);
            HttpRequest request = builder
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
