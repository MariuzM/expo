/**
 * Copyright © 2022 650 Industries.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import path from 'node:path';

import { logMetroErrorAsync } from './metroErrorInterface';
import { getApiRoutesForDirectory } from './router';
import { requireFileContentsWithMetro } from '../getStaticRenderFunctions';

const debug = require('debug')('expo:server-routes') as typeof console.log;

const pendingRouteOperations = new Map<string, Promise<string | null>>();

export type ApiRouteOptions = {
  mode?: string;
  appDir: string;
  port?: number;
  shouldThrow?: boolean;
};

// Bundle the API Route with Metro and return the string contents to be evaluated in the server.
export async function bundleApiRoute(
  projectRoot: string,
  filepath: string,
  options: ApiRouteOptions
): Promise<string | null | undefined> {
  if (pendingRouteOperations.has(filepath)) {
    return pendingRouteOperations.get(filepath);
  }

  const devServerUrl = `http://localhost:${options.port}`;

  async function bundleAsync() {
    try {
      debug('Check API route:', options.appDir, filepath);

      const middleware = await requireFileContentsWithMetro(projectRoot, devServerUrl, filepath, {
        minify: options.mode === 'production',
        dev: options.mode !== 'production',
        // Ensure Node.js
        environment: 'node',
      });

      return middleware;
    } catch (error: any) {
      if (error instanceof Error) {
        await logMetroErrorAsync({ error, projectRoot });
      }
      if (options.shouldThrow) {
        throw error;
      }
      // TODO: improve error handling, maybe have this be a mock function which returns the static error html
      return null;
    } finally {
      // pendingRouteOperations.delete(filepath);
    }
  }
  const route = bundleAsync();

  pendingRouteOperations.set(filepath, route);
  return route;
}

export async function rebundleApiRoute(
  projectRoot: string,
  filepath: string,
  options: ApiRouteOptions
) {
  pendingRouteOperations.delete(filepath);
  return bundleApiRoute(projectRoot, filepath, options);
}

export async function exportAllApiRoutesAsync(projectRoot: string, options: ApiRouteOptions) {
  const files: Map<string, string> = new Map();

  await Promise.all(
    getApiRoutesForDirectory(options.appDir).map(async (filepath) => {
      const contents = await bundleApiRoute(projectRoot, filepath, options);
      files.set(path.relative(options.appDir, filepath.replace(/\.[tj]sx?$/, '.js')), contents!);
    })
  );

  return files;
}
