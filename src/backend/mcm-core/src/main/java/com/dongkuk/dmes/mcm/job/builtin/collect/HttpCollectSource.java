package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.function.IntSupplier;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;

/**
 * HTTP JSON 원천 — 스펙 2026-10-05 정시 수집 §2·§4. 관리자가 정한 주소를 서버가 부르므로 SSRF 를 막는 규칙을 모두 여기서 지킨다.
 * <ul>
 *   <li>호스트가 허용 목록({@code dmes.job.http.allowed-hosts})에 정확히 있어야 한다(대소문자 무시, 포트는 허용). 목록이 비면 모두 거절.</li>
 *   <li>사용자 정보({@code user:pw@})가 든 주소는 거절한다(저장 검사와 같은 {@link CollectConfigs#parseUrl}).</li>
 *   <li>호스트를 풀어(상한 3초) 하나라도 링크 로컬({@code 169.254.x.x}·{@code fe80::})·멀티캐스트·와일드카드·클라우드 메타데이터 주소
 *       ({@code fd00:ec2::254}·{@code 100.100.100.200}, IPv4 호환 {@code ::a.b.c.d}·NAT64 {@code 64:ff9b::/96}·6to4 에 묻힌 IPv4 는 꺼내 다시 판정)이면
 *       거절한다. 이름 풀이와 실제 연결 사이에 주소가 바뀌는 경우(DNS 재바인딩)까지는 막지 못하므로 허용 호스트는 신뢰하는 곳만 적는다.
 *       시스템 프록시는 쓰지 않는다.</li>
 *   <li>리다이렉트는 따라가지 않는다(3xx 는 실패). 연결 3초·읽기 5초, 응답 본문 1MB 상한, JSON 이 아니면 실패.</li>
 *   <li>주소의 {@code {{이름}}} 자리는 경로·쿼리에만 있고, 작업 변수 값을 퍼센트 인코딩해 넣는다({@link HttpUrlTemplate}). 정의되지 않은 변수는 거절하고,
 *       허용 호스트·주소 검사는 변수를 넣은 주소로 한다.</li>
 *   <li>실패 메시지에 주소·질의 문자열을 넣지 않는다(키가 질의에 있을 수 있다).</li>
 *   <li>일시 오류 재시도({@code source.retryTransient=true}): HTTP 503·502·504·429 와 연결/읽기 시간 초과·연결 거부·끊김이면 몇 초 뒤 <b>한 번만</b> 다시 부른다.
 *       나머지 4xx·500·3xx·응답 내용 오류와 위 보안 검사는 재시도하지 않는다. 대기는 {@value #RETRY_DELAY_MS}ms + 0~{@value #RETRY_JITTER_MS}ms 무작위,
 *       429·503 의 {@code Retry-After}(정수 초)는 {@value #RETRY_AFTER_MAX_MS}ms 까지만 따르고 넘으면 재시도하지 않는다. 마감이 알려져 있으면 남은 시간이
 *       대기 + 한 번 호출의 최악 시간({@code 연결 3초 + 읽기 5초})보다 많을 때만 한다. 키가 없으면 끔(기존 작업 동작 그대로).</li>
 * </ul>
 * 값은 숫자(또는 숫자 글자)면 숫자, 그 밖의 글자는 글자(200자까지). 경로에 값이 없는 항목은 건너뛰고, 전부 없으면 호출자가 실패로 기록한다.
 */
public class HttpCollectSource implements CollectSource<CollectConfig.HttpSource> {

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    static final int MAX_BODY_BYTES = 1024 * 1024;
    /** 일시 오류 재시도 기본 대기·무작위 폭(몰린 작업이 같은 순간에 다시 부르지 않게)·Retry-After 상한. */
    static final int RETRY_DELAY_MS = 3000;
    static final int RETRY_JITTER_MS = 1000;
    static final long RETRY_AFTER_MAX_MS = 10_000;
    /** 한 번 호출의 최악 시간(연결 + 읽기) — 재시도 여유 판정에 쓴다. */
    static final long ATTEMPT_WORST_MS = CONNECT_TIMEOUT.toMillis() + READ_TIMEOUT.toMillis();

    private static final Logger log = LoggerFactory.getLogger(HttpCollectSource.class);

    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    private final Predicate<String> hostAllowed;
    private final RestClient http;
    static final Duration DNS_TIMEOUT = Duration.ofSeconds(3);
    /** 이름 풀이 전용 스레드(데몬) — 풀이가 오래 걸려도 수집기 스레드는 DNS_TIMEOUT 에 풀려난다. 밀리면 새 풀이를 거절한다. */
    private static final ExecutorService DNS_EXECUTOR = new ThreadPoolExecutor(0, 4, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), r -> {
        Thread t = new Thread(r, "widget-collect-dns");
        t.setDaemon(true);
        return t;
    });

    private final Function<String, InetAddress[]> resolver;
    private final Duration dnsTimeout;
    private final Clock clock;
    private final Sleeper sleeper;
    private final IntSupplier jitterMs;

    /** 재시도 대기용 — 시험은 실제로 자지 않는 구현을 넣는다. */
    @FunctionalInterface
    interface Sleeper {
        void sleep(long millis) throws InterruptedException;
    }

    /** 수집 결과와, 일시 오류를 한 번 재시도해 성공했으면 그 설명(이력 메시지용). */
    public record Result(List<CollectItem> items, String retryNote) {}

    /** 재시도 대상인 일시 오류. 메시지는 재시도하지 않을 때의 실패 문구와 같다. */
    static final class TransientFailure extends CollectException {
        private final String reason;
        private final Long retryAfterMs;

        TransientFailure(String message, String reason, Long retryAfterMs) {
            super(message);
            this.reason = reason;
            this.retryAfterMs = retryAfterMs;
        }

        String reason() {
            return reason;
        }

        Long retryAfterMs() {
            return retryAfterMs;
        }
    }

    public HttpCollectSource(Predicate<String> hostAllowed) {
        this(hostAllowed, builder(), HttpCollectSource::resolve, DNS_TIMEOUT);
    }

    /** 시험은 {@code MockRestServiceServer.bindTo(builder)} 로 묶은 빌더와 가짜 이름 풀이를 넘긴다(실제 네트워크 금지). */
    HttpCollectSource(Predicate<String> hostAllowed, RestClient.Builder builder, Function<String, InetAddress[]> resolver) {
        this(hostAllowed, builder, resolver, DNS_TIMEOUT);
    }

    HttpCollectSource(Predicate<String> hostAllowed, RestClient.Builder builder, Function<String, InetAddress[]> resolver, Duration dnsTimeout) {
        this(hostAllowed, builder, resolver, dnsTimeout, Clock.systemUTC(), Thread::sleep, () -> ThreadLocalRandom.current().nextInt(RETRY_JITTER_MS + 1));
    }

    HttpCollectSource(Predicate<String> hostAllowed, RestClient.Builder builder, Function<String, InetAddress[]> resolver, Duration dnsTimeout,
                      Clock clock, Sleeper sleeper, IntSupplier jitterMs) {
        this.hostAllowed = hostAllowed;
        this.http = builder.build();
        this.resolver = resolver;
        this.dnsTimeout = dnsTimeout;
        this.clock = clock;
        this.sleeper = sleeper;
        this.jitterMs = jitterMs;
    }

    /** 시간 제한을 걸고 리다이렉트를 따라가지 않는 RestClient 빌더. */
    static RestClient.Builder builder() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .proxy(HttpClient.Builder.NO_PROXY) // 시스템 프록시 설정을 타지 않는다 — 주소 검사와 실제 연결 경로가 같아야 한다
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder().requestFactory(factory);
    }

    private static InetAddress[] resolve(String host) {
        try {
            return InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            return new InetAddress[0];
        }
    }

    @Override
    public List<CollectItem> collect(CollectConfig.HttpSource source, LocalDate today) {
        return collect(source, today, Map.of());
    }

    /** 작업 변수를 주소의 {@code {{이름}}} 자리에 넣는 실행 경로 — {@code jobCollect} 가 쓴다. 허용 호스트·주소 검사는 변수를 넣은 뒤의 주소로 한다. */
    public List<CollectItem> collect(CollectConfig.HttpSource source, LocalDate today, Map<String, Object> vars) {
        return collectDetailed(source, today, vars, null).items();
    }

    /**
     * {@link #collect(CollectConfig.HttpSource, LocalDate, Map)} 와 같고, 일시 오류 재시도 설명과 실행 마감을 함께 다룬다.
     * {@code deadline} 은 이 시도의 마감(없으면 null — 남은 시간을 따지지 않고 재시도한다).
     */
    public Result collectDetailed(CollectConfig.HttpSource source, LocalDate today, Map<String, Object> vars, Instant deadline) {
        java.net.URI uri = HttpUrlTemplate.render(source, vars, today);
        String host = uri.getHost();
        if (host == null || !hostAllowed.test(host)) throw new CollectException("허용 목록에 없는 호스트라 수집하지 않습니다.");
        requireSafeAddress(host);
        String[] retryNote = new String[1];
        JsonNode root = fetch(uri, source.retryTransient(), deadline, retryNote);
        List<CollectItem> items = new ArrayList<>();
        for (CollectConfig.HttpItem item : source.items()) {
            JsonNode node = at(root, item.path());
            if (node == null || node.isNull() || node.isMissingNode()) continue;
            CollectItem ci = node.isNumber() ? CollectItem.of(item.key(), node.decimalValue())
                    : node.isTextual() ? CollectItem.of(item.key(), node.asText())
                    : node.isBoolean() ? CollectItem.of(item.key(), node.asBoolean())
                    : null; // 객체·배열은 값이 아니다
            if (ci != null) items.add(ci);
        }
        return new Result(items, retryNote[0]);
    }

    /** 이름이 풀리지 않거나(3초 안에) 위험한 주소({@link #isUnsafe})가 하나라도 있으면 거절한다. */
    private void requireSafeAddress(String host) {
        InetAddress[] addresses = resolveWithTimeout(host);
        if (addresses == null || addresses.length == 0) throw new CollectException("호스트 주소를 찾지 못했습니다.");
        for (InetAddress a : addresses) {
            if (isUnsafe(a)) throw new CollectException("링크 로컬·멀티캐스트·와일드카드·메타데이터 주소로 풀리는 호스트는 수집하지 않습니다.");
        }
    }

    private InetAddress[] resolveWithTimeout(String host) {
        Future<InetAddress[]> future;
        try {
            future = DNS_EXECUTOR.submit(() -> resolver.apply(host));
        } catch (RejectedExecutionException e) {
            throw new CollectException("호스트 이름 풀이가 밀려 있어 수집하지 않습니다.");
        }
        try {
            return future.get(dnsTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new CollectException("호스트 이름 풀이가 " + dnsTimeout.toSeconds() + "초 안에 끝나지 않았습니다.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CollectException("호스트 이름 풀이가 중단되었습니다.");
        } catch (ExecutionException e) {
            throw new CollectException("호스트 주소를 찾지 못했습니다.");
        }
    }

    /**
     * 링크 로컬·멀티캐스트·와일드카드 주소, 클라우드 메타데이터 주소({@code fd00:ec2::254} AWS IPv6, {@code 100.100.100.200} 알리바바)이면 true.
     * IPv6 안에 묻힌 IPv4({@code ::a.b.c.d} IPv4 호환, {@code 64:ff9b::/96} NAT64, {@code 2002::/16} 6to4)는 꺼내 IPv4 규칙으로 다시 본다
     * (IPv4 매핑 {@code ::ffff:a.b.c.d} 는 JDK 가 이미 IPv4 로 바꾼다). 사설·루프백은 막지 않는다(허용 호스트가 사내 API 일 수 있다).
     */
    static boolean isUnsafe(InetAddress a) {
        if (a.isLinkLocalAddress() || a.isMulticastAddress() || a.isAnyLocalAddress()) return true;
        byte[] b = a.getAddress();
        if (b.length == 4) return isMetadataV4(b);
        if (b.length != 16) return true; // 알 수 없는 형은 거절
        if ((b[0] & 0xff) == 0xfd && (b[1] & 0xff) == 0x00 && b[2] == 0x0e && b[3] == (byte) 0xc2 && isZero(b, 4, 14) && b[14] == 0x02 && b[15] == 0x54) {
            return true; // fd00:ec2::254
        }
        byte[] embedded = null;
        if (isZero(b, 0, 12)) { // IPv4 호환 ::a.b.c.d
            embedded = new byte[] {b[12], b[13], b[14], b[15]};
        } else if (b[0] == 0x00 && b[1] == 0x64 && (b[2] & 0xff) == 0xff && (b[3] & 0xff) == 0x9b && isZero(b, 4, 12)) { // NAT64 64:ff9b::/96
            embedded = new byte[] {b[12], b[13], b[14], b[15]};
        } else if (b[0] == 0x20 && b[1] == 0x02) { // 6to4 2002:AABB:CCDD::/48
            embedded = new byte[] {b[2], b[3], b[4], b[5]};
        }
        return embedded != null && isUnsafeV4(embedded);
    }

    private static boolean isUnsafeV4(byte[] v4) {
        try {
            InetAddress a = InetAddress.getByAddress(v4);
            return a.isLinkLocalAddress() || a.isMulticastAddress() || a.isAnyLocalAddress() || isMetadataV4(v4);
        } catch (UnknownHostException e) {
            return true;
        }
    }

    private static boolean isMetadataV4(byte[] b) {
        return (b[0] & 0xff) == 100 && (b[1] & 0xff) == 100 && (b[2] & 0xff) == 100 && (b[3] & 0xff) == 200;
    }

    /** b[from, to) 가 모두 0 인가. */
    private static boolean isZero(byte[] b, int from, int to) {
        for (int i = from; i < to; i++) if (b[i] != 0) return false;
        return true;
    }

    /**
     * 한 번 부르고, 재시도가 켜져 있으면 일시 오류({@link TransientFailure})일 때 한 번만 더 부른다. 재시도하지 않을 때의 실패 문구는 종전과 같다.
     * 재시도로 성공하면 {@code retryNote[0]} 에 설명을 남긴다.
     */
    private JsonNode fetch(java.net.URI uri, boolean retryTransient, Instant deadline, String[] retryNote) {
        try {
            return fetchOnce(uri);
        } catch (TransientFailure first) {
            if (!retryTransient) throw first;
            long delayMs = first.retryAfterMs() != null ? first.retryAfterMs() : RETRY_DELAY_MS + jitterMs.getAsInt();
            if (first.retryAfterMs() != null && first.retryAfterMs() > RETRY_AFTER_MAX_MS) {
                log.warn("수집 일시 오류 재시도 안 함 — Retry-After {}ms 가 상한 {}ms 를 넘는다 원인={}", first.retryAfterMs(), RETRY_AFTER_MAX_MS, first.reason());
                throw first;
            }
            if (deadline != null) {
                long remaining = Duration.between(clock.instant(), deadline).toMillis();
                if (remaining < delayMs + ATTEMPT_WORST_MS) {
                    log.warn("수집 일시 오류 재시도 안 함 — 남은 시간 {}ms 가 부족하다 원인={}", remaining, first.reason());
                    throw first;
                }
            }
            log.warn("수집 일시 오류 — {}ms 뒤 한 번 다시 부른다 원인={}", delayMs, first.reason());
            try {
                sleeper.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new CollectException("수집이 중단되었습니다.");
            }
            try {
                JsonNode root = fetchOnce(uri);
                retryNote[0] = "일시 오류(" + first.reason() + ") 후 재시도 1회로 성공";
                return root;
            } catch (TransientFailure second) {
                throw new CollectException(second.getMessage() + " (일시 오류 재시도 1회 후에도 실패)");
            }
        }
    }

    private JsonNode fetchOnce(java.net.URI uri) {
        byte[] body;
        try {
            body = http.get().uri(uri).accept(MediaType.APPLICATION_JSON).exchange((request, response) -> {
                HttpStatusCode status = response.getStatusCode();
                if (status.is3xxRedirection()) throw new CollectException("리다이렉트 응답은 따르지 않습니다.");
                if (!status.is2xxSuccessful()) {
                    String message = "수집 요청 실패: HTTP " + status.value();
                    int code = status.value();
                    if (code == 429 || code == 502 || code == 503 || code == 504) {
                        throw new TransientFailure(message, "HTTP " + code, (code == 429 || code == 503) ? retryAfterMs(response.getHeaders().getFirst("Retry-After")) : null);
                    }
                    throw new CollectException(message);
                }
                try (InputStream in = response.getBody()) {
                    byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
                    if (bytes.length > MAX_BODY_BYTES) throw new CollectException("응답이 1MB 를 넘어 수집하지 않습니다.");
                    return bytes;
                }
            });
        } catch (CollectException e) {
            throw e;
        } catch (ResourceAccessException e) {
            // 연결/읽기 시간 초과·연결 거부·끊김 — 일시 오류. 예외 메시지에 요청 주소가 들어 있을 수 있어 종류만 적는다.
            throw new TransientFailure("수집 요청 실패: " + e.getClass().getSimpleName(), e.getClass().getSimpleName(), null);
        } catch (RestClientException e) {
            // 예외 메시지에 요청 주소가 들어 있을 수 있어 종류만 적는다.
            throw new CollectException("수집 요청 실패: " + e.getClass().getSimpleName());
        }
        if (body == null || body.length == 0) throw new CollectException("응답이 비었습니다.");
        try {
            return JSON.readTree(body);
        } catch (IOException e) {
            throw new CollectException("응답을 JSON 으로 읽지 못했습니다.");
        }
    }

    /** {@code Retry-After} 가 0 이상 정수 초면 ms, 아니면(날짜 형식·잘못된 값·없음) null. 상한 판정은 호출하는 쪽이 한다. */
    static Long retryAfterMs(String header) {
        if (header == null) return null;
        String v = header.strip();
        if (v.isEmpty() || v.length() > 9 || !v.chars().allMatch(Character::isDigit)) return null;
        return Long.parseLong(v) * 1000L;
    }

    /** path 조각(글자=키, 정수=배열 첨자)을 따라 내려간다. 없으면 null. */
    static JsonNode at(JsonNode root, List<Object> path) {
        JsonNode node = root;
        for (Object part : path) {
            if (node == null) return null;
            node = part instanceof Integer i ? (node.isArray() ? node.get(i) : null) : (node.isObject() ? node.get((String) part) : null);
        }
        return node;
    }
}
