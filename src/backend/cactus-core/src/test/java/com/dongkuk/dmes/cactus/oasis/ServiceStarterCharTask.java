package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.oasis.exceptions.UserException;

/**
 * {@link OasisServiceStarterCharacterizationTest} 의 BPMN(cactus-starter-char/*.bpmn) 이 부르는 작업.
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
}
