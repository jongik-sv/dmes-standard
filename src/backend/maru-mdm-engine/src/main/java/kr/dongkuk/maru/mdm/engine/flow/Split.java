package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 분기 하나와 짝 합류. {@code kind} 는 IF 또는 PARALLEL. {@code branches} 는 실행 순서다 — IF 는 order 오름차순 뒤 그 외,
 * PARALLEL 은 order 오름차순(plan C3).
 */
public record Split(String nodeId, NodeKind kind, String mergeId, List<Branch> branches) implements Block {}
