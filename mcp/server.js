#!/usr/bin/env node
/**
 * Altiora MCP server.
 *
 * Exposes the Offline Tasker SQLite database (expenses, tasks, habits, daily
 * records, trading journal, notebooks, app usage) to MCP clients over stdio.
 *
 * Configuration:
 *   ALTIORA_DB_PATH      path to the .db file       (default: <repo>/offline_tasker.db)
 *   ALTIORA_MCP_READONLY set to 1 to hide all write tools
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools, findTool } from './lib/tools.js';
import { dbStats, listTables, columnsOf, dbPath, READ_ONLY } from './lib/db.js';

const server = new Server(
    { name: 'altiora', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) {
        return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        };
    }
    try {
        const result = await tool.handler(request.params.arguments ?? {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
        return {
            isError: true,
            content: [{ type: 'text', text: `${tool.name} failed: ${err.message}` }],
        };
    }
});

const RESOURCES = [
    {
        uri: 'altiora://schema',
        name: 'Altiora database schema',
        description: 'Tables and columns of the Offline Tasker SQLite database',
        mimeType: 'application/json',
        read: () => Object.fromEntries(listTables().map((t) => [t, columnsOf(t)])),
    },
    {
        uri: 'altiora://db-info',
        name: 'Altiora database status',
        description: 'File path, size, last-modified time and per-table row counts',
        mimeType: 'application/json',
        read: () => dbStats(),
    },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = RESOURCES.find((r) => r.uri === request.params.uri);
    if (!resource) throw new Error(`Unknown resource: ${request.params.uri}`);
    return {
        contents: [{
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: JSON.stringify(resource.read(), null, 2),
        }],
    };
});

// stdout is the MCP transport — diagnostics must go to stderr only.
console.error(`[altiora-mcp] db=${dbPath()} readonly=${READ_ONLY} tools=${tools.length}`);

await server.connect(new StdioServerTransport());
