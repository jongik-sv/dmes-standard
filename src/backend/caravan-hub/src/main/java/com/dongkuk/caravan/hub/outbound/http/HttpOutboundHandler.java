package com.dongkuk.caravan.hub.outbound.http;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * OUTBOUND HTTP 처리 핸들러.
 *
 * <p>Kafka에서 수신한 메시지를 외부 시스템에 HTTP POST로 전달한다.
 * {@code HttpURLConnection}을 사용하며, 타임아웃은 {@link CaravanHubProperties.Outbound.Http}에서 설정한다.</p>
 *
 * <p>전송되는 JSON 본문은 {@code context.getRawMessageMap()}으로, Kafka에서 받은 원본 메시지 전체이다:</p>
 * <pre>{@code
 * {
 *   "TRANSACTION_CODE": "CaravanHubConsumeHandler",
 *   "KAFKA_KEYDATA": "uuid...",
 *   "INTERFACE_ID": "TOPIC_ID",
 *   "INTERFACE_MSG": "...",
 *   "INTERFACE_PROTOCOL": "IF_KAFKA"
 * }
 * }</pre>
 *
 * <p>HTTP 응답 코드 200~299이면 성공, 그 외에는 {@code IllegalStateException}을 발생시킨다.</p>
 *
 * @see com.dongkuk.caravan.hub.outbound.OutboundDispatchRoute
 * @see CaravanHubProperties.Outbound.Http
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class HttpOutboundHandler {

    private final CaravanHubProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** {@code ${ENV_VAR}} 형태의 환경변수 placeholder 패턴 ({@code HTTP_HEADERS} 값 치환용). */
    private static final Pattern ENV_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    /**
     * Kafka 수신 메시지를 외부 시스템에 HTTP로 전송한다.
     *
     * <p>처리 순서:</p>
     * <ol>
     *   <li>config에서 {@code HTTP_URL}, {@code HTTP_METHOD} 추출 (기본값: POST)</li>
     *   <li>{@code context.getRawMessageMap()}을 JSON으로 직렬화</li>
     *   <li>{@code HttpURLConnection}으로 전송 (Content-Type: application/json; charset=UTF-8)</li>
     *   <li>응답 코드 200~299이면 성공, 그 외 {@code IllegalStateException} 발생</li>
     * </ol>
     *
     * @param context Caravan이 제공하는 Kafka 메시지 컨텍스트
     * @param config  OUTBOUND 설정 정보 ({@code HTTP_URL}, {@code HTTP_METHOD}, {@code HTTP_HEADERS} 포함)
     * @throws IllegalStateException HTTP_URL이 없거나, 직렬화 실패, 헤더 파싱 실패, 전송 실패 시
     */
    public void handle(KafkaMessageContext context, Map<String, Object> config) {
        // 1. 설정 정보 추출
        String httpUrl = (String) config.get("HTTP_URL");
        String httpMethod = (String) config.get("HTTP_METHOD");
        if (httpMethod == null || httpMethod.isEmpty()) {
            httpMethod = "POST";
        }

        // 2. 필수값 검증
        if (httpUrl == null || httpUrl.isEmpty()) {
            throw new IllegalStateException("HTTP_URL 설정이 없습니다");
        }

        // 3. 목적지별 옵셔널 헤더 (HTTP_HEADERS JSON → ${ENV} 치환). NULL/blank 면 헤더 0개.
        Map<String, String> extraHeaders = parseHeaders((String) config.get("HTTP_HEADERS"));

        // 4. 원본 메시지를 JSON으로 직렬화
        String jsonPayload;
        try {
            jsonPayload = objectMapper.writeValueAsString(context.getRawMessageMap());
        } catch (Exception e) {
            throw new IllegalStateException("메시지 직렬화 실패", e);
        }

        // 5. HTTP 전송
        String topicId = context.getInterfaceId();
        int responseCode = sendHttpRequest(httpUrl, httpMethod, jsonPayload, extraHeaders);

        log.info("HTTP 전송 완료 - Topic: {}, URL: {}, ResponseCode: {}", topicId, httpUrl, responseCode);
    }

    /**
     * {@code HTTP_HEADERS}(JSON object) 를 목적지별 헤더 Map 으로 파싱한다.
     *
     * <p>값에 포함된 {@code ${ENV_VAR}} placeholder 는 {@code System.getenv} 로 치환된다
     * (실 시크릿은 DB 가 아닌 caravan-hub 환경변수에 보관). NULL/blank 면 빈 Map(헤더 0개 = 기존 동작).</p>
     *
     * @param httpHeaders HTTP_HEADERS 컬럼 값 (JSON object 또는 null/blank)
     * @return 치환 완료된 헤더 Map (삽입 순서 보존). NULL/blank 면 빈 Map
     * @throws IllegalStateException JSON 파싱 실패 시
     */
    Map<String, String> parseHeaders(String httpHeaders) {
        if (httpHeaders == null || httpHeaders.isBlank()) {
            return Map.of();
        }
        Map<String, String> raw;
        try {
            raw = objectMapper.readValue(httpHeaders, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("HTTP_HEADERS JSON 파싱 실패: " + e.getMessage(), e);
        }
        Map<String, String> resolved = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : raw.entrySet()) {
            resolved.put(entry.getKey(), resolveEnv(entry.getValue()));
        }
        return resolved;
    }

    /**
     * 문자열 내 {@code ${ENV_VAR}} placeholder 를 {@code System.getenv} 값으로 치환한다.
     *
     * <p>환경변수가 미설정이면 빈 문자열로 치환하고 경고 로그를 남긴다.</p>
     *
     * @param value 치환 대상 문자열 (null 가능)
     * @return 치환된 문자열. value 가 null 이면 null
     */
    String resolveEnv(String value) {
        if (value == null) {
            return null;
        }
        Matcher matcher = ENV_PATTERN.matcher(value);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String envName = matcher.group(1);
            String envValue = System.getenv(envName);
            if (envValue == null) {
                log.warn("HTTP_HEADERS 환경변수 미설정: {} → 빈 값 치환", envName);
                envValue = "";
            }
            matcher.appendReplacement(sb, Matcher.quoteReplacement(envValue));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * HTTP 요청을 전송하고 응답 코드를 반환한다.
     *
     * <p>타임아웃 설정:</p>
     * <ul>
     *   <li>연결 타임아웃: {@code caravan-hub.outbound.http.connect-timeout} (기본 10000ms)</li>
     *   <li>읽기 타임아웃: {@code caravan-hub.outbound.http.read-timeout} (기본 30000ms)</li>
     * </ul>
     *
     * @param urlString    전송 대상 URL
     * @param method       HTTP 메서드 (예: POST)
     * @param jsonPayload  JSON 요청 본문
     * @param extraHeaders 목적지별 추가 헤더 (HTTP_HEADERS, 비어 있으면 무시)
     * @return HTTP 응답 코드 (200~299)
     * @throws IllegalStateException 응답 코드가 200~299가 아니거나 전송 오류 발생 시
     */
    private int sendHttpRequest(String urlString, String method, String jsonPayload,
                                Map<String, String> extraHeaders) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setRequestProperty("Accept", "application/json");
            // 목적지별 옵셔널 헤더 (인증 고정키 등). Content-Type/Accept 이후 적용 → 필요 시 override 가능.
            if (extraHeaders != null) {
                for (Map.Entry<String, String> header : extraHeaders.entrySet()) {
                    connection.setRequestProperty(header.getKey(), header.getValue());
                }
            }
            connection.setConnectTimeout(properties.getOutbound().getHttp().getConnectTimeout());
            connection.setReadTimeout(properties.getOutbound().getHttp().getReadTimeout());
            connection.setDoOutput(true);

            // 요청 본문 전송
            try (OutputStream os = connection.getOutputStream()) {
                byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            int responseCode = connection.getResponseCode();

            if (responseCode >= 200 && responseCode < 300) {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    StringBuilder response = new StringBuilder();
                    String responseLine;
                    while ((responseLine = br.readLine()) != null) {
                        response.append(responseLine.trim());
                    }
                    log.debug("HTTP 응답: {}", response.toString());
                }
            } else {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(connection.getErrorStream(), StandardCharsets.UTF_8))) {
                    StringBuilder response = new StringBuilder();
                    String responseLine;
                    while ((responseLine = br.readLine()) != null) {
                        response.append(responseLine.trim());
                    }
                    log.warn("HTTP 에러 응답 ({}): {}", responseCode, response.toString());
                }
                throw new IllegalStateException("HTTP 전송 실패 - ResponseCode: " + responseCode);
            }

            return responseCode;

        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("HTTP 전송 오류: " + e.getMessage(), e);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
