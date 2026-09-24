package com.dongkuk.dmes.mdm.contract.layout;

import java.util.Map;

/**
 * 레이아웃 스냅샷 기준으로 고정 길이 바이트 전문을 업무 데이터로 파싱한다(TSK-05-01 design.md §6.1).
 * 구현은 이 Task 밖(TSK-05-03)이다 — 이 인터페이스는 추상 메서드만 선언한다.
 */
public interface MdmLayoutParser {

    Map<String, Object> parse(MdmLayoutSnapshot snapshot, byte[] message);
}
