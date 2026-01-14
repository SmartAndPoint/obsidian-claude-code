#!/usr/bin/env node
/**
 * Headless test for ACP connection
 * Tests that we can connect to claude-code-acp and exchange messages
 * without Obsidian UI
 */

import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import type * as ACP from "@agentclientprotocol/sdk";

async function main() {
  console.log("🧪 Headless ACP Connection Test\n");

  console.log("1. Checking claude-code-acp availability...");

  const acp = await import("@agentclientprotocol/sdk");

  console.log("2. Spawning claude-code-acp process...");

  const agentProcess = spawn("claude-code-acp", [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  agentProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[agent stderr] ${data.toString()}`);
  });

  agentProcess.on("error", (error: Error) => {
    console.error("❌ Failed to spawn claude-code-acp:", error.message);
    console.log("\nMake sure claude-code-acp is installed:");
    console.log("  npm install -g @zed-industries/claude-code-acp");
    console.log("\nAnd ANTHROPIC_API_KEY is set in environment.");
    process.exit(1);
  });

  if (!agentProcess.stdin || !agentProcess.stdout) {
    console.error("❌ Failed to get process streams");
    process.exit(1);
  }

  console.log("3. Creating ACP connection...");

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(agentProcess.stdout) as ReadableStream<Uint8Array>;

  const testClient: ACP.Client = {
    async requestPermission(params: ACP.RequestPermissionRequest): Promise<ACP.RequestPermissionResponse> {
      console.log(`\n🔐 Permission requested: ${params.toolCall.title}`);
      return {
        outcome: {
          outcome: "selected",
          optionId: params.options[0].optionId,
        },
      };
    },

    async sessionUpdate(params: ACP.SessionNotification): Promise<void> {
      const update = params.update;
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
          if (update.content.type === "text") {
            process.stdout.write(update.content.text);
          }
          break;
        case "tool_call":
          console.log(`\n🔧 Tool: ${update.title ?? "Tool"} (${update.status ?? "running"})`);
          break;
        default:
          break;
      }
    },

    async writeTextFile(params: ACP.WriteTextFileRequest): Promise<ACP.WriteTextFileResponse> {
      console.log(`\n📝 Write file: ${params.path}`);
      return {};
    },

    async readTextFile(params: ACP.ReadTextFileRequest): Promise<ACP.ReadTextFileResponse> {
      console.log(`\n📖 Read file: ${params.path}`);
      return { content: "Test file content" };
    },
  };

  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection((_agent) => testClient, stream);

  try {
    console.log("4. Initializing connection...");

    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });

    console.log(`✅ Connected! Protocol v${initResult.protocolVersion}`);

    console.log("\n5. Creating session...");

    const sessionResult = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    console.log(`✅ Session created: ${sessionResult.sessionId}`);

    console.log("\n6. Sending test message...");
    console.log('   Message: "Hello! Respond with exactly: HEADLESS_TEST_OK"\n');
    console.log("━".repeat(50));
    console.log("Agent response:");
    console.log("━".repeat(50));

    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: 'Hello! Respond with exactly: HEADLESS_TEST_OK',
        },
      ],
    });

    console.log("\n" + "━".repeat(50));
    console.log(`\n✅ Prompt completed: ${promptResult.stopReason}`);
    console.log("\n🎉 Headless test PASSED!\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  } finally {
    agentProcess.kill();
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
