package com.dongkuk.analogexpress.parser;

import org.junit.jupiter.api.Test;

class ExtractToken {
    private final String baseDir = "src/test/resources/logs";

    @Test
    public void extractDateTime() {
        String text = "2023-01-03 13:00:10,092 TH-287 [HeatEafRsltReg][service.ServiceControllerImpl.start-61] INFO Service start - service name : [HeatLfRsltList], process name : [null], Start at [Tue Jan 03 13:00:10 KST 2023] ";

        for(int i = 0; i < 1000000; i ++) {
            if (text.startsWith("20")) {
                String logTime = text.substring(0, 23);
                System.out.println("logTime = |" + logTime + "|");
                String logThread = text.substring(24, 30);
                System.out.println("logThread = |" + logThread + "|");
                String s = text.substring(31);
                String serviceId = null;
                String caller = null;

                int indexFr = s.indexOf("[");
                int indexTo = s.indexOf("]");
                if (indexFr != -1 && indexTo != -1) {
                    serviceId = s.substring(indexFr + 1, indexTo);
                    System.out.println("serviceId = " + serviceId);
                }

                indexFr = s.indexOf("[", indexTo + 1);
                indexTo = s.indexOf("]", indexTo + 1);
                if (indexFr != -1 && indexTo != -1) {
                    caller = s.substring(indexFr + 1, indexTo);
                    System.out.println("caller = " + caller);
                }

            } else {
                System.out.println("notfound = " + text);
            }
        }
    }
}