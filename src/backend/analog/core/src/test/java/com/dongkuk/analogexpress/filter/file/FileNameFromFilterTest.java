package com.dongkuk.analogexpress.filter.file;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;

class FileNameFromFilterTest {
    @Test
    public void fileLoadTest() {
        FileNameFromFilter f = new FileNameFromFilter("mpr_app_20200730_13");
        boolean accept = f.accept(new File("src/test/resources/logs/mpr_app.log"));
        Assertions.assertFalse(accept);
    }

}