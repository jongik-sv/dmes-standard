package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 받는 노드가 붙은 단계(받는 노드 spec §3, implicit-join spec §2.3). 단계가 성공하면 {@code normal} 을, 실패하거나 결과가 없는데 그 종류를
 * 받는 노드가 있으면 그 처리 갈래를 실행한다. 처리 갈래는 {@code joinId}(돌아오는 자리 J)로 돌아오거나({@code ends=false}) END 로 가서
 * 세트를 끝낸다({@code ends=true}). 돌아오는 처리 갈래가 없으면 {@code normal} 은 비고 {@code joinId} 는 null 이며 노드의 나가는 선은
 * 바깥 순차가 그대로 잇는다. {@code mergeId} 는 옛 형식 돌아오는 MERGE(splitId = 이 노드)일 때만 {@code joinId} 와 같다.
 * {@code step} 이 TASK 면 처리 갈래는 실행되지 않는다(J-D4). m-mdm {@code flow-model.ts} 의 {@code Guarded} 짝.
 */
public record Guarded(Step step, Seq normal, List<Handler> handlers, @Nullable String mergeId, @Nullable String joinId) implements Block {

    /** 처리 갈래 하나 — 받는 노드 ID·받는 종류(저장 순서)·본문·END 로 끝내는가. */
    public record Handler(String catchNodeId, List<CatchKind> kinds, Seq body, boolean ends) {}

    /** 받는 노드가 붙은 노드 ID. */
    public String nodeId() {
        return step.nodeId();
    }

    /** kind 를 받는 처리 갈래. 없으면 null(한 노드에서 한 종류는 한 받는 노드만 받는다 — FLOW_CATCH). */
    public @Nullable Handler handlerFor(CatchKind kind) {
        for (Handler h : handlers) {
            if (h.kinds().contains(kind)) {
                return h;
            }
        }
        return null;
    }
}
