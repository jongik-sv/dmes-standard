package com.dongkuk.dmes.cactus.job;

import java.net.InetAddress;

/** 실행 기록 SERVER_NM — 설정값이 없으면 {@code 호스트이름:앱이름:pid}(100자까지). */
public final class JobServerName {

    private JobServerName() {}

    public static String resolve(String configured, String appName) {
        String name;
        if (configured != null && !configured.isBlank()) {
            name = configured.trim();
        } else {
            String host;
            try {
                host = InetAddress.getLocalHost().getHostName();
            } catch (Exception e) {
                host = "unknown";
            }
            name = host + ":" + (appName == null || appName.isBlank() ? "app" : appName) + ":" + ProcessHandle.current().pid();
        }
        return name.length() > 100 ? name.substring(0, 100) : name;
    }
}
