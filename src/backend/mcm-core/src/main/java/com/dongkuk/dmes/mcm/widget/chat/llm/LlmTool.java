package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.Map;

/**
 * 모델에게 줄 도구 정의(스펙 §9.2).
 *
 * @param name        도구 이름(find_screen·run_widget_query)
 * @param description 모델이 도구를 고를 때 읽는 설명
 * @param inputSchema 입력 JSON Schema(object)
 */
public record LlmTool(String name, String description, Map<String, Object> inputSchema) {}
