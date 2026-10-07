// 주석·문자열·템플릿 처리 경계
const a = "don't // not a comment fetch('/api/auth/me')";
const b = 'say "hi" /* not a comment */ fetch("/api/auth/me")';
const c = `template ${ fn("}") } // still template ${nested(`inner ${x}`)} fetch('/api/auth/me')`;
/* 블록 주석
   여러 줄 fetch('/api/auth/me')
*/ fetch('/api/auth/me'); // 줄 끝 주석 fetch('/api/auth/me')
const re = /\/\/ not comment/g;
const jsx = <p>It's a JSX apostrophe // and not a comment</p>;
const jsx2 = <p>don't</p>; fetch(`/api/auth/me`);
const escaped = "a \" b // c"; fetch('/api/auth/me');
const unterminated = 'abc
fetch('/api/auth/me');
/* 닫히지 않는 블록 주석 fetch('/api/auth/me')
