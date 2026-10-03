package com.dongkuk.dmes.cactus.mdm;

/** 목차 응답의 {@code current}(D-154, 결정 P11) — {@code at} 시각에 MDM 이 고른 버전과 그 본문. 고른 버전은 cactus 가 목차로 다시 확인한다. */
public record MdmCurrent(String ver, Object body) {
}
