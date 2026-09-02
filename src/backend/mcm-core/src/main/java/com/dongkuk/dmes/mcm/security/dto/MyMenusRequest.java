package com.dongkuk.dmes.mcm.security.dto;

/**
 * 내 메뉴 / 내 권한 / 비번 리셋 공용 요청 DTO.
 *
 * <p>⚠️ {@code userId} 필드는 IDOR 차단을 위해 mcm-core 측에서 무시되고
 * {@code SecurityIdentity.requireUserId()} 로 강제 치환된다 (Phase 2-3 갭 #IDOR).
 * 호출자가 어떤 값을 보내든 인증된 본인의 ID 가 적용됨.
 *
 * <p>본 DTO 자체는 BPMN 호환을 위해 유지하되, userId 필드만 deprecated.
 */
public class MyMenusRequest {

    /**
     * @deprecated mcm-core 가 SecurityContext 의 userId 로 강제 치환. 본 필드는 사용되지 않음.
     */
    @Deprecated
    private String userId;

    public MyMenusRequest() {}

    /** @deprecated mcm-core 측에서 무시됨. */
    @Deprecated
    public String getUserId() { return userId; }

    /** @deprecated mcm-core 측에서 무시됨. */
    @Deprecated
    public void setUserId(String userId) { this.userId = userId; }
}
