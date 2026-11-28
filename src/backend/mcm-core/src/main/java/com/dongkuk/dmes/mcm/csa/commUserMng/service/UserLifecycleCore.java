/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 계정 상태 바꾸기(잠금 해제·비활성·다시 사용·퇴직·인계) — 관리자 화면과 ERP 인사 연동이 같은 처리를 쓴다
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import com.dongkuk.dmes.mcm.security.account.AccountStatusCache;
import com.dongkuk.dmes.mcm.security.account.UserOwnershipClient;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 계정 상태 처리 본문. 트랜잭션은 부르는 쪽(OASIS 프로세스 또는 인사 처리의 건별 트랜잭션)을 따른다.
 *
 * <p>상태 칸(A안): 관리자 비활성 = {@code USE_TP='N'} · 인사 휴직 = {@code HR_ST='LEAVE'} · 퇴직 = {@code USE_TP='N'} +
 * 유효 기한일 오늘 · ERP 퇴직 = {@code HR_ST='RETIRED'} 도 함께 · 잠금 = {@code LOCK_YN}. 계산은 {@link AccountState#of}.
 *
 * <p>SYSADMIN 보호(D15): 비활성·퇴직은 {@link SysadminGuard} 로 본인 잠금·마지막 SYSADMIN 을 막는다.
 *
 * <p>MDM 담당 데이터 인계·ERD 점유 해제는 다른 앱 호출이라 MCM 트랜잭션에 묶이지 않는다. MCM 쓰기와 가드 검사가 모두 끝난 뒤
 * 마지막에 부르고, 실패하면 퇴직은 그대로 두고 「인계 대기」로 남긴다(D4 — 권장만).
 * 예외: 퇴직 이력만 인계 결과를 담으려고 호출 뒤에 쓴다 — 이력 저장 실패 시 퇴직은 되돌려지고 MDM 소유는 받을 사람에게 남는다.
 */
@Component("userLifecycleCore")
public class UserLifecycleCore {

    private static final Logger log = LoggerFactory.getLogger(UserLifecycleCore.class);

    /** 본인 비활성·퇴직 거절 문구. */
    static final String SELF_MSG = "본인 계정은 비활성화하거나 퇴직 처리할 수 없습니다";
    /** 인사 처리 사유 앞말 — 처리자가 시스템이라 이력에서 알아보게 한다. */
    static final String HR_PREFIX = "ERP 인사";

    private final SecUserRepository secUserRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final UserQueryAssignRepository userQueryAssignRepository;
    private final CommUserMngHisWriter hisWriter;
    private final SysadminGuard sysadminGuard;
    private final AccountStatusCache accountStatusCache;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectProvider<UserOwnershipClient> ownershipClient;

    UserLifecycleCore(SecUserRepository secUserRepository,
                      SecUserMappingRepository secUserMappingRepository,
                      SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                      UserQueryAssignRepository userQueryAssignRepository,
                      CommUserMngHisWriter hisWriter,
                      SysadminGuard sysadminGuard,
                      AccountStatusCache accountStatusCache,
                      ApplicationEventPublisher eventPublisher,
                      ObjectProvider<UserOwnershipClient> ownershipClient) {
        this.secUserRepository = secUserRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.userQueryAssignRepository = userQueryAssignRepository;
        this.hisWriter = hisWriter;
        this.sysadminGuard = sysadminGuard;
        this.accountStatusCache = accountStatusCache;
        this.eventPublisher = eventPublisher;
        this.ownershipClient = ownershipClient;
    }

    // ────────────────────────────────────────────────────────────────
    // 조회
    // ────────────────────────────────────────────────────────────────

    /** 사용자 한 명 — 없으면 업무 오류. */
    SecUser require(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "사용자를 고르세요");
        }
        return secUserRepository.findById(userId.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.BUSINESS_ERROR, "USER_NOT_FOUND: 사용자를 찾을 수 없습니다"));
    }

    /** 오늘 상태. */
    AccountState stateOf(SecUser u) {
        return AccountState.of(u.getUseTp(), u.getStartActiveDate(), u.getEndActiveDate(), u.getHrSt(), u.getLockYn(),
                sysadminGuard.today());
    }

    // ────────────────────────────────────────────────────────────────
    // 잠금 해제
    // ────────────────────────────────────────────────────────────────

    /** 잠금 해제 — 비밀번호는 그대로, 실패·연속 잠금 횟수 0. 잠겨 있지 않으면 업무 오류. */
    void unlock(String userId) {
        SecUser u = require(userId);
        if (!"Y".equals(u.getLockYn())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "NOT_LOCKED: 잠긴 계정이 아닙니다");
        }
        u.setLockYn("N");
        u.setLockAt(null);
        u.setLockCnt(0L);
        u.setPwdFailCount(0L);
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_UNLOCK, CommUserMngHisWriter.CASE_MANUAL,
                u.getUserNm(), "잠금 해제");
        accountStatusCache.invalidate(u.getUserId());
    }

    // ────────────────────────────────────────────────────────────────
    // 비활성 · 다시 사용
    // ────────────────────────────────────────────────────────────────

    /** 관리자 비활성 — USE_TP='N'. 역할과 담당 데이터는 그대로 둔다. 쓰던 세션은 끊는다. */
    void suspend(String userId, String reason) {
        SecUser u = require(userId);
        requireNotSelf(u.getUserId());
        AccountState st = stateOf(u);
        if (st == AccountState.RETIRED) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ALREADY_RETIRED: 퇴직한 계정입니다");
        }
        if ("N".equals(u.getUseTp())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ALREADY_SUSPENDED: 이미 관리자가 비활성화한 계정입니다");
        }
        SysadminGuard.Check check = sysadminGuard.begin(SysadminGuard.PERM_BUSY);
        u.setUseTp("N");
        secUserRepository.save(u);
        verifySysadmin(check);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_SUSPEND, CommUserMngHisWriter.CASE_MANUAL,
                u.getUserNm(), "비활성: " + nz(reason, "사유 없음"));
        accountStatusCache.invalidate(u.getUserId());
        releaseClaimsQuietly(u.getUserId());
    }

    /**
     * 관리자 「다시 사용」 — USE_TP='Y'. 관리자가 건 비활성만 푼다. 인사 휴직(HR_ST='LEAVE')은 남는다(D5 — 건 쪽이 푼다).
     *
     * @return 인사 휴직이 남아 있으면 true(화면 안내용)
     */
    boolean resume(String userId) {
        SecUser u = require(userId);
        if (stateOf(u) == AccountState.RETIRED) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ALREADY_RETIRED: 퇴직한 계정은 「계정 재생성」으로 되돌립니다");
        }
        if (!"N".equals(u.getUseTp())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    AccountState.HR_LEAVE.equals(u.getHrSt())
                            ? "HR_LEAVE: 인사 휴직은 인사 복직 정보가 오면 풀립니다"
                            : "NOT_SUSPENDED: 비활성 계정이 아닙니다");
        }
        u.setUseTp("Y");
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_RESUME, CommUserMngHisWriter.CASE_MANUAL,
                u.getUserNm(), "다시 사용");
        accountStatusCache.invalidate(u.getUserId());
        return AccountState.HR_LEAVE.equals(u.getHrSt());
    }

    /** 인사 휴직 — HR_ST='LEAVE'. 이미 휴직이면 false(건너뜀). 마지막 SYSADMIN 이면 업무 오류(LAST_SYSADMIN). */
    boolean hrLeave(SecUser u, String desc) {
        if (AccountState.HR_LEAVE.equals(u.getHrSt()) || AccountState.HR_RETIRED.equals(u.getHrSt())) return false;
        SysadminGuard.Check check = sysadminGuard.begin(SysadminGuard.PERM_BUSY);
        u.setHrSt(AccountState.HR_LEAVE);
        secUserRepository.save(u);
        verifySysadmin(check);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_SUSPEND, CommUserMngHisWriter.CASE_HR,
                u.getUserNm(), HR_PREFIX + " 휴직" + suffix(desc));
        accountStatusCache.invalidate(u.getUserId());
        return true;
    }

    /** 인사 복직 — 인사 휴직만 푼다. 관리자 비활성(USE_TP='N')은 남는다. 휴직이 아니면 false(건너뜀). */
    boolean hrReturn(SecUser u, String desc) {
        if (!AccountState.HR_LEAVE.equals(u.getHrSt())) return false;
        u.setHrSt(AccountState.HR_ACTIVE);
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_RESUME, CommUserMngHisWriter.CASE_HR,
                u.getUserNm(), HR_PREFIX + " 복직" + suffix(desc)
                        + ("N".equals(u.getUseTp()) ? " · 관리자 비활성은 남음" : ""));
        accountStatusCache.invalidate(u.getUserId());
        return true;
    }

    // ────────────────────────────────────────────────────────────────
    // 퇴직 · 인계
    // ────────────────────────────────────────────────────────────────

    /**
     * 퇴직 처리 — 한 트랜잭션: 상태(유효 기한일 오늘 + USE_TP='N', 인사면 HR_ST='RETIRED') · 역할그룹 회수(ROLL_HIS 'D') ·
     * 사용자 쿼리 배정 해제 · 이력(사유·처리자) · 세션 끊기. 그 뒤 MDM 인계(받을 사람이 있으면) 또는 ERD 점유 해제.
     *
     * @param hr        ERP 인사 퇴직이면 true(이력 PROC_CASE='H', 본인 잠금 검사 없음)
     * @param toUserId  담당 데이터를 받을 사람. 비우면 「인계 대기」
     * @return 결과 — {@code ROLE_GROUP_CNT}·{@code ASSIGN_CNT}·{@code HANDOVER_ST}(DONE·PENDING·FAILED)·{@code HANDOVER_MSG}·{@code HANDOVER_ITEMS}
     */
    Map<String, Object> retire(SecUser u, String reason, boolean hr, String toUserId) {
        if (!hr) requireNotSelf(u.getUserId());
        if (stateOf(u) == AccountState.RETIRED && !(hr && !AccountState.HR_RETIRED.equals(u.getHrSt()))) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ALREADY_RETIRED: 이미 퇴직한 계정입니다");
        }
        SecUser receiver = null;
        if (toUserId != null && !toUserId.isBlank()) {
            receiver = require(toUserId);
            if (receiver.getUserId().equalsIgnoreCase(u.getUserId())) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "퇴직자 본인에게는 넘길 수 없습니다");
            }
            if (stateOf(receiver) != AccountState.ACTIVE && stateOf(receiver) != AccountState.LOCKED) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "받을 사람이 활성 계정이 아닙니다");
            }
        }

        SysadminGuard.Check check = sysadminGuard.begin(SysadminGuard.PERM_BUSY);
        LocalDateTime endDt = LocalDate.now().atStartOfDay();
        u.setEndActiveDate(endDt);
        u.setUseTp("N");
        if (hr) u.setHrSt(AccountState.HR_RETIRED);
        secUserRepository.save(u);

        int roleGroups = revokeRoleGroups(u.getUserId(), hr ? HR_PREFIX + " 퇴직" : "퇴직 처리");
        int assigns = userQueryAssignRepository.deleteByUserId(u.getUserId());
        verifySysadmin(check);

        accountStatusCache.invalidate(u.getUserId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ROLE_GROUP_CNT", roleGroups);
        out.put("ASSIGN_CNT", assigns);
        out.putAll(receiver != null ? handoverToMdm(u, receiver) : releaseOnly(u.getUserId()));

        // 이력 문구는 인계 결과를 보고 쓴다 — 인계가 실패했는데 「인계: 받을 사람」으로 남으면 상태 사유가 넘긴 것처럼 보인다
        String procCase = hr ? CommUserMngHisWriter.CASE_HR : CommUserMngHisWriter.CASE_MANUAL;
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_RETIRE, procCase, u.getUserNm(),
                (hr ? HR_PREFIX + " 퇴직" : "퇴직") + suffix(reason) + handoverNote(receiver, out.get("HANDOVER_ST")));
        return out;
    }

    /** 퇴직 이력 끝말 — 넘겼으면 「인계: 받을 사람」, 넘기지 못했으면 실패·대기를 남긴다. */
    static String handoverNote(SecUser receiver, Object handoverSt) {
        if (receiver == null) return " · 인계 대기";
        if ("DONE".equals(handoverSt)) return " · 인계: " + receiver.getUserId();
        if ("FAILED".equals(handoverSt)) return " · 인계 실패(받을 사람 " + receiver.getUserId() + ") · 인계 대기";
        return " · 인계 대기";
    }

    /**
     * 퇴직 미리 보기 — {@link #retire} 가 회수·해제할 건수를 같은 조회로 센다. 아무것도 바꾸지 않는다.
     *
     * @return {@code ROLE_GROUP_CNT}(회수할 역할그룹 수)·{@code ASSIGN_CNT}(해제할 사용자 쿼리 배정 수)
     */
    Map<String, Object> retirePreview(SecUser u) {
        List<String> groupIds = secUserMappingRepository.findRoleGroupIdsByUserId(u.getUserId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ROLE_GROUP_CNT", groupIds == null ? 0 : groupIds.size());
        out.put("ASSIGN_CNT", Math.toIntExact(userQueryAssignRepository.countByUserId(u.getUserId()))); // retire 의 ASSIGN_CNT 와 같은 int
        return out;
    }

    /**
     * 나중에 인계 — 퇴직자(또는 누구든)의 MDM 담당을 받을 사람에게 넘긴다. MCM 칸은 바꾸지 않고 이력만 남긴다.
     */
    Map<String, Object> handover(String fromUserId, String toUserId) {
        SecUser from = require(fromUserId);
        SecUser to = require(toUserId);
        if (from.getUserId().equalsIgnoreCase(to.getUserId())) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "같은 사람에게는 넘길 수 없습니다");
        }
        AccountState toSt = stateOf(to);
        if (toSt != AccountState.ACTIVE && toSt != AccountState.LOCKED) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "받을 사람이 활성 계정이 아닙니다");
        }
        Map<String, Object> out = handoverToMdm(from, to);
        if ("DONE".equals(out.get("HANDOVER_ST"))) {
            hisWriter.userHis(from.getUserId(), CommUserMngHisWriter.TP_HANDOVER, CommUserMngHisWriter.CASE_MANUAL,
                    from.getUserNm(), "담당 데이터 인계: " + to.getUserId());
        }
        return out;
    }

    /** 역할그룹 회수 — 매핑을 지우고 역할 이력에 'D' 로 남긴 뒤 권한 캐시를 비운다(D3). 회수한 그룹 수. */
    int revokeRoleGroups(String userId, String description) {
        List<String> groupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (groupIds == null || groupIds.isEmpty()) return 0;
        String today = CommUserMngHisWriter.today();
        for (String g : groupIds) {
            secUserMappingRepository.deleteById(new SecUserMapping.PK(userId, g));
            hisWriter.rollHis(today, "P", userId, g, "D", null, null, description);
        }
        Set<String> touched = new LinkedHashSet<>(groupIds);
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(new ArrayList<>(touched));
        eventPublisher.publishEvent(new RoleChangedEvent(new LinkedHashSet<>(roleIds == null ? List.of() : roleIds)));
        return groupIds.size();
    }

    // ────────────────────────────────────────────────────────────────
    // MDM
    // ────────────────────────────────────────────────────────────────

    private Map<String, Object> handoverToMdm(SecUser from, SecUser to) {
        Map<String, Object> out = new LinkedHashMap<>();
        UserOwnershipClient client = ownershipClient.getIfAvailable();
        if (client == null) {
            out.put("HANDOVER_ST", "PENDING");
            out.put("HANDOVER_MSG", "MDM 연결 설정이 없어 담당 데이터는 「인계 대기」로 남았습니다");
            return out;
        }
        try {
            List<UserOwnershipClient.Owned> items = client.handover(
                    new UserOwnershipClient.Person(from.getUserId(), from.getUserEmpNo()),
                    new UserOwnershipClient.Person(to.getUserId(), to.getUserEmpNo()));
            out.put("HANDOVER_ST", "DONE");
            out.put("HANDOVER_ITEMS", toRows(items));
        } catch (UserOwnershipClient.UnavailableException ex) {
            log.warn("[UserLifecycleCore] MDM 인계 실패 — from={} to={} : {}", from.getUserId(), to.getUserId(), ex.getMessage());
            out.put("HANDOVER_ST", "FAILED");
            out.put("HANDOVER_MSG", "MDM 인계를 하지 못했습니다. 「퇴직자가 담당인 데이터」에서 다시 넘기세요");
        }
        return out;
    }

    private Map<String, Object> releaseOnly(String userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("HANDOVER_ST", "PENDING");
        out.put("HANDOVER_MSG", "담당 데이터는 「인계 대기」로 남았습니다");
        releaseClaimsQuietly(userId);
        return out;
    }

    private void releaseClaimsQuietly(String userId) {
        UserOwnershipClient client = ownershipClient.getIfAvailable();
        if (client == null) return;
        try {
            client.releaseClaims(userId);
        } catch (UserOwnershipClient.UnavailableException ex) {
            // ERD 점유는 만료 시각(EXPIRES_AT)에 저절로 풀린다
            log.warn("[UserLifecycleCore] ERD 점유 해제 실패(만료 시각에 풀린다) — user={} : {}", userId, ex.getMessage());
        }
    }

    static List<Map<String, Object>> toRows(List<UserOwnershipClient.Owned> items) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (items == null) return rows;
        for (UserOwnershipClient.Owned o : items) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("USER_ID", o.userId());
            r.put("KIND", o.kind());
            r.put("KIND_NM", o.kindNm());
            r.put("CNT", o.cnt());
            r.put("SKIPPED", o.skipped() ? "Y" : "N");
            rows.add(r);
        }
        return rows;
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    private void requireNotSelf(String userId) {
        String me = sysadminGuard.currentUserId();
        if (me != null && me.equalsIgnoreCase(userId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, SysadminGuard.SELF_LOCKOUT + ": " + SELF_MSG);
        }
    }

    private static void verifySysadmin(SysadminGuard.Check check) {
        check.verify(SysadminGuard.LAST_SYSADMIN, "마지막 시스템관리자는 비활성화하거나 퇴직 처리할 수 없습니다. 다른 시스템관리자를 먼저 지정하세요",
                SysadminGuard.SELF_LOCKOUT, SELF_MSG);
    }

    private static String suffix(String s) {
        return s == null || s.isBlank() ? "" : ": " + s.trim();
    }

    private static String nz(String s, String dflt) {
        return s == null || s.isBlank() ? dflt : s.trim();
    }
}
