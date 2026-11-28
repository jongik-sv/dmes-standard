/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: ERP 인사 정보 한 건 처리 — 사번으로 계정을 맞춰 휴직·복직·퇴직·부서 이동·이름 변경을 상태 처리로 넘긴다(D8)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import com.dongkuk.dmes.mcm.entity.SecHrEvt;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecHrEvtRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import com.dongkuk.dmes.mcm.security.account.AccountStatusCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 인사 정보 한 건 = 트랜잭션 한 건(REQUIRES_NEW). 한 사람이 실패해도 다른 사람은 처리한다(연동 규칙 「실패해도 멈추지 않게」).
 *
 * <p>연동 규칙(시안 「ERP 인사 시스템 연동」):
 * <ul>
 *   <li>맞추는 키 = 사번(USER_EMP_NO). 사번 계정이 없거나 둘 이상이면 처리하지 않고 FAIL</li>
 *   <li>외부 구분(IN_OUT_EMP_TP='O') 계정은 건드리지 않는다(SKIP) — 관리자가 관리한다(D13)</li>
 *   <li>퇴직은 인사가 이긴다 — 관리자가 살려 둔 계정도 퇴직 처리. 마지막 SYSADMIN 이면 HR_ST='RETIRED'(로그인만 막음)로 두고
 *       FAIL 로 남긴다. 다른 SYSADMIN 이 지정된 뒤 다시 처리하면 역할 회수까지 한다(D15)</li>
 *   <li>같은 정보를 두 번 받아도 결과가 같다 — 이미 같은 상태면 SKIP</li>
 *   <li>입사는 계정을 자동으로 만들지 않는다 — 계정이 없으면 HOLD(계정 생성 대기, D12). 있으면 HR_ST='ACTIVE' 로 잇는다</li>
 * </ul>
 */
@Component("hrEventProcessor")
public class HrEventProcessor {

    private static final Logger log = LoggerFactory.getLogger(HrEventProcessor.class);
    static final int MSG_MAX = 500;

    private final SecHrEvtRepository hrEvtRepository;
    private final SecUserRepository secUserRepository;
    private final UserLifecycleCore core;
    private final CommUserMngHisWriter hisWriter;
    private final SysadminGuard sysadminGuard;
    private final AccountStatusCache accountStatusCache;

    HrEventProcessor(SecHrEvtRepository hrEvtRepository,
                     SecUserRepository secUserRepository,
                     UserLifecycleCore core,
                     CommUserMngHisWriter hisWriter,
                     SysadminGuard sysadminGuard,
                     AccountStatusCache accountStatusCache) {
        this.hrEvtRepository = hrEvtRepository;
        this.secUserRepository = secUserRepository;
        this.core = core;
        this.hisWriter = hisWriter;
        this.sysadminGuard = sysadminGuard;
        this.accountStatusCache = accountStatusCache;
    }

    /**
     * 한 건 처리. 결과 상태(DONE·SKIP·FAIL·HOLD·WAIT)를 돌려준다.
     * 처리 중 예외가 나면 이 트랜잭션은 통째로 되돌린다(중간 쓰기가 남지 않게) — 부르는 쪽이 {@link #markFailed} 로 실패를 적는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String processOne(String evtId) {
        SecHrEvt e = hrEvtRepository.findById(evtId).orElse(null);
        if (e == null) return null;
        Result r = handle(e);
        e.setTryCnt((e.getTryCnt() == null ? 0 : e.getTryCnt()) + 1);
        e.setProcAt(LocalDateTime.now());
        e.setProcSt(r.st);
        e.setProcMsg(clip(r.msg));
        hrEvtRepository.save(e);
        return e.getProcSt();
    }

    /** 처리 실패를 따로 적는다(앞 트랜잭션은 되돌려졌다). */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(String evtId, String message) {
        SecHrEvt e = hrEvtRepository.findById(evtId).orElse(null);
        if (e == null) return;
        e.setTryCnt((e.getTryCnt() == null ? 0 : e.getTryCnt()) + 1);
        e.setProcAt(LocalDateTime.now());
        e.setProcSt(SecHrEvt.ST_FAIL);
        e.setProcMsg(clip(message));
        hrEvtRepository.save(e);
        log.warn("[HrEventProcessor] 처리 실패 — evt={} : {}", evtId, message);
    }

    private record Result(String st, String msg) {}

    private Result handle(SecHrEvt e) {
        // 발령일 전이면 기다린다(퇴직일에 퇴직 처리)
        if (e.getEvtDt() != null && e.getEvtDt().compareTo(CommUserMngHisWriter.today()) > 0) {
            return new Result(SecHrEvt.ST_WAIT, "발령일(" + e.getEvtDt() + ") 전이라 기다립니다");
        }
        List<SecUser> users = secUserRepository.findByUserEmpNo(e.getEmpNo());
        if (users.size() > 1) {
            return new Result(SecHrEvt.ST_FAIL, "같은 사번을 쓰는 계정이 " + users.size() + "개입니다");
        }
        if (users.isEmpty()) {
            if (SecHrEvt.TP_HIRE.equals(e.getEvtTp())) {
                return new Result(SecHrEvt.ST_HOLD, "계정 생성 대기 — 관리자가 사용자 아이디를 정해 만듭니다");
            }
            return new Result(SecHrEvt.ST_FAIL, "사번에 맞는 계정이 없습니다");
        }
        SecUser u = users.get(0);
        e.setUserId(u.getUserId());
        if ("O".equals(u.getInOutEmpTp())) {
            return new Result(SecHrEvt.ST_SKIP, "외부(수동 관리) 계정이라 건드리지 않습니다");
        }
        String desc = e.getOrderNo() == null ? null : "발령 " + e.getOrderNo();
        return switch (e.getEvtTp()) {
            case SecHrEvt.TP_HIRE -> hire(u);
            case SecHrEvt.TP_LEAVE -> core.hrLeave(u, desc)
                    ? new Result(SecHrEvt.ST_DONE, "휴직 — 비활성")
                    : new Result(SecHrEvt.ST_SKIP, "이미 휴직·퇴직 상태입니다");
            case SecHrEvt.TP_RETURN -> core.hrReturn(u, desc)
                    ? new Result(SecHrEvt.ST_DONE, "N".equals(u.getUseTp()) ? "복직 — 관리자 비활성은 남음" : "복직 — 활성")
                    : new Result(SecHrEvt.ST_SKIP, "인사 휴직 상태가 아닙니다");
            case SecHrEvt.TP_RETIRE -> retire(u, desc);
            case SecHrEvt.TP_MOVE -> move(u, e);
            case SecHrEvt.TP_INFO -> info(u, e);
            default -> new Result(SecHrEvt.ST_FAIL, "모르는 인사 구분: " + e.getEvtTp());
        };
    }

    private Result hire(SecUser u) {
        if (AccountState.HR_ACTIVE.equals(u.getHrSt())) {
            return new Result(SecHrEvt.ST_SKIP, "이미 인사 재직으로 이어진 계정입니다");
        }
        u.setHrSt(AccountState.HR_ACTIVE);
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_UPDATE, CommUserMngHisWriter.CASE_HR, u.getUserNm(),
                UserLifecycleCore.HR_PREFIX + " 입사 — 있는 계정과 이음");
        accountStatusCache.invalidate(u.getUserId());
        return new Result(SecHrEvt.ST_DONE, "있는 계정을 인사 재직으로 이었습니다");
    }

    private Result retire(SecUser u, String desc) {
        if (AccountState.HR_RETIRED.equals(u.getHrSt()) && core.stateOf(u) == AccountState.RETIRED
                && !"Y".equals(u.getUseTp())) {
            return new Result(SecHrEvt.ST_SKIP, "이미 퇴직한 계정입니다");
        }
        // 마지막 SYSADMIN — 로그인만 막고 역할 회수는 다른 SYSADMIN 지정 뒤(D15)
        java.util.Set<String> holders = sysadminGuard.activeHolders();
        boolean lastSysadmin = holders.size() == 1 && holders.iterator().next().equalsIgnoreCase(u.getUserId());
        if (lastSysadmin) {
            if (!AccountState.HR_RETIRED.equals(u.getHrSt())) {
                u.setHrSt(AccountState.HR_RETIRED);
                secUserRepository.save(u);
                hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_RETIRE, CommUserMngHisWriter.CASE_HR,
                        u.getUserNm(), UserLifecycleCore.HR_PREFIX + " 퇴직 — 마지막 시스템관리자라 로그인만 막음");
                accountStatusCache.invalidate(u.getUserId());
            }
            return new Result(SecHrEvt.ST_FAIL,
                    "LAST_SYSADMIN: 마지막 시스템관리자라 로그인만 막았습니다. 다른 시스템관리자를 지정한 뒤 다시 처리하세요");
        }
        core.retire(u, desc, true, null);
        return new Result(SecHrEvt.ST_DONE, "퇴직 — 역할 회수, 담당 데이터는 인계 대기");
    }

    private Result move(SecUser u, SecHrEvt e) {
        if (e.getDeptCd() == null || e.getDeptCd().isBlank()) {
            return new Result(SecHrEvt.ST_FAIL, "부서 코드가 비어 있습니다");
        }
        if (Objects.equals(e.getDeptCd(), u.getDeptCd())) {
            return new Result(SecHrEvt.ST_SKIP, "이미 같은 부서입니다");
        }
        String before = u.getDeptCd();
        u.setDeptCd(e.getDeptCd());
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_UPDATE, CommUserMngHisWriter.CASE_HR, u.getUserNm(),
                UserLifecycleCore.HR_PREFIX + " 부서 이동: " + before + " → " + e.getDeptCd());
        // 역할그룹은 건드리지 않는다. 「부서가 바뀐 사람의 역할 확인」은 인사 연동 목록의 부서 이동 건으로 본다
        return new Result(SecHrEvt.ST_DONE, "부서 이동 " + before + " → " + e.getDeptCd() + " — 역할 확인 필요");
    }

    private Result info(SecUser u, SecHrEvt e) {
        boolean changed = false;
        if (e.getUserNm() != null && !e.getUserNm().equals(u.getUserNm())) { u.setUserNm(e.getUserNm()); changed = true; }
        if (e.getEmail() != null && !e.getEmail().equals(u.getEmail())) { u.setEmail(e.getEmail()); changed = true; }
        if (e.getTelNo() != null && !e.getTelNo().equals(u.getTelNo())) { u.setTelNo(e.getTelNo()); changed = true; }
        if (e.getMobileTelNo() != null && !e.getMobileTelNo().equals(u.getMobileTelNo())) {
            u.setMobileTelNo(e.getMobileTelNo());
            changed = true;
        }
        if (!changed) return new Result(SecHrEvt.ST_SKIP, "바뀐 값이 없습니다");
        secUserRepository.save(u);
        hisWriter.userHis(u.getUserId(), CommUserMngHisWriter.TP_UPDATE, CommUserMngHisWriter.CASE_HR, u.getUserNm(),
                UserLifecycleCore.HR_PREFIX + " 이름·연락처 변경");
        return new Result(SecHrEvt.ST_DONE, "이름·연락처를 인사 값으로 바꿨습니다");
    }

    private static String clip(String s) {
        if (s == null) return null;
        return s.length() <= MSG_MAX ? s : s.substring(0, MSG_MAX);
    }
}
