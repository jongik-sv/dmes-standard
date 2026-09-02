package com.dongkuk.oasis.methodinvoker;

import java.util.List;

/**
 * 메서드 바인딩 실패 시 진단 정보를 제공하기 위한 컨텍스트 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2026-05-15
 */
public interface ContextDiagnosticsProvider {
    /**
     * 메서드 바인딩 컨텍스트 진단 정보를 사람이 읽을 수 있는 형태의 줄 단위 리스트로 반환한다.
     *
     * @return 진단 메시지 목록
     */
    List<String> describeMethodBindingContext();
}
