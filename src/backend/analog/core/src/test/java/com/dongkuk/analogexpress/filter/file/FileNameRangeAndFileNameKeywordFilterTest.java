package com.dongkuk.analogexpress.filter.file;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;

/**
 * @author Jeongjin Kim
 * @since 2020-08-20
 */
class FileNameRangeAndFileNameKeywordFilterTest {
    @Test
    public void acceptWhenThreadFileThenTrue() {
        FileNameRangeAndFileNameKeywordFilter fileNameRangeAndFileNameKeywordFilter =
                new FileNameRangeAndFileNameKeywordFilter("mpr_app_20200101_16", "mpr_app_20200812_16", "THR");
        boolean accept = fileNameRangeAndFileNameKeywordFilter.accept(new File("src/test/resources/logs/mpr_app_20200811_16_D03A1_THR_230.log"));
        Assertions.assertTrue(accept);
    }

    @Test
    public void acceptWhenNoThreadFileThenFalse() {
        FileNameRangeAndFileNameKeywordFilter fileNameRangeAndFileNameKeywordFilter =
                new FileNameRangeAndFileNameKeywordFilter("mpr_app_20200101_16", "mpr_app_20200812_16", "THR");
        boolean accept = fileNameRangeAndFileNameKeywordFilter.accept(new File("src/test/resources/logs/mpr_app_20200811_16"));
        Assertions.assertFalse(accept);
    }
}