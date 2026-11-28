/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 마지막 시스템관리자·본인 잠금 막기(perm-crudfix c5) — 권한 화면 4곳(commUserMng·commRoleGrpMng·commRoleMng·commPermBench)이 같이 쓰는 판정
 */
package com.dongkuk.dmes.mcm.csa.commPerm;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * 「활성 SYSADMIN 보유자」 판정과 저장 전·후 비교.
 *
 * <p><b>활성 SYSADMIN 보유자</b> = 사람 → 그룹({@code TB_MCM_SEC_USER_MAPPING}) → 역할({@code TB_MCM_SEC_ROLEGROUP_MAPPING})
 * 사슬에 SYSADMIN 역할({@link CommPermQueryRepository#SYSADMIN_ROLE_IDS}, 같은 기준)이 있고, 사람·그룹·역할이 모두 활성인 사용자.
 * 활성 = {@code USE_TP='Y'} 이고 지금이 {@code START_ACTIVE_DATE ~ END_ACTIVE_DATE} 안.
 * <ul>
 *   <li>사람 = 날짜 단위(KST 오늘, 끝 날 포함) — 로그인 검사 {@code today.isAfter(end)} 와 같다</li>
 *   <li>그룹·역할 = 런타임 {@code PermEvaluator.active} 와 같다: 시작 ≤ 지금, 끝이 자정이면 그날 끝까지, 아니면 끝 시각까지.
 *       그룹·역할 행이 없으면 활성으로 본다</li>
 * </ul>
 * 알려진 한계: {@link Check#verify} 는 「지금」 하나만 본다. 2026-11-28 — 미래 종료일은 {@link #verifyFutureEnd} 로 따로 본다.
 *
 * <p><b>쓰는 법</b>(한 트랜잭션 안, 쓰기 전에 시작):
 * <pre>
 *   SysadminGuard.Check c = guard.begin("PERM_BUSY");   // 잠금 + 저장 전 보유자
 *   ... 쓰기 ...
 *   c.verify("LAST_SYSADMIN", "마지막 시스템관리자는 …", "SELF_LOCKOUT", "본인 계정의 …");  // flush + 저장 뒤 보유자
 * </pre>
 * 저장 전 보유자가 있었는데 저장 뒤 0명 = {@code lastCode} 로 거절. 로그인한 본인이 저장 전 보유자였는데 저장 뒤 아니면 = {@code selfCode} 로 거절.
 * 둘 다 {@link BusinessException} — OASIS process 트랜잭션이 저장 전체를 되돌린다. 저장 전 보유자가 0명인 DB(새 설치·시험 DB)는 막지 않는다.
 *
 * <p><b>동시 저장</b>: 시작할 때 SYSADMIN 역할 행({@code TB_MCM_SEC_ROLE})을 {@code SELECT … FOR UPDATE WAIT 10} 으로 잠근다.
 * 잠금은 커밋·롤백까지 유지되므로 보유자를 줄일 수 있는 저장 두 건은 줄을 서고, 뒤 저장은 앞 저장이 커밋한 상태를 보고 판정한다
 * (Oracle READ COMMITTED — 잠금을 얻은 뒤 시작한 SELECT 는 앞 커밋을 본다). 쓰기 전에 잠그므로 행 잠금 순서가 뒤집혀 교착되지 않는다.
 * 잠금 대기 초과·교착 = {@code busyCode}. SYSADMIN 역할 행이 하나도 없으면 잠글 행이 없다(별칭만 매핑에 쓰인 DB — 알려진 한계).
 *
 * <p><b>SYSADMIN 만 할 수 있는 일</b>(2026-11-28 m19, 권한 올리기 막기): 공통관리자 같은 SYSADMIN 이 아닌 운영자가
 * 스스로(또는 남에게) 시스템관리자 권한·SYSADMIN 전용 오브젝트 권한을 주거나 SYSADMIN 계정을 넘겨받지 못하게 한다.
 * 판정은 이 클래스 하나다 — 「로그인 사용자가 SYSADMIN」= 위 활성 보유자({@link #currentUserIsSysadmin}),
 * 「민감한 역할」= SYSADMIN 역할(별칭 포함) 또는 SYSADMIN 전용 오브젝트({@link #SYSADMIN_ONLY_OBJECTS}) 퍼미션을 가진 역할,
 * 「민감한 그룹」= 민감한 역할이 든 그룹. 거절은 {@link #requireSysadmin} — 「SYSADMIN_ONLY: …」.
 * 로그인 사용자가 없는 호출(시더·스케줄러 같은 시스템 호출)은 막지 않는다.
 */
@Component
public class SysadminGuard {

    private static final Logger log = LoggerFactory.getLogger(SysadminGuard.class);

    /** 마지막 시스템관리자 — 사용자·역할 그룹·역할 화면. */
    public static final String LAST_SYSADMIN = "LAST_SYSADMIN";
    /** 본인 잠금 — 사용자·역할 그룹·역할 화면. */
    public static final String SELF_LOCKOUT = "SELF_LOCKOUT";
    /** 마지막 시스템관리자 — 권한 작업대 적용. */
    public static final String PERM_LAST_SYSADMIN = "PERM_LAST_SYSADMIN";
    /** 본인 SYSADMIN 해제 — 권한 작업대 적용. */
    public static final String PERM_SELF_LOCKOUT = "PERM_SELF_LOCKOUT";
    /** 잠금 대기 초과·교착(기존 작업대 코드와 같다). */
    public static final String PERM_BUSY = "PERM_BUSY";

    /** 사용자·그룹·역할 화면이 같이 쓰는 문구. */
    public static final String LAST_MSG = "마지막 시스템관리자는 삭제하거나 끄거나 시스템관리자 권한을 뺄 수 없습니다";
    public static final String SELF_ROLE_MSG = "본인 계정의 시스템관리자 권한은 뺄 수 없습니다";

    /** SYSADMIN 만 할 수 있는 일을 SYSADMIN 이 아닌 사용자가 했다(m19). */
    public static final String SYSADMIN_ONLY = "SYSADMIN_ONLY";
    public static final String SYSADMIN_ONLY_MSG = "시스템관리자만 시스템관리자 권한을 바꿀 수 있습니다";
    /** SYSADMIN 전용 오브젝트 — 이 오브젝트의 퍼미션을 역할에 주고 빼는 일은 SYSADMIN 만 한다(m19). */
    public static final Set<String> SYSADMIN_ONLY_OBJECTS = Set.of("dbViewer");

    static final int LOCK_WAIT_SEC = 10;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private static final String SYSADMIN_IN_SQL =
            "'" + String.join("','", new TreeSet<>(CommPermQueryRepository.SYSADMIN_ROLE_IDS)) + "'";

    /**
     * 사람 활성 — 별칭 X 의 USE_TP·기간(날짜 단위, 끝 날 포함 — 로그인 검사와 같다)·ERP 인사 상태.
     * 2026-11-28 — 인사 휴직·퇴직(HR_ST LEAVE·RETIRED)도 활성에서 뺀다(로그인이 막히므로). 잠금(LOCK_YN)은 빼지 않는다 —
     * SYSADMIN 잠금은 시간이 지나면 저절로 풀린다(D15).
     */
    private static String activeByDay(String x) {
        return x + ".USE_TP = 'Y'"
                + " AND (" + x + ".HR_ST IS NULL OR " + x + ".HR_ST = 'ACTIVE')"
                + " AND (" + x + ".START_ACTIVE_DATE IS NULL OR TRUNC(" + x + ".START_ACTIVE_DATE) <= :today)"
                + " AND (" + x + ".END_ACTIVE_DATE IS NULL OR TRUNC(" + x + ".END_ACTIVE_DATE) >= :today)";
    }

    /** 그룹·역할 활성 — {@code PermEvaluator.active} 와 같은 규칙(시작 ≤ 지금, 자정 끝 = 그날 끝까지, 그 밖 = 끝 시각까지). */
    private static String activeAtNow(String x) {
        String end = x + ".END_ACTIVE_DATE";
        return x + ".USE_TP = 'Y'"
                + " AND (" + x + ".START_ACTIVE_DATE IS NULL OR " + x + ".START_ACTIVE_DATE <= :now)"
                + " AND (" + end + " IS NULL"
                // 자정 끝 = 그날 끝까지(now < end+1일 ⇔ end ≥ TRUNC(now)) — end+1 은 9999-12-31 에서 넘친다(ORA-01841)
                + " OR (" + end + " = TRUNC(" + end + ") AND " + end + " >= TRUNC(:now))"
                + " OR (" + end + " <> TRUNC(" + end + ") AND :now <= " + end + "))";
    }

    static final String HOLDERS_SQL =
            "SELECT DISTINCT U.USER_ID FROM MCMAPUSER.TB_MCM_SEC_USER U "
            + "JOIN MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM ON UM.USER_ID = U.USER_ID "
            + "JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GM ON GM.ROLE_GROUP_ID = UM.ROLE_GROUP_ID "
            + "LEFT JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP G ON G.ROLE_GROUP_ID = UM.ROLE_GROUP_ID "
            + "LEFT JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON R.ROLE_ID = GM.ROLE_ID "
            + "WHERE GM.ROLE_ID IN (" + SYSADMIN_IN_SQL + ") "
            + "AND " + activeByDay("U") + " "
            + "AND (G.ROLE_GROUP_ID IS NULL OR (" + activeAtNow("G") + ")) "
            + "AND (R.ROLE_ID IS NULL OR (" + activeAtNow("R") + "))";

    static final String LOCK_SQL =
            "SELECT ROLE_ID FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID IN (" + SYSADMIN_IN_SQL + ") "
            + "ORDER BY ROLE_ID FOR UPDATE WAIT " + LOCK_WAIT_SEC;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    private final ObjectProvider<SecurityIdentity> identity;
    private final Clock clock;

    @Autowired
    public SysadminGuard(ObjectProvider<SecurityIdentity> identity) {
        this(identity, Clock.system(KST));
    }

    protected SysadminGuard(ObjectProvider<SecurityIdentity> identity, Clock clock) {
        this.identity = identity;
        this.clock = clock;
    }

    /** 오늘(KST 날짜). */
    public LocalDate today() {
        return LocalDate.now(clock.withZone(KST));
    }

    /** 지금(KST). */
    LocalDateTime now() {
        return LocalDateTime.now(clock.withZone(KST));
    }

    /** 로그인한 사용자 ID. 인증 정보가 없으면 null. */
    public String currentUserId() {
        SecurityIdentity id = identity.getIfAvailable();
        String u = id == null ? null : id.currentUserId();
        return u == null || u.isBlank() ? null : u.trim();
    }

    /** 지금 DB 상태의 활성 SYSADMIN 보유자(같은 트랜잭션의 flush 된 쓰기 포함). */
    public Set<String> activeHolders() {
        return holdersAt(today(), now());
    }

    /**
     * 그날 0시 기준 활성 SYSADMIN 보유자 — 유효 기한일을 미래로 바꾸는 저장이 「그날 뒤 0명」을 만드는지 본다(D15).
     * 지금 DB 의 칸 값으로 계산한다(그날까지 다른 저장이 없다고 본다).
     */
    public Set<String> holdersOn(LocalDate day) {
        return holdersAt(day, day.atStartOfDay());
    }

    @SuppressWarnings("unchecked")
    private Set<String> holdersAt(LocalDate day, LocalDateTime at) {
        List<Object> rows = entityManager.createNativeQuery(HOLDERS_SQL)
                .setParameter("today", day)
                .setParameter("now", at)
                .getResultList();
        Set<String> out = new LinkedHashSet<>();
        for (Object r : rows) {
            if (r != null) out.add(String.valueOf(r));
        }
        return out;
    }

    /**
     * SYSADMIN 역할 행을 잠그고 저장 전 보유자를 읽는다. 쓰기 전에 부른다.
     *
     * @param busyCode 잠금 대기 초과·교착 때 오류 코드
     */
    public Check begin(String busyCode) {
        int locked;
        try {
            locked = lockSysadminRows();
        } catch (RuntimeException e) {
            if (isLockTimeout(e)) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        busyCode + ": 다른 권한 저장이 진행 중입니다. 잠시 뒤 다시 저장하세요");
            }
            throw e;
        }
        return new Check(activeHolders(), currentUserId(), locked > 0);
    }

    /** SYSADMIN 역할 행 잠금(커밋·롤백까지). 잠근 행 수를 돌려준다. 시험 가짜가 바꿔 끼운다. */
    protected int lockSysadminRows() {
        return entityManager.createNativeQuery(LOCK_SQL).getResultList().size();
    }

    /** 같은 트랜잭션의 쓰기를 DB 로 내보낸다(저장 뒤 보유자 SQL 이 보게). */
    protected void flush() {
        entityManager.flush();
    }

    /** 저장 전 상태. {@link #verify} 로 저장 뒤와 비교한다. */
    public final class Check {
        private final Set<String> before;
        private final String me;
        private final boolean locked;

        Check(Set<String> before, String me, boolean locked) {
            this.before = before;
            this.me = me;
            this.locked = locked;
        }

        /** 저장 전 활성 SYSADMIN 보유자. */
        public Set<String> before() {
            return before;
        }

        /**
         * flush 뒤 저장 뒤 보유자를 읽어 비교한다. 본인 해제가 먼저다(본인이 마지막 1명이면 본인 코드).
         *
         * @throws BusinessException 「selfCode: selfMsg」 또는 「lastCode: lastMsg」
         */
        public void verify(String lastCode, String lastMsg, String selfCode, String selfMsg) {
            if (before.isEmpty()) {
                return;
            }
            flush();
            Set<String> after = activeHolders();
            if (me != null && containsIgnoreCase(before, me) && !containsIgnoreCase(after, me)) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, selfCode + ": " + selfMsg);
            }
            if (after.isEmpty()) {
                // 보유자 ID 는 응답에 싣지 않고 서버 기록에만 남긴다
                log.warn("[SysadminGuard] {} — 저장 전 활성 SYSADMIN 보유자 {} 가 저장 뒤 0명", lastCode, before);
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, lastCode + ": " + lastMsg);
            }
            if (!locked && after.size() < before.size()) {
                // 잠글 SYSADMIN 역할 행이 없으면 동시 저장을 줄 세우지 못한다 — 보유자를 줄이는 저장만 막는다(fail closed)
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, lastCode
                        + ": 시스템관리자(SYSADMIN) 역할 행이 없어 시스템관리자를 줄이는 저장을 할 수 없습니다. 역할 관리에서 SYSADMIN 역할을 먼저 등록하세요");
            }
        }
    }

    /**
     * 유효 기한일을 미래 날짜로 바꾼 저장 — 그 날짜 다음 날 활성 SYSADMIN 이 0명이 되면 거절한다(지금 판정만 보던 한계, D15).
     * 저장(쓰기) 뒤에 부른다. 지금 보유자가 0명인 DB(새 설치·시험 DB)는 막지 않는다.
     *
     * @param endDays 이번 저장이 SYSADMIN 후보에게 넣은 미래 기한일들
     * @throws BusinessException 「lastCode: 그날 뒤에 남는 시스템관리자가 없습니다」
     */
    public void verifyFutureEnd(java.util.Collection<LocalDate> endDays, String lastCode) {
        if (endDays == null || endDays.isEmpty()) return;
        flush();
        if (activeHolders().isEmpty()) return;
        LocalDate today = today();
        for (LocalDate end : new java.util.TreeSet<>(endDays)) {
            if (end == null || !end.isAfter(today.minusDays(1)) || end.getYear() >= 9999) continue;
            if (holdersOn(end.plusDays(1)).isEmpty()) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, lastCode + ": " + end
                        + " 뒤에 남는 시스템관리자가 없습니다. 다른 시스템관리자를 먼저 지정하세요");
            }
        }
    }

    // ── SYSADMIN 만 할 수 있는 일(m19) ──────────────────────────────

    /** SYSADMIN 역할 ID(별칭 포함)인가 — 앞뒤 공백·대소문자를 무시한다(보수적으로 넓게 막는다). */
    public static boolean isSysadminRoleId(String roleId) {
        if (roleId == null) return false;
        String r = roleId.trim();
        for (String s : CommPermQueryRepository.SYSADMIN_ROLE_IDS) {
            if (s.equalsIgnoreCase(r)) return true;
        }
        return false;
    }

    /** SYSADMIN 전용 오브젝트인가(대소문자 무시). */
    public static boolean isSysadminOnlyObject(String objectId) {
        if (objectId == null) return false;
        String o = objectId.trim();
        for (String s : SYSADMIN_ONLY_OBJECTS) {
            if (s.equalsIgnoreCase(o)) return true;
        }
        return false;
    }

    /**
     * 로그인 사용자가 SYSADMIN 인가 — 활성 보유자({@link #activeHolders})에 든다(대소문자 무시).
     * 로그인 사용자가 없으면 false. 시스템 호출 허용은 {@link #requireSysadmin} 이 정한다.
     */
    public boolean currentUserIsSysadmin() {
        String me = currentUserId();
        return me != null && containsIgnoreCase(activeHolders(), me);
    }

    /**
     * SYSADMIN 만 할 수 있는 일 — 로그인 사용자가 SYSADMIN 이 아니면 「SYSADMIN_ONLY: 문구」로 거절한다.
     * 로그인 사용자가 없는 시스템 호출(시더 등)은 통과한다. 쓰기 전·{@link #begin} 전에 부른다(거절이 잠금을 잡지 않게).
     */
    public void requireSysadmin(String msg) {
        if (currentUserId() == null || currentUserIsSysadmin()) return;
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, SYSADMIN_ONLY + ": " + (msg == null ? SYSADMIN_ONLY_MSG : msg));
    }

    /** {@link #requireSysadmin(String)} — 기본 문구. */
    public void requireSysadmin() {
        requireSysadmin(SYSADMIN_ONLY_MSG);
    }

    /** 주어진 사람 가운데 활성 SYSADMIN 보유자(대소문자 무시, 입력 표기 그대로). */
    public Set<String> holdersAmong(java.util.Collection<String> userIds) {
        Set<String> out = new LinkedHashSet<>();
        if (userIds == null || userIds.isEmpty()) return out;
        Set<String> holders = activeHolders();
        for (String u : userIds) {
            if (u != null && containsIgnoreCase(holders, u.trim())) out.add(u);
        }
        return out;
    }

    /**
     * 주어진 사람 가운데 민감한 그룹(SYSADMIN 역할·SYSADMIN 전용 오브젝트 퍼미션을 가진 역할이 든 그룹)에 매핑된 사람(대소문자 무시, 입력 표기 그대로).
     * 사람·그룹·역할의 사용 여부·기간은 보지 않는다 — 기간이 지났거나 정지된 SYSADMIN 계정도 비밀번호를 초기화해 다시 켜면
     * 넘겨받을 수 있기 때문이다(계정 보호용, 마지막 시스템관리자 판정은 {@link #activeHolders}).
     */
    @SuppressWarnings("unchecked")
    public Set<String> usersInSensitiveGroups(java.util.Collection<String> userIds) {
        Set<String> out = new LinkedHashSet<>();
        if (userIds == null || userIds.isEmpty()) return out;
        List<String> upper = new java.util.ArrayList<>();
        for (String u : userIds) if (u != null && !u.isBlank()) upper.add(u.trim().toUpperCase(java.util.Locale.ROOT));
        if (upper.isEmpty()) return out;
        Set<String> withObj = rolesWithSysadminOnlyObjects();
        Set<String> hit = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Object[] row : (List<Object[]>) entityManager.createNativeQuery(USER_ROLES_SQL)
                .setParameter("ids", upper).getResultList()) {
            String u = row[0] == null ? null : String.valueOf(row[0]);
            String r = row[1] == null ? null : String.valueOf(row[1]);
            if (u != null && r != null && (isSysadminRoleId(r) || withObj.contains(r.trim()))) hit.add(u.trim());
        }
        for (String u : userIds) if (u != null && hit.contains(u.trim())) out.add(u);
        return out;
    }

    static final String USER_ROLES_SQL =
            "SELECT UM.USER_ID, GM.ROLE_ID FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM "
            + "JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GM ON GM.ROLE_GROUP_ID = UM.ROLE_GROUP_ID "
            + "WHERE UPPER(TRIM(UM.USER_ID)) IN (:ids)";

    static final String SENSITIVE_ROLE_SQL =
            "SELECT DISTINCT P.ROLE_ID FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM P WHERE UPPER(P.OBJECT_ID) IN ("
            + upperIn(SYSADMIN_ONLY_OBJECTS) + ")";

    static final String GROUP_ROLES_SQL =
            "SELECT GM.ROLE_GROUP_ID, GM.ROLE_ID FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GM";

    private static String upperIn(Set<String> ids) {
        StringBuilder b = new StringBuilder();
        for (String id : new TreeSet<>(ids)) {
            if (b.length() > 0) b.append(',');
            b.append('\'').append(id.toUpperCase(java.util.Locale.ROOT)).append('\'');
        }
        return b.toString();
    }

    /** SYSADMIN 전용 오브젝트 퍼미션(TB_MCM_SEC_ROLE_PERM)을 가진 역할(지금 DB, 같은 트랜잭션의 flush 된 쓰기 포함). */
    @SuppressWarnings("unchecked")
    public Set<String> rolesWithSysadminOnlyObjects() {
        Set<String> out = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Object r : (List<Object>) entityManager.createNativeQuery(SENSITIVE_ROLE_SQL).getResultList()) {
            if (r != null) out.add(String.valueOf(r));
        }
        return out;
    }

    /** 민감한 역할 = SYSADMIN 역할(별칭 포함) 또는 SYSADMIN 전용 오브젝트 퍼미션을 가진 역할. 입력 가운데 민감한 것. */
    public Set<String> sensitiveRoles(java.util.Collection<String> roleIds) {
        Set<String> out = new LinkedHashSet<>();
        if (roleIds == null || roleIds.isEmpty()) return out;
        Set<String> withObj = null;
        for (String r : roleIds) {
            if (r == null) continue;
            if (isSysadminRoleId(r)) {
                out.add(r);
                continue;
            }
            if (withObj == null) withObj = rolesWithSysadminOnlyObjects();
            if (withObj.contains(r.trim())) out.add(r);
        }
        return out;
    }

    /** 민감한 그룹 = 민감한 역할이 든 그룹(TB_MCM_SEC_ROLEGROUP_MAPPING, 지금 DB). 입력 가운데 민감한 것. */
    @SuppressWarnings("unchecked")
    public Set<String> sensitiveGroups(java.util.Collection<String> groupIds) {
        Set<String> out = new LinkedHashSet<>();
        if (groupIds == null || groupIds.isEmpty()) return out;
        Set<String> wanted = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (String g : groupIds) if (g != null) wanted.add(g.trim());
        Set<String> withObj = rolesWithSysadminOnlyObjects();
        Set<String> hit = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Object[] row : (List<Object[]>) entityManager.createNativeQuery(GROUP_ROLES_SQL).getResultList()) {
            String g = row[0] == null ? null : String.valueOf(row[0]);
            String r = row[1] == null ? null : String.valueOf(row[1]);
            if (g == null || r == null || !wanted.contains(g)) continue;
            if (isSysadminRoleId(r) || withObj.contains(r.trim())) hit.add(g);
        }
        for (String g : groupIds) if (g != null && hit.contains(g.trim())) out.add(g);
        return out;
    }

    private static boolean containsIgnoreCase(Set<String> ids, String id) {
        for (String s : ids) {
            if (s.equalsIgnoreCase(id)) return true;
        }
        return false;
    }

    /** ORA-30006(WAIT 초과)·ORA-00060(교착)·ORA-00054(NOWAIT). */
    static boolean isLockTimeout(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException s) {
                int code = s.getErrorCode();
                if (code == 30006 || code == 60 || code == 54) {
                    return true;
                }
            }
            if (t.getCause() == t) {
                break;
            }
        }
        return false;
    }
}
