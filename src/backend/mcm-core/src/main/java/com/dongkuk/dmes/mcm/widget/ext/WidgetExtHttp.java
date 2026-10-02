package com.dongkuk.dmes.mcm.widget.ext;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * 외부 정보 HTTP 공용 — 연결 3초·읽기 5초(스펙 §8.3). 제공자는 이 빌더로 RestClient 를 만들고, 시험은 같은 자리에
 * {@code MockRestServiceServer.bindTo(builder)} 로 묶은 빌더를 넘긴다(실제 네트워크 금지).
 * 응답은 바이트로 받아 Jackson 2 트리로 읽는다 — Boot 4 의 메시지 변환기 선택(Jackson 2·3)에 기대지 않으려고.
 */
final class WidgetExtHttp {

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    private WidgetExtHttp() {}

    /** 시간 제한을 건 RestClient 빌더(JDK HttpClient). */
    static RestClient.Builder builder() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder().requestFactory(factory);
    }

    /**
     * GET 후 JSON 트리. 실패는 모두 {@link WidgetExtException} — 메시지에 주소를 넣지 않는다(인증키가 query 에 있다).
     */
    static JsonNode getJson(RestClient http, URI uri, String what) {
        byte[] body;
        try {
            body = http.get().uri(uri).accept(MediaType.APPLICATION_JSON).retrieve().body(byte[].class);
        } catch (RestClientResponseException e) {
            throw new WidgetExtException(what + " 요청 실패: HTTP " + e.getStatusCode().value());
        } catch (RestClientException e) {
            throw new WidgetExtException(what + " 요청 실패: " + e.getClass().getSimpleName());
        }
        if (body == null || body.length == 0) {
            throw new WidgetExtException(what + " 응답이 비었습니다.");
        }
        try {
            return JSON.readTree(body);
        } catch (IOException e) {
            throw new WidgetExtException(what + " 응답을 JSON 으로 읽지 못했습니다.");
        }
    }
}
