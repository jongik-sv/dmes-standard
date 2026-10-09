package com.dongkuk.dmes.mcm.job.def;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.def.JobVar.Type;
import com.dongkuk.dmes.mcm.job.def.JobVars.RunFacts;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobVarsTest {

    private static RunFacts facts(String schedAt, String now, String prev) {
        return new RunFacts(LocalDateTime.parse(schedAt), LocalDateTime.parse(now), prev == null ? null : LocalDateTime.parse(prev), "mdm.sync", "MDM");
    }

    private static JobVar v(String name, Type type, String value) {
        return new JobVar(name, type, value, "");
    }

    @Test
    @DisplayName("날짜 변수는 SCHED_AT 기준 — 자정 작업이 23:59:30 에 선점돼도 :today 는 예정 날짜, :now 만 선점 시각이다")
    void datesFollowSchedAt() {
        Map<String, Object> r = JobVars.resolve(List.of(
                v("today", Type.DATE, ":today"), v("yesterday", Type.DATE, ":yesterday"), v("now", Type.DATE, ":now"),
                v("sched", Type.DATE, ":schedAt")),
                facts("2026-10-09T00:00:00", "2026-10-08T23:59:30", null));
        assertThat(r.get("today")).isEqualTo("2026-10-09");
        assertThat(r.get("yesterday")).isEqualTo("2026-10-08");
        assertThat(r.get("now")).isEqualTo("2026-10-08T23:59:30");
        assertThat(r.get("sched")).isEqualTo("2026-10-09T00:00:00");
    }

    @Test
    @DisplayName("날짜 실행 변수는 형 STRING 이면 yyyyMMdd, 형 DATE 면 yyyy-MM-dd — 시각 값은 형과 상관없이 ISO")
    void dateVarsByType() {
        List<JobVar> vars = List.of(
                v("s1", Type.STRING, ":today"), v("s2", Type.STRING, ":yesterday"), v("s3", Type.STRING, ":monthStart"),
                v("s4", Type.STRING, ":prevMonthStart"), v("s5", Type.STRING, ":bizDate"), v("s6", Type.STRING, ":bizYesterday"),
                v("d6", Type.DATE, ":bizYesterday"), v("t", Type.STRING, ":schedAt"), v("j", Type.STRING, ":jobId"));
        Map<String, Object> r = JobVars.resolve(vars, facts("2026-01-03T06:59:00", "2026-01-03T06:59:00", null));
        assertThat(r.get("s1")).isEqualTo("20260103");
        assertThat(r.get("s2")).isEqualTo("20260102");
        assertThat(r.get("s3")).isEqualTo("20260101");
        assertThat(r.get("s4")).isEqualTo("20251201");
        assertThat(r.get("s5")).isEqualTo("20260102");
        assertThat(r.get("s6")).isEqualTo("20260101");
        assertThat(r.get("d6")).isEqualTo("2026-01-01");
        assertThat(r.get("t")).isEqualTo("2026-01-03T06:59:00");
    }

    @Test
    @DisplayName(":monthStart·:prevMonthStart 는 예정 날짜의 달 기준")
    void monthStarts() {
        Map<String, Object> r = JobVars.resolve(List.of(v("a", Type.DATE, ":monthStart"), v("b", Type.DATE, ":prevMonthStart")),
                facts("2026-01-15T01:00:00", "2026-01-15T01:00:05", null));
        assertThat(r.get("a")).isEqualTo("2026-01-01");
        assertThat(r.get("b")).isEqualTo("2025-12-01");
    }

    @Test
    @DisplayName(":bizDate·:bizYesterday 는 예정 시각에서 7시간을 뺀 날짜 — 07시 경계")
    void bizDates() {
        List<JobVar> vars = List.of(v("a", Type.DATE, ":bizDate"), v("b", Type.DATE, ":bizYesterday"));
        Map<String, Object> before = JobVars.resolve(vars, facts("2026-10-09T06:59:59", "2026-10-09T06:59:59", null));
        assertThat(before.get("a")).isEqualTo("2026-10-08");
        assertThat(before.get("b")).isEqualTo("2026-10-07");
        Map<String, Object> at = JobVars.resolve(vars, facts("2026-10-09T07:00:00", "2026-10-09T07:00:00", null));
        assertThat(at.get("a")).isEqualTo("2026-10-09");
        assertThat(at.get("b")).isEqualTo("2026-10-08");
        Map<String, Object> after = JobVars.resolve(vars, facts("2026-10-09T07:01:00", "2026-10-09T07:01:00", null));
        assertThat(after.get("a")).isEqualTo("2026-10-09");
        assertThat(after.get("b")).isEqualTo("2026-10-08");
        // 공장의 전일 = 전기일 기준 전날(달력 전날이 아니다)
        Map<String, Object> jan3 = JobVars.resolve(vars, facts("2026-01-03T06:59:00", "2026-01-03T06:59:00", null));
        assertThat(jan3.get("a")).isEqualTo("2026-01-02");
        assertThat(jan3.get("b")).isEqualTo("2026-01-01");
        Map<String, Object> jan3At7 = JobVars.resolve(vars, facts("2026-01-03T07:00:00", "2026-01-03T07:00:00", null));
        assertThat(jan3At7.get("a")).isEqualTo("2026-01-03");
        assertThat(jan3At7.get("b")).isEqualTo("2026-01-02");
        Map<String, Object> newYear = JobVars.resolve(vars, facts("2026-01-01T06:59:00", "2026-01-01T06:59:00", null));
        assertThat(newYear.get("a")).isEqualTo("2025-12-31");
        assertThat(newYear.get("b")).isEqualTo("2025-12-30");
    }

    @Test
    @DisplayName(":prevRunAt 은 없으면 null, 있으면 시각 글자. :jobId·:moduleCd 는 사실값")
    void prevRunAtAndIds() {
        List<JobVar> vars = List.of(v("p", Type.DATE, ":prevRunAt"), v("j", Type.STRING, ":jobId"), v("m", Type.STRING, ":moduleCd"));
        assertThat(JobVars.resolve(vars, facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", null)).get("p")).isNull();
        Map<String, Object> r = JobVars.resolve(vars, facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", "2026-10-08T02:00:00"));
        assertThat(r.get("p")).isEqualTo("2026-10-08T02:00:00");
        assertThat(r.get("j")).isEqualTo("mdm.sync");
        assertThat(r.get("m")).isEqualTo("MDM");
        assertThat(JobVars.usesPrevRunAt(vars)).isTrue();
        assertThat(JobVars.usesPrevRunAt(List.of(v("x", Type.STRING, "고정")))).isFalse();
    }

    @Test
    @DisplayName("고정값 — NUMBER 는 BigDecimal, JSON 은 Map/List, STRING 은 그대로")
    void fixedValues() {
        Map<String, Object> r = JobVars.resolve(List.of(v("n", Type.NUMBER, "12.5"), v("j", Type.JSON, "{\"a\":[1,2]}"), v("s", Type.STRING, "abc"),
                v("d", Type.DATE, "2026-10-01")), facts("2026-10-09T02:00:00", "2026-10-09T02:00:00", null));
        assertThat(r.get("n")).isEqualTo(new BigDecimal("12.5"));
        assertThat(((Map<String, Object>) r.get("j"))).containsKey("a");
        assertThat(r.get("s")).isEqualTo("abc");
        assertThat(r.get("d")).isEqualTo("2026-10-01");
    }

    @Test
    @DisplayName("validate — 이름 규칙·중복·30개 상한·알 수 없는 :변수·형식 불일치")
    void validate() {
        assertThat(JobVars.validate(List.of(v("1abc", Type.STRING, "x")))).anyMatch(s -> s.contains("이름"));
        assertThat(JobVars.validate(List.of(v("a", Type.STRING, "x"), v("a", Type.STRING, "y")))).anyMatch(s -> s.contains("겹"));
        assertThat(JobVars.validate(List.of(v("sql", Type.STRING, "x")))).anyMatch(s -> s.contains("예약어"));
        assertThat(JobVars.validate(List.of(v("action", Type.STRING, "x")))).anyMatch(s -> s.contains("예약어"));
        assertThat(JobVars.validate(List.of(v("a", Type.DATE, ":unknown")))).anyMatch(s -> s.contains(":unknown"));
        assertThat(JobVars.validate(List.of(v("n", Type.NUMBER, "abc")))).anyMatch(s -> s.contains("숫자"));
        assertThat(JobVars.validate(List.of(v("d", Type.DATE, "2026/10/01")))).anyMatch(s -> s.contains("날짜"));
        assertThat(JobVars.validate(List.of(v("j", Type.JSON, "{bad")))).anyMatch(s -> s.contains("JSON"));
        assertThat(JobVars.validate(java.util.stream.IntStream.range(0, 31).mapToObj(i -> v("v" + i, Type.STRING, "x")).toList()))
                .anyMatch(s -> s.contains("30"));
        assertThat(JobVars.validate(List.of(v("ok", Type.DATE, ":today"), v("n", Type.NUMBER, "1")))).isEmpty();
    }

    @Test
    @DisplayName("parse(toJson(x)) 왕복, null·빈 글자는 빈 목록, typesOf")
    void roundTrip() {
        List<JobVar> vars = List.of(new JobVar("baseDt", Type.DATE, ":yesterday", "기준일"), v("n", Type.NUMBER, "3"));
        assertThat(JobVars.parse(JobVars.toJson(vars))).isEqualTo(vars);
        assertThat(JobVars.parse(null)).isEmpty();
        assertThat(JobVars.parse("  ")).isEmpty();
        assertThat(JobVars.typesOf(vars)).containsEntry("baseDt", "DATE").containsEntry("n", "NUMBER");
    }
}
