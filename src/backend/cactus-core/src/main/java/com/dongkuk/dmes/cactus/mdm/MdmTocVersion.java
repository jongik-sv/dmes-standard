package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 목차의 버전 한 줄(D-154, 스펙 §3.1) — status 는 늘 RELEASED(결정 P2 가 칸을 두게 했다). applyTo null 은 열린 끝. */
public record MdmTocVersion(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo) {
}
