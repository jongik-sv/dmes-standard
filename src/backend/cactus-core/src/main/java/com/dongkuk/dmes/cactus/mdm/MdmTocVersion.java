package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 목차의 버전 한 줄(D-154, 스펙 §3.1) — status 는 늘 RELEASED(결정 P2 가 칸을 두게 했다 — 룰·세트·전문 선택은 status 를 보지 않고 이 계약에 기댄다).
 * applyTo null 은 열린 끝. 코드는 {@link MdmToc#codeRows()} 가 엔진에 넘길 때 null 일시를 엔진 모양으로 바꾼다.
 */
public record MdmTocVersion(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo) {
}
