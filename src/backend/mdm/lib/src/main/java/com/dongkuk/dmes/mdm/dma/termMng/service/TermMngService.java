package com.dongkuk.dmes.mdm.dma.termMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache.CachedTerm;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.ReencodeBatchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.ReencodeBatchResult;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermDeleteRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermRow;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 용어 관리({@code termMng}) OASIS 진입 서비스 — TSK-04-02 design.md §2.
 *
 * <p>정본: {@code docs/mdm/screens/termMng/termMng_기능설계서.md}. BPMN
 * {@code services/dma/termMng.bpmn} 의 5 분기와 1:1: {@code search}/{@code save}/{@code delete}/
 * {@code compare}(method={@link #recommend})/{@code execute}(method={@link #reencodeBatch}).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — mls {@code NoticeMgmtService} 선례와 같은
 * 이유(OASIS 파라미터 바인딩).
 */
@Service("termMngService")
public class TermMngService {

    private static final Logger log = LoggerFactory.getLogger(TermMngService.class);
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    /** 동의어 표기의 "명칭(시스템)" 접미사를 잘라내는 패턴(I18). */
    private static final Pattern TRAILING_PAREN = Pattern.compile("\\s*\\([^)]*\\)\\s*$");
    private static final double MIN_STAGE1_SCORE = 0.5d;
    private static final int TOP_N = 5;
    private static final int DEFAULT_CHUNK_SIZE = 500;

    // Spring Boot 4 는 기본 JSON 스택으로 tools.jackson(Jackson 3)을 쓰고 classic
    // com.fasterxml.jackson.databind.ObjectMapper 빈을 자동 등록하지 않는다(실측 확인) — 이 리포의
    // 기존 관례(GridConverter, AuditLogger 등)와 같이 직접 인스턴스를 만들어 쓴다.
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final MdmTermRepository termRepository;
    private final TermEmbeddingRepository embeddingRepository;
    private final TermRecommendationCache cache;
    private final TermEmbeddingEncoder encoder;

    public TermMngService(MdmTermRepository termRepository, TermEmbeddingRepository embeddingRepository,
            TermRecommendationCache cache, TermEmbeddingEncoder encoder) {
        this.termRepository = termRepository;
        this.embeddingRepository = embeddingRepository;
        this.cache = cache;
        this.encoder = encoder;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search
    // ────────────────────────────────────────────────────────────────

    public TermSearchResult search(TermSearchRequest request) {
        String keyword = trimToNull(request != null ? request.getKeyword() : null);
        String keywordUpper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        String systemsFilter = trimToNull(request != null ? request.getSystems() : null);
        String contextFilter = trimToNull(request != null ? request.getContext() : null);

        List<TermRow> rows = termRepository.findAll().stream()
                .filter(t -> keywordUpper == null || matchesKeyword(t, keywordUpper))
                .filter(t -> systemsFilter == null || readStringList(t.getSystems()).stream()
                        .anyMatch(s -> s.equalsIgnoreCase(systemsFilter)))
                .filter(t -> contextFilter == null || (t.getContext() != null
                        && t.getContext().toUpperCase(Locale.ROOT).contains(contextFilter.toUpperCase(Locale.ROOT))))
                .map(this::toRow)
                .toList();
        return new TermSearchResult(rows);
    }

    private boolean matchesKeyword(MdmTerm t, String keywordUpper) {
        if (contains(t.getTermName(), keywordUpper) || contains(t.getEngAbbr(), keywordUpper)) {
            return true;
        }
        return readStringList(t.getSynonyms()).stream().anyMatch(s -> contains(s, keywordUpper))
                || readStringList(t.getAliases()).stream().anyMatch(s -> contains(s, keywordUpper));
    }

    private static boolean contains(String value, String keywordUpper) {
        return value != null && value.toUpperCase(Locale.ROOT).contains(keywordUpper);
    }

    // ────────────────────────────────────────────────────────────────
    // action: save
    // ────────────────────────────────────────────────────────────────

    public TermSaveResult save(TermSaveRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
        }
        String termName = trimToNull(request.getTermName());
        if (termName == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "표기(한글)는 필수입니다."); // V-001
        }
        if (request.getSenseNo() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "의미 번호는 숫자여야 합니다."); // V-002
        }
        int senseNo = request.getSenseNo();
        String definition = trimToNull(request.getDefinition());
        if (definition == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "정의는 필수입니다."); // V-003, I7
        }

        MdmTerm existing = request.getTermId() != null ? termRepository.findById(request.getTermId()).orElse(null) : null;

        // I6 — (표기, 의미 번호) 중복 저장 거부(자기 자신 제외).
        termRepository.findByTermNameAndSenseNo(termName, senseNo).ifPresent(dup -> {
            if (existing == null || !dup.getTermId().equals(existing.getTermId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 표기·의미 번호의 용어가 이미 있습니다.");
            }
        });

        String engName = trimToNull(request.getEngName());
        String engAbbr = trimToNull(request.getEngAbbr());

        // I8 — 영문 약어 중복은 저장을 막지 않고 warnings 로만 경고한다(V11, D1).
        List<String> warnings = new ArrayList<>();
        if (engAbbr != null) {
            boolean dupAbbr = termRepository.findByEngAbbr(engAbbr).stream()
                    .anyMatch(t -> existing == null || !t.getTermId().equals(existing.getTermId()));
            if (dupAbbr) {
                warnings.add("ENG_ABBR_DUP");
            }
        }

        boolean isNew = existing == null;
        // I12 — 인코딩 입력을 구성하는 세 필드(term_name/definition/eng_name) 중 하나라도 바뀌면 재인코딩 대상.
        boolean inputChanged = isNew
                || !Objects.equals(existing.getTermName(), termName)
                || !Objects.equals(existing.getDefinition(), definition)
                || !Objects.equals(existing.getEngName(), engName);

        MdmTerm entity = isNew ? new MdmTerm(termName, senseNo, definition) : existing;
        entity.setTermName(termName);
        entity.setSenseNo(senseNo);
        entity.setDefinition(definition);
        entity.setContext(trimToNull(request.getContext()));
        entity.setEngName(engName);
        entity.setEngAbbr(engAbbr);
        entity.setSynonyms(writeJson(parseCommaList(request.getSynonyms())));
        entity.setAliases(writeJson(parseCommaList(request.getAliases())));
        entity.setSystems(writeJson(parseCommaList(request.getSystems())));
        entity.setStdBasis(trimToNull(request.getStdBasis()));

        // advisor 지적 — JPA insert 가 아직 flush 되지 않으면 뒤이은 네이티브 UPDATE(EMBEDDING)가 0건이 된다.
        MdmTerm saved = termRepository.saveAndFlush(entity);
        Long termId = saved.getTermId();

        if (inputChanged) {
            // I12 — 먼저 지운다(옛 벡터 + 새 modelId 조합이 남아 I11 을 영영 못 걸리게 하는 사고 방지).
            embeddingRepository.clearEmbedding(termId);
            if (encoder.isEnabled()) {
                float[] vector = encoder.encode(buildEncodingInput(termName, definition, engName));
                byte[] bytes = TermEmbeddingCodec.encode(vector);
                int updated = embeddingRepository.updateEmbedding(termId, bytes, encoder.modelId());
                if (updated != 1) {
                    throw new IllegalStateException("EMBEDDING 갱신 대상 행이 없다(flush 누락 의심): termId=" + termId);
                }
            }
        }

        afterCommitOrNow(() -> cache.refresh(termId));

        log.info("[termMng] save — termId={} termName={} senseNo={} warnings={}", termId, termName, senseNo, warnings);
        return new TermSaveResult(termId, warnings, search(new TermSearchRequest()).getList());
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> delete(TermDeleteRequest request) {
        if (request == null || request.getTermId() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "삭제할 용어가 없습니다.");
        }
        MdmTerm entity = termRepository.findById(request.getTermId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "삭제 대상 용어를 찾을 수 없습니다."));
        // D13 — TB_MDM_COLUMN.TERM_IDS 참조 검사는 이 작업 범위 밖(TSK-04-04 인계).
        termRepository.delete(entity);
        Long termId = entity.getTermId();
        afterCommitOrNow(() -> cache.remove(termId));
        log.info("[termMng] delete — termId={}", termId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cntMerge", 1);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: compare (method=recommend)
    // ────────────────────────────────────────────────────────────────

    /**
     * 1차(문자열)+2차(임베딩) 유사어 추천을 한 응답으로 결합한다(D4). 측정 대상(AC7)은 이 메서드 자체다.
     */
    public Map<String, Object> recommend(RecommendRequest request) {
        String termName = request != null ? trimToNull(request.getTermName()) : null;
        String definition = request != null ? trimToNull(request.getDefinition()) : null;
        String engName = request != null ? trimToNull(request.getEngName()) : null;
        Long selfId = request != null ? request.getTermId() : null;

        List<RecommendCandidate> stage1 = termName != null && termName.length() >= 2
                ? recommendStage1(termName, selfId)
                : List.of();

        boolean stage2Enabled = encoder.isEnabled();
        List<RecommendCandidate> stage2 = stage2Enabled
                ? recommendStage2(buildEncodingInput(termName == null ? "" : termName,
                        definition == null ? "" : definition, engName == null ? "" : engName), selfId)
                : List.of();

        List<RecommendCandidate> combined = new ArrayList<>(stage1.size() + stage2.size());
        combined.addAll(stage1);
        combined.addAll(stage2);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("candidates", combined);
        out.put("stage2Enabled", stage2Enabled);
        return out;
    }

    private List<RecommendCandidate> recommendStage1(String query, Long selfId) {
        String queryUpper = query.toUpperCase(Locale.ROOT);
        List<RecommendCandidate> scored = new ArrayList<>();
        for (CachedTerm c : cache.values()) {
            if (c.termId().equals(selfId)) {
                continue;
            }
            double best = scoreText(c.termName(), queryUpper, query);
            String bestText = c.termName();
            for (String syn : c.synonyms()) {
                String bare = TRAILING_PAREN.matcher(syn).replaceAll("");
                double s = scoreText(bare, queryUpper, query);
                if (s > best) {
                    best = s;
                    bestText = syn;
                }
            }
            for (String alias : c.aliases()) {
                double s = scoreText(alias, queryUpper, query);
                if (s > best) {
                    best = s;
                    bestText = alias;
                }
            }
            if (c.engName() != null) {
                double s = scoreText(c.engName(), queryUpper, query);
                if (s > best) {
                    best = s;
                    bestText = c.engName();
                }
            }
            if (best >= MIN_STAGE1_SCORE) {
                scored.add(new RecommendCandidate(c.termId(), c.termName(), c.senseNo(), c.engName(), c.systems(),
                        bestText, best, "1"));
            }
        }
        return topN(scored);
    }

    private static double scoreText(String candidateText, String queryUpper, String query) {
        if (candidateText == null || candidateText.isBlank()) {
            return -1d;
        }
        String candidateUpper = candidateText.toUpperCase(Locale.ROOT);
        if (candidateUpper.equals(queryUpper)) {
            return 1.0d;
        }
        if (candidateUpper.contains(queryUpper) || queryUpper.contains(candidateUpper)) {
            return 0.9d;
        }
        int distance = levenshtein(query, candidateText);
        int maxLen = Math.max(query.length(), candidateText.length());
        if (maxLen == 0) {
            return 0d;
        }
        return 1.0d - ((double) distance / maxLen);
    }

    private List<RecommendCandidate> recommendStage2(String queryInput, Long selfId) {
        float[] queryVector = encoder.encode(queryInput);
        List<RecommendCandidate> scored = new ArrayList<>();
        for (CachedTerm c : cache.values()) {
            if (c.termId().equals(selfId) || c.embedding() == null) {
                continue;
            }
            double cosine = dot(queryVector, c.embedding());
            scored.add(new RecommendCandidate(c.termId(), c.termName(), c.senseNo(), c.engName(), c.systems(),
                    c.termName(), cosine, "2"));
        }
        return topN(scored);
    }

    private static List<RecommendCandidate> topN(List<RecommendCandidate> scored) {
        return scored.stream()
                .sorted(Comparator.comparingDouble(RecommendCandidate::getScore).reversed()
                        .thenComparing(RecommendCandidate::getTermId))
                .limit(TOP_N)
                .toList();
    }

    private static double dot(float[] a, float[] b) {
        double s = 0;
        int n = Math.min(a.length, b.length);
        for (int i = 0; i < n; i++) {
            s += (double) a[i] * b[i];
        }
        return s;
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute (method=reencodeBatch)
    // ────────────────────────────────────────────────────────────────

    /** 최초 일괄 구축·모델 교체 재인코딩 공통 배치(D6) — 청크(기본 500건) 단위. */
    public Map<String, Object> reencodeBatch(ReencodeBatchRequest request) {
        if (!encoder.isEnabled()) {
            // I12 — 인코더가 비활성이면 즉시 반환하고 아무 것도 건드리지 않는다.
            return toMap(new ReencodeBatchResult(false, 0, 0, true));
        }
        int chunkSize = request != null && request.getChunkSize() != null ? request.getChunkSize() : DEFAULT_CHUNK_SIZE;
        List<Long> stale = embeddingRepository.findStaleTermIds(encoder.modelId());
        int total = stale.size();
        int take = Math.min(chunkSize, total);
        int processed = 0;
        for (int i = 0; i < take; i++) {
            Long termId = stale.get(i);
            MdmTerm term = termRepository.findById(termId).orElse(null);
            if (term == null) {
                continue; // 배치 중 삭제된 행 — 다음 대상으로 넘어간다.
            }
            String input = buildEncodingInput(term.getTermName(), term.getDefinition(), term.getEngName());
            float[] vector = encoder.encode(input);
            byte[] bytes = TermEmbeddingCodec.encode(vector);
            int updated = embeddingRepository.updateEmbedding(termId, bytes, encoder.modelId());
            if (updated == 1) {
                processed++;
                afterCommitOrNow(() -> cache.refresh(termId));
            }
        }
        int remaining = total - processed;
        boolean done = remaining <= 0;
        log.info("[termMng] reencodeBatch — processed={} remaining={} done={}", processed, remaining, done);
        return toMap(new ReencodeBatchResult(true, processed, remaining, done));
    }

    private static Map<String, Object> toMap(ReencodeBatchResult r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", r.isEnabled());
        out.put("processed", r.getProcessed());
        out.put("remaining", r.getRemaining());
        out.put("done", r.isDone());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // 내부 구현
    // ────────────────────────────────────────────────────────────────

    /** I9·I18 — 인코딩 입력 문자열은 {@code "{표기}: {정의} ({영문명})"} 로 고정한다. */
    static String buildEncodingInput(String termName, String definition, String engName) {
        return (termName == null ? "" : termName) + ": " + (definition == null ? "" : definition)
                + " (" + (engName == null ? "" : engName) + ")";
    }

    /**
     * I19 — 활성 트랜잭션이 있으면(OASIS 가 BPMN process 단위로 감싼 트랜잭션) 커밋 후로 캐시 갱신을
     * 미룬다. 없으면 즉시 갱신한다. DB 가 롤백됐는데 캐시만 갱신되는 유령 항목을 막는다.
     */
    private static void afterCommitOrNow(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    private TermRow toRow(MdmTerm t) {
        TermRow row = new TermRow();
        row.setTermId(t.getTermId());
        row.setTermName(t.getTermName());
        row.setSenseNo(t.getSenseNo());
        row.setDefinition(t.getDefinition());
        row.setContext(t.getContext());
        row.setEngName(t.getEngName());
        row.setEngAbbr(t.getEngAbbr());
        row.setSynonyms(readStringList(t.getSynonyms()));
        row.setAliases(readStringList(t.getAliases()));
        row.setSystems(readStringList(t.getSystems()));
        row.setStdBasis(t.getStdBasis());
        return row;
    }

    /**
     * D-006·D-009·D-010 — 콤마 구분 원본 텍스트를 배열로 나눈다. 각 항목은 trim 하고 빈 항목은 버린다.
     * OASIS 바인딩 제약(위 클래스 주석)때문에 화면은 배열이 아니라 이 형식의 문자열을 보낸다.
     */
    private static List<String> parseCommaList(String commaSeparated) {
        if (commaSeparated == null || commaSeparated.isBlank()) {
            return List.of();
        }
        return Arrays.stream(commaSeparated.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private String writeJson(List<String> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        try {
            return OBJECT_MAPPER.writeValueAsString(list);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 직렬화 실패", e);
        }
    }

    private List<String> readStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return OBJECT_MAPPER.readValue(json, STRING_LIST);
        } catch (Exception e) {
            log.warn("[termMng] JSON 파싱 실패 — 빈 목록으로 대체: {}", json, e);
            return List.of();
        }
    }

    /** 자바 문자 단위 편집 거리(Levenshtein) — D9(외부 라이브러리·DB 네이티브 미사용). */
    private static int levenshtein(String a, String b) {
        int[] prev = new int[b.length() + 1];
        int[] curr = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            curr[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[b.length()];
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
