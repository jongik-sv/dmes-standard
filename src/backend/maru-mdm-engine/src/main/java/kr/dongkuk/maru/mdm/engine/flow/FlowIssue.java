package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 구조 오류 하나. {@code code} 는 {@link FlowParser#STRUCTURE} 또는 {@link FlowParser#IF_ELSE}. 문구는 plan C3 표. */
public record FlowIssue(String code, @Nullable String nodeId, @Nullable String edgeId, String message) {}
