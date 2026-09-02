package com.dongkuk.analog.process;

import com.dongkuk.analog.nodes.ObjectNode;
import com.dongkuk.analog.parser.LogParser;
import com.dongkuk.analog.repository.LogRepository;
import com.dongkuk.analog.scanner.LogData;
import com.dongkuk.analog.scanner.LogLexer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;


import java.util.*;


@Data
@Slf4j
public class LogProcessor {

    private Map<String, LogParser> parserMap = new HashMap();
    private Queue<LogData> queue;
    private LogLexer logLexer;
    private LogRepository logRepository;
    private boolean eoq = false;
    private boolean debug = false;

    public LogProcessor(LogLexer logLexer, Queue<LogData> queue) {
        this.logLexer = logLexer;
        logLexer.setQueue(queue);
        this.queue = queue;
    }

    public void init() {
        if(logLexer.isContinuesProcessing()) run();
    }

    public void clear() {
       queue.clear();
       parserMap = new HashMap();
//       parserMap.clear();

    }
    // 연속 모드가 아닐 경우(1회 실행 모드) 전체 트리를 리턴한다.
    public List<Object> getTree() {
        if(logLexer.isContinuesProcessing()) {
            throw new RuntimeException("연속 모드의 경우 사용 할 수 없습니다.");
        }

        List<LogParser> sortedList = new ArrayList<>(parserMap.values());
        List<Object> jsonTree = new ArrayList<>();
        String stringObjectMap = "";
        Collections.sort(sortedList, Comparator.comparing(LogParser::getTime));
        for (LogParser logParser : sortedList) {
           jsonTree.add(logParser.getRequestNode().makeTree());
        }
        ObjectMapper objectMapper = new ObjectMapper();
        String jsonString = null;
        try {
            jsonString = objectMapper.writeValueAsString(jsonTree);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }

        clear();
        return jsonTree;
    }

    private void consume(LogData item) {
        // 마지막이면
        if(item.isEoq()){
//            getTree();
            eoq = true;
            return;
        }

        if(item.getServiceTag().isEmpty()) return;
        LogToken logToken = LogToken.parse(item);
        if(!parserMap.containsKey(item.getServiceTag())) {
            LogParser logParser = new LogParser(logToken);
            logParser.setDebug(debug);
            parserMap.put(item.getServiceTag(), logParser) ;
        }
        parserMap.get(item.getServiceTag()).addQueue(logToken);

        // 여기에서 각 파서에 touchTime 갱신
        parserMap.get(item.getServiceTag()).setTouchTime();

        // 연속 실행 모드 일 경우 mongodb에 저장하고 파서를 삭제 한다.
        if(((ObjectNode)parserMap.get(item.getServiceTag()).getRequestNode()).isComplete() && logLexer.isContinuesProcessing()) {
            logRepository.save(parserMap.get(item.getServiceTag()).getRequestNode().makeTree(), "biz");
            parserMap.remove(item.getServiceTag());
        }

    }

    // todo : LogData 도 <<EOF>> 를 만들어야 될것 같다, 그래서 LogData가 EOF가 되면 LogProcess 종료하면 됨

    public void run() {
//        runScanner();
        if(logLexer.isContinuesProcessing()) {
            // 연속 실행 모드 이면 저장하고 지워줘야 한다.
            // 오래된 로그에 대해서도 지속적인 관리가 필요하다.
            Thread gcThread = new Thread(() -> {
                while(!eoq) {
                    parserMap.forEach((key, parser) -> {
                        Date touchTime = parser.getTouchTime();
                        Date current = new Date();
                        long comparisonTime = current.getTime() - touchTime.getTime();

                        if(comparisonTime > 1000) {
                            log.info(key + "(3000) : 자동저장 ---------------------------- 시간 비교 " + comparisonTime);
                            logRepository.save(parserMap.get(key).getRequestNode().makeTree(), "biz");
                        }
                        if(comparisonTime > 300000) {
                            log.info(key + "(30000) : 오래된 로그 삭제 ---------------------------- 시간 비교 " + comparisonTime);
                            parserMap.remove(key);
                        }
                    });
                    try {
                        Thread.sleep(1000);
                    } catch (InterruptedException e) {
                        throw new RuntimeException(e);
                    }
                }
            });
            gcThread.start();
        }

        try {
            runConsumer();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
   }

   public void runConsumer() throws InterruptedException {
        // 소비자 스레드 생성

        LogData buff = null;
        StringBuilder sb = new StringBuilder();

        while (true) {
            if(queue.isEmpty())
            {
                if(buff != null) {
                    consume(buff);
                    buff = null;
                }

                try {
                    Thread.sleep(100);
                    continue;
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                }
            }
            LogData item = queue.poll();
            if(item.isEoq() && !logLexer.isContinuesProcessing()) {
                log.info("버퍼처리 다 끝났으니 consumer 종료");
                return;
            }

            if(!item.getConStr()) {
                // 이전에 메시지를 소비한다.
                if(buff != null) {
                    buff.setMessage(sb.toString());
                    consume(buff);
                }
                // 새로운 메시지를 만든다.
                buff = item;
                sb.setLength(0);
                sb.append(item.getMessage());
            } else {
                // 메시지를 연결한다.
                sb.append("\n");
                sb.append(item.getMessage());
            }
        }
    }
}