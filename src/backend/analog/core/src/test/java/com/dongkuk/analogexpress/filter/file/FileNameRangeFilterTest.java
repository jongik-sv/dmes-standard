package com.dongkuk.analogexpress.filter.file;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;

class FileNameRangeFilterTest {
    @Test
    public void filterSameName(){
        FileNameRangeFilter fileNameRangeFilter = new FileNameRangeFilter("mpr_app_20200730_10.log", "mpr_app_20200730_10.log");
        Assertions.assertTrue(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200730_10.log")));
    }
    @Test
    public void filterRangeFalse(){
        FileNameRangeFilter fileNameRangeFilter = new FileNameRangeFilter("mpr_app.log", "mpr_app_20200730_10.log");
        Assertions.assertFalse(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200730_11.log")));
    }
    @Test
    public void filterRangeReverseFalse(){
        FileNameRangeFilter fileNameRangeFilter = new FileNameRangeFilter("mpr_app_20200730_10.log", "mpr_app.log");
        Assertions.assertFalse(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200730_11.log")));
    }
    @Test
    public void filterRangeStartWithFileName(){
        FileNameRangeFilter fileNameRangeFilter = new FileNameRangeFilter("mpr_app_20200730", "mpr_app_20200730");
        Assertions.assertTrue(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200730_10.log")));
        Assertions.assertTrue(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200730_15.log")));
        Assertions.assertFalse(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app_20200803_14.log")));
        Assertions.assertFalse(fileNameRangeFilter.accept(new File("src/test/resources/logs/mpr_app.log")));
    }
}