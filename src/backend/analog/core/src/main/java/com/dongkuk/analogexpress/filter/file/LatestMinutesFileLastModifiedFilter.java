package com.dongkuk.analogexpress.filter.file;

import java.time.LocalDateTime;

public class LatestMinutesFileLastModifiedFilter extends FileLastModifiedFilter {
    public LatestMinutesFileLastModifiedFilter(int minutes) {
        super(LocalDateTime.now().minusMinutes(minutes), LocalDateTime.now());
    }
}
