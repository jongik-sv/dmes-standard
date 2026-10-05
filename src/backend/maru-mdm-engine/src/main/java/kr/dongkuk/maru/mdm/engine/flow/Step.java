package kr.dongkuk.maru.mdm.engine.flow;

/** 한 칸짜리 단계 — RULE·TASK·SET(하위 세트 호출, 하위 세트 spec §1). 받는 노드가 붙으면 {@link Guarded#step()} 이 된다(implicit-join spec §4, J-D11). */
public sealed interface Step extends Block permits RuleStep, TaskStep, SetStep {

    /** 노드 ID. */
    String nodeId();
}
