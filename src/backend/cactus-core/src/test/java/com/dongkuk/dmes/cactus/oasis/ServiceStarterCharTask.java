package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.oasis.exceptions.UserException;
import java.util.List;

/**
 * {@link OasisServiceStarterCharacterizationTest}·{@link CactusResponseConverterBusinessErrorsTest} 의 BPMN(cactus-starter-char/*.bpmn) 이 부르는 작업.
 * BPMN 의 {@code camunda:class} 가 이 클래스를 이름으로 찾아 새 인스턴스로 실행한다.
 */
public class ServiceStarterCharTask {

    /** 정상 종료 — 커밋 경로. */
    public String ok() {
        return "done";
    }

    /** 업무 예외 — USER_ERROR · 롤백 경로. */
    public void userError() {
        throw new UserException("업무 예외");
    }

    /** 일반 예외 — SYSTEM_ERROR · 롤백 경로. */
    public void systemError() {
        throw new IllegalStateException("시스템 예외");
    }

    /** 행 단위 상세가 있는 cactus 업무 예외 — SYSTEM_ERROR · 롤백 경로, 응답 errors[] 로 실린다(항목 8). */
    public void businessErrors() {
        throw new BusinessException(ErrorCode.INVALID_VALUE, "검증 실패", List.of(
                ErrorDetail.of("MDM001", "기본 문구"),
                ErrorDetail.ofGrid("master", "r1", "termName", "MDM005", "용어명이 비었습니다")));
    }
}
