package com.dongkuk.analogexpress.postprocessing;

public class ServiceDefinition {
    String serviceName;
    String serviceTag;
    String startTime;
    String endTime;
    int runTime;
    String action;

    boolean isError;

    public void setRunTime(int runTime) {
        this.runTime = runTime;
    }

    public void setIsError(boolean isError) {
        this.isError = isError;
    }
    public int getRunTime() {
        return runTime;
    }

    public boolean isError() {
        return isError;
    }

    public ServiceDefinition(String serviceName, String serviceTag, String startTime, String endTime) {
        this.serviceName = serviceName;
        this.serviceTag = serviceTag;
        this.startTime = startTime;
        this.endTime = endTime;
        this.runTime = 0;
        this.isError = false;
    }

    public void setEndTime(String endTime) {
        this.endTime = endTime;
    }

    public void setStartTime(String startTime) {
        this.startTime = startTime;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public String getServiceName() {
        return serviceName;
    }

    public String getServiceTag() {
        return serviceTag;
    }

    public String getStartTime() {
        return startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }
}
