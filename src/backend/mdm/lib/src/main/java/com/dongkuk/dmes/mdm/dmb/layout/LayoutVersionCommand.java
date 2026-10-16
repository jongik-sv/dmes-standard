package com.dongkuk.dmes.mdm.dmb.layout;

/**
 * 레이아웃·헤더 버전 조작 입력(코어, BE 리팩토링 2회차 C5) — {@link LayoutVersionService} 의 copy·delete(target)·lock·unlock·handover 가
 * 받는다. 화면(layoutMng·headerMng)의 요청 DTO 가 이 모양으로 바꿔 넘긴다 — 코어가 화면 DTO 를 알지 않게 한다.
 *
 * @param ver    소수 셋째 자리 버전 문자열({@code "1.001"}). copy 는 쓰지 않는다
 * @param target delete 만 쓴다 — {@link #TARGET_VERSION}(비면 기본, DRAFT 삭제)·{@link #TARGET_CONFIRM}(확정 취소)
 */
public record LayoutVersionCommand(Long layoutId, String ver, String verKind, Long rowVersion, String newOwnerId, String target) {

    public static final String TARGET_VERSION = "VERSION";
    public static final String TARGET_CONFIRM = "CONFIRM";
}
