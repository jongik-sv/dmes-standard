package com.dongkuk.analog.scanner;

import lombok.Data;

@Data
public class LogData {
    private Boolean conStr; // contiguous String
    private String time;
    private String level;
    private String thread;
    private String serviceTag;
    private String logger;
    private String message;
    private boolean eoq;

    @Override
    public String toString() {
        return "com.analog.oasis.analogforoasis4.scanner.LogData{" +
                "time='" + time + '\'' +
                ", level='" + level + '\'' +
                ", serviceTag='" + serviceTag + '\'' +
                ", logger='" + logger + '\'' +
                ", message='" + message + '\'' +
                '}';
    }
}
