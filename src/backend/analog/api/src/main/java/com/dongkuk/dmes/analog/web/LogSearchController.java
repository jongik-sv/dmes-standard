package com.dongkuk.dmes.analog.web;

import com.dongkuk.analog.parser.LogPattern;
import com.dongkuk.analog.process.LogProcessor;
import com.dongkuk.analog.scanner.LogData;
import com.dongkuk.analog.scanner.LogLexer;
import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.comparator.SortStrategy;
import com.dongkuk.analogexpress.filter.file.CaseInsensitiveFileNameRangeFilter;
import com.dongkuk.analogexpress.postprocessing.ServiceDefinition;
import com.dongkuk.analogexpress.postprocessing.ServiceListExtraction;
import com.dongkuk.analogexpress.searcher.ContextualNewLineInspector;
import com.dongkuk.analogexpress.searcher.GzipAwareFileSearcher;
import com.dongkuk.analogexpress.searcher.SearchStrategy;
import com.dongkuk.analogexpress.searcher.StartsStringContextualNewLineInspector;
import com.fasterxml.jackson.core.JsonProcessingException;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletResponse;
import com.dongkuk.dmes.analog.dto.Result;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.util.ResourceUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileFilter;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 원본: com.dongkuk.analogexpress.plate.controller.ApiController (analog-express-web-plate)
 * 이식: {CLIENT} 어댑터 — Spring Boot 4 / Java 21 / jakarta.* 호환.
 * BFF 컨벤션: /api/analog/rest/{API_PATH} 에서 BFF 가 prefix 만 제거하므로 BE 매핑은 원본 그대로 유지.
 * CORS 개방(@CrossOrigin) 은 제거 — FE 는 BFF(be-proxy) 경유이며 mpn/mcm 관례에도 없음.
 */
@RestController
public class LogSearchController {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(LogSearchController.class);

    @Value("${analog-express.stage}")
    private String stage;
    @Value("${analog-express.modules}")
    private String modules;
    @Value("${analog-express.log_base_dir}")
    private String logBaseDir;
    @Value("${analog-express.unzip_cache_dir:}")
    private String unzipCacheDir;
    @Value("${analog-express.file_search_limit_megabyte:100}")
    private long fileSearchLimitMegaByte;
    @Value("${analog-express.datetime_format:yyyy-MM-dd HH:mm:ss.SSS}")
    private String dateTimeFormat;
    @Value("${analog-express.begin_index_of_date_time:0}")
    private int beginIndexOfDateTime;
    @Value("${analog-express.end_index_of_date_time:23}")
    private int endIndexOfDateTime;
    @Value("${analog-express.log_file_name_date_format:yyyy-MM-dd}")
    private String logFileNameDateFormat;
    @Value("${analog-express.thread_log_file_name_date_format:yyyyMMdd_HHmmss}")
    private String threadLogFileNameDateFormat;
    @Value("${analog-express.log_file_name_daily_directory_format:yyyy-MM-dd}")
    private String logFileNameDailyDirectoryFormat;
    @Value("${analog-express.log_file_name_format:dmes-{MODULE}.{FILE_NAME_DATE}.{SEQ}.log}")
    private String logFileNameFormat;
    @Value("${analog-express.live_log_file_name_format:dmes-{MODULE}.log}")
    private String liveLogFileNameFormat;
    @Value("${analog-express.byThreadLogFileNameFormat:{MODULE}_{CLIENT_TYPE}_{THREAD_FILE_NAME_DATE}-{KEYWORD}-THREAD-{SEQ}.log}")
    private String byThreadLogFileNameFormat;
    @Value("${analog-express.threads_per_request:10}")
    private int threadsPerRequest;
    @Value("${analog-express.output_limit_megabyte:10}")
    private long outputLimitMegaByte;
    @Value("${analog-express.minimum_minutes_for_binary_search:50}")
    private int minMinutesForBinarySearch;
    @Value("${analog-express.minimum_mega_bytes_for_multi_thread:50}")
    private long minMegaBytesForMultiThread;
    @Value("${analog-express.encoding:utf-8}")
    private String encoding;
    @Value("${analog-express.ftp_client:#{null}}")
    private String ftpClient;
    @Value("${analog-express.new_line_inspector:20}")
    private String newLineInspector;
    @Value("${analog-express.service_extraction_pattern:(?<time>20[\\d-]{2}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})[,.]\\d{3}\\s*[\\w-]+\\s*\\[(?<serviceTag>.*?)\\]\\s*\\[(?<serviceName>.*?)\\]\\s*\\[}")
    private String serviceExtractionPattern;
    @Value("${analog-serializer.config_file:classpath:analog-serializer.json}")
    private String filePath;
    @Value("${analog-serializer.log_debug:false}")
    private boolean logDebug;
    @Value("${analog-serializer.lex_pattern}")
    private String lexPattern;
    @Value("${analog-serializer.extraction.service_finish.start_with_match}")
    private String startWithMatch;
    @Value("${analog-serializer.extraction.service_finish.run_time_pattern}")
    private String runTimePattern;
    @Value("${analog-serializer.extraction.service_action.start_with_match}")
    private String actionStartWithMatch;
    @Value("${analog-serializer.extraction.service_action.action_pattern}")
    private String actionPattern;

    private ContextualNewLineInspector contextualNewLineInspector;
    private ServiceListExtraction serviceListExtraction;

    @PostConstruct
    public void init() {
        this.contextualNewLineInspector = new StartsStringContextualNewLineInspector(newLineInspector);
        this.serviceListExtraction = new ServiceListExtraction(lexPattern, startWithMatch, runTimePattern, actionStartWithMatch, actionPattern);
    }

    @RequestMapping(value = "/log/refresh")
    public String refreshLogOnServer(
            @RequestParam String module,
            @RequestParam String clientType) {

        validateModule(module);
        if (ftpClient == null || ftpClient.isBlank()) {
            return "ftp 프로그램이 정의 되지 않았습니다. \n" +
                    "application.yml 에 analog-express.ftp_client=[path포함 파일명] 을 추가하세요";
        }
        try {
            String liveFileName = liveLogFileNameFormat
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", clientTypeToLogFileName(trimStartingQASOrDEV(module.toLowerCase()), clientType));

            ProcessBuilder processBuilder = new ProcessBuilder();
            List<String> command = new ArrayList<>();
            command.add(ftpClient);
            command.add("--livefile=" + liveFileName);
            command.add("--module=" + module);
            processBuilder.command(command);
            processBuilder.directory(new File(ftpClient).getParentFile());
            log.info("....ftp_client: {}", ftpClient);
            Process process = processBuilder.start();
            int exitCode = process.waitFor();

            InputStream inputStream = process.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            String line;
            Pattern pattern = Pattern.compile("return : (-?\\d+),\\s*(.*)");
            while ((line = reader.readLine()) != null) {
                log.info(line);
                Matcher matcher = pattern.matcher(line);
                if (matcher.find()) {
                    String numberPart = matcher.group(1);
                    String remainingPart = matcher.group(2);
                    if (numberPart.equals("0")) {
                        return "동기화 성공";
                    } else {
                        return "동기화 실패 : " + remainingPart;
                    }
                }
            }
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            return e.getMessage() + " — 로그 동기화 실패";
        }
        return "로그 동기화 실패";
    }

    @RequestMapping(value = "/log/range/time/download", produces = "text/plain; charset=UTF-8")
    public String logRangeTimeDownload(@RequestParam(name = "from") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime fromTime,
                                       @RequestParam(name = "to") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime toTime,
                                       @RequestParam String keyword,
                                       @RequestParam String serverType,
                                       @RequestParam String module,
                                       @RequestParam String clientType,
                                       HttpServletResponse response,
                                       @RequestParam @Nullable boolean ignoreCase,
                                       @RequestParam @Nullable boolean byThread) {
        validateModule(module);
        setDownloadHeader(keyword, serverType, module, response);
        return logRangeTime(fromTime, toTime, keyword, serverType, module, clientType, ignoreCase, byThread);
    }

    @RequestMapping(value = "/log/range/time/tree", produces = "application/json; charset=UTF-8")
    public List<Object> logRangeTimeTree(@RequestParam(name = "from") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime fromTime,
                                         @RequestParam(name = "to") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime toTime,
                                         @RequestParam String keyword,
                                         @RequestParam String serverType,
                                         @RequestParam String module,
                                         @RequestParam String clientType,
                                         HttpServletResponse response,
                                         @RequestParam @Nullable boolean ignoreCase,
                                         @RequestParam @Nullable boolean byThread) throws JsonProcessingException, InterruptedException, FileNotFoundException {

        validateModule(module);
        Queue<LogData> queue = new ConcurrentLinkedQueue<>();
        LogProcessor logProcessor = new LogProcessor(new LogLexer(), queue);
        logProcessor.setDebug(logDebug);
        logProcessor.getLogLexer().setLogPattern(lexPattern);
        logProcessor.getLogLexer().setStartString(newLineInspector);
        File configFile = ResourceUtils.getFile(filePath);
        LogPattern.loadPattern(configFile);

        Thread thread = new Thread(() -> {
            try {
                logProcessor.run();
            } catch (Exception e) {
                Thread.currentThread().interrupt();
            }
        });
        thread.start();

        String largeStringResult = logRangeTime(fromTime, toTime, keyword, serverType, module, clientType, ignoreCase, byThread);
        try (BufferedReader reader = new BufferedReader(new StringReader(largeStringResult))) {
            logProcessor.getLogLexer().readBuffer(reader);
        } catch (IOException e) {
            log.error("logLexer readBuffer 실패", e);
        }

        thread.join();
        return logProcessor.getTree();
    }

    @RequestMapping(value = "/log/range/time", produces = "application/json; charset=UTF-8")
    public Result logRangeTimeApi(@RequestParam(name = "from") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime fromTime,
                                  @RequestParam(name = "to") @DateTimeFormat(pattern = "yyyyMMddHHmmss") LocalDateTime toTime,
                                  @RequestParam String keyword,
                                  @RequestParam String serverType,
                                  @RequestParam String module,
                                  @RequestParam String clientType,
                                  @RequestParam @Nullable boolean ignoreCase,
                                  @RequestParam @Nullable boolean byThread) {

        validateModule(module);
        String logBody = logRangeTime(fromTime, toTime, keyword, serverType, module, clientType, ignoreCase, byThread);
        List<ServiceDefinition> serviceList = serviceListExtraction.extract(logBody);
        return new Result(logBody, serviceList);
    }

    private String logRangeTime(LocalDateTime fromTime,
                                LocalDateTime toTime,
                                String keyword,
                                String serverType,
                                String module,
                                String clientType,
                                boolean ignoreCase,
                                boolean byThread) {
        String decodedKeyword = decodeKeyword(keyword);
        String localLogBaseDir = resolveBaseDirectory(module);
        File localUnzipCacheDir = resolveUnzipCacheDir(module, localLogBaseDir);
        final long fileSearchLimitByte = fileSearchLimitMegaByte * 1024 * 1024;

        String fromFileName;
        String toFileName;
        if (byThread) {
            fromFileName = byThreadLogFileNameFormat
                    .replace("{THREAD_FILE_NAME_DATE}", fromTime.format(DateTimeFormatter.ofPattern(threadLogFileNameDateFormat)))
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", "thr")
                    .replace("{KEYWORD}", decodedKeyword)
                    .replace("{SEQ}", "1");

            toFileName = byThreadLogFileNameFormat
                    .replace("{THREAD_FILE_NAME_DATE}", toTime.format(DateTimeFormatter.ofPattern(threadLogFileNameDateFormat)))
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", "thr")
                    .replace("{KEYWORD}", decodedKeyword)
                    .replace("{SEQ}", "999999999");
        } else {
            fromFileName = logFileNameFormat
                    .replace("{FILE_NAME_DATE}", fromTime.format(DateTimeFormatter.ofPattern(logFileNameDateFormat)))
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", clientTypeToLogFileName(trimStartingQASOrDEV(module.toLowerCase()), clientType))
                    .replace("{SEQ}", "0");

            toFileName = logFileNameFormat
                    .replace("{FILE_NAME_DATE}", toTime.format(DateTimeFormatter.ofPattern(logFileNameDateFormat)))
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", clientTypeToLogFileName(trimStartingQASOrDEV(module.toLowerCase()), clientType))
                    .replace("{SEQ}", "999999999");
        }

        // gz 아카이브는 GzipAwareFileSearcher 가 .gz 를 뗀 이름으로 필터 평가 후
        // 캐시에 해제해 평문으로 편입한다 — 엔진은 평문만 읽는다.
        FileFilter fileFilter = new CaseInsensitiveFileNameRangeFilter(fromFileName, toFileName);
        File[] archivedFiles = GzipAwareFileSearcher.findFile(localLogBaseDir, fileSearchLimitByte, fileFilter, SortStrategy.ascendingSortByFileName, localUnzipCacheDir);
        File[] files;
        final long archivedFileLength = sumOfLength(archivedFiles);

        if (archivedFileLength < fileSearchLimitByte && !byThread) {
            String liveFileName = liveLogFileNameFormat
                    .replace("{MODULE}", removeEndingNumber(moduleNameToLogFileName(trimStartingQASOrDEV(module.toLowerCase()))))
                    .replace("{CLIENT_TYPE}", clientType);

            FileFilter liveFileFilter = new CaseInsensitiveFileNameRangeFilter(liveFileName, liveFileName);
            File[] liveFiles = GzipAwareFileSearcher.findFile(localLogBaseDir, fileSearchLimitByte, liveFileFilter, SortStrategy.ascendingSortByFileName, localUnzipCacheDir);
            files = joinFiles(Arrays.asList(archivedFiles, liveFiles), fileSearchLimitByte);
        } else {
            files = archivedFiles;
        }

        List<SearchStrategy> searchStrategies = new ArrayList<>();
        LoggingTimeComparator comparator = new LoggingTimeComparator(fromTime, toTime, dateTimeFormat, beginIndexOfDateTime, endIndexOfDateTime);

        for (File file : files) {
            SearchStrategy searchStrategy = new SearchStrategy(file, encoding);
            searchStrategy.makeStrategy(fromTime,
                    toTime,
                    comparator,
                    dateTimeFormat,
                    beginIndexOfDateTime,
                    endIndexOfDateTime,
                    decodedKeyword,
                    ignoreCase,
                    minMinutesForBinarySearch,
                    minMegaBytesForMultiThread,
                    contextualNewLineInspector);
            searchStrategies.add(searchStrategy);
        }
        return search(searchStrategies);
    }

    private long sumOfLength(File[] archivedFiles) {
        return Arrays.stream(archivedFiles)
                .mapToLong(File::length)
                .sum();
    }

    private String trimStartingQASOrDEV(String keyword) {
        String data = keyword.toLowerCase();
        if (data.startsWith("qas_") || data.startsWith("dev_")) {
            return data.substring(4);
        }
        return data;
    }

    private String removeEndingNumber(String module) {
        if (module == null || module.isEmpty()) {
            return module;
        }
        if (Character.isDigit(module.charAt(module.length() - 1))) {
            return module.substring(0, module.length() - 1);
        }
        return module;
    }

    private String moduleNameToLogFileName(String module) {
        if (module.startsWith("jcm_")) {
            return module.substring(4);
        }
        return module;
    }

    private String clientTypeToLogFileName(String module, String clientType) {
        if (module.equals("jcm") && clientType.equals("app")) {
            return "appHH";
        }
        return clientType;
    }

    private File[] joinFiles(Iterable<File[]> filesToJoin, long limit) {
        long currentFileSize = 0;
        List<File> files = new ArrayList<>();
        for (File[] fileToJoin : filesToJoin) {
            for (File file : fileToJoin) {
                if (files.isEmpty()) {
                    files.add(file);
                } else if (currentFileSize + file.length() <= limit) {
                    files.add(file);
                    currentFileSize += file.length();
                } else {
                    return files.toArray(new File[0]);
                }
            }
        }
        return files.toArray(new File[0]);
    }

    private void setDownloadHeader(String keyword, String serverType, String module, HttpServletResponse response) {
        String fileName = (serverType + "_" + module + "_" + decodeKeyword(keyword) + "_"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")))
                .replaceAll(" ", "") + ".txt";
        response.setHeader("Content-Disposition", "attachment; filename=" + fileName);
    }

    /**
     * module 요청 파라미터를 디렉터리/파일명 치환용 정본 형태로 정규화한다 —
     * 소문자화 + QAS_/DEV_ 스테이지 접두 제거. (원 회사는 대문자 디렉터리였으나
     * {CLIENT} 은 모듈 디렉터리·logback LOG_PATH 모두 소문자다.)
     */
    private String normalizeModule(String module) {
        return trimStartingQASOrDEV(module.toLowerCase());
    }

    /**
     * module 화이트리스트 가드 — {MODULE} 이 로그 베이스 디렉터리 경로에 치환되므로,
     * 설정된 모듈 목록({@code analog-express.modules}) 에 없는 값은 400 으로 거부한다
     * (경로 조작 차단). 비교는 양쪽 모두 {@link #normalizeModule(String)} 기준.
     */
    private void validateModule(String module) {
        String normalized = normalizeModule(module);
        boolean allowed = Arrays.stream(modules.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(this::normalizeModule)
                .anyMatch(normalized::equals);
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "허용되지 않은 module 입니다: " + module);
        }
    }

    private String resolveBaseDirectory(String module) {
        return logBaseDir.replace("{MODULE}", normalizeModule(module));
    }

    /**
     * gz 해제 캐시 디렉터리를 결정한다.
     * {@code analog-express.unzip_cache_dir} 미설정 시 {@code {log_base_dir}/.analog-unzip-cache}
     * — dot 접두 이름이라 파일명 범위 필터에 걸리지 않고, 디렉터리 항목은
     * {@link GzipAwareFileSearcher} 의 isFile 체크로 후보에서 제외된다.
     * log_base_dir 가 {MODULE} 치환형이면 캐시도 모듈별 디렉터리가 된다 (의도).
     */
    private File resolveUnzipCacheDir(String module, String resolvedBaseDir) {
        if (unzipCacheDir == null || unzipCacheDir.isBlank()) {
            return new File(resolvedBaseDir, ".analog-unzip-cache");
        }
        return new File(unzipCacheDir.replace("{MODULE}", normalizeModule(module)));
    }

    private String decodeKeyword(String keyword) {
        byte[] decode = Base64.getDecoder().decode(keyword.replace(" ", "+"));
        return new String(decode);
    }

    private String search(List<SearchStrategy> searchStrategies) {
        log.info("찾기 시작/{}", System.currentTimeMillis());
        ExecutorService executorService = Executors.newFixedThreadPool(threadsPerRequest);
        for (SearchStrategy searchStrategy : searchStrategies) {
            executorService.execute(searchStrategy.getTextSearcher());
        }
        executorService.shutdown();
        while (!executorService.isTerminated()) {
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        log.info("검색 완료/{}", System.currentTimeMillis());
        long size = 0;
        long outputLimit = outputLimitMegaByte * 1024 * 1024;
        StringBuilder result = new StringBuilder();
        for (SearchStrategy searchResult : searchStrategies) {
            result.append(searchResult.getSearchResult().getResultAsString(outputLimit - size));
            size = size + searchResult.getSearchResult().getSize();
            if (outputLimit <= size) {
                break;
            }
        }
        log.info("결과 취합 완료/{}", System.currentTimeMillis());
        return result.toString();
    }
}
