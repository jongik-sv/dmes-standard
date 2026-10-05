package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 하위 세트를 부르는 SET 노드 하나(하위 세트 spec §1). {@code setId} 가 비어 있어도 구조 오류가 아니다 — 서버 분석기 CALL_MISSING 과 엔진 준비
 * 단계 SET_NOT_FOUND 가 막는다. 받는 노드가 붙으면 {@link Guarded#step()} 이 된다. m-mdm {@code flow-model.ts} 의 {@code SetStep} 짝.
 */
public record SetStep(String nodeId, @Nullable String setId) implements Step {}
