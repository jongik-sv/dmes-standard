package com.dongkuk.dmes.mcm.widget.chat.llm;

import com.dongkuk.dmes.mcm.widget.chat.WidgetLlmProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * OpenAI 호환 Chat Completions 공급자(스펙 §9.1, {@code provider=openai}) — 사내 Ollama·vLLM 등.
 * <ul>
 *   <li>{@code POST {base-url}/chat/completions}, 키가 있을 때만 {@code Authorization: Bearer}.</li>
 *   <li>본문 {@code model·max_tokens·messages(system 먼저)·tools([{type:function, function:{name,description,parameters}}])}.</li>
 *   <li>도구 호출은 {@code choices[0].message.tool_calls}(arguments 는 JSON 문자열), 결과는 호출마다 {@code role=tool·tool_call_id} 메시지.</li>
 * </ul>
 * 오류·시간 초과는 {@link LlmException}(HTTP 상태만). 키·프롬프트는 예외·로그에 넣지 않는다.
 */
public class OpenAiCompatibleLlmClient implements LlmClient {

    private static final String PROVIDER = "openai";

    private final RestClient http;
    private final String model;
    private final int maxTokens;
    private final String apiKey;

    /**
     * @param builder 요청 팩토리(시간 제한)가 이미 걸린 빌더 — 이 생성자는 팩토리를 건드리지 않는다.
     * @param props   base-url·model 필수(없으면 {@code WidgetChatConfig} 가 가짜로 대신한다)
     */
    public OpenAiCompatibleLlmClient(RestClient.Builder builder, WidgetLlmProperties props) {
        this.http = builder.baseUrl(LlmJson.trimSlash(props.getBaseUrl() == null ? "" : props.getBaseUrl())).build();
        this.model = props.getModel() == null ? "" : props.getModel().trim();
        this.maxTokens = props.getMaxTokens() > 0 ? props.getMaxTokens() : 1024;
        this.apiKey = props.getApiKey() == null ? "" : props.getApiKey().trim();
    }

    @Override
    public LlmReply chat(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {
        String body = LlmJson.write(requestBody(systemPrompt, messages, tools));
        String response;
        try {
            RestClient.RequestBodySpec spec = http.post().uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON);
            if (!apiKey.isEmpty()) spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
            response = spec.body(body).retrieve().body(String.class);
        } catch (RestClientResponseException e) {
            throw new LlmException(PROVIDER + " HTTP " + e.getStatusCode().value());
        } catch (RestClientException e) {
            throw new LlmException(PROVIDER + " 호출 실패(" + e.getClass().getSimpleName() + ")");
        }
        return parse(response);
    }

    private ObjectNode requestBody(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {
        ObjectNode body = LlmJson.MAPPER.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        ArrayNode out = body.putArray("messages");
        if (!LlmJson.blank(systemPrompt)) out.addObject().put("role", "system").put("content", systemPrompt);
        for (LlmMessage m : messages) {
            switch (m.role()) {
                case LlmMessage.ASSISTANT -> out.add(assistantMessage(m));
                case LlmMessage.TOOL -> {
                    for (LlmToolResult r : m.toolResults()) {
                        out.addObject().put("role", "tool").put("tool_call_id", r.toolCallId()).put("content", r.content());
                    }
                }
                default -> out.addObject().put("role", "user").put("content", m.text());
            }
        }
        if (tools != null && !tools.isEmpty()) {
            ArrayNode arr = body.putArray("tools");
            for (LlmTool t : tools) {
                ObjectNode fn = arr.addObject().put("type", "function").putObject("function");
                fn.put("name", t.name());
                fn.put("description", t.description());
                fn.set("parameters", LlmJson.MAPPER.valueToTree(t.inputSchema()));
            }
        }
        return body;
    }

    private static ObjectNode assistantMessage(LlmMessage m) {
        if (m.rawAssistant() instanceof ObjectNode raw) return raw.deepCopy();
        ObjectNode msg = LlmJson.MAPPER.createObjectNode();
        msg.put("role", "assistant");
        if (m.toolCalls().isEmpty()) {
            msg.put("content", m.text());
            return msg;
        }
        if (m.text().isEmpty()) msg.putNull("content");
        else msg.put("content", m.text());
        ArrayNode calls = msg.putArray("tool_calls");
        for (LlmToolCall c : m.toolCalls()) {
            ObjectNode call = calls.addObject();
            call.put("id", c.id());
            call.put("type", "function");
            ObjectNode fn = call.putObject("function");
            fn.put("name", c.name());
            fn.put("arguments", LlmJson.write(c.input()));
        }
        return msg;
    }

    private static LlmReply parse(String response) {
        JsonNode root = LlmJson.read(response, PROVIDER);
        JsonNode choice = root.path("choices").path(0);
        JsonNode message = choice.path("message");
        if (!message.isObject()) {
            throw new LlmException(PROVIDER + " 응답에 choices[0].message 가 없습니다" + (root.has("error") ? "(오류 응답)" : ""));
        }
        String text = message.hasNonNull("content") ? message.get("content").asText("") : "";
        List<LlmToolCall> calls = new ArrayList<>();
        boolean generatedId = false;
        JsonNode toolCalls = message.path("tool_calls");
        if (toolCalls.isArray()) {
            int i = 0;
            for (JsonNode tc : toolCalls) {
                i++;
                JsonNode fn = tc.path("function");
                String id = tc.path("id").asText("");
                if (id.isBlank()) {
                    // 일부 호환 서버는 id 를 주지 않는다 — 만들어 쓰고, 되돌려 줄 때는 원본 대신 다시 짠 메시지를 쓴다.
                    id = "call_" + i;
                    generatedId = true;
                }
                JsonNode args = fn.path("arguments");
                calls.add(new LlmToolCall(id, fn.path("name").asText(),
                        args.isObject() ? LlmJson.toMap(args) : LlmJson.parseObject(args.asText(""))));
            }
        }
        String stop = choice.hasNonNull("finish_reason") ? choice.get("finish_reason").asText() : null;
        return new LlmReply(text, calls, stop, generatedId ? null : message);
    }
}
