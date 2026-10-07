package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service;

import com.dongkuk.dmes.mdm.common.segment.DataItemChecks;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemValue;
import com.dongkuk.dmes.mdm.common.segment.DataSavePath;
import com.dongkuk.dmes.mdm.common.segment.UpsertResult;
import com.dongkuk.dmes.mdm.common.segment.UpsertRow;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvRow;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvSaveResult;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvValidateRequest;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvValidateResult;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * CSV 업로드({@code dataCsvUploadPop}) OASIS 진입 서비스 — design.md B2. BPMN {@code services/dmd/dataCsvUploadPop.bpmn}
 * 의 분기와 1:1: validate(dryRun 검증, 읽기) → {@link #validate}, save(실제 저장, 쓰기) → {@link #save}.
 *
 * <p>새 검사 로직을 두지 않는다(I1) — 파싱만 이 클래스·{@link Rfc4180Csv} 몫이고, 검사 1~7·INSERT/UPDATE/NONE 판정·
 * 저장은 모두 {@link DataItemSaveCore#upsert} 로만 돈다. 파서 단계 오류(열 수 불일치·헤더 불일치·{@code seq} 정수 변환
 * 실패)가 있는 행은 코어를 부르지 않고 그 줄만 오류로 표시한다 — 파서 오류가 하나라도 있으면 그 CSV 전체가 저장
 * 대상에서 빠진다(오류 0건 전체 원칙, I2 와 동형).
 *
 * <p>{@code @Transactional} 을 붙이지 않는다(F11, {@link DataItemSaveCore} 가 자체 트랜잭션으로 돈다 — dataItemMng 선례).
 */
@Service("dataCsvUploadPopService")
public class DataCsvUploadPopService {

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern(MdmTemporalBinder.TEXT_PATTERN);

    private final DataItemSaveCore core;

    public DataCsvUploadPopService(DataItemSaveCore core) {
        this.core = core;
    }

    // ── action: validate ───────────────────────────────────────────────────

    /** dryRun 검증 — 아무것도 쓰지 않는다. 파서 오류가 있어도 예외를 던지지 않고 그 줄의 오류로 결과에 담는다. */
    public DataCsvValidateResult validate(DataCsvValidateRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        String csvText = request.getCsvText() == null ? "" : request.getCsvText();

        ParseOutcome outcome = toUpsertRows(Rfc4180Csv.parse(csvText));
        UpsertResult result = core.upsert(md, DataSavePath.CSV, null, outcome.rows(), true);

        List<DataCsvRow> all = new ArrayList<>(outcome.parserErrorRows());
        int insertCount = 0;
        int updateCount = 0;
        int noneCount = 0;
        for (int i = 0; i < outcome.rows().size(); i++) {
            UpsertResult.RowAction ra = result.rows().get(i);
            all.add(new DataCsvRow(outcome.lineNoOf().get(i), ra.code(), ra.action().name(), messages(ra.issues())));
            switch (ra.action()) {
                case INSERT -> insertCount++;
                case UPDATE -> updateCount++;
                case NONE -> noneCount++;
                default -> {
                    // CSV 는 CLOSE·REOPEN 을 만들지 않는다(I3) — 여기 오지 않는다.
                }
            }
        }
        all.sort(Comparator.comparingInt(DataCsvRow::lineNo));
        int errorCount = outcome.parserErrorRows().size()
                + (int) result.rows().stream().filter(r -> !r.issues().isEmpty()).count();
        return new DataCsvValidateResult(all, insertCount, updateCount, noneCount, errorCount);
    }

    // ── action: save ───────────────────────────────────────────────────────

    /**
     * 실제 저장 — 파서 오류든 검사 1~7 이슈든 하나라도 있으면 아무 행도 쓰지 않고 예외를 던진다(I2, 다른 쓰기 경로와
     * 같은 {@link DataItemChecks#rejected}). 파서 오류가 있으면 코어를 아예 부르지 않는다(부분 저장 방지).
     */
    public DataCsvSaveResult save(DataCsvSaveRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        String csvText = request.getCsvText() == null ? "" : request.getCsvText();

        ParseOutcome outcome = toUpsertRows(Rfc4180Csv.parse(csvText));
        if (!outcome.parserErrorRows().isEmpty()) {
            throw DataItemChecks.rejected(parserIssues(outcome.parserErrorRows()));
        }
        UpsertResult result = core.upsert(md, DataSavePath.CSV, null, outcome.rows(), false);
        if (!result.issues().isEmpty()) {
            throw DataItemChecks.rejected(result.issues());
        }
        int insertCount = 0;
        int updateCount = 0;
        int noneCount = 0;
        for (UpsertResult.RowAction ra : result.rows()) {
            switch (ra.action()) {
                case INSERT -> insertCount++;
                case UPDATE -> updateCount++;
                case NONE -> noneCount++;
                default -> {
                    // CSV 는 CLOSE·REOPEN 을 만들지 않는다(I3).
                }
            }
        }
        return new DataCsvSaveResult(insertCount, updateCount, noneCount, TEXT.format(result.at()));
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    /** 파싱 결과를 코어 입력({@link UpsertRow})과 파서 오류 행으로 가른다. 두 목록의 순서는 각각 원본 레코드 순서다. */
    private record ParseOutcome(List<DataCsvRow> parserErrorRows, List<UpsertRow> rows, List<Integer> lineNoOf) {
    }

    private static ParseOutcome toUpsertRows(Rfc4180Csv.ParsedCsv parsed) {
        List<DataCsvRow> parserErrors = new ArrayList<>();
        List<UpsertRow> rows = new ArrayList<>();
        List<Integer> lineNoOf = new ArrayList<>();
        for (Rfc4180Csv.ParsedRow r : parsed.rows()) {
            if (!r.ok()) {
                String code = r.cells().isEmpty() ? "-" : r.cells().get(0);
                parserErrors.add(new DataCsvRow(r.lineNo(), code, "-", List.of(r.error())));
                continue;
            }
            List<String> c = r.cells();
            Integer seq;
            try {
                seq = c.get(3).isBlank() ? null : Integer.valueOf(c.get(3).trim());
            } catch (NumberFormatException e) {
                parserErrors.add(new DataCsvRow(r.lineNo(), c.get(0), "-",
                        List.of("seq 는 정수여야 합니다: " + c.get(3))));
                continue;
            }
            DataItemValue value = new DataItemValue(c.get(1), c.get(2), seq, c.get(4), c.subList(5, 10),
                    c.subList(10, 20));
            rows.add(new UpsertRow(c.get(0), value));
            lineNoOf.add(r.lineNo());
        }
        return new ParseOutcome(parserErrors, rows, lineNoOf);
    }

    private static List<MdmCheckIssue> parserIssues(List<DataCsvRow> parserErrorRows) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        for (DataCsvRow row : parserErrorRows) {
            for (String message : row.issues()) {
                issues.add(new MdmCheckIssue("CSV", row.lineNo() + "번째 줄: " + message, null, row.code()));
            }
        }
        return issues;
    }

    private static List<String> messages(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::message).toList();
    }

    private static String requireMaruData(String md) {
        String id = md == null || md.isBlank() ? null : md.trim();
        if (id == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "마루 데이터를 고르세요", List.of());
        }
        return id;
    }
}
