'use client';

import { Client, Databases, Query } from 'appwrite';
import { logWarn } from '@/utils/logging';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

if (!endpoint || !projectId) {
  logWarn(
    'Missing Appwrite environment variables, using placeholder values',
    { endpoint: !!endpoint, projectId: !!projectId },
    'AppwriteClient'
  );
}

export const client = new Client()
  .setEndpoint(endpoint || 'https://placeholder.appwrite.io/v1')
  .setProject(projectId || 'placeholder-project');

export const databases = new Databases(client);
export { Query };