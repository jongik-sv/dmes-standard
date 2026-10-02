package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpClient;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * {@link WidgetExtHttp} — 운영 경로 빌더의 시간 제한(연결 3초·읽기 5초, 스펙 §8.3). 제공자 시험은 가짜 HTTP 빌더를 넘기므로
 * 운영 빌더 설정은 여기서만 본다. 팩토리에 꺼내 볼 공개 메서드가 없어 필드를 읽는다.
 */
class WidgetExtHttpTest {

    @Test
    @DisplayName("builder() 는 JDK HttpClient 요청 팩토리를 쓰고, 연결 3초·읽기 5초가 걸려 있다")
    void builderHasConnectAndReadTimeouts() {
        assertThat(WidgetExtHttp.CONNECT_TIMEOUT).isEqualTo(Duration.ofSeconds(3));
        assertThat(WidgetExtHttp.READ_TIMEOUT).isEqualTo(Duration.ofSeconds(5));

        Object factory = ReflectionTestUtils.getField(WidgetExtHttp.builder(), "requestFactory");
        assertThat(factory).isInstanceOf(JdkClientHttpRequestFactory.class);
        assertThat(ReflectionTestUtils.getField(factory, "readTimeout")).isEqualTo(Duration.ofSeconds(5));
        HttpClient client = (HttpClient) ReflectionTestUtils.getField(factory, "httpClient");
        assertThat(client).isNotNull();
        assertThat(client.connectTimeout()).contains(Duration.ofSeconds(3));
    }
}
