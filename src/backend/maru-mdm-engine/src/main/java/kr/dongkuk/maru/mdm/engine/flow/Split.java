package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 분기 하나. {@code kind} 는 IF 또는 PARALLEL. {@code branches} 는 실행 순서다 — IF 는 order 오름차순 뒤 그 외, PARALLEL 은 order 오름차순.
 * {@code mergeId} 는 PARALLEL 과 옛 형식 IF 의 짝 MERGE(새 형식 IF 는 null), {@code joinId} 는 이어지는 갈래가 모이는 노드다
 * (MERGE 가 있으면 MERGE, implicit-join spec §2.2 4 의 예외에서만 END).
 */
public record Split(String nodeId, NodeKind kind, @Nullable String mergeId, String joinId, List<Branch> branches) implements Block {}
