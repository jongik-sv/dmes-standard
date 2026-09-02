package com.dongkuk.analog.scanner;

import com.google.code.regexp.Pattern;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.IOException;
import java.util.Map;
import java.util.Queue;
import com.google.code.regexp.Matcher;

@Slf4j
@Data
public class LogLexer {
    private Queue<LogData> queue;
    private boolean continuesProcessing = false;
    private Pattern logPattern = Pattern.compile("\\[(.*?)\\]\\[(.*?)\\]\\[(.*?)\\]\\[(.*?)\\]-(.*)");
    private String startString = "[";

    public void setQueue(Queue<LogData> queue) {
        this.queue = queue;
    }

    public void setLogPattern(String logPattern) {
        this.logPattern = Pattern.compile(logPattern);
    }

//    public void setLogPattern(Pattern logPattern) {
//        this.logPattern = logPattern;
//    }

    public void setContinuesProcessing(boolean continuesProcessing) {
        this.continuesProcessing = continuesProcessing;
    }

    public boolean isContinuesProcessing() {
        return continuesProcessing;
    }

    private LogData parse(String logString) {
        LogData logData = new LogData();


        if (logString.startsWith(startString)) {
            Matcher matcher = logPattern.matcher(logString);

            if(!matcher.matches()) {
                return null;
            }
            for(Map<String, String> map: matcher.namedGroups() ) {
                for (String groupName : map.keySet()) {
//                    map.get(groupName);
                    if(groupName.equals("time")) {
                        logData.setTime(map.get(groupName));
                    } else if(groupName.equals("level")) {
                        logData.setLevel(map.get(groupName));
                    } else if(groupName.equals("thread")) {
                        logData.setThread(map.get(groupName));
                    } else if(groupName.equals("serviceTag")) {
                        logData.setServiceTag(map.get(groupName));
                    } else if(groupName.equals("logger")) {
                        logData.setLogger(map.get(groupName));
                    } else if(groupName.equals("message")) {
                        logData.setMessage(map.get(groupName));
                    }
                }
            }
            logData.setConStr(false);

//            if (matcher.find())
//                logData.setTime(matcher.group(1));
//                logData.setLevel(matcher.group(2));
//                logData.setServiceTag(matcher.group(3));
//                logData.setLogger(matcher.group(4));
//                logData.setMessage(matcher.group(5).trim());
//                logData.setConStr(false);
//            }
        } else {
            logData.setMessage(logString);
            logData.setConStr(true);
        }
        return logData;
    }

    /**
     * reader를 받아서 공유하고 있는 queue에 로그를 기본 파싱해서 넣는 역할을 한다.
     * @param reader
     * @throws IOException
     * @throws InterruptedException
     */
    public void readBuffer(BufferedReader reader) throws IOException {
        String line;
        while (true) {
            if (!((line = reader.readLine()) != null)) break;
            LogData ll = parse(line);
            if(ll == null) {
                log.error("파싱불가 : "  + line );
                continue;
            } else {
                queue.add(ll); // 큐에 한 줄씩 추가
            }

            // 큐의 크기가 10000개 이상이면 1초간 대기
            if (queue.size() >= 100000) {
                log.info("-------------------------------큐가 가득차서 잠시 대기합니다.-------------------------------------------");
                try {
                    Thread.sleep(1000); // 0.1초간 대기
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                }
            }
        }

        // 연속이 아니면 EOQ를 보낸다.
        if(!continuesProcessing) {
            LogData logData = new LogData();
            logData.setConStr(false);
            logData.setEoq(true);
            queue.add(logData);
        }
    }

    public void setStartString(String startString) {
        this.startString = startString;
    }
}
