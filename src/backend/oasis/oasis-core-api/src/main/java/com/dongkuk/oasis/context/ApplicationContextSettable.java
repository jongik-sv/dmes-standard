package com.dongkuk.oasis.context;

/**
 * 애플리케이션 컨텍스트를 설정할 수 있는 기능을 제공한다.
 * See, {@link DefaultServiceContext}
 *
 * @author Jeongjin Kim
 * @since 2021-06-03
 */
public interface ApplicationContextSettable {
    /**
     * @param applicationContext application context
     */
    void setApplicationContext(ApplicationContext applicationContext);
}
