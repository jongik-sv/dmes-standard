package com.dongkuk.dmes.mcm.domain.security.controller;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * BFF 권한 캐시(방식 C) lazy load 용 — 현재 인증 사용자의 권한키 목록 반환.
 *
 * <p>BFF(`proxy.ts`)가 세션 중 사용자별 권한 캐시를 처음 채울 때 호출한다
 * (X-Client-Key + X-Authenticated-User 신뢰 채널). IDOR 안전: 입력 없이 SecurityContext 의
 * {@code currentUserId} 로만 산출. SYSADMIN 은 {@code ["*"]} ({@link UserPermCache#toKeyStrings}).
 *
 * <p>경로 {@code /api/sec/perm-keys} = 2-segment → {@code EndpointPermissionFilter} RBAC 대상 ✗ (인증만).
 * {@code ClientKeyFilter} skip 경로(/api/auth/)가 아니므로 X-Authenticated-User 로 사전 인증이 set 된다.
 *
 * <p>응답: {@code { "data": { "permKeys": ["module/objId/action", ...] } }} (BFF 가 data.permKeys 파싱).
 */
@RestController
@RequestMapping("/api/sec")
public class SecPermKeysController {

    private final UserPermCache userPermCache;
    private final SecurityIdentity securityIdentity;

    public SecPermKeysController(UserPermCache userPermCache, SecurityIdentity securityIdentity) {
        this.userPermCache = userPermCache;
        this.securityIdentity = securityIdentity;
    }

    @GetMapping("/perm-keys")
    public ApiResponse<?> permKeys() {
        String userId = securityIdentity.currentUserId();
        List<String> keys = userPermCache.toKeyStrings(userId);
        return ApiResponse.ok(Map.of("permKeys", keys));
    }
}
