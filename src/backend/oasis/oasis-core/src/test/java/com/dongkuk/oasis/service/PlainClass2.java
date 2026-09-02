package com.dongkuk.oasis.service;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

@SuppressWarnings("unused")
public class PlainClass2 {
    @SuppressFBWarnings("URF_UNREAD_FIELD")
    static class Temp {
        private String name;

    }

    public Temp domainClass() {
        Temp temp = new Temp();
        temp.name = "Jeongjin";
        return temp;
    }
}
