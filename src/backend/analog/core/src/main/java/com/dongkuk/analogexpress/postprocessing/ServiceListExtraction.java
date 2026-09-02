package com.dongkuk.analogexpress.postprocessing;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ServiceListExtraction {

    private final Pattern logPattern;
    private final String startWithMatch;
    private final Pattern runTimePattern;
    private final String actionStartWithMatch;
    private final Pattern actionPattern;


    String test = "(?<time>20\\d\\d-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d\\d\\d) (?<thread>TH-\\S+) \\[(?<serviceTag>\\w{4}?)\\] \\[(?<service>\\S+)\\]\\[(?<logger>[\\w.-]+)\\] (?<level>\\S+)\\s+(?<message>.*)";
    public ServiceListExtraction(String logPattern, String startWithMatch, String runTimePattern, String actionStartWithMatch, String actionPattern) {
        if (startWithMatch == null || startWithMatch.isEmpty()) {
            throw new IllegalArgumentException("logPattern is null or empty");
        }
        if (logPattern == null || logPattern.isEmpty()) {
            throw new IllegalArgumentException("logPattern is null or empty");
        }
        if (runTimePattern == null || runTimePattern.isEmpty()) {
            throw new IllegalArgumentException("runTimePattern is null or empty");
        }
        this.startWithMatch = startWithMatch;
        this.logPattern = Pattern.compile(logPattern);
        this.runTimePattern = Pattern.compile(runTimePattern);

        if(actionStartWithMatch != null && actionPattern != null) {
            this.actionStartWithMatch = actionStartWithMatch;
            this.actionPattern = Pattern.compile(actionPattern);
        } else {
            this.actionStartWithMatch = null;
            this.actionPattern = null;
        }
    }

    public List<ServiceDefinition> extract(String largeStringResult) {
        BufferedReader reader = new BufferedReader(new StringReader(largeStringResult));
        Map<String, ServiceDefinition> serviceMap = new HashMap<>();
        List<ServiceDefinition> serviceList = new ArrayList<>();
        String line;
        Matcher m;
        Matcher m2;
        Matcher m3;
        while (true) {
            try {
                if ((line = reader.readLine()) == null) break;
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            m = logPattern.matcher(line);

            if (m.find()) {
                String time = m.group("time");
                String serviceTag = m.group("serviceTag");
                String serviceName = m.group("service");
                String level = m.group("level");
                String message = m.group("message");

                if (serviceTag.isEmpty()) continue;
                if (serviceMap.containsKey(serviceTag)) {
                    serviceMap.get(serviceTag).setEndTime(time);
                    if (serviceMap.get(serviceTag).getServiceName().isEmpty()) {
                        serviceMap.get(serviceTag).setServiceName(serviceName);
                    }
                    if(message.startsWith(startWithMatch)) {
                        m2 = runTimePattern.matcher(message);
                        if(m2.find()) {
                            String runTime = m2.group("runTime");
                            int runTimeInt = Integer.parseInt(runTime);
                            serviceMap.get(serviceTag).setRunTime(runTimeInt);
                        }
                    }


                } else {
                    ServiceDefinition service = new ServiceDefinition(serviceName, serviceTag, time, time);
                    serviceMap.put(serviceTag, service);
                    serviceList.add(service);
                }

                if(actionStartWithMatch != null && actionPattern != null && serviceMap.get(serviceTag).getAction() == null) {
                    m3 = actionPattern.matcher(message);
                    if(m3.find()) {
                        String action = m3.group("action");
                        serviceMap.get(serviceTag).setAction(action);
                    }
                }
                if(level.equals("ERROR")) serviceMap.get(serviceTag).setIsError(true);
            }
        }
        return serviceList;
    }
}
