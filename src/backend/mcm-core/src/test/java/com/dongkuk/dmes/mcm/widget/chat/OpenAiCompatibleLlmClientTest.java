package com.dongkuk.dmes.mcm.widget.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dongkuk.dmes.mcm.widget.chat.llm.LlmException;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmMessage;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmReply;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmTool;
import com.dongkuk.dmes.mcm.widget.chat.llm.LlmToolResult;
import com.dongkuk.dmes.mcm.widget.chat.llm.OpenAiCompatibleLlmClient;
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

/** {@link OpenAiCompatibleLlmClient} — /chat/completions 요청 모양·tools/tool_calls·오류(가짜 HTTP 만, 사내 Ollama·vLLM 호환). */
class OpenAiCompatibleLlmClientTest {

    private static final String URL = "http://ollama.local:11434/v1/chat/completions";

    private RestClient.Builder builder;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
    }

    private static WidgetLlmProperties props(String apiKey) {
        WidgetLlmProperties p = new WidgetLlmProperties();
        p.setProvider("openai");
        p.setBaseUrl("http://ollama.local:11434/v1/");
        p.setModel("qwen3:14b");
        p.setApiKey(apiKey);
        return p;
    }

    private static LlmTool runQuery() {
        return new LlmTool("run_widget_query", "쿼리 위젯 실행", Map.of(
                "type", "object",
                "properties", Map.of("defId", Map.of("type", "string")),
                "required", List.of("defId")));
    }

    @Test
    @DisplayName("요청은 Bearer 키·model·max_tokens·system 메시지·function tools 이고 일반 답을 글로 돌려준다")
    void requestShapeAndTextReply() {
        server.expect(requestTo(URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer sk-local"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.model").value("qwen3:14b"))
                .andExpect(jsonPath("$.max_tokens").value(1024))
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].role").value("system"))
                .andExpect(jsonPath("$.messages[0].content").value("너는 도우미다."))
                .andExpect(jsonPath("$.messages[1].role").value("user"))
                .andExpect(jsonPath("$.messages[1].content").value("오늘 생산 실적은?"))
                .andExpect(jsonPath("$.tools[0].type").value("function"))
                .andExpect(jsonPath("$.tools[0].function.name").value("run_widget_query"))
                .andExpect(jsonPath("$.tools[0].function.description").value("쿼리 위젯 실행"))
                .andExpect(jsonPath("$.tools[0].function.parameters.type").value("object"))
                .andRespond(withSuccess("""
                        {"id":"chatcmpl-1","object":"chat.completion",
                         "choices":[{"index":0,"message":{"role":"assistant","content":"실적은 120톤입니다."},"finish_reason":"stop"}]}
                        """, MediaType.APPLICATION_JSON));

        LlmReply reply = new OpenAiCompatibleLlmClient(builder, props("sk-local"))
                .chat("너는 도우미다.", List.of(LlmMessage.user("오늘 생산 실적은?")), List.of(runQuery()));

        server.verify();
        assertThat(reply.text()).isEqualTo("실적은 120톤입니다.");
        assertThat(reply.hasToolCalls()).isFalse();
        assertThat(reply.stopReason()).isEqualTo("stop");
    }

    @Test
    @DisplayName("키가 없으면 Authorization 헤더를 보내지 않고, tools 가 없으면 tools 칸도 없다")
    void noKeyNoAuthorization() {
        server.expect(requestTo(URL))
                .andExpect(headerDoesNotExist("Authorization"))
                .andExpect(jsonPath("$.tools").doesNotExist())
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}",
                        MediaType.APPLICATION_JSON));

        assertThat(new OpenAiCompatibleLlmClient(builder, props("")).chat("", List.of(LlmMessage.user("q")), List.of()).text())
                .isEqualTo("ok");
        server.verify();
    }

    @Test
    @DisplayName("tool_calls 의 arguments(JSON 문자열)를 입력으로 읽고, content 가 null 이면 글은 빈 값")
    void parsesToolCalls() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("""
                        {"choices":[{"message":{"role":"assistant","content":null,
                           "tool_calls":[{"id":"call_1","type":"function",
                                          "function":{"name":"run_widget_query","arguments":"{\\"defId\\":\\"def.k3x9q2ab\\"}"}},
                                         {"id":"call_2","type":"function",
                                          "function":{"name":"find_screen","arguments":"not json"}}]},
                          "finish_reason":"tool_calls"}]}
                        """, MediaType.APPLICATION_JSON));

        LlmReply reply = new OpenAiCompatibleLlmClient(builder, props("k"))
                .chat("s", List.of(LlmMessage.user("q")), List.of(runQuery()));

        assertThat(reply.text()).isEmpty();
        assertThat(reply.stopReason()).isEqualTo("tool_calls");
        assertThat(reply.toolCalls()).hasSize(2);
        assertThat(reply.toolCalls().get(0).id()).isEqualTo("call_1");
        assertThat(reply.toolCalls().get(0).name()).isEqualTo("run_widget_query");
        assertThat(reply.toolCalls().get(0).input()).containsEntry("defId", "def.k3x9q2ab");
        assertThat(reply.toolCalls().get(1).input()).as("잘못된 arguments 는 빈 입력").isEmpty();
    }

    @Test
    @DisplayName("도구 반복 중 assistant tool_calls 메시지를 다시 짜서(출력 전용 칸 없이) 보내고, 결과는 호출마다 role=tool·tool_call_id 메시지로 보낸다")
    void echoesToolCallsAndToolMessages() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("""
                        {"choices":[{"message":{"role":"assistant","content":"","reasoning_content":"생각 중",
                           "tool_calls":[{"id":"call_1","type":"function",
                                          "function":{"name":"run_widget_query","arguments":"{\\"defId\\":\\"def.a\\"}"}}]},
                          "finish_reason":"tool_calls"}]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.messages.length()").value(4))
                .andExpect(jsonPath("$.messages[2].role").value("assistant"))
                .andExpect(jsonPath("$.messages[2].reasoning_content").doesNotExist())
                .andExpect(jsonPath("$.messages[2].tool_calls[0].id").value("call_1"))
                .andExpect(jsonPath("$.messages[2].tool_calls[0].type").value("function"))
                .andExpect(jsonPath("$.messages[2].tool_calls[0].function.name").value("run_widget_query"))
                .andExpect(jsonPath("$.messages[2].tool_calls[0].function.arguments").value("{\"defId\":\"def.a\"}"))
                .andExpect(jsonPath("$.messages[3].role").value("tool"))
                .andExpect(jsonPath("$.messages[3].tool_call_id").value("call_1"))
                .andExpect(jsonPath("$.messages[3].content").value("{\"columns\":[\"QTY\"]}"))
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"끝\"},\"finish_reason\":\"stop\"}]}",
                        MediaType.APPLICATION_JSON));

        OpenAiCompatibleLlmClient client = new OpenAiCompatibleLlmClient(builder, props("k"));
        LlmMessage question = LlmMessage.user("q");
        LlmReply first = client.chat("s", List.of(question), List.of(runQuery()));
        LlmReply second = client.chat("s", List.of(question, LlmMessage.assistantReply(first),
                LlmMessage.toolResults(List.of(new LlmToolResult("call_1", "{\"columns\":[\"QTY\"]}", false)))), List.of(runQuery()));

        server.verify();
        assertThat(second.text()).isEqualTo("끝");
    }

    @Test
    @DisplayName("HTTP 오류·시간 초과·choices 없는 응답은 LlmException 이고 메시지에 키가 없다")
    void errorsBecomeLlmException() {
        server.expect(requestTo(URL)).andRespond(withServerError());
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(requestTo(URL)).andRespond(withException(new SocketTimeoutException("Read timed out")));
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"error\":{\"message\":\"model not found\"}}",
                MediaType.APPLICATION_JSON));
        OpenAiCompatibleLlmClient client = new OpenAiCompatibleLlmClient(builder, props("sk-secret-key"));

        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> client.chat("s", List.of(LlmMessage.user("q")), List.of()))
                    .isInstanceOf(LlmException.class)
                    .hasMessageNotContaining("sk-secret-key");
        }
        server.verify();
    }
}
