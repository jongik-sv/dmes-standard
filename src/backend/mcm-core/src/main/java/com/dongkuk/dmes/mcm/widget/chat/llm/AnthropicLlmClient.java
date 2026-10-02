package com.dongkuk.dmes.mcm.widget.chat.llm;

import com.dongkuk.dmes.mcm.widget.chat.WidgetLlmProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Claude Messages API 공급자(스펙 §9.1, {@code provider=anthropic}). SDK 없이 {@link RestClient} 로 HTTP 를 직접 부른다.
 * <ul>
 *   <li>{@code POST {base-url}/v1/messages}, 헤더 {@code x-api-key}·{@code anthropic-version: 2023-06-01}.</li>
 *   <li>본문 {@code model·max_tokens·system·messages·tools(name·description·input_schema)}. temperature·tool_choice 는 보내지 않는다
 *       (최신 모델은 둘 다 400 — 기본 자동 도구 선택을 쓴다).</li>
 *   <li>도구 반복 중 assistant 차례는 받은 {@code content} 배열을 그대로 되돌려 준다(thinking 블록을 지우면 다음 요청이 거절된다).
 *       도구 결과는 한 user 메시지 안의 {@code tool_result} 블록들로 보낸다.</li>
 * </ul>
 * 오류·시간 초과는 {@link LlmException}(HTTP 상태·오류 종류만). 키·프롬프트는 예외·로그에 넣지 않는다.
 */
public class AnthropicLlmClient implements LlmClient {

    public static final String DEFAULT_BASE_URL = "https://api.anthropic.com";
    public static final String DEFAULT_MODEL = "claude-sonnet-5-5";
    public static final String API_VERSION = "2023-06-01";

    private static final String PROVIDER = "anthropic";

    private final RestClient http;
    private final String model;
    private final int maxTokens;
    private final String apiKey;

    /**
     * @param builder 요청 팩토리(시간 제한)가 이미 걸린 빌더 — 이 생성자는 팩토리를 건드리지 않는다
     *                (시험이 {@code MockRestServiceServer.bindTo(builder)} 로 묶은 가짜를 지키려고)
     */
    public AnthropicLlmClient(RestClient.Builder builder, WidgetLlmProperties props) {
        String base = LlmJson.blank(props.getBaseUrl()) ? DEFAULT_BASE_URL : LlmJson.trimSlash(props.getBaseUrl());
        this.http = builder.baseUrl(base).build();
        this.model = LlmJson.blank(props.getModel()) ? DEFAULT_MODEL : props.getModel().trim();
        this.maxTokens = props.getMaxTokens() > 0 ? props.getMaxTokens() : 1024;
        this.apiKey = props.getApiKey() == null ? "" : props.getApiKey().trim();
    }

    @Override
    public LlmReply chat(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {
        String body = LlmJson.write(requestBody(systemPrompt, messages, tools));
        String response;
        try {
            RestClient.RequestBodySpec spec = http.post().uri("/v1/messages")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("anthropic-version", API_VERSION);
            if (!apiKey.isEmpty()) spec = spec.header("x-api-key", apiKey);
            response = spec.body(body).retrieve().body(String.class);
        } catch (RestClientResponseException e) {
            throw new LlmException(PROVIDER + " HTTP " + e.getStatusCode().value() + errorType(e.getResponseBodyAsString()));
        } catch (RestClientException e) {
            throw new LlmException(PROVIDER + " 호출 실패(" + e.getClass().getSimpleName() + ")");
        }
        return parse(response);
    }

    private ObjectNode requestBody(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {
        ObjectNode body = LlmJson.MAPPER.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        if (!LlmJson.blank(systemPrompt)) body.put("system", systemPrompt);
        ArrayNode out = body.putArray("messages");
        boolean started = false;
        for (LlmMessage m : messages) {
            // Messages API 는 user 로 시작해야 한다 — 최근 N개로 자른 기록이 assistant 로 시작하면 첫 user 앞까지 버린다.
            if (!started && !LlmMessage.USER.equals(m.role())) continue;
            started = true;
            out.add(toMessage(m));
        }
        if (tools != null && !tools.isEmpty()) {
            ArrayNode arr = body.putArray("tools");
            for (LlmTool t : tools) {
                ObjectNode tool = arr.addObject();
                tool.put("name", t.name());
                tool.put("description", t.description());
                tool.set("input_schema", LlmJson.MAPPER.valueToTree(t.inputSchema()));
            }
        }
        return body;
    }

    private static ObjectNode toMessage(LlmMessage m) {
        ObjectNode msg = LlmJson.MAPPER.createObjectNode();
        switch (m.role()) {
            case LlmMessage.ASSISTANT -> {
                msg.put("role", "assistant");
                if (m.rawAssistant() instanceof JsonNode raw && raw.isArray()) {
                    msg.set("content", raw);
                } else if (!m.toolCalls().isEmpty()) {
                    ArrayNode content = msg.putArray("content");
                    if (!m.text().isEmpty()) content.addObject().put("type", "text").put("text", m.text());
                    for (LlmToolCall c : m.toolCalls()) {
                        ObjectNode use = content.addObject();
                        use.put("type", "tool_use");
                        use.put("id", c.id());
                        use.put("name", c.name());
                        use.set("input", LlmJson.MAPPER.valueToTree(c.input()));
                    }
                } else {
                    msg.put("content", m.text());
                }
            }
            case LlmMessage.TOOL -> {
                msg.put("role", "user");
                ArrayNode content = msg.putArray("content");
                for (LlmToolResult r : m.toolResults()) {
                    ObjectNode block = content.addObject();
                    block.put("type", "tool_result");
                    block.put("tool_use_id", r.toolCallId());
                    block.put("content", r.content());
                    if (r.error()) block.put("is_error", true);
                }
            }
            default -> {
                msg.put("role", "user");
                msg.put("content", m.text());
            }
        }
        return msg;
    }

    private static LlmReply parse(String response) {
        JsonNode root = LlmJson.read(response, PROVIDER);
        if ("error".equals(root.path("type").asText())) {
            throw new LlmException(PROVIDER + " 오류 응답(" + root.path("error").path("type").asText("unknown") + ")");
        }
        JsonNode content = root.path("content");
        if (!content.isArray()) throw new LlmException(PROVIDER + " 응답에 content 가 없습니다");
        StringBuilder text = new StringBuilder();
        List<LlmToolCall> calls = new ArrayList<>();
        for (JsonNode block : content) {
            String type = block.path("type").asText();
            if ("text".equals(type)) {
                text.append(block.path("text").asText(""));
            } else if ("tool_use".equals(type)) {
                calls.add(new LlmToolCall(block.path("id").asText(), block.path("name").asText(),
                        LlmJson.toMap(block.path("input"))));
            }
            // thinking·redacted_thinking 등은 글에 넣지 않고 content 원본으로만 보존한다.
        }
        String stop = root.hasNonNull("stop_reason") ? root.get("stop_reason").asText() : null;
        return new LlmReply(text.toString(), calls, stop, content);
    }

    /** 오류 본문에서 error.type 만 꺼낸다(메시지·본문 전체는 싣지 않는다). */
    private static String errorType(String body) {
        try {
            String type = LlmJson.MAPPER.readTree(body == null ? "" : body).path("error").path("type").asText("");
            return type.isEmpty() ? "" : " " + type;
        } catch (Exception e) {
            return "";
        }
    }
}
