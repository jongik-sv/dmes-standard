package com.dongkuk.dmes.mcm.widget.collect;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * HTTP JSON 원천 — 스펙 2026-10-05 정시 수집 §2·§4. 관리자가 정한 주소를 서버가 부르므로 SSRF 를 막는 규칙을 모두 여기서 지킨다.
 * <ul>
 *   <li>호스트가 허용 목록({@code dmes.widget.collect.allowed-hosts})에 정확히 있어야 한다(대소문자 무시, 포트는 허용). 목록이 비면 모두 거절.</li>
 *   <li>사용자 정보({@code user:pw@})가 든 주소는 거절한다(저장 검사와 같은 {@link CollectConfigs#parseUrl}).</li>
 *   <li>호스트를 풀어 하나라도 링크 로컬({@code 169.254.x.x}·{@code fe80::})·멀티캐스트·와일드카드 주소이면 거절한다(클라우드 메타데이터 주소 차단).
 *       이름 풀이와 실제 연결 사이에 주소가 바뀌는 경우(DNS 재바인딩)까지는 막지 못하므로 허용 호스트는 신뢰하는 곳만 적는다.</li>
 *   <li>리다이렉트는 따라가지 않는다(3xx 는 실패). 연결 3초·읽기 5초, 응답 본문 1MB 상한, JSON 이 아니면 실패.</li>
 *   <li>실패 메시지에 주소·질의 문자열을 넣지 않는다(키가 질의에 있을 수 있다).</li>
 * </ul>
 * 값은 숫자(또는 숫자 글자)면 숫자, 그 밖의 글자는 글자(200자까지). 경로에 값이 없는 항목은 건너뛰고, 전부 없으면 호출자가 실패로 기록한다.
 */
@Component
class HttpCollectSource implements CollectSource<CollectConfig.HttpSource> {

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    static final int MAX_BODY_BYTES = 1024 * 1024;

    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    private final WidgetCollectProperties properties;
    private final RestClient http;
    private final Function<String, InetAddress[]> resolver;

    @Autowired
    HttpCollectSource(WidgetCollectProperties properties) {
        this(properties, builder(), HttpCollectSource::resolve);
    }

    /** 시험은 {@code MockRestServiceServer.bindTo(builder)} 로 묶은 빌더와 가짜 이름 풀이를 넘긴다(실제 네트워크 금지). */
    HttpCollectSource(WidgetCollectProperties properties, RestClient.Builder builder, Function<String, InetAddress[]> resolver) {
        this.properties = properties;
        this.http = builder.build();
        this.resolver = resolver;
    }

    /** 시간 제한을 걸고 리다이렉트를 따라가지 않는 RestClient 빌더. */
    static RestClient.Builder builder() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
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
        java.net.URI uri = source.url();
        String host = uri.getHost();
        if (!properties.isAllowedHost(host)) throw new CollectException("허용 목록에 없는 호스트라 수집하지 않습니다.");
        requireSafeAddress(host);
        JsonNode root = fetch(uri);
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
        return items;
    }

    /** 이름이 풀리지 않거나 링크 로컬·멀티캐스트·와일드카드 주소가 하나라도 있으면 거절한다. */
    private void requireSafeAddress(String host) {
        InetAddress[] addresses = resolver.apply(host);
        if (addresses == null || addresses.length == 0) throw new CollectException("호스트 주소를 찾지 못했습니다.");
        for (InetAddress a : addresses) {
            if (a.isLinkLocalAddress() || a.isMulticastAddress() || a.isAnyLocalAddress()) {
                throw new CollectException("링크 로컬·멀티캐스트·와일드카드 주소로 풀리는 호스트는 수집하지 않습니다.");
            }
        }
    }

    private JsonNode fetch(java.net.URI uri) {
        byte[] body;
        try {
            body = http.get().uri(uri).accept(MediaType.APPLICATION_JSON).exchange((request, response) -> {
                HttpStatusCode status = response.getStatusCode();
                if (status.is3xxRedirection()) throw new CollectException("리다이렉트 응답은 따르지 않습니다.");
                if (!status.is2xxSuccessful()) throw new CollectException("수집 요청 실패: HTTP " + status.value());
                try (InputStream in = response.getBody()) {
                    byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
                    if (bytes.length > MAX_BODY_BYTES) throw new CollectException("응답이 1MB 를 넘어 수집하지 않습니다.");
                    return bytes;
                }
            });
        } catch (CollectException e) {
            throw e;
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
