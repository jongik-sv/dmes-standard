package com.dongkuk.dmes.mdm.dmb.layout;

/**
 * 레이아웃·헤더 버전 조작 결과(코어, BE 리팩토링 2회차 C5) — 화면이 응답 DTO 로 옮긴다. 해당 없는 칸은 null.
 *
 * @param ver        버전 문자열({@code "1.001"}, {@code VersionNumbers.plain})
 * @param verKind    새 버전(copy)일 때만: MAJOR 또는 MINOR
 * @param rowVersion copy 는 0, lock·unlock·handover 는 새 값, delete 는 null
 */
public record LayoutVersionOutcome(Long layoutId, String ver, String verKind, Long rowVersion) {
}
