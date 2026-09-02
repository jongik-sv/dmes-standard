package com.dongkuk.dmes.mcm.security.endpoint;

/**
 * RBAC 권한 식별 키 — (모듈, 서비스, 화면, 액션) 4-튜플.
 *
 * <p>{@code RBAC-PATH-CONVENTION.md} 의 URL 컨벤션 {@code /api/{moduleId}/{serviceId}/{objId}/{action}}
 * 와 1:1 매핑. 모든 필드는 소문자 정규화.
 *
 * <p>예) 공정계획 마스터 데이터 관리 서비스의 공장관리 화면 조회:
 *      {@code PermKey("mpn", "b0000004-0000-4000-8000-000000000002", "plant", "search")}
 *      → {@code /api/mpn/b0000004-0000-4000-8000-000000000002/plant/search}
 *
 * <p>{@code serviceId} 가 빈 문자열이면 legacy 3-segment URL {@code /api/{module}/{objId}/{action}} 매칭.
 *
 * @param moduleId  TB_SEC_OBJ.SYS_CD (mpn / mpp / mqc / mcm 등)
 * @param serviceId 서비스 식별자 — TB_SEC_MENU.MENU_ID (dir 타입). 빈 문자열은 legacy 호환
 * @param objId     TB_SEC_OBJ.OBJ_ID (kebab-case 화면 디렉토리명)
 * @param action    TB_SEC_PERM_BUTTON.ACTION (search / save / delete / ...)
 */
public record PermKey(String moduleId, String serviceId, String objId, String action) {

    public PermKey {
        if (moduleId == null || moduleId.isBlank()) {
            throw new IllegalArgumentException("moduleId 가 비어있습니다");
        }
        if (objId == null || objId.isBlank()) {
            throw new IllegalArgumentException("objId 가 비어있습니다");
        }
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("action 이 비어있습니다");
        }
        moduleId  = moduleId.trim().toLowerCase();
        serviceId = serviceId == null ? "" : serviceId.trim();
        objId     = objId.trim().toLowerCase();
        action    = action.trim().toLowerCase();
    }

    /**
     * URL 에서 PermKey 추출. 두 형식 지원:
     * <ul>
     *   <li>4-segment: {@code /api/{moduleId}/{serviceId}/{objId}/{action}} → 모든 필드 추출</li>
     *   <li>3-segment: {@code /api/{moduleId}/{objId}/{action}} → serviceId 는 ""</li>
     * </ul>
     *
     * @return null 이면 형식 불일치 (3/4 segment 가 아니거나 prefix 가 /api/ 아님)
     */
    public static PermKey parseUrl(String requestUri) {
        if (requestUri == null || requestUri.isBlank()) return null;
        String path = requestUri;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (!path.startsWith("/api/")) return null;
        // strip /api/
        String rest = path.substring(5);
        String[] parts = rest.split("/");
        try {
            if (parts.length == 4) {
                // /api/{moduleId}/{serviceId}/{objId}/{action}
                if (parts[0].isEmpty() || parts[1].isEmpty() || parts[2].isEmpty() || parts[3].isEmpty()) return null;
                return new PermKey(parts[0], parts[1], parts[2], parts[3]);
            }
            if (parts.length == 3) {
                // legacy /api/{moduleId}/{objId}/{action}
                if (parts[0].isEmpty() || parts[1].isEmpty() || parts[2].isEmpty()) return null;
                return new PermKey(parts[0], "", parts[1], parts[2]);
            }
            return null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * BFF→BE forward 경로의 OASIS URL 을 PermKey 로 파싱한다 (Phase 6-4 — BE 백스톱 복구).
     *
     * <p>BFF(be-proxy/oasis-proxy)는 OASIS 호출을 두 형태로 BE 에 전달한다:
     * <ul>
     *   <li>{@code /oasis/{serviceId}/{action}}          — 개발: 모듈 WAS 직접(module 세그먼트 없음)</li>
     *   <li>{@code /{module}/oasis/{serviceId}/{action}} — 운영: Nginx 게이트웨이 prefix</li>
     * </ul>
     * 둘 다 {@code PermKey(module, "oasis", serviceId→objId, action)} 로 환산 →
     * {@link UserPermCache} 가 빌드한 PermKey(serviceId="oasis")와 정합. module 이 경로에 없으면
     * {@code defaultModule}(= {@code cactus.oasis.service-group}, 자기 시스템) 사용.
     *
     * <p>{@link #parseUrl(String)} (FE 컨벤션 {@code /api/...})와 별개. BFF→BE 는 {@code /api/} 가 없어
     * parseUrl 로는 매칭 불가했고(EndpointPermissionFilter 가 OASIS 를 통과시킴), 본 메서드가 그 갭을 메운다.
     *
     * @return null 이면 OASIS 형태 아님 (RBAC 대상 ✗ — actuator/auth/caravan-console 등)
     */
    public static PermKey parseBackendOasisUrl(String requestUri, String defaultModule) {
        if (requestUri == null || requestUri.isBlank()) return null;
        String path = requestUri;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (path.startsWith("/")) path = path.substring(1);
        String[] parts = path.split("/");
        try {
            // /oasis/{serviceId}/{action}
            if (parts.length == 3 && "oasis".equals(parts[0])) {
                if (defaultModule == null || defaultModule.isBlank()) return null;
                if (parts[1].isEmpty() || parts[2].isEmpty()) return null;
                return new PermKey(defaultModule, "oasis", parts[1], parts[2]);
            }
            // /{module}/oasis/{serviceId}/{action}
            if (parts.length == 4 && "oasis".equals(parts[1])) {
                if (parts[0].isEmpty() || parts[2].isEmpty() || parts[3].isEmpty()) return null;
                return new PermKey(parts[0], "oasis", parts[2], parts[3]);
            }
            return null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** PermKey → 대응 URL 형식으로 직렬화. serviceId 가 비어있으면 3-segment. */
    public String toUrl() {
        if (serviceId == null || serviceId.isEmpty()) {
            return "/api/" + moduleId + "/" + objId + "/" + action;
        }
        return "/api/" + moduleId + "/" + serviceId + "/" + objId + "/" + action;
    }
}
