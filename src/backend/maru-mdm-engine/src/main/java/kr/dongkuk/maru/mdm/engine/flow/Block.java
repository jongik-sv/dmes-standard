package kr.dongkuk.maru.mdm.engine.flow;

/** 블록 트리 한 칸 — 순차·룰·분기. */
public sealed interface Block permits Seq, RuleStep, Split {}
