package com.dongkuk.dmes.mdm.dma.termMng.service;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.common.support.MdmJsonLists;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
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
    /** JSON 목록 파싱 실패 경고 로그 앞머리. */
    private static final String LOG_LABEL = "termMng";
    /** 동의어 표기의 "명칭(시스템)" 접미사를 잘라내는 패턴(I18). */
    private static final Pattern TRAILING_PAREN = Pattern.compile("\\s*\\([^)]*\\)\\s*$");
    private static final double MIN_STAGE1_SCORE = 0.5d;
    /** 부분 일치 가점·편집 거리 점수는 짧은 쪽이 이 길이 이상일 때만 준다 — 한 글자 용어("명"·"량")는 정확 일치만 후보다. */
    private static final int MIN_CONTAIN_LENGTH = 2;
    /** 부분 일치 점수 = CONTAIN_BASE + CONTAIN_SPAN × 짧은쪽 길이 ÷ 긴쪽 길이 (0.7 초과 ~ 0.9 미만). */
    private static final double CONTAIN_BASE = 0.7d;
    private static final double CONTAIN_SPAN = 0.2d;
    private static final int TOP_N = 5;
    private static final int DEFAULT_CHUNK_SIZE = 500;

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

    /**
     * 키워드·상황 조건은 DB 에서 {@link TermSearchPrefilter} 로 먼저 줄이고(필요조건만), 아래 Java 비교가 최종 판정한다. 비교 순서
     * (키워드 → 시스템 → 상황)는 예전 그대로다. JSON 목록 해석은 {@link MdmJsonLists#readStrings} 를 따른다(D1·D2 수정 뒤 null
     * 리터럴은 빈 목록, 원소 null 은 버림). 행마다 JSON 칸은 한 번만 파싱한다.
     *
     * <p>조건이 하나도 없고 {@code limit} 이 오면 앞쪽 {@code limit} 건만 돌려주고 {@code totalCount}·{@code truncated} 로 알린다
     * (화면 성능 가이드 R1).
     */
    public TermSearchResult search(TermSearchRequest request) {
        String keyword = trimToNull(request != null ? request.getKeyword() : null);
        String keywordUpper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        String systemsFilter = trimToNull(request != null ? request.getSystems() : null);
        String contextFilter = trimToNull(request != null ? request.getContext() : null);
        String contextUpper = contextFilter == null ? null : contextFilter.toUpperCase(Locale.ROOT);

        int limit = request == null || request.getLimit() == null ? 0 : request.getLimit();
        if (keyword == null && systemsFilter == null && contextFilter == null && limit > 0) {
            // 조건 없음 + 상한(R1) — 정렬이 TERM_ID 숫자 순이라 DB 가 앞쪽 limit 건만 읽고 전체 건수는 COUNT 로 센다.
            Page<MdmTerm> page = termRepository.findAll(PageRequest.of(0, limit, TermSearchPrefilter.ORDER));
            List<TermRow> rows = page.stream().map(ParsedTerm::of).map(TermMngService::toRow).toList();
            return new TermSearchResult(rows, Math.toIntExact(page.getTotalElements()));
        }
        Specification<MdmTerm> prefilter = TermSearchPrefilter.of(keywordUpper, contextUpper);
        List<TermRow> rows = termRepository.findAll(prefilter, TermSearchPrefilter.ORDER).stream()
                .map(ParsedTerm::of)
                .filter(p -> keywordUpper == null || matchesKeyword(p, keywordUpper))
                .filter(p -> systemsFilter == null || p.systems().stream()
                        .anyMatch(s -> s.equalsIgnoreCase(systemsFilter)))
                .filter(p -> contextUpper == null || (p.term().getContext() != null
                        && p.term().getContext().toUpperCase(Locale.ROOT).contains(contextUpper)))
                .map(TermMngService::toRow)
                .toList();
        return new TermSearchResult(rows);
    }

    /**
     * 검색 한 행 — JSON 목록 세 칸을 한 번만 파싱해 둔다. 목록은 null 이 아니다(JSON null 리터럴도 빈 목록, D1 수정). 원소도 null 이
     * 아니다(원소 null 은 파서가 버린다, D2 수정).
     */
    private record ParsedTerm(MdmTerm term, List<String> synonyms, List<String> aliases, List<String> systems) {
        static ParsedTerm of(MdmTerm t) {
            return new ParsedTerm(t, readStrings(t.getSynonyms()), readStrings(t.getAliases()),
                    readStrings(t.getSystems()));
        }
    }

    private static boolean matchesKeyword(ParsedTerm p, String keywordUpper) {
        if (contains(p.term().getTermName(), keywordUpper) || contains(p.term().getEngAbbr(), keywordUpper)) {
            return true;
        }
        return p.synonyms().stream().anyMatch(s -> contains(s, keywordUpper))
                || p.aliases().stream().anyMatch(s -> contains(s, keywordUpper));
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
        entity.setSynonyms(MdmJsonLists.writeStrings(parseCommaList(request.getSynonyms())));
        entity.setAliases(MdmJsonLists.writeStrings(parseCommaList(request.getAliases())));
        entity.setSystems(MdmJsonLists.writeStrings(parseCommaList(request.getSystems())));
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

        afterCommitOrNow("refresh termId=" + termId, () -> cache.refresh(termId));

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
        afterCommitOrNow("remove termId=" + termId, () -> cache.remove(termId));
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
            int shorter = Math.min(candidateUpper.length(), queryUpper.length());
            int longer = Math.max(candidateUpper.length(), queryUpper.length());
            if (shorter >= MIN_CONTAIN_LENGTH) {
                return CONTAIN_BASE + CONTAIN_SPAN * shorter / longer;
            }
        }
        if (Math.min(candidateUpper.length(), queryUpper.length()) < MIN_CONTAIN_LENGTH) {
            return -1d; // 한 글자 쪽은 정확 일치만 인정한다(편집 거리 0.5 로 컷오프에 걸리는 것을 막는다)
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
                afterCommitOrNow("refresh termId=" + termId, () -> cache.refresh(termId));
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

    /**
     * I9·I18 — 인코딩 입력 문자열은 {@code "{표기}: {정의} ({영문명})"} 다(term-embedding.md §2, D-025).
     * 값은 strip 하고, 정의가 비면 {@code ": {정의}"}, 영문명이 비면 {@code " ({영문명})"} 를 뺀다.
     */
    static String buildEncodingInput(String termName, String definition, String engName) {
        StringBuilder sb = new StringBuilder(termName == null ? "" : termName.strip());
        if (definition != null && !definition.isBlank()) {
            sb.append(": ").append(definition.strip());
        }
        if (engName != null && !engName.isBlank()) {
            sb.append(" (").append(engName.strip()).append(')');
        }
        return sb.toString();
    }

    /**
     * I19 — 활성 트랜잭션이 있으면(OASIS 가 BPMN process 단위로 감싼 트랜잭션) 커밋 후로 캐시 갱신을
     * 미룬다. 없으면 즉시 갱신한다. DB 가 롤백됐는데 캐시만 갱신되는 유령 항목을 막는다.
     *
     * <p>두 경로 모두 {@link #runCacheUpdate} 로 감싸 캐시 갱신 실패를 밖으로 내지 않는다.
     *
     * @param what 실패 로그에 남길 갱신 설명(예: {@code "refresh termId=7"})
     */
    private static void afterCommitOrNow(String what, Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    runCacheUpdate(what, action);
                }
            });
        } else {
            runCacheUpdate(what, action);
        }
    }

    /**
     * 캐시 갱신을 실행하고 실패({@link RuntimeException})는 삼켜 경고 로그(스택 포함)만 남긴다. {@link Error} 는 잡지 않는다.
     *
     * <p>삼키는 이유 — Spring 은 {@code afterCommit} 예외를 {@code commit()} 호출자에게 그대로 던지고(DB 커밋은 이미 끝남),
     * cactus {@code CactusSpringTransactionHandler.commitAll} 은 이를 커밋 실패로 보고 남은 트랜잭션을 롤백한 뒤 S001 로
     * 응답한다. 그러면 DB 에는 반영된 저장·삭제가 화면에는 실패로 보인다. 같은 트랜잭션의 뒤쪽 {@code afterCommit}
     * (예: {@code reencodeBatch} 의 다른 행 갱신)도 건너뛴다. 트랜잭션이 없을 때의 즉시 경로도 {@code saveAndFlush}·
     * {@code delete} 가 이미 자기 트랜잭션으로 커밋한 뒤라 같은 처지여서 같은 정책을 따른다.
     *
     * <p>로그 수준은 {@code warn} 이다 — {@code ControlTopicPublisher}(DB 가 정본이라 다른 쪽이 나중에 따라잡음, warn) 쪽이고,
     * {@code DmomDispatchSynchronization}(외부 전송분이 사라져 TC_ERROR 로 따로 메워야 함, error) 쪽이 아니다. DB 는 정상이고
     * 잃는 데이터가 없으며 캐시만 낡는다: 저장·재인코딩 실패분은 그 용어를 다음에 저장·재인코딩할 때, 삭제 실패분(지운 용어가
     * 추천 후보에 남음)은 다시 갱신할 길이 없어 다음 전체 재적재({@link TermRecommendationCache#reloadAll}, 부팅 시)까지 남는다.
     */
    private static void runCacheUpdate(String what, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.warn("[termMng] 캐시 갱신 실패 — {} (DB 는 반영됨, 캐시는 다음 갱신·재적재까지 낡음)", what, e);
        }
    }

    private static TermRow toRow(ParsedTerm p) {
        MdmTerm t = p.term();
        TermRow row = new TermRow();
        row.setTermId(t.getTermId());
        row.setTermName(t.getTermName());
        row.setSenseNo(t.getSenseNo());
        row.setDefinition(t.getDefinition());
        row.setContext(t.getContext());
        row.setEngName(t.getEngName());
        row.setEngAbbr(t.getEngAbbr());
        row.setSynonyms(p.synonyms());
        row.setAliases(p.aliases());
        row.setSystems(p.systems());
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

    private static List<String> readStrings(String json) {
        return MdmJsonLists.readStrings(json, LOG_LABEL);
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
}
