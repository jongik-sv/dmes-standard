package com.dongkuk.dmes.mcm.widget.chat;

import com.dongkuk.dmes.mcm.widget.chat.llm.AnthropicLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.FakeLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.OpenAiCompatibleLlmClient;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 챗봇 LLM 공급자 빈(스펙 §9.1, W-D27). {@code dmes.widget.llm.provider} 로 하나를 고른다 — 빈 값·모르는 값·필수 설정 누락은
 * 부팅을 막지 않고 {@link FakeLlmClient}(「AI 연결이 설정되지 않았습니다」)로 둔다.
 * HTTP 는 연결 3초·읽기 {@code timeout-sec}(기본 60초). 이름이 {@code *AutoConfiguration} 이 아니어야 mcm api 컴포넌트 스캔에 잡힌다.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(WidgetLlmProperties.class)
public class WidgetChatConfig {

    private static final Logger log = LoggerFactory.getLogger(WidgetChatConfig.class);

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    public LlmClient widgetLlmClient(WidgetLlmProperties props) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(props.getTimeoutSec() > 0 ? props.getTimeoutSec() : 60));
        LlmClient client = createClient(props, RestClient.builder().requestFactory(factory));
        log.info("[widgetChat] LLM 공급자: {}", client.getClass().getSimpleName());
        return client;
    }

    /** 공급자 고르기. 빌더에는 요청 팩토리가 이미 걸려 있어야 한다(시험은 MockRestServiceServer 로 묶은 빌더). */
    public static LlmClient createClient(WidgetLlmProperties props, RestClient.Builder builder) {
        String provider = props.getProvider() == null ? "" : props.getProvider().trim().toLowerCase(Locale.ROOT);
        switch (provider) {
            case "" -> {
                return new FakeLlmClient();
            }
            case "anthropic" -> {
                return new AnthropicLlmClient(builder, props);
            }
            case "openai" -> {
                if (blank(props.getBaseUrl()) || blank(props.getModel())) {
                    log.warn("[widgetChat] provider=openai 에는 base-url·model 이 필요합니다 — 가짜 공급자로 둡니다");
                    return new FakeLlmClient();
                }
                return new OpenAiCompatibleLlmClient(builder, props);
            }
            default -> {
                log.warn("[widgetChat] 모르는 provider={} — 가짜 공급자로 둡니다", provider);
                return new FakeLlmClient();
            }
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
