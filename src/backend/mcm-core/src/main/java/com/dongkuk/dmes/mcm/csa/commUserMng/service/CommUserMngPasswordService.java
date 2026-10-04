/*
 * 내용: commUserMng pwdinit 의 단건 비밀번호 초기화 분기(SSO_RESET_FLAG≠"Y").
 *       BPMN 진입점은 퍼사드 {@link CommUserMngService#pwdinit}(빈 commUserMngService).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * commUserMng 단건 비밀번호 초기화 — As-Is PasswordInit.java 의 비-SSO 분기(mergeCommonPwdInit).
 *
 * <p>BPMN 이 직접 부르지 않는다. {@link CommUserMngService#pwdinit} 퍼사드가 SSO_RESET_FLAG 로 분기해 위임한다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 단위로 감싼다.
 */
@Service("commUserMngPasswordService")
public class CommUserMngPasswordService {

    private final CommUserMngPwdWriter pwdWriter;

    CommUserMngPasswordService(CommUserMngPwdWriter pwdWriter) {
        this.pwdWriter = pwdWriter;
    }

    /**
     * 단건 PWD 초기화 — request 의 USER_ID 우선.
     * USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD) + USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → mergeCommonPwdInit.
     *
     * <p><b>응답 (2026-09-28 신설)</b> — 성공 시 발급된 평문 초기 비밀번호를 {@code INIT_PWD} 로 함께 돌려준다.
     * As-Is {@code pwdtmp} 콜백이 하단 상태바에 "임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다" 를 보여주던 것을
     * (분석 §5.5 / 기능설계서 M-032) To-Be 화면 팝업 + 클립보드 복사로 대체하기 위한 것이다 — 초기 비밀번호가
     * bcrypt 해시로만 남으면 관리자가 사용자에게 전달할 값 자체를 알 수 없어 "초기화는 되는데 로그인할 수 없다" 가 된다.
     *
     * <p>보안 주의: {@code INIT_PWD} 는 <b>응답으로만</b> 나가고 로그에는 남기지 않는다. 값이 고정
     * 상수인 점은 {@link CommUserMngPwdWriter#DEFAULT_PASSWORD} 주석의 외부화 선행 과제(운영 적용 전 반드시 처리) 그대로다.
     *
     * <p>응답 키 순서: {@code cnt_save} → (성공 시) {@code INIT_PWD} → {@code INIT_PWD_USER_ID}.
     * USER_ID 가 null·공백(또는 request 가 null)이면 {@code cnt_save=0} 만 담는다.
     */
    public Map<String, Object> initPwd(CommUserMngPwdInitRequest request) {
        int cnt = 0;
        String initPwdUserId = null;
        String userId = request != null ? request.getUSER_ID() : null;
        String userEmpNo = request != null ? request.getUSER_EMP_NO() : null;
        if (userId != null && !userId.isBlank()) {
            pwdWriter.resetToInitial(userId, userEmpNo);
            cnt = 1;
            initPwdUserId = userId;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        if (initPwdUserId != null) {
            out.put("INIT_PWD", CommUserMngPwdWriter.DEFAULT_PASSWORD);
            out.put("INIT_PWD_USER_ID", initPwdUserId);
        }
        return out;
    }
}
