package com.dongkuk.oasis.service;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

@SuppressWarnings("unused")
public class PlainClass {
    @SuppressFBWarnings("URF_UNREAD_FIELD")
    static class Temp {
        private String className;

    }

    public Temp domainClass() {
        Temp temp = new Temp();
        temp.className = "ClassName";
        return temp;
    }
}
