/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng 계정 상태 action — unlock·suspend·resume·retire·handover·searchOwned (시안 「사용자 비활성화·퇴직 처리」)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.security.account.UserOwnershipClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 계정 상태 action 본문. BPMN 은 퍼사드 {@link CommUserMngService} 를 부른다. {@code @Transactional} 없음 —
 * OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 하나를 트랜잭션 하나로 감싼다.
 *
 * <p>응답은 모두 {@code cnt_save} 를 담는다. 오류는 업무 예외 메시지 「코드: 문구」 — 화면은 문구를 그대로 보여 준다.
 */
@Service("commUserMngLifecycleService")
public class CommUserMngLifecycleService {

    private final UserLifecycleCore core;
    private final ObjectProvider<UserOwnershipClient> ownershipClient;

    CommUserMngLifecycleService(UserLifecycleCore core, ObjectProvider<UserOwnershipClient> ownershipClient) {
        this.core = core;
        this.ownershipClient = ownershipClient;
    }

    /** 잠금 해제 — 비밀번호 유지, 실패 횟수 0. */
    public Map<String, Object> unlock(CommUserMngStateRequest request) {
        core.unlock(request == null ? null : request.getUSER_ID());
        return saved(1);
    }

    /** 관리자 비활성 — 역할·담당 데이터 유지, 세션 끊기. 사유 필수. */
    public Map<String, Object> suspend(CommUserMngStateRequest request) {
        String reason = request == null ? null : request.getREASON();
        if (reason == null || reason.isBlank()) {
            throw new com.dongkuk.dmes.mcm.common.exception.BusinessException(
                    com.dongkuk.dmes.mcm.common.exception.ErrorCode.REQUIRED_VALUE, "비활성 사유를 고르세요");
        }
        core.suspend(request.getUSER_ID(), reason);
        return saved(1);
    }

    /** 다시 사용 — 관리자 비활성만 푼다. 인사 휴직이 남아 있으면 {@code HR_LEAVE_REMAINS=Y}. */
    public Map<String, Object> resume(CommUserMngStateRequest request) {
        boolean hrLeave = core.resume(request == null ? null : request.getUSER_ID());
        Map<String, Object> out = saved(1);
        out.put("HR_LEAVE_REMAINS", hrLeave ? "Y" : "N");
        return out;
    }

    /** 퇴직 처리 — 받을 사람(TO_USER_ID)이 있으면 MDM 담당 데이터를 넘긴다. 사유 필수. */
    public Map<String, Object> retire(CommUserMngStateRequest request) {
        String reason = request == null ? null : request.getREASON();
        if (reason == null || reason.isBlank()) {
            throw new com.dongkuk.dmes.mcm.common.exception.BusinessException(
                    com.dongkuk.dmes.mcm.common.exception.ErrorCode.REQUIRED_VALUE, "퇴직 사유를 고르세요");
        }
        SecUser u = core.require(request.getUSER_ID());
        Map<String, Object> out = saved(1);
        out.putAll(core.retire(u, reason, false, request.getTO_USER_ID()));
        return out;
    }

    /** 나중에 인계 — 퇴직자가 담당인 MDM 데이터를 받을 사람에게 넘긴다. */
    public Map<String, Object> handover(CommUserMngStateRequest request) {
        if (request == null || request.getTO_USER_ID() == null || request.getTO_USER_ID().isBlank()) {
            throw new com.dongkuk.dmes.mcm.common.exception.BusinessException(
                    com.dongkuk.dmes.mcm.common.exception.ErrorCode.REQUIRED_VALUE, "받을 사람을 고르세요");
        }
        Map<String, Object> out = saved(1);
        out.putAll(core.handover(request.getUSER_ID(), request.getTO_USER_ID()));
        return out;
    }

    /**
     * 한 사람의 담당 데이터(MDM) — {@code ds_owned}(KIND·KIND_NM·CNT). MDM 에 닿지 못하면 빈 목록과
     * {@code OWNED_ERROR} 문구.
     */
    public Map<String, Object> searchOwned(CommUserMngStateRequest request) {
        SecUser u = core.require(request == null ? null : request.getUSER_ID());
        Map<String, Object> out = new LinkedHashMap<>();
        UserOwnershipClient client = ownershipClient.getIfAvailable();
        if (client == null) {
            out.put("ds_owned", List.of());
            out.put("OWNED_ERROR", "MDM 연결 설정이 없습니다");
            return out;
        }
        try {
            out.put("ds_owned", UserLifecycleCore.toRows(client.summary(
                    List.of(new UserOwnershipClient.Person(u.getUserId(), u.getUserEmpNo())))));
        } catch (UserOwnershipClient.UnavailableException ex) {
            out.put("ds_owned", List.of());
            out.put("OWNED_ERROR", "MDM 담당 데이터를 읽지 못했습니다");
        }
        return out;
    }

    private static Map<String, Object> saved(int n) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", n);
        return out;
    }
}
