/*
 * 내용: commUserMng pwdinit 의 SSO 일괄 초기화 분기(SSO_RESET_FLAG="Y").
 *       BPMN 진입점은 퍼사드 {@link CommUserMngService#pwdinit}(빈 commUserMngService).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commUserMng SSO 비밀번호 일괄 초기화 — As-Is PasswordInit.java 의 SSO 분기(updateCommonSSOPwdInit).
 *
 * <p>BPMN 이 직접 부르지 않는다. {@link CommUserMngService#pwdinit} 퍼사드가 SSO_RESET_FLAG="Y" 일 때 위임한다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 단위로 감싸므로
 * 도중 실패하면 전체가 롤백된다.
 */
@Service("commUserMngSsoService")
public class CommUserMngSsoService {

    private final SecUserPwdRepository secUserPwdRepository;
    private final CommUserMngPwdWriter pwdWriter;

    CommUserMngSsoService(SecUserPwdRepository secUserPwdRepository,
                          CommUserMngPwdWriter pwdWriter) {
        this.secUserPwdRepository = secUserPwdRepository;
        this.pwdWriter = pwdWriter;
    }

    /**
     * SSO 전체 — master(ds_main) for-loop, 각 row 별 USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → updateCommonSSOPwdInit.
     * PWD 행이 없으면(UPDATE 0건) 신규 행을 upsert 한다. USER_ID 가 null·공백인 행과 null 행은 건너뛴다.
     *
     * <p>초기 비밀번호를 반환하지 않는다({@code cnt_save} 만). 대상이 그리드 전 행이라 평문 비밀번호를
     * 응답에 싣는 순간 프런트가 N건의 비밀번호를 화면에 펼쳐야 하고, 값 규칙(USER_ID+USER_EMP_NO)도
     * 사용자마다 달라 그대로 노출되면 DB 사본과 동등한 정보가 된다. 필요하면 별도 내려받기 화면을 연다.
     */
    public Map<String, Object> resetSsoPwd(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String userId = strOf(row.get("USER_ID"));
                String userEmpNo = strOf(row.get("USER_EMP_NO"));
                if (userId == null || userId.isBlank()) continue;
                String ssoPwd = pwdWriter.encode(userId + (userEmpNo == null ? "" : userEmpNo));
                int affected = secUserPwdRepository.updateSsoPwd(userId, ssoPwd);
                if (affected == 0) {
                    // 행이 없으면 신규 PWD 행 upsert
                    pwdWriter.upsertUserPwd(userId, null, ssoPwd);
                }
                cnt++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }
}
