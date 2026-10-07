package com.dongkuk.dmes.mdm.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * TSK-01-03 design.md §3.2 A2 — mdm 신뢰 채널(D6, 불변 규칙 I18).
 *
 * <p>{@code cactus.jwt.secret} 이 있어야 cactus 보안 체인과 {@code ClientKeyFilter} 가 켜진다(F15). 켜졌다면
 * ① 헤더 없는 OASIS 호출은 401, ② BFF 신뢰 헤더가 있으면 인증을 통과해 OASIS 봉투({@code meta})가 오고,
 * ③ {@code /actuator/health} 는 인증 없이 200 이다.
 *
 * <p>유효 키: {@code ClientKeyFilter} 는 환경변수 {@code BACKEND_CLIENT_KEY} 를 yml 보다 먼저 본다(CKF:59,81-84).
 * 테스트도 같은 순서로 키를 고른다 — 환경변수가 있으면 그 값, 없으면 이 클래스가 고정한 속성 값.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MdmSecurityChainTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MdmSecurityChainTest extends AbstractMdmSharedDbTest {

    static final String TEST_CLIENT_KEY = "mdm-test-client-key";

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void 헤더_없는_OASIS_호출은_401_이다() throws IOException, InterruptedException {
        HttpResponse<String> response = client.send(oasisPost().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(401, response.statusCode(), response.body());
    }

    @Test
    void 신뢰_헤더가_있으면_인증을_통과해_OASIS_봉투가_온다() throws IOException, InterruptedException {
        HttpRequest request = oasisPost()
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "kim")
                .header("X-Authenticated-Role", "MDM_STEWARD")
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        assertNotEquals(401, response.statusCode(), response.body());
        assertNotEquals(403, response.statusCode(), response.body());
        JsonNode body = json.readTree(response.body());
        assertTrue(body.has("meta") && body.get("meta").isObject(),
                "OASIS CactusResponse 봉투(meta)가 아니다: " + response.body());
    }

    @Test
    void 헬스체크는_인증_없이_200_이다() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/actuator/health"))
                .GET()
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
    }

    private HttpRequest.Builder oasisPost() {
        return HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/anyService/search"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"meta\":{},\"data\":{}}"));
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
