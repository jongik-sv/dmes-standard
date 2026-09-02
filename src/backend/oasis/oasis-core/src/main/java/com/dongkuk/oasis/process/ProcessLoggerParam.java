package com.dongkuk.oasis.process;

/**
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
final class ProcessLoggerParam {
    private final String processId;
    private final String processName;

    /**
     * @param processId   프로세스 식별자
     * @param processName 프로세스 이름
     */
    public ProcessLoggerParam(String processId, String processName) {
        this.processId = processId;
        this.processName = processName;
    }

    /**
     * @return 프로세스 식별자
     */
    public String getProcessId() {
        return processId;
    }

    /**
     * @return 프로세스 이름
     */
    public String getProcessName() {
        return processName;
    }
}
