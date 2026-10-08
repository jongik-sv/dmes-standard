package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * 예약 작업 접수 {@code POST /internal/job/run} 의 보안(설계 §4.10) — mdm 앱을 실제로 띄워 ClientKeyFilter → 컨트롤러 주체 검사를 확인한다.
 * 보안 설정은 바꾸지 않는다: /internal/** 는 anyRequest().authenticated() 이고, ClientKeyFilter 가 X-Authenticated-* 헤더로 주체를 세운다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "cactus.security.client-key=" + JobRunHttpSecurityTest.KEY)
@ActiveProfiles("local")
class JobRunHttpSecurityTest extends AbstractMdmSharedDbTest {

    static final String KEY = "mdm-job-test-client-key";

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();

    private static final String BODY_OTHER_MODULE = """
            {"runId":"r1","jobId":"mcm.x","module":"MCM","serviceId":"jobCode","action":"run","inputs":{},"varTypes":{},"config":{"handlerId":"x"},
             "timeoutSec":60,"schedAt":"2026-10-09T02:00:00","manual":false}
            """;
    private static final String BODY_NO_HANDLER = """
            {"runId":"r1","jobId":"mdm.x","module":"MDM","serviceId":"jobCode","action":"run","inputs":{},"varTypes":{},"config":{"handlerId":"no.such"},
             "timeoutSec":60,"schedAt":"2026-10-09T02:00:00","manual":false}
            """;

    private HttpResponse<String> post(String body, String key, String user, String role) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create("http://127.0.0.1:" + port + "/internal/job/run"))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        if (key != null) b.header("X-Client-Key", key);
        if (user != null) b.header("X-Authenticated-User", user);
        if (role != null) b.header("X-Authenticated-Role", role);
        return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void 키가_없으면_401() throws Exception {
        assertEquals(401, post(BODY_NO_HANDLER, null, "system:mcm", "SYSTEM").statusCode());
        assertEquals(401, post(BODY_NO_HANDLER, "wrong", "system:mcm", "SYSTEM").statusCode());
    }

    @Test
    void 키는_맞아도_주체_헤더가_없으면_거절된다() throws Exception {
        int status = post(BODY_NO_HANDLER, KEY, null, null).statusCode();
        assertTrue(status == 401 || status == 403, "상태 " + status);
    }

    @Test
    void 사용자_주체는_403() throws Exception {
        assertEquals(403, post(BODY_NO_HANDLER, KEY, "admin", "SYSADMIN").statusCode());
    }

    @Test
    void SYSTEM_이어도_system_mcm_이_아니면_403() throws Exception {
        assertEquals(403, post(BODY_NO_HANDLER, KEY, "system:mls", "SYSTEM").statusCode());
    }

    @Test
    void system_mcm_인데_module_이_이_앱과_다르면_400() throws Exception {
        HttpResponse<String> r = post(BODY_OTHER_MODULE, KEY, "system:mcm", "SYSTEM");
        assertEquals(400, r.statusCode());
        assertTrue(r.body().contains("JOB_MODULE_MISMATCH"), r.body());
    }

    @Test
    void system_mcm_이면_컨트롤러까지_닿아_처리기가_없으면_404() throws Exception {
        HttpResponse<String> r = post(BODY_NO_HANDLER, KEY, "system:mcm", "SYSTEM");
        assertEquals(404, r.statusCode());
        assertTrue(r.body().contains("JOB_HANDLER_NOT_FOUND"), r.body());
    }
}
