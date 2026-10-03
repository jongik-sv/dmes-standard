package com.dongkuk.dmes.mcm.listener;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 권한 캐시 무효화 BE → BFF 호출 — BFF 는 /api/mcm/internal/* 를 세션 대신 X-Client-Key(BFF↔BE 합의 비밀)로만 연다
 * (2026-10-03 보안 지적, 스펙 2026-10-02-widget-admin-generic §16.3). 옛 X-Internal-Bff-Call: 1 표식은 브라우저도 붙일 수 있어
 * BFF 가 더는 받지 않는다. 가짜 BFF(JDK HttpServer)로 실제 요청 헤더를 본다. @Async 는 Spring 밖이라 그대로 동기 호출된다.
 */
class RoleChangedEventListenerTest {

    private HttpServer bff;
    private final List<Map<String, String>> receivedHeaders = new ArrayList<>();
    private final List<String> receivedBodies = new ArrayList<>();

    @BeforeEach
    void startFakeBff() throws IOException {
        bff = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        bff.createContext("/api/mcm/internal/cache/invalidate-role", exchange -> {
            Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            exchange.getRequestHeaders().forEach((name, values) -> headers.put(name, String.join(",", values)));
            receivedHeaders.add(headers);
            receivedBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] ok = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, ok.length);
            exchange.getResponseBody().write(ok);
            exchange.close();
        });
        bff.start();
    }

    @AfterEach
    void stopFakeBff() {
        bff.stop(0);
    }

    private String invalidateUrl() {
        return "http://127.0.0.1:" + bff.getAddress().getPort() + "/api/mcm/internal/cache/invalidate-role";
    }

    @Test
    void 합의_비밀을_X_Client_Key_로_싣고_옛_내부_표식은_보내지_않는다() {
        new RoleChangedEventListener(invalidateUrl(), "test-client-key")
                .onRoleChanged(new RoleChangedEvent(Set.of("SYSADMIN")));

        assertEquals(1, receivedHeaders.size());
        Map<String, String> headers = receivedHeaders.get(0);
        assertEquals("test-client-key", headers.get("X-Client-Key"));
        assertNull(headers.get("X-Internal-Bff-Call"));
        assertEquals("{\"roleId\":\"SYSADMIN\"}", receivedBodies.get(0));
    }

    @Test
    void 비밀이_비어_있으면_X_Client_Key_없이_보낸다_BFF_가_403_으로_거절한다() {
        new RoleChangedEventListener(invalidateUrl(), " ")
                .onRoleChanged(new RoleChangedEvent(Set.of("SYSADMIN")));

        assertEquals(1, receivedHeaders.size());
        assertNull(receivedHeaders.get(0).get("X-Client-Key"));
        assertNull(receivedHeaders.get(0).get("X-Internal-Bff-Call"));
    }
}
