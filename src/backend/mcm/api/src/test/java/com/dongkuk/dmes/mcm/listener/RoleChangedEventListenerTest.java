package com.dongkuk.dmes.mcm.listener;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;

/**
 * 권한 캐시 무효화 BE → BFF 호출(2026-10-03 보안 지적, 스펙 2026-10-02-widget-admin-generic §16.3).
 * <ul>
 *   <li>BFF 는 /api/mcm/internal/cache/invalidate-role 을 세션 대신 BE → BFF 전용 비밀(X-Bff-Internal-Secret)로만 연다.</li>
 *   <li>BFF → BE 마스터 비밀(X-Client-Key = BACKEND_CLIENT_KEY)은 보내지 않는다 — 옛 코드는 dev·prod·wildfly 에서 기본 주소
 *       http://localhost:3000(평문)으로 마스터 비밀을 보내 그 포트의 아무 프로세스가 받을 수 있었다.</li>
 *   <li>주소·비밀에 코드 기본값이 없고, 하나라도 비면 부르지 않는다(5분 TTL 로 반영).</li>
 * </ul>
 * 가짜 BFF(JDK HttpServer)로 실제 요청 헤더를 본다. @Async 는 Spring 밖이라 그대로 동기 호출된다.
 */
class RoleChangedEventListenerTest {

    private static final String LOCAL_SECRET = "dmes-bff-internal-local-2026";

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
    void 내부_비밀을_X_Bff_Internal_Secret_로_싣고_마스터_키와_옛_표식은_보내지_않는다() {
        new RoleChangedEventListener(invalidateUrl(), "test-internal-secret")
                .onRoleChanged(new RoleChangedEvent(Set.of("SYSADMIN")));

        assertEquals(1, receivedHeaders.size());
        Map<String, String> headers = receivedHeaders.get(0);
        assertEquals("test-internal-secret", headers.get(RoleChangedEventListener.INTERNAL_SECRET_HEADER));
        assertEquals("test-internal-secret", headers.get("X-Bff-Internal-Secret"));
        assertNull(headers.get("X-Client-Key"));
        assertNull(headers.get("X-Internal-Bff-Call"));
        assertEquals("{\"roleId\":\"SYSADMIN\"}", receivedBodies.get(0));
    }

    @Test
    void 비밀이_없거나_비어_있으면_부르지_않는다() {
        for (String secret : new String[] {null, "", "   "}) {
            new RoleChangedEventListener(invalidateUrl(), secret)
                    .onRoleChanged(new RoleChangedEvent(Set.of("SYSADMIN")));
        }
        assertEquals(0, receivedHeaders.size());
    }

    @Test
    void 주소가_없거나_비어_있으면_부르지_않는다() {
        for (String url : new String[] {null, "", "   "}) {
            new RoleChangedEventListener(url, "test-internal-secret")
                    .onRoleChanged(new RoleChangedEvent(Set.of("SYSADMIN")));
        }
        assertEquals(0, receivedHeaders.size());
    }

    /**
     * 설정 해석 — 생성자의 @Value 식을 실제 application*.yml 과 가짜 환경변수로 푼다.
     * 개발자 PC 의 실제 환경변수가 섞이지 않게 시스템 환경·시스템 속성 출처는 빼고 시작한다.
     */
    @Nested
    class 설정_해석 {

        private String urlExpression;
        private String secretExpression;

        @BeforeEach
        void readValueExpressions() throws NoSuchMethodException {
            Constructor<RoleChangedEventListener> ctor =
                    RoleChangedEventListener.class.getConstructor(String.class, String.class);
            urlExpression = ((Value) ctor.getParameterAnnotations()[0][0]).value();
            secretExpression = ((Value) ctor.getParameterAnnotations()[1][0]).value();
        }

        private StandardEnvironment environment(Map<String, Object> env, String... profiles) throws IOException {
            StandardEnvironment environment = new StandardEnvironment();
            MutablePropertySources sources = environment.getPropertySources();
            sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
            sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
            YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
            for (PropertySource<?> base : loader.load("application", new ClassPathResource("application.yml"))) {
                sources.addLast(base);
            }
            for (String profile : profiles) {
                String name = "application-" + profile + ".yml";
                for (PropertySource<?> profiled : loader.load(name, new ClassPathResource(name))) {
                    sources.addFirst(profiled);
                }
            }
            sources.addFirst(new SystemEnvironmentPropertySource("testEnvironment", env));
            return environment;
        }

        @Test
        void 프로필_설정이_없으면_주소와_비밀이_비어_호출하지_않는다_옛_3000_기본값_없음() throws IOException {
            StandardEnvironment environment = environment(Map.of());
            assertEquals("", environment.resolvePlaceholders(urlExpression));
            assertEquals("", environment.resolvePlaceholders(secretExpression));
        }

        @Test
        void 운영은_환경변수_BFF_INVALIDATE_ROLE_URL_과_BFF_INTERNAL_SECRET_에서_읽는다() throws IOException {
            StandardEnvironment environment = environment(Map.of(
                    "BFF_INVALIDATE_ROLE_URL", "https://portal.example/api/mcm/internal/cache/invalidate-role",
                    "BFF_INTERNAL_SECRET", "prod-internal-secret",
                    "BACKEND_CLIENT_KEY", "prod-master-key"));
            assertEquals("https://portal.example/api/mcm/internal/cache/invalidate-role",
                    environment.resolvePlaceholders(urlExpression));
            assertEquals("prod-internal-secret", environment.resolvePlaceholders(secretExpression));
        }

        @Test
        void 마스터_키만_있으면_비밀은_비어_있다_마스터_키로_대신하지_않는다() throws IOException {
            StandardEnvironment environment = environment(Map.of("BACKEND_CLIENT_KEY", "prod-master-key"));
            assertEquals("", environment.resolvePlaceholders(secretExpression));
        }

        @Test
        void 로컬_프로필은_5100_주소와_로컬_전용_비밀을_쓰고_환경변수가_있으면_그_값을_쓴다() throws IOException {
            StandardEnvironment local = environment(Map.of(), "local");
            assertEquals("http://localhost:5100/api/mcm/internal/cache/invalidate-role",
                    local.resolvePlaceholders(urlExpression));
            assertEquals(LOCAL_SECRET, local.resolvePlaceholders(secretExpression));

            StandardEnvironment overridden = environment(Map.of("BFF_INTERNAL_SECRET", "my-secret"), "local");
            assertEquals("my-secret", overridden.resolvePlaceholders(secretExpression));
        }

        @Test
        void 로컬_비밀은_BFF_env_example_의_BFF_INTERNAL_SECRET_과_같다() throws IOException {
            Path envExample = findEnvExample();
            Matcher m = Pattern.compile("(?m)^BFF_INTERNAL_SECRET=\"?([^\"\\r\\n]*)\"?\\s*$")
                    .matcher(Files.readString(envExample, StandardCharsets.UTF_8));
            assertTrue(m.find(), "m-mcm/.env.example 에 BFF_INTERNAL_SECRET 줄이 없다");
            assertEquals(LOCAL_SECRET, m.group(1));
            assertEquals(m.group(1), environment(Map.of(), "local").resolvePlaceholders(secretExpression));
        }

        @Test
        void 어느_프로필_파일도_BFF_주소를_3000_으로_두지_않는다() throws IOException, URISyntaxException {
            Path dir = Path.of(new ClassPathResource("application.yml").getURL().toURI()).getParent();
            List<Path> files;
            try (Stream<Path> list = Files.list(dir)) {
                files = list.filter(p -> p.getFileName().toString().matches("application.*\\.yml")).toList();
            }
            assertFalse(files.isEmpty());
            YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
            for (Path file : files) {
                for (PropertySource<?> source : loader.load(file.toString(), new FileSystemResource(file))) {
                    Object url = source.getProperty("mcm.bff.invalidate-role-url");
                    if (url != null) {
                        assertFalse(url.toString().contains(":3000"), file + " → " + url);
                    }
                }
            }
        }

        /** 작업 디렉터리(모듈 루트)에서 위로 올라가며 src/frontend/m-mcm/.env.example 을 찾는다. */
        private Path findEnvExample() {
            Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
            for (int i = 0; i < 8 && dir != null; i++, dir = dir.getParent()) {
                Path candidate = dir.resolve("src/frontend/m-mcm/.env.example");
                if (Files.isRegularFile(candidate)) {
                    return candidate;
                }
            }
            assertNotNull(null, "src/frontend/m-mcm/.env.example 을 찾지 못했다");
            return null;
        }
    }
}
