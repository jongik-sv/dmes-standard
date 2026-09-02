package com.dongkuk.analogexpress.searcher;


import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class SearchResult {
    private final File file;
    private final List<String> result = new ArrayList<>();
    private boolean finished = false;
    private long size = 0;

    public SearchResult(File file) {
        this.file = file;
    }

    public File getFile() {
        return file;
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
    }

    public void addResultLine(String line) {
        this.result.add(line);
    }

    public List<String> getResult() {
        return result;
    }

    public long getSize() {
        return size;
    }

    public String getResultAsString(long limitSize) {
        long lineSize;
        StringBuilder str = new StringBuilder();
        for (String s : result) {
            lineSize = s.getBytes().length;
            if (limitSize > size + lineSize) {
                str.append(s).append(System.lineSeparator());
                size = size + lineSize;
            } else {
                size = size + lineSize;
                str.append("++++++++++++++ Size Limited ++++++++++++++").append(System.lineSeparator());
                break;
            }
        }
        return str.toString();
    }

}
