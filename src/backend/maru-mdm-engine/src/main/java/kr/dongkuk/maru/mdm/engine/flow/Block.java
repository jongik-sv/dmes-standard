package kr.dongkuk.maru.mdm.engine.flow;

/** 블록 트리 한 칸 — 순차·단계(룰·빈 단계)·분기·받는 노드 블록(implicit-join spec §4). */
public sealed interface Block permits Seq, Step, Split, Guarded {}
