package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * 가짜 LLM(스펙 §9.1) — {@code dmes.widget.llm.provider} 가 비어 있으면 운영 빈으로 쓰여 늘 「AI 연결이 설정되지 않았습니다.
 * 관리자에게 문의하세요.」를 돌려준다(밤사이 개발·시험이 키 없이 돈다, W-D27).
 * 시험은 {@link #scripted()} 로 답·예외 각본을 넣고 받은 입력({@link #calls()})을 확인한다. 기본 가짜는 호출을 기억하지 않는다(메모리).
 */
public class FakeLlmClient implements LlmClient {

    public static final String NOT_CONFIGURED = "AI 연결이 설정되지 않았습니다. 관리자에게 문의하세요.";

    /** 받은 입력 한 번. */
    public record Call(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {}

    private final boolean recording;
    private final Deque<Object> script = new ArrayDeque<>();
    private final List<Call> calls = new ArrayList<>();

    public FakeLlmClient() {
        this(false);
    }

    private FakeLlmClient(boolean recording) {
        this.recording = recording;
    }

    /** 각본·기록을 쓰는 시험용 가짜. */
    public static FakeLlmClient scripted() {
        return new FakeLlmClient(true);
    }

    /** 다음 호출에 돌려줄 답을 넣는다. */
    public synchronized FakeLlmClient then(LlmReply reply) {
        script.addLast(reply);
        return this;
    }

    /** 다음 호출에 던질 예외를 넣는다(공급자 오류 흉내). */
    public synchronized FakeLlmClient thenThrow(RuntimeException error) {
        script.addLast(error);
        return this;
    }

    public synchronized List<Call> calls() {
        return List.copyOf(calls);
    }

    @Override
    public synchronized LlmReply chat(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools) {
        if (recording) {
            calls.add(new Call(systemPrompt, List.copyOf(messages), tools == null ? List.of() : List.copyOf(tools)));
        }
        Object next = script.pollFirst();
        if (next instanceof RuntimeException error) throw error;
        if (next instanceof LlmReply reply) return reply;
        return LlmReply.ofText(NOT_CONFIGURED);
    }
}
