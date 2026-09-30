package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 갈래 하나 — 나가는 선과 그 갈래의 본문. */
public record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body) {}
