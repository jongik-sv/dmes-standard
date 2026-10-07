package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-01-01 design.md §3.1 — mdm 이 local 프로파일로 실제 기동해 /actuator/health 200 을
 * 돌려주고, Flyway V1 베이스라인이 적용됐는지("flyway_schema_history") 검증한다.
 *
 * <p>이 조합(cactus-core + mcm-core 를 함께 올려 RANDOM_PORT 로 부팅)은 design.md 재검증에서
 * "이 리포에 선례가 없다"고 확인된 첫 시도다 — 부팅 성패 자체가 §4 AC #1·#2 의 최우선 확인 대상.
 *
 * <p>DB 는 공용 기반({@link AbstractMdmSharedDbTest})이 가리키는 Oracle 시험 PDB 의 MDMAPUSER 스키마다 — 레인 개발 PDB 를
 * 건드리지 않는다. 이력 표는 Flyway 가 Oracle 에서 소문자 따옴표 이름으로 만든다. HTTP 클라이언트는 TestRestTemplate
 * 자동 설정 대신 JDK {@link HttpClient} + {@link LocalServerPort} 를 쓴다(Boot 4.0.6 에서 이
 * 리포에 TestRestTemplate 선례가 없어 더 확실한 경로를 택함).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class MdmApplicationHealthTest extends AbstractMdmSharedDbTest {

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

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
                     "SELECT \"version\", \"success\" FROM \"flyway_schema_history\" WHERE \"version\" = '1'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=1 행이 없다");
            assertEquals("1", rs.getString("version"));
            assertTrue(rs.getBoolean("success"), "V1 마이그레이션이 success=true 가 아니다");
        }
    }
}
