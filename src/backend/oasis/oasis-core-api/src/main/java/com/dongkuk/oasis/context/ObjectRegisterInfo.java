package com.dongkuk.oasis.context;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public interface ObjectRegisterInfo {
    /**
     * @return 등록할 이름
     */
    String name();

    /**
     * @return 등록할 타입
     */
    Class<?> classType();

    /**
     * 등록한 오브젝트를 유지할 레벨.
     * <p>
     * PROCESS 레벨이면 프로세스 내에서만 유지된다.
     * SERVICE 레벨이면 단일 서비스 요청 내에서만 유지된다. 이 경우 프로세스 내에서 만든 개체를 다른 프로세스도 참조 가능하게 된다.
     *
     * @return 오브젝트 유지 레벨
     */
    ObjectSustainLevel sustainLevel();
}
