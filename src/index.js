import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const envSchema = z.object({
  POP_BASE_URL: z.string().url().optional(),
  POP_API_KEY: z.string().min(1).optional(),
  POP_API_KEY_HEADER: z.string().min(1).optional(),
});

const env = envSchema.parse(process.env);
const DEFAULT_BASE_URL = "https://popapi.io";
const baseUrlDefault = env.POP_BASE_URL ?? DEFAULT_BASE_URL;
const apiKey = env.POP_API_KEY;
const apiKeyHeader = env.POP_API_KEY_HEADER ?? "X-API-Key";

const server = new Server(
  {
    name: "pop-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const createUblSchema = z.object({
  base_url: z.string().url().optional(),
  payload: z.record(z.any()),
  integration: z
    .object({
      use: z.string(),
      action: z.string(),
    })
    .optional(),
});

server.tool(
  "create_ubl_invoice",
  "Create UBL invoice (optionally with PEPPOL integration via POP).",
  createUblSchema,
  async ({ base_url, payload, integration }) => {
    const url = `${base_url ?? baseUrlDefault}/wp-json/api/v2/create-ubl`;

    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text:
              "Missing POP_API_KEY environment variable. Set it to your POP API key.",
          },
        ],
        isError: true,
      };
    }

    const body = {
      ...payload,
      ...(integration ? { integration } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [apiKeyHeader]: apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      return {
        content: [
          {
            type: "text",
            text: `POP API error (${res.status}): ${JSON.stringify(parsed)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(parsed, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
