package com.dongkuk.dmes.mcm.common.event;

import java.util.Set;

/**
 * 역할 변경 이벤트 — 02 §5-4 권고. mcm-core 자체 클래스 (cactus 무관).
 *
 * <p>발행처:
 * <ul>
 *   <li>{@code SecRolePermService.saveRolePerms} — 역할의 권한 매핑 변경</li>
 *   <li>{@code SecUserRoleService.saveUserRoles} — 사용자-역할 매핑 변경 (간접 영향 → 영향받은 roleIds)</li>
 *   <li>{@code SecRoleGroupService.assignRoles / assignUsers} — 그룹 ↔ 역할/사용자 매핑 변경</li>
 * </ul>
 *
 * <p>구독처(사이트): {@code RoleChangedEventListener} 가 BFF 의 invalidateRole 엔드포인트 호출.
 * 멀티 인스턴스 운영 시 사이트가 별도 Broadcaster (Redis Pub/Sub 등) 로 확장.
 */
public class RoleChangedEvent {

    private final Set<String> roleIds;

    public RoleChangedEvent(Set<String> roleIds) {
        this.roleIds = roleIds;
    }

    public Set<String> getRoleIds() {
        return roleIds;
    }
}
