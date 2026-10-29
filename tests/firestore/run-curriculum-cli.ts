import { execFile } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCurriculumCli(...args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile('node', ['tools/curriculum/cli.ts', ...args], (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr,
      });
    });
  });
}
