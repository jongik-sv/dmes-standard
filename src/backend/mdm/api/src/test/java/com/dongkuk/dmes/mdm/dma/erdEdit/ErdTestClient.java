package com.dongkuk.dmes.mdm.dma.erdEdit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

/** 단계 2 서버 시험 공용 — OASIS 호출과 SSE 구독(ErdStreamTest·ErdEditOasisHttpTest 방식). 기본 역할은 MDM_STEWARD 다. */
final class ErdTestClient {

    /** 스트림이 끝나면(서버가 닫음) 큐에 넣는 표시 이벤트 이름. 본문은 {}. */
    static final String END = "__end__";
    final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private final int port;
    private final String key;

    ErdTestClient(int port, String key) {
        this.port = port;
        String env = System.getenv("BACKEND_CLIENT_KEY");
        this.key = env != null && !env.isBlank() ? env : key;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        return call(action, user, "MDM_STEWARD", params);
    }

    JsonNode call(String action, String user, String role, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", key)
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    /** SSE 를 연다. 받은 이벤트를 "이름|data" 로 큐에 넣는다. sinceRev 가 음수면 새 구독(hello 부터)이다. */
    BlockingQueue<String> open(String modelId, String session, long sinceRev, String user) {
        BlockingQueue<String> q = new LinkedBlockingQueue<>();
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/" + modelId
                        + "?session=" + session + "&sinceRev=" + sinceRev))
                .header("X-Client-Key", key).header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", "MDM_STEWARD").header("Accept", "text/event-stream").GET().build();
        http.sendAsync(req, HttpResponse.BodyHandlers.ofInputStream()).thenAccept(res -> {
            try (var br = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
                String line;
                String event = "message";
                while ((line = br.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        event = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        q.add(event + "|" + line.substring(5).trim());
                        event = "message";
                    }
                }
            } catch (Exception ignored) {
                // 시험이 끝나면 연결이 닫힌다
            }
            q.add(END + "|{}");
        });
        return q;
    }

    /** 이름이 event 이고 본문이 match 를 만족하는 첫 이벤트의 본문. 10초 안에 없으면 실패한다. */
    JsonNode next(BlockingQueue<String> q, String event, Predicate<JsonNode> match) throws Exception {
        long end = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s == null || !s.startsWith(event + "|")) continue;
            JsonNode body = om.readTree(s.substring(event.length() + 1));
            if (match.test(body)) return body;
        }
        throw new AssertionError(event + " 이벤트(조건에 맞는 것)가 10초 안에 오지 않았습니다");
    }

    /** 처음으로 event 가 올 때까지 받은 이벤트 전부(그 이벤트 포함). */
    List<String> until(BlockingQueue<String> q, String event) throws Exception {
        List<String> seen = new ArrayList<>();
        long end = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s == null) continue;
            seen.add(s);
            if (s.startsWith(event + "|")) return seen;
        }
        throw new AssertionError(event + " 이벤트가 10초 안에 오지 않았습니다: " + seen);
    }

    /** ms 동안 event 가 오지 않아야 한다. */
    void assertNone(BlockingQueue<String> q, String event, long ms) throws Exception {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(100, TimeUnit.MILLISECONDS);
            if (s != null && s.startsWith(event + "|")) throw new AssertionError("오지 않아야 할 " + event + ": " + s);
        }
    }

    List<JsonNode> cmd(String json) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    /** presence 목록에서 그 세션의 항목. 없으면 null. */
    static JsonNode entry(JsonNode list, String session) {
        for (JsonNode p : list) if (p.path("session").asText().equals(session)) return p;
        return null;
    }

    /** HTTP 응답의 null 칸. OASIS 응답 직렬화가 null 칸을 빼더라도 같은 뜻으로 본다. */
    static boolean nullish(JsonNode n) {
        return n == null || n.isNull() || n.isMissingNode();
    }

    static void await(BooleanSupplier cond, String what) throws InterruptedException {
        long end = System.currentTimeMillis() + 5_000;
        while (!cond.getAsBoolean()) {
            if (System.currentTimeMillis() > end) throw new AssertionError(what);
            Thread.sleep(50);
        }
    }
}
