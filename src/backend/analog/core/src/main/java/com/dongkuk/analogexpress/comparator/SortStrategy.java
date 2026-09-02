package com.dongkuk.analogexpress.comparator;

import java.io.File;
import java.util.Comparator;

public class SortStrategy {
    public static final Comparator<File> ascendingSortByFileName = new AscendingSortByFileName();
    public static final Comparator<File> descendingSortByName = new DescendingSortByName();
    public static final Comparator<File> ascendingSortByLastModified = new AscendingSortByLastModified();
    public static final Comparator<File> descendingSortByLastModified = new DescendingSortByLastModified();

    public static class AscendingSortByFileName implements Comparator<File> {
        @Override
        public int compare(File o1, File o2) {
            // 같은 디렉토리에 같은 파일명이 있을 수 없다.
            // 그래서 0 리턴은 없음
            return o1.getName().compareTo(o2.getName()) > 0 ? 1 : -1;
        }
    }

    public static class DescendingSortByName implements Comparator<File> {
        @Override
        public int compare(File o1, File o2) {
            // 같은 디렉토리에 같은 파일명이 있을 수 없다.
            // 그래서 0 리턴은 없음
            return o1.getName().compareTo(o2.getName()) < 0 ? 1 : -1;
        }
    }

    public static class AscendingSortByLastModified implements Comparator<File> {

        @Override
        public int compare(File o1, File o2) {
            return o1.lastModified() > o2.lastModified() ? 1 : -1;
        }
    }

    public static class DescendingSortByLastModified implements Comparator<File> {
        @Override
        public int compare(File o1, File o2) {
            return o1.lastModified() < o2.lastModified() ? 1 : -1;
        }
    }
}
