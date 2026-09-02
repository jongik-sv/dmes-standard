package com.dongkuk.oasis.logger;

import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.utils.StringUtil;
import org.slf4j.MDC;

import static com.dongkuk.oasis.TraceConstants.REQUEST_TAG;

/**
 * @author Jeongjin Kim
 * @since 2021-12-15
 */
public abstract class MDCTemplate {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MDCTemplate.class);

    /**
     * 입력받은 요청 태그와 서비스 태그를 입력으로 받아 MDC에 저장하여 로그 추적에 도움을 준다.
     * <p>
     * Service Tag는 최초 생성시에 {@code null} 로 입력하면 랜덤 스트링을 생성하여 MDC에 저장한다. 파라미터에 입력을 하면
     * 기존에 있는 service tag 에 새로운 랜덤 스트링을 생성하여 붙여서 넣어준다.
     *
     * @param serviceTag 서비스 태그
     */
    public void mdc(String serviceTag) {
        if (serviceTag == null) {
            MDC.put(TraceConstants.SERVICE_TAG,
                    StringUtil.generateRandomString(4));
        } else {
            MDC.put(TraceConstants.SERVICE_TAG,
                    serviceTag + ":" + StringUtil.generateRandomString(4));
        }

        try {
            process();
        } finally {
            MDC.clear();
        }
    }

    /**
     * 프로세스.
     */
    public abstract void process();
}
