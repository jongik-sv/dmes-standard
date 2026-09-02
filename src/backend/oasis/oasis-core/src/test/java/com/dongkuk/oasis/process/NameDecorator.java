package com.dongkuk.oasis.process;

/**
 * @author Jeongjin Kim
 * @since 2021-06-28
 */
public class NameDecorator {
    public String deco(String name) {
        String s = name + " kim";
        System.out.println(s);
        return s;
    }

    public String decoFullName(String firstName, String lastName) {
        String s = firstName + lastName;
        System.out.println(s);
        return s;
    }
}
