package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.SortStrategy;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.Arrays;
import java.util.List;

class FileSearcherTest {
    private final String baseDir = "src/test/resources/logs";

    @Test
    public void given1MBLimitThenReturn6files() {
        File[] file1 =
                FileSearcher.findFile(baseDir, 1 * 1024 * 1024, file -> file.getName().startsWith("mpr"), SortStrategy.ascendingSortByFileName);

        Assertions.assertEquals(6, file1.length);
    }
    @Test
    public void given3MBLimitThenReturn7files() {
        File[] file1 =
                FileSearcher.findFile(baseDir, 3 * 1024 * 1024, file -> file.getName().startsWith("mpr"), SortStrategy.ascendingSortByFileName);
        long acc = 0;
        for (File file : file1) {
            acc += file.length();
            System.out.println(file.getName() + ":" + file.length() + ":" + acc);
        }
        Assertions.assertEquals(7, file1.length);
    }

    @Test
    public void given0MBLimitThenReturn1file() {
        File[] file1 =
                FileSearcher.findFile(baseDir, 0 * 1024 * 1024, file -> file.getName().startsWith("mpr"), SortStrategy.ascendingSortByFileName);

        Assertions.assertEquals(1, file1.length);
        Assertions.assertEquals("mpr_app.log", file1[0].getName());
    }

    @Test
    public void givenCurrentFileItShouldBeLast() {
        File[] file1 =
                FileSearcher.findFile(baseDir, 10 * 1024 * 1024, file -> true, SortStrategy.ascendingSortByFileName);

        for (File file : file1) {
            System.out.println(file.getName());
        }

    }

    @Test
    public void getExtension() {
        String g = "ffflog";
        int i = g.lastIndexOf(".");
        String substring = g.substring(0, g.length() - i - 1);
        System.out.println(substring);
    }

    @Test
    public void fileContains(){
        File[] file1 =
                FileSearcher.findFile(baseDir, 10000 * 1024 * 1024, file -> true, SortStrategy.ascendingSortByFileName);
        List<File> files = Arrays.asList(file1);
        for (File file : files) {
            System.out.println(file.getName());
        }
        File file = new File(baseDir + "/mpr_app.log");
        System.out.println(files.contains(file));


    }
}