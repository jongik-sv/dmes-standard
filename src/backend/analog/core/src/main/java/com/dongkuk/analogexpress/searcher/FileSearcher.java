package com.dongkuk.analogexpress.searcher;

import java.io.File;
import java.io.FileFilter;
import java.util.Arrays;
import java.util.Comparator;

/**
 * 요청한 조건에 맞는 파일을 찾는 놈
 */
public class FileSearcher {
    /**
     * 찾은 파일이 없으면 길이가 0인 File 배열 반환
     *
     * @param baseDirectory 파일을 찾을 Base 디렉터리
     * @param limitByte     파일크기 제한. 무조건 파일 1개는 조건에 상관없음
     * @param fileFilter    파일 필터
     * @return 조건에 맞는 파일 배열
     */
    public static File[] findFile(String baseDirectory, long limitByte, FileFilter fileFilter, Comparator<File> sort) {
        File dir = new File(baseDirectory);
        File[] files = dir.listFiles(fileFilter);

        if (files == null)
            return new File[]{};
        if (sort != null)
            Arrays.sort(files, sort);

        long accFileLength = 0;

        // 무조건 한개는 대상이 됨
        for (int i = 0; i < files.length; i++) {
            accFileLength += files[i].length();
            if (accFileLength >= limitByte) {
                if (i <= 1) {
                    return Arrays.copyOf(files, 1);
                } else {
                    return Arrays.copyOf(files, i);
                }
            }
        }
        return files;
    }

    public static File[] findFile(String baseDirectory, long limitByte, FileFilter fileFilter) {
        return findFile(baseDirectory, limitByte, fileFilter, null);
    }
}
