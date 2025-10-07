import { describe, it, expect } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

// Helper to set environment variables with UPPER_SNAKE_CASE names
// Using bracket notation to avoid naming-convention and dot-notation lint rules
const setEnv = (
  env: Record<string, string | undefined>,
  key: string,
  value: string,
): void => {
  env[key] = value;
};

describe('Docker Compose Configuration', () => {
  it('should validate server docker-compose.yml syntax', async () => {
    const composePath = path.join(
      process.cwd(),
      'docker-compose.yml',
    );

    try {
      const testEnv = {
        ...process.env,
      };
      // Provide minimal required env vars for validation
      setEnv(testEnv, 'DB_PASSWORD', 'test');

      const { stdout, stderr } = await execAsync(
        `docker-compose -f ${composePath} config --quiet`,
        {
          cwd: process.cwd(),
          env: testEnv,
        },
      );

      // config --quiet returns empty output on success
      expect(stderr).toBe('');
      expect(stdout).toBe('');
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string };
      // Fail the test with the docker-compose error message
      throw new Error(
        `Docker Compose validation failed: ${err.stderr ?? err.stdout ?? 'Unknown error'}`,
      );
    }
  });

  it('should have valid service definition structure', async () => {
    const composePath = path.join(
      process.cwd(),
      'docker-compose.yml',
    );

    const testEnv = {
      ...process.env,
    };
    setEnv(testEnv, 'DB_PASSWORD', 'test');
    setEnv(testEnv, 'DB_HOST', 'localhost');
    setEnv(testEnv, 'DB_PORT', '5432');
    setEnv(testEnv, 'DB_USER', 'postgres');
    setEnv(testEnv, 'DB_NAME', 'raceday');
    setEnv(testEnv, 'NZTAB_API_URL', 'https://api.tab.co.nz');

    const { stdout } = await execAsync(
      `docker-compose -f ${composePath} config`,
      {
        cwd: process.cwd(),
        env: testEnv,
      },
    );

    // Parse the YAML output to verify structure
    expect(stdout).toContain('services:');
    expect(stdout).toContain('server:');
    expect(stdout).toContain('container_name: raceday-server');
    expect(stdout).toContain('restart: unless-stopped');
    // CPU can be "4" or 4 depending on docker-compose version
    expect(stdout.includes('cpus: "4"') || stdout.includes('cpus: 4')).toBe(
      true,
    );
    expect(stdout).toContain('memory: "4294967296"');
  });

  it('should have proper health check configuration', async () => {
    const composePath = path.join(
      process.cwd(),
      'docker-compose.yml',
    );

    const testEnv = {
      ...process.env,
    };
    setEnv(testEnv, 'DB_PASSWORD', 'test');

    const { stdout } = await execAsync(
      `docker-compose -f ${composePath} config`,
      {
        cwd: process.cwd(),
        env: testEnv,
      },
    );

    expect(stdout).toContain('healthcheck:');
    expect(stdout).toContain('http://localhost:7000/health');
    expect(stdout).toContain('interval: 30s');
    expect(stdout).toContain('timeout: 10s');
    expect(stdout).toContain('retries: 3');
  });

  it('should expose port 7000', async () => {
    const composePath = path.join(
      process.cwd(),
      'docker-compose.yml',
    );

    const testEnv = {
      ...process.env,
    };
    setEnv(testEnv, 'DB_PASSWORD', 'test');

    const { stdout } = await execAsync(
      `docker-compose -f ${composePath} config`,
      {
        cwd: process.cwd(),
        env: testEnv,
      },
    );

    // Port can be in format "7000:7000" or expanded format with target/published
    expect(
      stdout.includes('7000:7000') ||
        (stdout.includes('target: 7000') && stdout.includes('published: "7000"')),
    ).toBe(true);
  });
});
