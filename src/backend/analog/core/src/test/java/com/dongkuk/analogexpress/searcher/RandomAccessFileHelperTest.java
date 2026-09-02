package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.io.BufferedRandomAccessFile;
import com.dongkuk.analogexpress.io.DirectRandomAccessFile;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;

class RandomAccessFileHelperTest {
    @Test
    public void point() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny.log");
        try (RandomAccessibleLineReader file = new BufferedRandomAccessFile(file1, "r")) {
            long pointer;
            pointer= RandomAccessFileHelper.getCurrentLineStartPointer(3, file);
            Assertions.assertEquals(0,pointer);
//            pointer= RandomAccessFileHelper.getCurrentLineStartPointer(5, file);
//            Assertions.assertEquals(5,pointer);
        }

    }
}