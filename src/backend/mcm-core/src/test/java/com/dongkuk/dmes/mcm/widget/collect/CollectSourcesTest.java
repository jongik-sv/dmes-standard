package com.dongkuk.dmes.mcm.widget.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.ExchangeSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.SqlSource;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryDataSource;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryExecutor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.net.InetAddress;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * 정시 수집 원천 3종 — 스펙 2026-10-05 정시 수집 §2·§4. SQL 은 Oracle 시험 PDB(MCMAPUSER 의 시험 전용 표 T_C4_MACHINE)와 실제 읽기 전용 실행기, HTTP 는 {@link MockRestServiceServer}, 환율은 가짜
 * 제공자를 쓴다(실제 네트워크 금지).
 */
class CollectSourcesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static final ObjectMapper JSON = new ObjectMapper();

    // ── SQL ──────────────────────────────────────────────────────────

    @Nested
    class Sql {

        /** 시험 전용 표 — 기준선에 없어 접두 T_C4_ 로 MCMAPUSER 에 만들고 끝에서 지운다. */
        private static final String TABLE = "T_C4_MACHINE";

        private HikariDataSource dataSource;
        private JdbcTemplate jdbc;
        private SqlCollectSource source;
        private WidgetQueryExecutor executor;

        @BeforeEach
        void setUp() {
            dataSource = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "collect-sql"); // 작은 풀(최대 2) — tearDown 에서 닫는다
            jdbc = new JdbcTemplate(dataSource);
            dropTable();
            jdbc.execute("CREATE TABLE T_C4_MACHINE (LINE VARCHAR2(20), CNT NUMBER(10), AMT NUMBER(12,3), STATE VARCHAR2(10), D DATE)");
            jdbc.update("INSERT INTO T_C4_MACHINE VALUES ('L1', 5, 1.500, 'RUN', DATE '2026-10-05')");
            jdbc.update("INSERT INTO T_C4_MACHINE VALUES ('L2', 7, 2.250, 'STOP', DATE '2026-10-05')");
            jdbc.update("INSERT INTO T_C4_MACHINE VALUES ('L3', NULL, NULL, NULL, NULL)");
            executor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), mock(WidgetUserContextResolver.class),
                    WidgetQueryDataSource.dedicated(dataSource, null));
            source = new SqlCollectSource(executor);
        }

        @AfterEach
        void tearDown() {
            try {
                dropTable();
            } finally {
                dataSource.close();
            }
        }

        /** 만들기 전·끝에서 시험 전용 표를 지운다(없으면 ORA-00942 만 무시). */
        private void dropTable() {
            jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + TABLE + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
        }

        @Test
        @DisplayName("keyField 가 있으면 행마다 항목 하나(키=그 열 값) — 숫자는 숫자, 글자는 글자, 값이 null 인 행은 건너뛴다")
        void keyedRows() {
            List<CollectItem> items = source.collect(new SqlSource("SELECT LINE, CNT FROM T_C4_MACHINE ORDER BY LINE", "CNT", "LINE"), TODAY);
            assertThat(items).extracting(CollectItem::key).containsExactly("L1", "L2");
            assertThat(items.get(0).num()).isEqualByComparingTo("5");
            assertThat(items.get(1).num()).isEqualByComparingTo("7");

            List<CollectItem> text = source.collect(new SqlSource("SELECT LINE, STATE FROM T_C4_MACHINE ORDER BY LINE", "STATE", "LINE"), TODAY);
            assertThat(text).extracting(CollectItem::key, CollectItem::txt, CollectItem::num).containsExactly(
                    org.assertj.core.groups.Tuple.tuple("L1", "RUN", null), org.assertj.core.groups.Tuple.tuple("L2", "STOP", null));
        }

        @Test
        @DisplayName("keyField 가 없으면 첫 행의 valueField 값 하나를 키 VALUE 로 — 결과 열 이름은 대소문자 무시로 찾는다")
        void singleValue() {
            List<CollectItem> items = source.collect(new SqlSource("SELECT SUM(CNT) AS TOTAL FROM T_C4_MACHINE", "total", null), TODAY);
            assertThat(items).hasSize(1);
            assertThat(items.get(0).key()).isEqualTo("VALUE");
            assertThat(items.get(0).num()).isEqualByComparingTo("12");
            assertThat(source.collect(new SqlSource("SELECT CNT FROM T_C4_MACHINE WHERE 1 = 0", "CNT", null), TODAY)).isEmpty();
        }

        @Test
        @DisplayName("한 회차 항목은 50개까지만 저장한다")
        void atMost50Items() {
            jdbc.execute("INSERT INTO T_C4_MACHINE (LINE, CNT) SELECT 'M' || LEVEL, LEVEL FROM DUAL CONNECT BY LEVEL <= 80");
            List<CollectItem> items = source.collect(new SqlSource("SELECT LINE, CNT FROM T_C4_MACHINE WHERE CNT IS NOT NULL ORDER BY LINE", "CNT", "LINE"), TODAY);
            assertThat(items).hasSize(50);
        }

        @Test
        @DisplayName("열이 없으면 실패, :userId·:deptCd 는 거절, :today·:now 등 날짜 변수는 허용한다")
        void columnsAndVariables() {
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT CNT FROM T_C4_MACHINE", "NOPE", null), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("값 열");
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT LINE, CNT FROM T_C4_MACHINE", "CNT", "NOPE"), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("항목 열");
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT CNT FROM T_C4_MACHINE WHERE LINE = :userId", "CNT", null), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("사용자 변수");
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT CNT FROM T_C4_MACHINE WHERE LINE = :deptCd", "CNT", null), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("사용자 변수");
            assertThatThrownBy(() -> executor.validateCollectSql("SELECT CNT FROM T_C4_MACHINE WHERE LINE = :userId")).isInstanceOf(BusinessException.class);
            executor.validateCollectSql("SELECT CNT FROM T_C4_MACHINE WHERE D = TO_DATE(:today, 'YYYYMMDD') AND :now IS NOT NULL");

            List<CollectItem> items = source.collect(new SqlSource("SELECT LINE, CNT FROM T_C4_MACHINE WHERE CAST(:today AS VARCHAR2(8)) IS NOT NULL"
                    + " AND CAST(:yesterday AS VARCHAR2(8)) IS NOT NULL AND CAST(:monthStart AS VARCHAR2(8)) IS NOT NULL"
                    + " AND CAST(:now AS TIMESTAMP) IS NOT NULL AND CNT IS NOT NULL ORDER BY LINE", "CNT", "LINE"), TODAY);
            assertThat(items).extracting(CollectItem::key).containsExactly("L1", "L2");
        }

        @Test
        @DisplayName("검사에 걸리는 SQL(쓰기·사용자 입력 조건)·DB 오류는 DB 메시지 없이 고정 문구로 실패한다")
        void guardAndDbErrors() {
            assertThatThrownBy(() -> source.collect(new SqlSource("DELETE FROM T_C4_MACHINE", "CNT", null), TODAY)).isInstanceOf(CollectException.class);
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT CNT FROM T_C4_MACHINE WHERE LINE = :line", "CNT", null), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("알 수 없는 변수");
            assertThatThrownBy(() -> source.collect(new SqlSource("SELECT CNT FROM NO_SUCH_TABLE", "CNT", null), TODAY))
                    .isInstanceOf(CollectException.class).hasMessage("위젯 데이터를 불러오지 못했습니다")
                    .satisfies(e -> assertThat(e.getMessage()).doesNotContain("NO_SUCH_TABLE"));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM T_C4_MACHINE", Long.class)).isEqualTo(3L);
        }
    }

    // ── HTTP ─────────────────────────────────────────────────────────

    @Nested
    class Http {

        private static final InetAddress PUBLIC = addr(203, 0, 113, 10);

        private final WidgetCollectProperties props = new WidgetCollectProperties();
        private MockRestServiceServer server;
        private HttpCollectSource source;
        private Function<String, InetAddress[]> resolver = host -> new InetAddress[] {PUBLIC};
        private final AtomicInteger resolveCalls = new AtomicInteger();

        @BeforeEach
        void setUp() {
            props.setAllowedHosts(List.of("api.example.com", "Quote.Example.com"));
            RestClient.Builder builder = RestClient.builder();
            server = MockRestServiceServer.bindTo(builder).build();
            source = new HttpCollectSource(props, builder, host -> {
                resolveCalls.incrementAndGet();
                return resolver.apply(host);
            });
        }

        private HttpSource http(String url, String... keyPaths) {
            List<CollectConfig.HttpItem> items = new ArrayList<>();
            for (int i = 0; i < keyPaths.length; i += 2) {
                items.add(new CollectConfig.HttpItem(keyPaths[i], keyPaths[i + 1], CollectConfigs.parsePath(keyPaths[i], keyPaths[i + 1])));
            }
            return new HttpSource(URI.create(url), items);
        }

        private static InetAddress addr(int... b) {
            try {
                return InetAddress.getByAddress(new byte[] {(byte) b[0], (byte) b[1], (byte) b[2], (byte) b[3]});
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        @Test
        @DisplayName("점·대괄호 경로로 값을 읽는다 — 숫자·숫자 글자는 숫자, 그 밖은 글자(200자), 없는 경로·객체·null 은 건너뛴다")
        void readsPaths() {
            server.expect(requestTo("https://api.example.com/q?s=005930")).andExpect(method(HttpMethod.GET))
                    .andRespond(withSuccess("{\"data\":{\"items\":[{\"price\":71200.5,\"name\":\"삼성\",\"qty\":\"1200\",\"nil\":null,\"obj\":{\"a\":1},\"flag\":true,"
                            + "\"long\":\"" + "x".repeat(300) + "\"}]}}", MediaType.APPLICATION_JSON));
            List<CollectItem> items = source.collect(http("https://api.example.com/q?s=005930",
                    "price", "data.items[0].price", "name", "data.items[0].name", "qty", "data.items[0].qty", "nil", "data.items[0].nil",
                    "obj", "data.items[0].obj", "missing", "data.items[1].price", "flag", "data.items[0].flag", "long", "data.items[0].long"), TODAY);
            server.verify();
            assertThat(items).extracting(CollectItem::key).containsExactly("price", "name", "qty", "flag", "long");
            assertThat(items.get(0).num()).isEqualByComparingTo("71200.5");
            assertThat(items.get(1).txt()).isEqualTo("삼성");
            assertThat(items.get(2).num()).isEqualByComparingTo("1200");
            assertThat(items.get(3).txt()).isEqualTo("true");
            assertThat(items.get(4).txt()).hasSize(200);
        }

        @Test
        @DisplayName("루트가 배열이어도 [0] 경로를 읽고, 경로가 모두 없으면 빈 목록(호출자가 실패로 기록)")
        void rootArrayAndAllMissing() {
            server.expect(requestTo("https://api.example.com/a")).andRespond(withSuccess("[{\"v\":3}]", MediaType.APPLICATION_JSON));
            assertThat(source.collect(http("https://api.example.com/a", "v", "[0].v"), TODAY)).extracting(CollectItem::key).containsExactly("v");
            server.reset();
            server.expect(requestTo("https://api.example.com/b")).andRespond(withSuccess("{\"x\":1}", MediaType.APPLICATION_JSON));
            assertThat(source.collect(http("https://api.example.com/b", "v", "nope.v"), TODAY)).isEmpty();
        }

        @Test
        @DisplayName("허용 호스트는 정확 일치(대소문자 무시·포트 허용) — 목록이 비면 모두 거절, 요청도 보내지 않는다")
        void allowedHosts() {
            server.expect(requestTo("https://quote.example.com:8443/x")).andRespond(withSuccess("{\"v\":1}", MediaType.APPLICATION_JSON));
            assertThat(source.collect(http("https://quote.example.com:8443/x", "v", "v"), TODAY)).hasSize(1);

            for (String url : List.of("https://evil.com/x", "https://api.example.com.evil.com/x", "https://sub.api.example.com/x", "https://example.com/x")) {
                assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).as(url)
                        .isInstanceOf(CollectException.class).hasMessage("허용 목록에 없는 호스트라 수집하지 않습니다.");
            }
            props.setAllowedHosts(List.of());
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).isInstanceOf(CollectException.class);
            server.verify(); // 거절된 호출은 요청을 보내지 않았다
        }

        @Test
        @DisplayName("링크 로컬·멀티캐스트·와일드카드 주소로 풀리는 호스트는 거절한다 — 하나라도 섞이면 거절, 풀리지 않아도 거절")
        void unsafeAddresses() {
            for (InetAddress bad : List.of(addr(169, 254, 169, 254), addr(169, 254, 0, 1), addr(224, 0, 0, 1), addr(0, 0, 0, 0))) {
                resolver = host -> new InetAddress[] {bad};
                assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).as(bad.toString())
                        .isInstanceOf(CollectException.class).hasMessageContaining("링크 로컬");
            }
            resolver = host -> new InetAddress[] {PUBLIC, addr(169, 254, 169, 254)};
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasMessageContaining("링크 로컬");
            resolver = host -> {
                try {
                    return new InetAddress[] {InetAddress.getByName("fe80::1")};
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            };
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasMessageContaining("링크 로컬");
            resolver = host -> new InetAddress[0];
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasMessageContaining("주소를 찾지 못했습니다");
            server.verify();
            assertThat(resolveCalls.get()).isEqualTo(7);
        }

        @Test
        @DisplayName("IPv6 에 묻힌 IPv4(IPv4 호환·NAT64·6to4)·AWS IPv6 메타데이터 fd00:ec2::254·알리바바 100.100.100.200 도 거절한다")
        void embeddedAndMetadataAddresses() throws Exception {
            for (String bad : List.of("fd00:ec2::254", "::169.254.169.254", "::a9fe:a9fe", "64:ff9b::a9fe:a9fe", "64:ff9b::169.254.169.254",
                    "2002:a9fe:a9fe::1", "::224.0.0.1", "64:ff9b::e000:1", "100.100.100.200", "::ffff:169.254.169.254", "::ffff:100.100.100.200",
                    "::0.0.0.0", "64:ff9b::6464:64c8", "::6464:64c8")) {
                assertThat(HttpCollectSource.isUnsafe(InetAddress.getByName(bad))).as(bad).isTrue();
            }
            for (String ok : List.of("203.0.113.10", "10.1.2.3", "127.0.0.1", "192.168.0.5", "100.100.100.201", "2001:db8::1", "::1", "fd00:ec2::255",
                    "64:ff9b::cb00:710a", "2002:cb00:710a::1", "::cb00:710a")) {
                assertThat(HttpCollectSource.isUnsafe(InetAddress.getByName(ok))).as(ok).isFalse();
            }
            resolver = host -> {
                try {
                    return new InetAddress[] {InetAddress.getByName("64:ff9b::a9fe:a9fe")};
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            };
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasMessageContaining("링크 로컬");
            server.verify();
        }

        @Test
        @DisplayName("이름 풀이가 상한 시간을 넘기면 실패한다 — 수집기 스레드는 풀이를 기다리며 묶이지 않는다")
        void dnsResolutionTimesOut() {
            RestClient.Builder builder = RestClient.builder();
            MockRestServiceServer none = MockRestServiceServer.bindTo(builder).build();
            HttpCollectSource slow = new HttpCollectSource(props, builder, host -> {
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return new InetAddress[] {PUBLIC};
            }, Duration.ofMillis(200));
            long start = System.nanoTime();
            assertThatThrownBy(() -> slow.collect(http("https://api.example.com/x", "v", "v"), TODAY))
                    .isInstanceOf(CollectException.class).hasMessageContaining("끝나지 않았습니다");
            assertThat(Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(2000);
            none.verify(); // 요청은 보내지 않았다
            assertThat(HttpCollectSource.DNS_TIMEOUT.toSeconds()).isEqualTo(3);
        }

        @Test
        @DisplayName("지수가 큰 짧은 숫자(1e999999999·1e-100000000)는 변환하지 않고 빠르게 건너뛴다 — 다른 항목은 정상 저장")
        void hugeExponentsSkippedQuickly() {
            server.expect(requestTo("https://api.example.com/x")).andRespond(withSuccess(
                    "{\"big\":1e999999999,\"tiny\":1e-100000000,\"neg\":-1E+400,\"ok\":12.5,\"txt\":\"1e999999999\",\"digits\":\"" + "9".repeat(150) + "\"}",
                    MediaType.APPLICATION_JSON));
            long start = System.nanoTime();
            List<CollectItem> items = source.collect(http("https://api.example.com/x", "big", "big", "tiny", "tiny", "neg", "neg", "ok", "ok",
                    "txt", "txt", "digits", "digits"), TODAY);
            assertThat(Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(1000);
            assertThat(items).extracting(CollectItem::key).containsExactly("ok", "txt", "digits");
            assertThat(items.get(0).num()).isEqualByComparingTo("12.5");
            assertThat(items.get(1).txt()).isEqualTo("1e999999999"); // 숫자 글자가 아니라 글자로 저장
            assertThat(items.get(2).txt()).hasSize(150);              // 너무 긴 숫자 글자는 글자
        }

        @Test
        @DisplayName("사설·루프백 주소는 막지 않는다(허용 호스트가 사내 API 일 수 있다)")
        void privateAddressesAllowed() {
            resolver = host -> new InetAddress[] {addr(10, 1, 2, 3), addr(127, 0, 0, 1), addr(192, 168, 0, 5)};
            server.expect(requestTo("https://api.example.com/x")).andRespond(withSuccess("{\"v\":1}", MediaType.APPLICATION_JSON));
            assertThat(source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasSize(1);
        }

        @Test
        @DisplayName("리다이렉트는 따라가지 않고 실패한다 — 위치 주소로 두 번째 요청을 보내지 않는다")
        void redirectNotFollowed() {
            server.expect(requestTo("https://api.example.com/x"))
                    .andRespond(withStatus(HttpStatus.FOUND).location(URI.create("http://169.254.169.254/latest/meta-data")));
            assertThatThrownBy(() -> source.collect(http("https://api.example.com/x", "v", "v"), TODAY))
                    .isInstanceOf(CollectException.class).hasMessage("리다이렉트 응답은 따르지 않습니다.");
            server.verify();
        }

        @Test
        @DisplayName("HTTP 오류·1MB 초과·빈 본문·JSON 아님은 실패하고, 메시지에 주소·질의 문자열을 넣지 않는다")
        void failuresDoNotLeakUrl() {
            String url = "https://api.example.com/x?apikey=SECRET123";
            server.expect(requestTo(url)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
            assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).hasMessage("수집 요청 실패: HTTP 500");

            server.reset();
            server.expect(requestTo(url)).andRespond(withSuccess(" ".repeat(1024 * 1024 + 1), MediaType.APPLICATION_JSON));
            assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).hasMessage("응답이 1MB 를 넘어 수집하지 않습니다.");

            server.reset();
            server.expect(requestTo(url)).andRespond(withSuccess("", MediaType.APPLICATION_JSON));
            assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).hasMessage("응답이 비었습니다.");

            server.reset();
            server.expect(requestTo(url)).andRespond(withSuccess("<html>not json</html>", MediaType.TEXT_HTML));
            assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).hasMessage("응답을 JSON 으로 읽지 못했습니다.")
                    .satisfies(e -> assertThat(e.getMessage()).doesNotContain("SECRET123").doesNotContain("api.example.com"));

            server.reset();
            server.expect(requestTo(url)).andRespond(request -> {
                throw new java.io.IOException("connect timed out: " + request.getURI());
            });
            assertThatThrownBy(() -> source.collect(http(url, "v", "v"), TODAY)).isInstanceOf(CollectException.class)
                    .satisfies(e -> assertThat(e.getMessage()).startsWith("수집 요청 실패: ").doesNotContain("SECRET123").doesNotContain("example.com"));
            server.verify();
        }

        @Test
        @DisplayName("정확히 1MB 인 본문은 받는다")
        void exactlyOneMegabyteAllowed() {
            String padding = " ".repeat(1024 * 1024 - 7);
            server.expect(requestTo("https://api.example.com/x")).andRespond(withSuccess("{\"v\":1}" + padding, MediaType.APPLICATION_JSON));
            assertThat(source.collect(http("https://api.example.com/x", "v", "v"), TODAY)).hasSize(1);
        }

        @Test
        @DisplayName("실제 클라이언트 빌더는 리다이렉트를 따르지 않고 3초·5초 제한을 건다")
        void realBuilderSettings() {
            assertThat(HttpCollectSource.CONNECT_TIMEOUT.toSeconds()).isEqualTo(3);
            assertThat(HttpCollectSource.READ_TIMEOUT.toSeconds()).isEqualTo(5);
            assertThat(HttpCollectSource.MAX_BODY_BYTES).isEqualTo(1024 * 1024);
            assertThat(HttpCollectSource.builder()).isNotNull();
        }
    }

    // ── 환율 ─────────────────────────────────────────────────────────

    @Nested
    class Exchange {

        private final WidgetExtProperties ext = new WidgetExtProperties();
        private final List<String> calls = new ArrayList<>();
        private List<ExchangeRatePoint> frankfurterPoints = List.of();
        private List<ExchangeRatePoint> koreaEximPoints = List.of();
        private RuntimeException frankfurterError;
        private final WidgetCollectorJpaTest.MutableClock clock = new WidgetCollectorJpaTest.MutableClock(Instant.parse("2026-10-05T03:00:00Z"));
        private ExchangeCollectSource source;

        private ExchangeRateProvider fake(String id, java.util.function.Supplier<List<ExchangeRatePoint>> points) {
            return new ExchangeRateProvider() {
                @Override
                public String id() {
                    return id;
                }

                @Override
                public List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to) {
                    calls.add(id + ":" + base + ":" + symbols + ":" + from + ":" + to);
                    if (frankfurterError != null && "frankfurter".equals(id)) throw frankfurterError;
                    return points.get();
                }
            };
        }

        @BeforeEach
        void setUp() {
            source = new ExchangeCollectSource(ext, fake("frankfurter", () -> frankfurterPoints), fake("koreaexim", () -> koreaEximPoints), clock);
        }

        private static ExchangeRatePoint p(LocalDate date, String cur, String rate) {
            return new ExchangeRatePoint(date, cur, new BigDecimal(rate));
        }

        @Test
        @DisplayName("기준 통화 KRW 로 7일 구간을 한 번 묻고, 통화마다 가장 최근 날짜의 값을 키=통화 코드로 저장한다 — 값 없는 통화는 건너뛴다")
        void latestWithinSevenDays() {
            // 오늘 2026-10-05(일). 직전 영업일 금요일(10-02) 값이 온다.
            frankfurterPoints = List.of(p(TODAY.minusDays(3), "USD", "1380.12345678"), p(TODAY.minusDays(4), "USD", "1370"),
                    p(TODAY.minusDays(5), "JPY", "9.1"), p(TODAY, "EUR", "1500"));
            List<CollectItem> items = source.collect(new ExchangeSource(List.of("USD", "JPY", "EUR", "GBP")), TODAY);
            assertThat(calls).containsExactly("frankfurter:KRW:[USD, JPY, EUR, GBP]:2026-09-28:2026-10-05");
            assertThat(items).extracting(CollectItem::key).containsExactly("USD", "JPY", "EUR");
            assertThat(items.get(0).num()).isEqualByComparingTo("1380.12345678"); // 더 최근 날짜
            assertThat(items.get(1).num()).isEqualByComparingTo("9.1");
        }

        @Test
        @DisplayName("7일(10-05 기준 09-28)보다 오래된 값·미래 날짜·묻지 않은 통화는 쓰지 않는다 — 모두 없으면 빈 목록")
        void outsideWindowIgnored() {
            frankfurterPoints = List.of(p(TODAY.minusDays(8), "USD", "1300"), p(TODAY.plusDays(1), "USD", "1500"), p(TODAY, "CHF", "1600"));
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY)).isEmpty();
            clock.advance(Duration.ofMinutes(31)); // 캐시 만료
            frankfurterPoints = List.of(p(TODAY.minusDays(7), "USD", "1310"));
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1310"); // 경계 포함
        }

        @Test
        @DisplayName("날짜마다 부르는 제공자는 값이 없는 통화만 오늘부터 하루씩 거슬러 묻고, 고시된 날을 찾으면 멈춘다")
        void perDayProviderWalksBack() {
            Map<LocalDate, List<ExchangeRatePoint>> byDay = Map.of(
                    TODAY.minusDays(2), List.of(p(TODAY.minusDays(2), "USD", "1390")),
                    TODAY.minusDays(3), List.of(p(TODAY.minusDays(3), "USD", "1380"), p(TODAY.minusDays(3), "JPY", "9.5")));
            ExchangeRateProvider perDay = new ExchangeRateProvider() {
                @Override
                public String id() {
                    return "koreaexim";
                }

                @Override
                public boolean callsPerDay() {
                    return true;
                }

                @Override
                public List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to) {
                    calls.add(symbols + ":" + from + ":" + to);
                    return byDay.getOrDefault(from, List.of());
                }
            };
            ext.getExchange().setProvider("koreaexim");
            ext.getExchange().setKoreaeximKey("KEY");
            ExchangeCollectSource s = new ExchangeCollectSource(ext, fake("frankfurter", List::of), perDay, clock);

            List<CollectItem> items = s.collect(new ExchangeSource(List.of("USD", "JPY", "GBP")), TODAY);

            assertThat(items).extracting(CollectItem::key, c -> c.num().stripTrailingZeros().toPlainString())
                    .containsExactly(org.assertj.core.groups.Tuple.tuple("USD", "1390"), org.assertj.core.groups.Tuple.tuple("JPY", "9.5"));
            // 오늘·어제는 전부 비어 있고, 이틀 전 USD 를 찾은 뒤에는 USD 를 다시 묻지 않으며, GBP 때문에 7일 전까지 거슬러 간다
            assertThat(calls).containsExactly(
                    "[USD, JPY, GBP]:2026-10-05:2026-10-05", "[USD, JPY, GBP]:2026-10-04:2026-10-04", "[USD, JPY, GBP]:2026-10-03:2026-10-03",
                    "[JPY, GBP]:2026-10-02:2026-10-02", "[GBP]:2026-10-01:2026-10-01", "[GBP]:2026-09-30:2026-09-30", "[GBP]:2026-09-29:2026-09-29",
                    "[GBP]:2026-09-28:2026-09-28");
            calls.clear();
            assertThat(s.collect(new ExchangeSource(List.of("GBP")), TODAY)).isEmpty();
            assertThat(calls).isEmpty(); // 「7일 안에 값 없음」도 30분 캐시된다
            clock.advance(Duration.ofMinutes(31));
            assertThat(s.collect(new ExchangeSource(List.of("GBP")), TODAY)).isEmpty();
            assertThat(calls).hasSize(8); // 7일 전 포함 8일을 모두 물었는데 없다
        }

        @Test
        @DisplayName("제공자 선택은 ExchangeService 와 같다 — koreaexim 이고 키가 있을 때만 한국수출입은행, 키가 없거나 다른 값이면 Frankfurter")
        void providerSelection() {
            koreaEximPoints = List.of(p(TODAY, "USD", "1400"));
            frankfurterPoints = List.of(p(TODAY, "USD", "1380"));
            ext.getExchange().setProvider("koreaexim");
            ext.getExchange().setKoreaeximKey("");
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1380");
            ext.getExchange().setKoreaeximKey("KEY");
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1400");
            clock.advance(Duration.ofMinutes(31)); // 캐시는 제공자별이지만 같은 제공자 호출은 만료시켜 다시 묻게 한다
            ext.getExchange().setProvider(" KoreaExim ");
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1400");
            ext.getExchange().setProvider("frankfurter");
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1380"); // frankfurter 캐시(첫 호출, 31분 전)는 만료
            assertThat(calls).extracting(c -> c.substring(0, c.indexOf(':'))).containsExactly("frankfurter", "koreaexim", "koreaexim", "frankfurter");
        }

        @Test
        @DisplayName("dmes.widget.ext.enabled=false 면 외부 호출 없이 실패, 제공자 예외는 그 메시지로 실패, 값이 하나도 없으면 빈 목록")
        void disabledAndProviderFailure() {
            ext.setEnabled(false);
            assertThatThrownBy(() -> source.collect(new ExchangeSource(List.of("USD")), TODAY)).isInstanceOf(CollectException.class)
                    .hasMessageContaining("dmes.widget.ext.enabled");
            assertThat(calls).isEmpty();
            ext.setEnabled(true);
            frankfurterError = new WidgetExtException("환율(Frankfurter) 요청 실패: HTTP 503");
            assertThatThrownBy(() -> source.collect(new ExchangeSource(List.of("USD")), TODAY)).isInstanceOf(CollectException.class)
                    .hasMessage("환율(Frankfurter) 요청 실패: HTTP 503");
            frankfurterError = null;
            clock.advance(Duration.ofMinutes(11)); // 실패 10분 뒤에는 다시 묻는다
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY)).isEmpty();
        }

        @Test
        @DisplayName("같은 (제공자, 통화)는 30분 캐시 — 여러 정의가 같은 통화를 물어도 외부 호출은 한 번, 모자란 통화만 더 묻고, 30분 뒤에 다시 묻는다")
        void cachedFor30Minutes() {
            frankfurterPoints = List.of(p(TODAY, "USD", "1380"), p(TODAY, "JPY", "9.5"), p(TODAY, "EUR", "1500"));
            assertThat(source.collect(new ExchangeSource(List.of("USD", "JPY")), TODAY)).hasSize(2);
            frankfurterPoints = List.of(p(TODAY, "USD", "9999")); // 캐시가 쓰이면 이 값은 보이지 않는다
            assertThat(source.collect(new ExchangeSource(List.of("USD")), TODAY).get(0).num()).isEqualByComparingTo("1380");
            assertThat(source.collect(new ExchangeSource(List.of("JPY", "USD")), TODAY)).extracting(CollectItem::key).containsExactly("JPY", "USD");
            assertThat(calls).hasSize(1);

            frankfurterPoints = List.of(p(TODAY, "EUR", "1500"));
            assertThat(source.collect(new ExchangeSource(List.of("USD", "EUR")), TODAY)).extracting(CollectItem::key).containsExactly("USD", "EUR");
            assertThat(calls).hasSize(2);
            assertThat(calls.get(1)).contains("[EUR]"); // 없는 통화만 묻는다

            clock.advance(Duration.ofMinutes(29));
            source.collect(new ExchangeSource(List.of("USD", "EUR")), TODAY);
            assertThat(calls).hasSize(2);
            clock.advance(Duration.ofMinutes(2));
            frankfurterPoints = List.of(p(TODAY, "USD", "1400"), p(TODAY, "EUR", "1510"));
            assertThat(source.collect(new ExchangeSource(List.of("USD", "EUR")), TODAY).get(0).num()).isEqualByComparingTo("1400");
            assertThat(calls).hasSize(3);
        }

        @Test
        @DisplayName("실패한 (제공자, 통화)는 10분 동안 다시 묻지 않는다 — 캐시된 통화가 있으면 그것만 저장하고, 10분 뒤에 다시 묻는다")
        void failedLookupsBackOffTenMinutes() {
            frankfurterPoints = List.of(p(TODAY, "USD", "1380"));
            source.collect(new ExchangeSource(List.of("USD")), TODAY); // USD 캐시
            frankfurterError = new WidgetExtException("환율(Frankfurter) 요청 실패: HTTP 503");
            // JPY 를 새로 묻다 실패 — USD 는 캐시로 저장된다
            assertThat(source.collect(new ExchangeSource(List.of("USD", "JPY")), TODAY)).extracting(CollectItem::key).containsExactly("USD");
            assertThat(calls).hasSize(2);
            // 실패 기록 중에는 JPY 를 다시 묻지 않는다
            assertThat(source.collect(new ExchangeSource(List.of("USD", "JPY")), TODAY)).extracting(CollectItem::key).containsExactly("USD");
            assertThatThrownBy(() -> source.collect(new ExchangeSource(List.of("JPY")), TODAY)).isInstanceOf(CollectException.class)
                    .hasMessage(ExchangeCollectSource.MSG_BACKOFF);
            assertThat(calls).hasSize(2);

            clock.advance(Duration.ofMinutes(9));
            assertThatThrownBy(() -> source.collect(new ExchangeSource(List.of("JPY")), TODAY)).hasMessage(ExchangeCollectSource.MSG_BACKOFF);
            assertThat(calls).hasSize(2);
            clock.advance(Duration.ofMinutes(2));
            frankfurterError = null;
            frankfurterPoints = List.of(p(TODAY, "JPY", "9.5"));
            assertThat(source.collect(new ExchangeSource(List.of("JPY")), TODAY).get(0).num()).isEqualByComparingTo("9.5");
            assertThat(calls).hasSize(3);
        }
    }

    @Test
    @DisplayName("CollectItem: 값 형 변환 — 숫자·숫자 글자는 숫자(소수 8자리), 정수부 16자리 초과·글자는 글자, 빈 값·null 은 건너뜀")
    void collectItemConversion() {
        assertThat(CollectItem.of("k", 12).num()).isEqualByComparingTo("12");
        assertThat(CollectItem.of("k", 1.5d).num()).isEqualByComparingTo("1.5");
        assertThat(CollectItem.of("k", new BigDecimal("0.123456789")).num()).isEqualByComparingTo("0.12345679");
        assertThat(CollectItem.of("k", " 42.50 ").num()).isEqualByComparingTo("42.5");
        assertThat(CollectItem.of("k", "-7").num()).isEqualByComparingTo("-7");
        assertThat(CollectItem.of("k", "1e5").txt()).isEqualTo("1e5");
        assertThat(CollectItem.of("k", "12abc").txt()).isEqualTo("12abc");
        assertThat(CollectItem.of("k", Double.NaN).txt()).isEqualTo("NaN");
        assertThat(CollectItem.of("k", new BigDecimal("12345678901234567")).txt()).isEqualTo("12345678901234567");
        assertThat(CollectItem.of("k", new BigDecimal("1234567890123456")).num()).isNotNull();
        assertThat(CollectItem.of("k", true).txt()).isEqualTo("true");
        // 지수가 크거나 자릿수가 많은 십진수는 변환 없이 건너뛴다(OOM·수십 초 CPU 방지) — 경계는 ±100·유효 100자리
        long start = System.nanoTime();
        assertThat(CollectItem.of("k", new BigDecimal("1e999999999"))).isNull();
        assertThat(CollectItem.of("k", new BigDecimal("1e-100000000"))).isNull();
        assertThat(CollectItem.of("k", new BigDecimal("1e101"))).isNull();
        assertThat(CollectItem.of("k", new BigDecimal("1e-101"))).isNull();
        assertThat(CollectItem.of("k", new BigDecimal("1e100"))).isNotNull();
        assertThat(CollectItem.of("k", new BigDecimal("1e-100")).num()).isEqualByComparingTo("0");
        assertThat(CollectItem.of("k", new BigDecimal("1".repeat(101)))).isNull();
        // 글자로 온 숫자 모양은 한도(100자리·scale ±100)를 넘어도 건너뛰지 않고 원문 글자로 저장한다 — 101~120자·121자 이상 모두
        for (int len : List.of(16, 17, 100, 101, 110, 120, 121, 150)) {
            CollectItem it = CollectItem.of("k", "9".repeat(len));
            assertThat(it).as("len " + len).isNotNull();
            if (len <= 16) { // 정수부 16자리 이하는 숫자
                assertThat(it.num()).isNotNull();
            } else { // 17자리 이상은 원문 글자(한도 100자리 안쪽도 바깥쪽도 같다)
                assertThat(it.num()).as("len " + len).isNull();
                assertThat(it.txt()).isEqualTo("9".repeat(len));
            }
        }
        assertThat(CollectItem.of("k", "0." + "0".repeat(110) + "1").txt()).isEqualTo("0." + "0".repeat(110) + "1"); // scale 111 → 글자
        assertThat(CollectItem.of("k", "9".repeat(250)).txt()).hasSize(200); // 글자는 200자로 자른다
        assertThat(CollectItem.of("k", "1e999999999").txt()).isEqualTo("1e999999999"); // 지수 모양 글자는 원래 글자
        assertThat(Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(1000);
        assertThat(CollectItem.of("k", null)).isNull();
        assertThat(CollectItem.of("k", "   ")).isNull();
        assertThat(CollectItem.of(" ", 1)).isNull();
        assertThat(CollectItem.of("k", "가".repeat(300)).txt()).hasSize(200);
        assertThat(Map.of("a", 1)).isNotNull();
        assertThat(JSON).isNotNull();
    }
}
