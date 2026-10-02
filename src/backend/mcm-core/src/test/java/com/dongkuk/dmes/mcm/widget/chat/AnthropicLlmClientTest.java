package com.dongkuk.dmes.mcm.widget.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dongkuk.dmes.mcm.widget.chat.llm.AnthropicLlmClient;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmException;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmTool;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolResult;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** {@link AnthropicLlmClient} — Messages API(POST /v1/messages) 요청 모양·응답 파싱·tool use·오류(가짜 HTTP 만). */
class AnthropicLlmClientTest {

    private static final String URL = "https://api.anthropic.com/v1/messages";

    private RestClient.Builder builder;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
    }

    private static WidgetLlmProperties props(String apiKey) {
        WidgetLlmProperties p = new WidgetLlmProperties();
        p.setProvider("anthropic");
        p.setApiKey(apiKey);
        return p;
    }

    private static LlmTool findScreen() {
        return new LlmTool("find_screen", "화면 찾기", Map.of(
                "type", "object",
                "properties", Map.of("keyword", Map.of("type", "string")),
                "required", List.of("keyword")));
    }

    @Test
    @DisplayName("요청은 x-api-key·anthropic-version 헤더와 model·max_tokens·system·messages·tools 본문이고, 일반 답을 글로 돌려준다")
    void requestShapeAndTextReply() {
        server.expect(requestTo(URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("x-api-key", "sk-test"))
                .andExpect(header("anthropic-version", "2023-06-01"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.model").value("claude-sonnet-5-5"))
                .andExpect(jsonPath("$.max_tokens").value(1024))
                .andExpect(jsonPath("$.system").value("너는 도우미다."))
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].role").value("user"))
                .andExpect(jsonPath("$.messages[0].content").value("위젯관리 화면은 어디 있어?"))
                .andExpect(jsonPath("$.tools[0].name").value("find_screen"))
                .andExpect(jsonPath("$.tools[0].description").value("화면 찾기"))
                .andExpect(jsonPath("$.tools[0].input_schema.type").value("object"))
                .andExpect(jsonPath("$.tools[0].input_schema.required[0]").value("keyword"))
                .andExpect(jsonPath("$.temperature").doesNotExist())
                .andExpect(jsonPath("$.tool_choice").doesNotExist())
                .andRespond(withSuccess("""
                        {"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5",
                         "content":[{"type":"text","text":"시스템관리 아래에 있습니다."}],
                         "stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":5}}
                        """, MediaType.APPLICATION_JSON));

        LlmReply reply = new AnthropicLlmClient(builder, props("sk-test"))
                .chat("너는 도우미다.", List.of(LlmMessage.user("위젯관리 화면은 어디 있어?")), List.of(findScreen()));

        server.verify();
        assertThat(reply.text()).isEqualTo("시스템관리 아래에 있습니다.");
        assertThat(reply.hasToolCalls()).isFalse();
        assertThat(reply.stopReason()).isEqualTo("end_turn");
    }

    @Test
    @DisplayName("tool_use 블록을 도구 호출로 읽고, thinking 블록은 글에서 빼되 원본 content 는 보존한다")
    void parsesToolUse() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.tools").doesNotExist())
                .andRespond(withSuccess("""
                        {"type":"message","role":"assistant",
                         "content":[{"type":"thinking","thinking":"","signature":"sig1"},
                                    {"type":"text","text":"찾아볼게요."},
                                    {"type":"tool_use","id":"toolu_01","name":"find_screen","input":{"keyword":"위젯"}}],
                         "stop_reason":"tool_use"}
                        """, MediaType.APPLICATION_JSON));

        LlmReply reply = new AnthropicLlmClient(builder, props("k"))
                .chat("", List.of(LlmMessage.user("위젯")), List.of());

        assertThat(reply.text()).isEqualTo("찾아볼게요.");
        assertThat(reply.stopReason()).isEqualTo("tool_use");
        assertThat(reply.toolCalls()).singleElement().satisfies(c -> {
            assertThat(c.id()).isEqualTo("toolu_01");
            assertThat(c.name()).isEqualTo("find_screen");
            assertThat(c.input()).containsEntry("keyword", "위젯");
        });
        assertThat(reply.rawAssistant()).isNotNull();
    }

    @Test
    @DisplayName("도구 반복 중 assistant 차례는 원본 content(thinking 포함)를 그대로, 도구 결과는 한 user 메시지의 tool_result 로 보낸다")
    void echoesAssistantTurnAndToolResults() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("""
                        {"type":"message","role":"assistant",
                         "content":[{"type":"thinking","thinking":"","signature":"sig1"},
                                    {"type":"tool_use","id":"toolu_01","name":"find_screen","input":{"keyword":"위젯"}},
                                    {"type":"tool_use","id":"toolu_02","name":"run_widget_query","input":{"defId":"def.x"}}],
                         "stop_reason":"tool_use"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.messages.length()").value(3))
                .andExpect(jsonPath("$.messages[1].role").value("assistant"))
                .andExpect(jsonPath("$.messages[1].content[0].type").value("thinking"))
                .andExpect(jsonPath("$.messages[1].content[0].signature").value("sig1"))
                .andExpect(jsonPath("$.messages[1].content[1].id").value("toolu_01"))
                .andExpect(jsonPath("$.messages[2].role").value("user"))
                .andExpect(jsonPath("$.messages[2].content.length()").value(2))
                .andExpect(jsonPath("$.messages[2].content[0].type").value("tool_result"))
                .andExpect(jsonPath("$.messages[2].content[0].tool_use_id").value("toolu_01"))
                .andExpect(jsonPath("$.messages[2].content[0].content").value("[{\"pageId\":\"mcm:csa/commWidgetMng\"}]"))
                .andExpect(jsonPath("$.messages[2].content[0].is_error").doesNotExist())
                .andExpect(jsonPath("$.messages[2].content[1].tool_use_id").value("toolu_02"))
                .andExpect(jsonPath("$.messages[2].content[1].is_error").value(true))
                .andRespond(withSuccess("""
                        {"type":"message","role":"assistant","content":[{"type":"text","text":"끝"}],"stop_reason":"end_turn"}
                        """, MediaType.APPLICATION_JSON));

        AnthropicLlmClient client = new AnthropicLlmClient(builder, props("k"));
        LlmMessage question = LlmMessage.user("위젯");
        LlmReply first = client.chat("s", List.of(question), List.of(findScreen()));
        LlmReply second = client.chat("s", List.of(question, LlmMessage.assistantReply(first), LlmMessage.toolResults(List.of(
                new LlmToolResult("toolu_01", "[{\"pageId\":\"mcm:csa/commWidgetMng\"}]", false),
                new LlmToolResult("toolu_02", "허용되지 않은 위젯입니다: def.x", true)))), List.of(findScreen()));

        server.verify();
        assertThat(second.text()).isEqualTo("끝");
    }

    @Test
    @DisplayName("기록이 assistant 로 시작하면 첫 user 메시지 앞까지 버린다(Messages API 는 user 로 시작해야 한다)")
    void dropsLeadingAssistant() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].role").value("user"))
                .andExpect(jsonPath("$.messages[0].content").value("질문1"))
                .andExpect(jsonPath("$.messages[1].role").value("assistant"))
                .andExpect(jsonPath("$.messages[1].content").value("답1"))
                .andRespond(withSuccess("{\"content\":[{\"type\":\"text\",\"text\":\"ok\"}],\"stop_reason\":\"end_turn\"}",
                        MediaType.APPLICATION_JSON));

        new AnthropicLlmClient(builder, props("k")).chat("s",
                List.of(LlmMessage.assistant("옛 답"), LlmMessage.user("질문1"), LlmMessage.assistant("답1")), List.of());

        server.verify();
    }

    @Test
    @DisplayName("base-url·model 설정을 따르고 base-url 끝 / 는 무시한다")
    void customBaseUrlAndModel() {
        WidgetLlmProperties p = props("k");
        p.setBaseUrl("http://llm-proxy.local/anthropic/");
        p.setModel("claude-opus-5-5");
        p.setMaxTokens(2048);
        server.expect(requestTo("http://llm-proxy.local/anthropic/v1/messages"))
                .andExpect(jsonPath("$.model").value("claude-opus-5-5"))
                .andExpect(jsonPath("$.max_tokens").value(2048))
                .andRespond(withSuccess("{\"content\":[{\"type\":\"text\",\"text\":\"ok\"}],\"stop_reason\":\"end_turn\"}",
                        MediaType.APPLICATION_JSON));

        assertThat(new AnthropicLlmClient(builder, p).chat("s", List.of(LlmMessage.user("q")), List.of()).text())
                .isEqualTo("ok");
        server.verify();
    }

    @Test
    @DisplayName("5xx·429 응답은 LlmException 이고 메시지에 키가 없다")
    void httpErrorsBecomeLlmException() {
        server.expect(requestTo(URL)).andRespond(withServerError());
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"slow down\"}}"));
        AnthropicLlmClient client = new AnthropicLlmClient(builder, props("sk-secret-key"));

        assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of()))
                .isInstanceOf(LlmException.class)
                .hasMessageNotContaining("sk-secret-key");
        assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of()))
                .isInstanceOf(LlmException.class)
                .hasMessageContaining("429")
                .hasMessageNotContaining("sk-secret-key");
    }

    @Test
    @DisplayName("시간 초과(연결·읽기)와 형식이 틀린 응답도 LlmException")
    void timeoutAndMalformedBecomeLlmException() {
        server.expect(requestTo(URL)).andRespond(withException(new SocketTimeoutException("Read timed out")));
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\"}}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andRespond(withSuccess("not json", MediaType.APPLICATION_JSON));
        AnthropicLlmClient client = new AnthropicLlmClient(builder, props("k"));

        assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of())).isInstanceOf(LlmException.class);
        assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of())).isInstanceOf(LlmException.class);
        assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of())).isInstanceOf(LlmException.class);
    }
}
