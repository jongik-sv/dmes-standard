package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-01-01 design.md §3.1 — mdm 이 local(SQLite) 프로파일로 실제 기동해 /actuator/health 200 을
 * 돌려주고, Flyway V1 베이스라인이 적용됐는지(flyway_schema_history) 검증한다.
 *
 * <p>이 조합(cactus-core + mcm-core 를 함께 올려 RANDOM_PORT 로 부팅)은 design.md 재검증에서
 * "이 리포에 선례가 없다"고 확인된 첫 시도다 — 부팅 성패 자체가 §4 AC #1·#2 의 최우선 확인 대상.
 *
 * <p>DB 는 {@code @TempDir} 로 격리한 SQLite 파일을 {@code @DynamicPropertySource} 로 주입한다
 * (mdm.db 를 다른 테스트·bootRun 인스턴스와 공유하지 않기 위함). HTTP 클라이언트는 TestRestTemplate
 * 자동 설정 대신 JDK {@link HttpClient} + {@link LocalServerPort} 를 쓴다(Boot 4.0.6 에서 이
 * 리포에 TestRestTemplate 선례가 없어 더 확실한 경로를 택함).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class MdmApplicationHealthTest {

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-health-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void 헬스체크가_UP을_반환한다() throws IOException, InterruptedException {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/actuator/health"))
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"status\":\"UP\""),
                "actuator/health 응답에 UP 상태가 없다: " + response.body());
    }

    @Test
    void flyway_V1_베이스라인이_적용됐다() throws SQLException {
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT version, success FROM flyway_schema_history WHERE version = '1'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=1 행이 없다");
            assertEquals("1", rs.getString("version"));
            assertTrue(rs.getBoolean("success"), "V1 마이그레이션이 success=true 가 아니다");
        }
    }
}
