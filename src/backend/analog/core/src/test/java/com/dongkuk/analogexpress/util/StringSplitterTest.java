package com.dongkuk.analogexpress.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

class StringSplitterTest {
    @Test
    public void testSplitString() {
        String input1 = "Hello World \"This is a test\" Java Programming";
        String[] expected1 = {"Hello", "World", "This is a test", "Java", "Programming"};

        String input2 = "A \"B C\" D E";
        String[] expected2 = {"A", "B C", "D", "E"};

        String input3 = "NoQuotes Here";
        String[] expected3 = {"NoQuotes", "Here"};

        String input4 = "";
        String[] expected4 = {};

        String[] result1 = StringSplitter.splitString(input1);
        String[] result2 = StringSplitter.splitString(input2);
        String[] result3 = StringSplitter.splitString(input3);
        String[] result4 = StringSplitter.splitString(input4);

        assertArrayEquals(expected1, result1);
        assertArrayEquals(expected2, result2);
        assertArrayEquals(expected3, result3);
        assertArrayEquals(expected4, result4);
    }

}