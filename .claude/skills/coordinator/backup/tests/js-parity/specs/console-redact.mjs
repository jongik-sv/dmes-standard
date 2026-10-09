// console-redact.sh ↔ console-redact.mjs 대조 명세. 형식은 ../README.md.
import { gen } from '../gen.mjs';

export default {
  module: 'console-redact',
  sh: 'scripts/lib/console-redact.sh',
  mjs: 'scripts/lib/console-redact.mjs',
  switchEnv: 'COORD_JS_REDACT',
  functions: {
    console_redact_text: { js: ['text'], gen: gen('text'), compareFiles: false },
    console_screen_filter: { js: ['screen'], gen: gen('screen'), compareFiles: false },
    console_screen_sha: { js: ['sha'], gen: gen('screen'), compareFiles: false },
    console_clean_prompt: { js: ['clean-prompt'], gen: gen('prompt'), compareFiles: false },
  },
};
