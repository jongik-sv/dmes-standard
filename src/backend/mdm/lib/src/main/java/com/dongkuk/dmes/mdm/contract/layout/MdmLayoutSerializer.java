package com.dongkuk.dmes.mdm.contract.layout;

import java.util.Map;

/**
 * 레이아웃 스냅샷 기준으로 업무 데이터를 고정 길이 바이트 전문으로 직렬화한다(TSK-05-01 design.md §6.1).
 * 구현은 이 Task 밖(TSK-05-03)이다 — 이 인터페이스는 추상 메서드만 선언한다(불변 규칙 16,
 * {@code MdmContractArchitectureTest} 가 default·static 메서드 금지를 고정한다). 시각 T 는 {@link MdmLayoutSnapshotResolver} 가
 * 받는다 — 이 직렬화기는 받은 스냅샷만 본다.
 */
public interface MdmLayoutSerializer {

    byte[] serialize(MdmLayoutSnapshot snapshot, Map<String, Object> record, MdmLayoutSerializeContext context);
}
