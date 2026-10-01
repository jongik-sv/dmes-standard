package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 갈래 하나 — 나가는 선과 그 갈래의 본문. {@code ends} 는 끝내는 IF 갈래(다른 갈래와 노드를 함께 지나지 않고 END 로 가서 세트를 끝낸다,
 * implicit-join spec §2.2)면 true 이고 본문은 END 앞까지다. 이어지는 갈래·병렬 갈래·옛 형식 IF 갈래는 false.
 */
public record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body, boolean ends) {}
