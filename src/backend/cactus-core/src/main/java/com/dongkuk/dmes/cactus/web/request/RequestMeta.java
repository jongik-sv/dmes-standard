package com.dongkuk.dmes.cactus.web.request;

/**
 * 요청 메타 정보.
 *
 * @param userId 요청 사용자 ID (감사 로그/화면 표시용, 인증은 JWT 기준)
 * @param menuId 메뉴/화면 ID (권한 체크에 활용)
 */
public record RequestMeta(
        String userId,
        String menuId
) {
}
