import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

async function main() {
  const binaryPath = process.env.ACP_BINARY || "node_modules/.bin/claude-code-acp";

  console.log("Spawning:", binaryPath);

  const proc = spawn(binaryPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env }
  });

  proc.stderr.on("data", (d) => console.error("stderr:", d.toString().trim()));

  // Create acp.Client implementation for handling agent callbacks
  const clientImpl = {
    requestPermission: async (_params) => {
      return { outcome: { outcome: "cancelled" } };
    },
    sessionUpdate: (_params) => {
      return Promise.resolve();
    },
    writeTextFile: async (_params) => {
      return {};
    },
    readTextFile: async (_params) => {
      return { content: "" };
    },
    createTerminal: (_params) => {
      return Promise.resolve({ terminalId: "test-terminal" });
    }
  };

  // Use ndJsonStream and ClientSideConnection (SDK 0.13.0 API)
  const input = Writable.toWeb(proc.stdin);
  const output = Readable.toWeb(proc.stdout);
  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection((_agent) => clientImpl, stream);

  try {
    const result = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      clientInfo: { name: "caps-test", version: "1.0.0" }
    });

    console.log("\n=== Agent Info ===");
    console.log(JSON.stringify(result.agentInfo, null, 2));

    console.log("\n=== Agent Capabilities ===");
    console.log(JSON.stringify(result.agentCapabilities, null, 2));

    if (result.agentCapabilities?.sessionCapabilities) {
      console.log("\n=== Session Capabilities (detailed) ===");
      const sc = result.agentCapabilities.sessionCapabilities;
      console.log("  fork:", sc.fork);
      console.log("  resume:", sc.resume);
      console.log("  list:", sc.list);
    }

    // Try to list sessions
    console.log("\n=== Testing listSessions ===");
    try {
      const sessions = await connection.unstable_listSessions({ cwd: process.cwd() });
      console.log("Sessions found:", sessions.sessions?.length || 0);
      if (sessions.sessions?.length > 0) {
        console.log("First session:", JSON.stringify(sessions.sessions[0], null, 2));
      }
    } catch (e) {
      console.log("listSessions error:", e.message);
    }

  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    proc.kill();
    process.exit(0);
  }
}

main();
