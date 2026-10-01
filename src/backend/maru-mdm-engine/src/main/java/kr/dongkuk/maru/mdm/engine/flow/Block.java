package kr.dongkuk.maru.mdm.engine.flow;

/** 블록 트리 한 칸 — 순차·룰·빈 단계·분기·받는 룰(받는 노드 spec §3). */
public sealed interface Block permits Seq, RuleStep, TaskStep, Split, Guarded {}
