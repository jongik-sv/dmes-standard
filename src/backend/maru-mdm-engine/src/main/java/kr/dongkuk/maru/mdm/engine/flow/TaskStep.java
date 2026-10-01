package kr.dongkuk.maru.mdm.engine.flow;

/** 빈 단계(TASK) 노드 하나 — 읽거나 만드는 것 없이 지나간다(4단계 spec §1.1). m-mdm {@code flow-model.ts} 의 {@code TaskStep} 짝. */
public record TaskStep(String nodeId) implements Step {}
