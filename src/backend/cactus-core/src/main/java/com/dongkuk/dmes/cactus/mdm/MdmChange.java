package com.dongkuk.dmes.cactus.mdm;

/** 변경 기록 한 줄. {@code type}·{@code kind} 는 MDM 이 준 글자 그대로다(모르는 종류는 폴러가 건너뛴다). */
public record MdmChange(long seq, String type, String key, String kind) {
}
