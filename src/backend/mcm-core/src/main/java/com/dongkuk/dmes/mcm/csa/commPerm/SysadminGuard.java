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
 * 알려진 한계: 「지금」 하나만 본다. 마지막 보유자의 종료일을 오늘·미래로 두는 저장은 통과하고, 그날이 지나면 0명이 된다.
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

    static final int LOCK_WAIT_SEC = 10;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private static final String SYSADMIN_IN_SQL =
            "'" + String.join("','", new TreeSet<>(CommPermQueryRepository.SYSADMIN_ROLE_IDS)) + "'";

    /** 사람 활성 — 별칭 X 의 USE_TP·기간(날짜 단위, 끝 날 포함 — 로그인 검사와 같다). */
    private static String activeByDay(String x) {
        return x + ".USE_TP = 'Y'"
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
    @SuppressWarnings("unchecked")
    public Set<String> activeHolders() {
        List<Object> rows = entityManager.createNativeQuery(HOLDERS_SQL)
                .setParameter("today", today())
                .setParameter("now", now())
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
