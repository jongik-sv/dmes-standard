package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomTcSend;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * TB_MCM_MOM_TC_SEND JPA Repository — 재전송 이력 (Q-100 A 신설).
 *
 * <p>tcErrorList 는 RESEND_CNT 를 {@link MomTcErrorRepository#search} 의 native COUNT 서브쿼리로
 * 직접 집계하므로 본 Repository 를 조회에 사용하지 않는다. 적재(INSERT)는 TCErrorResendPop(P-001)
 * 재전송 화면에서 사용 예정(본 Repository 보유로 테이블 모델·후속 기능 연계).
 */
public interface MomTcSendRepository extends JpaRepository<MomTcSend, Long> {

    /** 특정 에러 로그(SQ_VAL)의 재전송 횟수. */
    long countByErrSqVal(Long errSqVal);
}
