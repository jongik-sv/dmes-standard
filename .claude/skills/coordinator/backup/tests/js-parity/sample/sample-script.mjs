// sample-script.sh 의 node 판(스크립트 전체를 옮기는 모듈의 틀).
import { isMain, scriptMain } from '../../../scripts/lib/js-cli.mjs';

export async function main(argv) {
  process.stdout.write(`args=${argv.length}\n${argv.map((a) => `[${a}]\n`).join('')}`);
  return argv.length % 3;
}
if (isMain(import.meta.url)) scriptMain(main);
