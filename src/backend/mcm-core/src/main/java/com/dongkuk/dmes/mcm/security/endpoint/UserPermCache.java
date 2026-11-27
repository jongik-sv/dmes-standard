package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 사용자별 {@link PermKey} 집합을 캐시한다 — RBAC-PATH-CONVENTION 의 in-memory 캐시.
 *
 * <p>정책:
 * <ul>
 *   <li>Login 시점에 사용자의 RBAC chain 을 펼쳐서 {@code Set<PermKey>} 로 빌드.</li>
 *   <li>요청마다 {@code O(1)} lookup ({@code Set.contains}).</li>
 *   <li>TTL 10분. 만료 후 첫 요청 시 동기 재로드.</li>
 *   <li>{@link RoleChangedEvent} 시 전체 무효화 (단일 인스턴스 가정).</li>
 * </ul>
 *
 * <p>RBAC chain (W1~W9 신규 자산 기반 — Phase R2 재작성):
 * <pre>
 *   SecUser → SecUserMapping → SecRoleGroup → SecRoleGroupMapping → SecRole
 *          → SecRoleMapping → (OBJECT_ID, PERMISSION_ID) → SecObj + SecPerm
 * </pre>
 *
 * <p>PermKey 빌드:
 * <ul>
 *   <li>{@code moduleId} = {@link SecObj#getSystemCode() SecObj.SYSTEM_CODE} (소문자, null 이면 "mcm")</li>
 *   <li>{@code serviceId} = "oasis" (FE 가 4-segment URL {@code /api/{moduleId}/oasis/{objectId}/{action}} 호출 —
 *       2026-06-01 fix). 이전 정책 (빈 문자열 + 3-segment) 은 OASIS URL 패턴과 mismatch 로 매칭 실패.</li>
 *   <li>{@code objId} = {@link SecObj#getObjectId() SecObj.OBJECT_ID} (소문자)</li>
 *   <li>{@code action} = {@link SecPerm} 의 4 텍스트 필드 ({@code PERMISSION_COMMON} +
 *       {@code PERMISSION_CUSTOM} + {@code POPUP_BTN} + {@code PERMISSION_ACTION}) 콤마 분할 후
 *       trim + 빈 토큰 제거 — 각 토큰별 PermKey 1 행씩</li>
 * </ul>
 *
 * <p>다중 인스턴스 운영 시 Redis 로 교체 권장 — 본 구현은 단일 인스턴스 기준.
 */
@Component
public class UserPermCache {

    private static final Logger log = LoggerFactory.getLogger(UserPermCache.class);
    private static final long TTL_MS = 10L * 60L * 1000L;
    private static final String DEFAULT_MODULE_ID = "mcm";
    // 2026-06-01 fix — FE 가 OASIS URL `/api/mcm/oasis/{objectId}/{action}` 호출.
    // PermKey.parseUrl 결과 = (mcm, oasis, objectId, action) → 캐시 PermKey 의 serviceId 도 "oasis" 로 정합.
    private static final String OASIS_SERVICE_ID = "oasis";

    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecObjRepository secObjRepository;
    private final SecPermRepository secPermRepository;

    /** SYSADMIN 브레이크글라스 — true 시 toKeyStrings 가 舊 와일드카드 ["*"] 반환 (기본 false = 실키 열거, 2026-07-30). */
    private final boolean sysadminFreepass;

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    /** perm-bench r3 — 사람 단위 빌드 잠금. */
    private final Map<String, Object> buildLocks = new ConcurrentHashMap<>();
    /** perm-bench r3 — 무효화 세대. 빌드 시작 뒤 바뀌면 그 결과를 캐시에 넣지 않는다. */
    private final AtomicLong generation = new AtomicLong();

    /** perm-bench r3 — v2 계산(그래프 + resolver). null 이면 옛 계산(legacy). */
    private final PermGraphLoader permGraphLoader;
    private final PermResolver permResolver;

    /** 옛 계산(legacy) 전용 — 시험과 되돌림 경로. */
    public UserPermCache(SecUserMappingRepository secUserMappingRepository,
                         SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                         SecRoleMappingRepository secRoleMappingRepository,
                         SecObjRepository secObjRepository,
                         SecPermRepository secPermRepository,
                         boolean sysadminFreepass) {
        this(secUserMappingRepository, secRoleGroupMappingRepository, secRoleMappingRepository, secObjRepository,
                secPermRepository, sysadminFreepass, "legacy", null, null);
    }

    /** perm-bench r3 — {@code mcm.security.perm-model=v2}(기본)이면 PermGraphLoader + PermResolver 로 키를 만든다(D24). */
    @Autowired
    public UserPermCache(SecUserMappingRepository secUserMappingRepository,
                         SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                         SecRoleMappingRepository secRoleMappingRepository,
                         SecObjRepository secObjRepository,
                         SecPermRepository secPermRepository,
                         @Value("${mcm.security.sysadmin-freepass:false}") boolean sysadminFreepass,
                         @Value("${mcm.security.perm-model:v2}") String permModel,
                         PermGraphLoader permGraphLoader,
                         PermResolver permResolver) {
        boolean v2 = "v2".equalsIgnoreCase(permModel == null ? "" : permModel.trim());
        this.permGraphLoader = v2 ? permGraphLoader : null;
        this.permResolver = v2 ? permResolver : null;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secObjRepository = secObjRepository;
        this.secPermRepository = secPermRepository;
        this.sysadminFreepass = sysadminFreepass;
    }

    /**
     * userId 의 PermKey 집합을 반환. 캐시 미스 또는 만료 시 동기 재로드.
     */
    public Set<PermKey> getPermissions(String userId) {
        if (userId == null || userId.isBlank()) return Set.of();
        Entry entry = cache.get(userId);
        if (entry != null && entry.expiresAt > System.currentTimeMillis()) {
            return entry.perms;
        }
        return loadAndCache(userId);
    }

    /** 명시적으로 사용자 캐시 빌드 — 로그인 직후 호출 권장. */
    public Set<PermKey> loadAndCache(String userId) {
        // perm-bench r3 — 사람 단위 잠금(v2 빌드는 오브젝트·메뉴 전체를 읽어 전역 잠금이면 로그인이 줄 선다).
        // 빌드 중 무효화가 지나가면 결과를 돌려주되 캐시에 넣지 않는다(옛 데이터가 TTL 동안 남지 않게).
        synchronized (buildLocks.computeIfAbsent(userId, k -> new Object())) {
            long gen = generation.get();
            Set<PermKey> built = build(userId);
            if (generation.get() == gen) {
                cache.put(userId, new Entry(built, System.currentTimeMillis() + TTL_MS));
            }
            log.debug("[UserPermCache] user={} permKeys={}", userId, built.size());
            return built;
        }
    }

    /**
     * userId 의 PermKey 집합을 BFF 권한키 문자열 List 로 직렬화한다.
     *
     * <p>포맷 = {@code "module/objId/action"} (소문자 3-part, serviceId 드롭) —
     * BFF {@code proxy.ts.parseRbacKey} 산출 키와 1:1 정합. OASIS(4-seg)·컨벤션(3-seg)이
     * 동일 키 공간으로 합쳐지도록 {@code PermKey.serviceId("oasis")} 는 키에서 제외한다.
     *
     * <p>SYSADMIN 도 실키 열거가 기본 (2026-07-30 순수 RBAC 전환 — 백필 데이터 기반). 브레이크글라스
     * ({@code mcm.security.sysadmin-freepass=true}) 시에만 舊 와일드카드 {@code ["*"]} 반환.
     *
     * @return 정렬·중복제거된 권한키 List. roleGroup 미매핑/빈 권한이면 빈 List.
     */
    public List<String> toKeyStrings(String userId) {
        if (userId == null || userId.isBlank()) return List.of();
        if (sysadminFreepass && isSysadmin(userId)) return List.of("*");
        return getPermissions(userId).stream()
                .map(k -> k.moduleId() + "/" + k.objId() + "/" + k.action())
                .distinct()
                .sorted()
                .toList();
    }

    /** RBAC chain(roleId)에 SYSADMIN 이 포함되는지 — 브레이크글라스 게이트 판별용 (SecurityContext 불요, 로그인 시점 호출 가능). */
    private boolean isSysadmin(String userId) {
        List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return false;
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(roleGroupIds);
        return roleIds != null && (roleIds.contains("SYSADMIN") || roleIds.contains("ROLE_SYSADMIN"));
    }

    public void invalidate(String userId) {
        if (userId == null) return;
        generation.incrementAndGet();
        cache.remove(userId);
    }

    public void invalidateAll() {
        generation.incrementAndGet();
        int n = cache.size();
        cache.clear();
        log.info("[UserPermCache] 전체 무효화 — {} 사용자 캐시 제거", n);
    }

    @EventListener
    public void onRoleChanged(RoleChangedEvent event) {
        // 보수적으로 전체 무효화. 영향받는 user 만 필터링하려면 event 에 영향 user 목록 필드 필요.
        invalidateAll();
    }

    /**
     * 사용자 PermKey 집합을 DB 로부터 빌드 — W1~W9 신규 RBAC chain.
     *
     * <ol>
     *   <li>{@code userId} → {@code List<String> roleGroupIds} (SecUserMapping)</li>
     *   <li>{@code roleGroupIds} → {@code List<String> roleIds} (SecRoleGroupMapping)</li>
     *   <li>{@code roleIds} → {@code List<SecRoleMapping> mappings} (SecRoleMapping)</li>
     *   <li>mappings 의 OBJECT_ID + PERMISSION_ID 한 번에 findAllById 로 enrich (N+1 방지)</li>
     *   <li>각 mapping 별 PermKey 카르테시안 (SecObj × SecPerm action 토큰 N개)</li>
     * </ol>
     */
    private Set<PermKey> build(String userId) {
        if (permGraphLoader != null && permResolver != null) return buildV2(userId);
        // step 1: USER → ROLE_GROUP
        List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return Set.of();

        // step 2: ROLE_GROUP → ROLE
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(roleGroupIds);
        if (roleIds == null || roleIds.isEmpty()) return Set.of();

        // step 3: ROLE → (OBJECT_ID, PERMISSION_ID)
        List<SecRoleMapping> mappings = secRoleMappingRepository.findByRoleIdIn(roleIds);
        if (mappings == null || mappings.isEmpty()) return Set.of();

        // step 4: OBJECT_ID / PERMISSION_ID 한 번에 enrich (N+1 방지)
        Set<String> objectIds = new LinkedHashSet<>();
        Set<String> permissionIds = new LinkedHashSet<>();
        for (SecRoleMapping rm : mappings) {
            if (rm.getObjectId() != null) objectIds.add(rm.getObjectId());
            if (rm.getPermissionId() != null) permissionIds.add(rm.getPermissionId());
        }
        if (objectIds.isEmpty() || permissionIds.isEmpty()) return Set.of();

        java.util.Map<String, SecObj> objById = new java.util.HashMap<>();
        for (SecObj obj : secObjRepository.findAllById(objectIds)) {
            objById.put(obj.getObjectId(), obj);
        }
        java.util.Map<String, SecPerm> permById = new java.util.HashMap<>();
        for (SecPerm perm : secPermRepository.findAllById(permissionIds)) {
            permById.put(perm.getPermissionId(), perm);
        }

        // step 5: PermKey 카르테시안 빌드
        Set<PermKey> result = new HashSet<>();
        for (SecRoleMapping rm : mappings) {
            String objectId = rm.getObjectId();
            String permissionId = rm.getPermissionId();
            if (objectId == null || permissionId == null) continue;

            SecObj obj = objById.get(objectId);
            SecPerm perm = permById.get(permissionId);
            if (obj == null || perm == null) continue;

            String systemCode = obj.getSystemCode();
            String moduleId = (systemCode == null || systemCode.isBlank())
                    ? DEFAULT_MODULE_ID : systemCode.trim().toLowerCase();
            String objIdLower = obj.getObjectId().trim().toLowerCase();

            for (String action : collectActions(perm)) {
                try {
                    // 2026-06-01 fix — FE OASIS URL `/api/{moduleId}/oasis/{objectId}/{action}` 와 정합.
                    // serviceId="oasis" 명시 — 이전 빈 문자열 / 3-segment 패턴은 OASIS URL 매칭 실패.
                    result.add(new PermKey(moduleId, OASIS_SERVICE_ID, objIdLower, action));
                } catch (IllegalArgumentException ignored) {
                    // action / objId 가 비어있으면 skip (PermKey 검증 위반)
                }
            }
        }
        return Collections.unmodifiableSet(result);
    }

    /**
     * perm-bench r3 — v2 키 빌드. 키 모양은 옛 빌드와 같다(D26):
     * {@code lower(trim(SYSTEM_CODE) ?: mcm)/lower(trim(OBJECT_ID))/action}.
     * action = resolver 효과({@code (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)}, SYSADMIN = 허용 값 전부).
     */
    private Set<PermKey> buildV2(String userId) {
        PermGraph graph = permGraphLoader.loadForUsers(Set.of(userId));
        Set<PermKey> result = new HashSet<>();
        for (Map.Entry<String, Set<String>> e : permResolver.actionsOf(graph, userId).entrySet()) {
            ObjMeta obj = graph.objects().get(e.getKey());
            String systemCode = obj == null ? null : obj.systemCode();
            String moduleId = (systemCode == null || systemCode.isBlank())
                    ? DEFAULT_MODULE_ID : systemCode.trim().toLowerCase();
            String objIdLower = e.getKey().trim().toLowerCase();
            for (String action : e.getValue()) {
                try {
                    result.add(new PermKey(moduleId, OASIS_SERVICE_ID, objIdLower, action));
                } catch (IllegalArgumentException ignored) {
                    // 빈 objId·action = skip (옛 빌드와 같음)
                }
            }
        }
        return Collections.unmodifiableSet(result);
    }

    /**
     * {@link SecPerm} 의 4 텍스트 필드를 콤마 분할하여 action 토큰 집합 빌드.
     * 빈 토큰은 제거, 중복은 LinkedHashSet 으로 단일화.
     */
    private static Set<String> collectActions(SecPerm perm) {
        Set<String> actions = new LinkedHashSet<>();
        addTokens(actions, perm.getPermissionCommon());
        addTokens(actions, perm.getPermissionCustom());
        addTokens(actions, perm.getPopupBtn());
        addTokens(actions, perm.getPermissionAction());
        return actions;
    }

    private static void addTokens(Set<String> sink, String csv) {
        if (csv == null || csv.isBlank()) return;
        for (String raw : csv.split(",")) {
            if (raw == null) continue;
            String t = raw.trim();
            if (!t.isEmpty()) sink.add(t);
        }
    }

    private record Entry(Set<PermKey> perms, long expiresAt) {}
}
