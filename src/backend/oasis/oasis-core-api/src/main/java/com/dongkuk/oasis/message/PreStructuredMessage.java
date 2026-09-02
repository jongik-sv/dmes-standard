package com.dongkuk.oasis.message;

import java.util.List;

/**
 * 구조화 정보를 결합한 메시지를 대표한다.
 */
public interface PreStructuredMessage extends Message {
    /**
     * 구조화된 메지시를 반환한다.
     *
     * @return 구조화된 메시지
     */
    List<PreStructuredMessageElement> preStructuredMessageElements();
}
