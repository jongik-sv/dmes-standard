package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.io.LimitedFileInputStream;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;

class LimitedFileInputStreamTest {
    @Test
    public void readWithLimit() throws IOException {
        File srcFile = new File("src/test/resources/logs/tiny.log");

        LimitedFileInputStream is = new LimitedFileInputStream(srcFile, 3);
        int count = 0;
        int data;
        while ((data = is.read()) > 0) {
            count++;
            System.out.print(data);
        }

        Assertions.assertEquals(3, count);
    }

    @Test
    public void readArrayWithLimit() throws IOException {
        File srcFile = new File("src/test/resources/logs/tiny.log");

        LimitedFileInputStream is = new LimitedFileInputStream(srcFile, 3);
        int count = 0;
        int data;
        byte[] bytes = new byte[5];
        int read = is.read(bytes);
        for (byte aByte : bytes) {
            System.out.print(aByte);
        }
        Assertions.assertEquals(3, read);
    }

    @Test
    public void readArrayOffsetWithLimit() throws IOException {
        File srcFile = new File("src/test/resources/logs/tiny.log");

        LimitedFileInputStream is = new LimitedFileInputStream(srcFile, 3);
        int count = 0;
        int data;
        byte[] bytes = new byte[5];
        int read = is.read(bytes, 1, 5);
        for (byte aByte : bytes) {
            System.out.print(aByte);
        }
        Assertions.assertEquals(3, read);
    }

    @Test
    public void readArrayOffsetWithLimitLoop() throws IOException {
        File srcFile = new File("src/test/resources/logs/tiny.log");

        LimitedFileInputStream is = new LimitedFileInputStream(srcFile, 3);
        int count = 0;
        int data;

        byte[] bytes = new byte[2];
        int read;
        while ((read = is.read(bytes, 0, 2)) > 0) {
            for (byte aByte : bytes) {
                System.out.print(aByte);
            }
            bytes = new byte[2];
        }
//        Assertions.assertEquals(3, read);
    }
}