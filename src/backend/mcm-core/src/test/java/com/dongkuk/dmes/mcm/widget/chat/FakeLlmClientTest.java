package com.dongkuk.dmes.mcm.widget.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.widget.chat.llm.AnthropicLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.FakeLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmException;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolCall;
import com.dongkuk.dmes.mcm.widget.chat.llm.OpenAiCompatibleLlmClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/** {@link FakeLlmClient}(설정 없을 때의 안내·시험 각본) 과 공급자 고르기({@link WidgetChatConfig#createClient}). */
class FakeLlmClientTest {

    @Test
    @DisplayName("기본 가짜는 「AI 연결이 설정되지 않았습니다」 를 돌려주고 호출을 쌓아 두지 않는다")
    void defaultFakeAnswersNotConfigured() {
        FakeLlmClient fake = new FakeLlmClient();

        LlmReply reply = fake.chat("s", List.of(LlmMessage.user("안녕")), List.of());

        assertThat(reply.text()).isEqualTo("AI 연결이 설정되지 않았습니다. 관리자에게 문의하세요.");
        assertThat(reply.hasToolCalls()).isFalse();
        assertThat(fake.calls()).as("운영 빈은 호출을 기억하지 않는다(메모리)").isEmpty();
    }

    @Test
    @DisplayName("각본 가짜는 넣은 순서대로 답·예외를 돌려주고, 다 쓰면 기본 안내를 돌려주며, 받은 입력을 기록한다")
    void scriptedFakeReplaysInOrder() {
        FakeLlmClient fake = FakeLlmClient.scripted()
                .then(LlmReply.ofToolCalls("", List.of(new LlmToolCall("t1", "find_screen", Map.of("keyword", "위젯")))))
                .thenThrow(new LlmException("boom"))
                .then(LlmReply.ofText("답"));

        assertThat(fake.chat("sys", List.of(LlmMessage.user("q1")), List.of()).toolCalls()).hasSize(1);
        assertThatThrownBy(() -> fake.chat("sys", List.of(LlmMessage.user("q2")), List.of())).isInstanceOf(LlmException.class);
        assertThat(fake.chat("sys", List.of(LlmMessage.user("q3")), List.of()).text()).isEqualTo("답");
        assertThat(fake.chat("sys", List.of(LlmMessage.user("q4")), List.of()).text()).isEqualTo(FakeLlmClient.NOT_CONFIGURED);

        assertThat(fake.calls()).hasSize(4);
        assertThat(fake.calls().get(0).systemPrompt()).isEqualTo("sys");
        assertThat(fake.calls().get(2).messages()).singleElement().extracting(LlmMessage::text).isEqualTo("q3");
    }

    @Test
    @DisplayName("provider 가 비어 있거나 모르는 값이면 가짜, anthropic·openai 는 해당 공급자(대소문자 무시)")
    void createClientByProvider() {
        assertThat(WidgetChatConfig.createClient(props("", "", ""), RestClient.builder())).isInstanceOf(FakeLlmClient.class);
        assertThat(WidgetChatConfig.createClient(props("gemini", "", ""), RestClient.builder())).isInstanceOf(FakeLlmClient.class);
        assertThat(WidgetChatConfig.createClient(props("Anthropic", "", ""), RestClient.builder()))
                .isInstanceOf(AnthropicLlmClient.class);
        assertThat(WidgetChatConfig.createClient(props("openai", "http://ollama.local:11434/v1", "qwen3:14b"), RestClient.builder()))
                .isInstanceOf(OpenAiCompatibleLlmClient.class);
    }

    @Test
    @DisplayName("openai 인데 base-url·model 이 없으면 부팅을 막지 않고 가짜로 둔다")
    void openAiWithoutBaseUrlFallsBackToFake() {
        LlmClient noUrl = WidgetChatConfig.createClient(props("openai", "", "qwen3:14b"), RestClient.builder());
        LlmClient noModel = WidgetChatConfig.createClient(props("openai", "http://ollama.local:11434/v1", ""), RestClient.builder());

        assertThat(noUrl).isInstanceOf(FakeLlmClient.class);
        assertThat(noModel).isInstanceOf(FakeLlmClient.class);
    }

    @Test
    @DisplayName("설정 toString 은 키를 보이지 않는다")
    void propertiesHideApiKey() {
        WidgetLlmProperties p = props("anthropic", "", "");
        p.setApiKey("sk-ant-secret");

        assertThat(p.toString()).doesNotContain("sk-ant-secret").contains("(설정됨)");
    }

    private static WidgetLlmProperties props(String provider, String baseUrl, String model) {
        WidgetLlmProperties p = new WidgetLlmProperties();
        p.setProvider(provider);
        p.setBaseUrl(baseUrl);
        p.setModel(model);
        return p;
    }
}
