package com.dongkuk.dmes.cactus.job;

/** 결과를 쓰는 쪽 — 운영은 {@link JobRunResultWriter}, 시험은 기록용 가짜. */
public interface JobRunReporter {

    JobRunResultWriter.WriteResult write(JobRunReport report);
}
