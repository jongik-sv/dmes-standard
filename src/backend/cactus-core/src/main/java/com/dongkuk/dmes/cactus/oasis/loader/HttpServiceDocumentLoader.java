package com.dongkuk.dmes.cactus.oasis.loader;

import com.dongkuk.oasis.exceptions.ServiceLoadException;
import com.dongkuk.oasis.loader.ServiceDocumentLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * HTTP GET 으로 BPMN 서비스 문서를 가져온다. {@code cactus.oasis.service-loader-url}
 * 에 지정한 URL 의 {@code {serviceId}} 토큰을 런타임에 실제 serviceId 로 치환.
 *
 * <p>미결 #8 결정사항 (2026-05-12): film 의 Apache HttpClient 4.x 의존을 가져오지
 * 않고 **JDK 21 의 {@link HttpClient}** 로 재작성.
 *
 * <p>cactus 의 {@code OasisAutoConfiguration} 이 {@code cactus.oasis.transactional=true}
 * + {@code cactus.oasis.service-loader-url} 명시 시
 * {@link com.dongkuk.oasis.provider.GenericServiceProvider} 의 loader 로 사용.
 *
 * @see com.dongkuk.dmes.cactus.oasis.OasisProperties
 */
public class HttpServiceDocumentLoader implements ServiceDocumentLoader {

    private static final Logger log = LoggerFactory.getLogger(HttpServiceDocumentLoader.class);

    private final HttpClient client;
    private final String serverUri;
    private final Duration timeout;

    public HttpServiceDocumentLoader(String serviceUri, int timeoutSecond) {
        this.timeout = Duration.ofSeconds(timeoutSecond);
        this.client = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.serverUri = serviceUri;
    }

    @Override
    public String serviceDocument(String serviceId) {
        URI uri = URI.create(serverUri.replace("{serviceId}", serviceId));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(uri)
                .timeout(timeout)
                .GET()
                .build();
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) {
                if (log.isDebugEnabled()) {
                    log.debug("Loaded {} ({} chars)", uri, response.body() == null ? 0 : response.body().length());
                }
                return response.body();
            }
            throw new ServiceLoadException("HTTP " + status + " from " + uri);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceLoadException(e);
        } catch (IOException e) {
            throw new ServiceLoadException(e);
        }
    }
}
