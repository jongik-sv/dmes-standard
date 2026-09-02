package com.dongkuk.oasis.executors;

/**
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
final class ElementLoggerParam {
    private final String taskId;
    private final String taskName;

    /**
     * @param taskId   태스크 식별자
     * @param taskName 태스크 이름
     */
    public ElementLoggerParam(String taskId, String taskName) {
        this.taskId = taskId;
        this.taskName = taskName;
    }

    /**
     * @return 태스트 식별자
     */
    public String getTaskId() {
        return taskId;
    }

    /**
     * @return 태스크 이름
     */
    public String getTaskName() {
        return taskName;
    }
}
