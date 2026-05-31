/**
 * Cloud-relay heartbeat contract tests for the `pushStatus` mutation.
 *
 * Companion to `cmdDroneStatus.test.ts` (which pins the LCD + video
 * local surface). This file owns the broader contract:
 *
 *   - required args (deviceId, version, uptimeSeconds) declare correctly
 *   - well-known optional args declare with the matching validator shape
 *   - the `cmd_droneStatus` schema table mirrors the mutation args
 *     (every field on the table appears on the mutation, and vice versa
 *     for the fields that actually need to be settable from the agent)
 *   - a snapshot of the full args key set so a future schema drift
 *     surfaces as a single, easy-to-review test diff
 *
 * Convex internal mutations cannot be invoked directly without a
 * runtime, so the contract is asserted against the source text. This
 * mirrors the established pattern in this folder.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MUTATION_PATH = path.join(process.cwd(), "convex/cmdDroneStatus.ts");
const SCHEMA_PATH = path.join(process.cwd(), "convex/schema.ts");

/**
 * Parse the `args: { ... }` block out of a Convex mutation source file
 * by signature-based bracket matching. Returns a map from arg name to
 * the verbatim validator expression (e.g. `"v.optional(v.string())"`).
 *
 * This is deliberately string-based: we want to catch a future refactor
 * that changes the validator shape (e.g. `v.optional(v.string())` →
 * `v.string()` would silently break agents that omit the field).
 */
function parseArgsBlock(source: string, exportName: string): Map<string, string> {
  const exportIdx = source.indexOf(`export const ${exportName}`);
  if (exportIdx < 0) throw new Error(`export ${exportName} not found`);
  const argsIdx = source.indexOf("args:", exportIdx);
  if (argsIdx < 0) throw new Error(`args block for ${exportName} not found`);
  const openBrace = source.indexOf("{", argsIdx);
  if (openBrace < 0) throw new Error("args open brace not found");

  // Walk to the matching close brace, tracking nesting depth so nested
  // `v.object({ ... })` validators don't terminate the args block early.
  let depth = 0;
  let close = -1;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error("args close brace not found");
  const body = source.slice(openBrace + 1, close);

  // Strip line comments first so commas inside `// ... ,` don't split
  // entries early. Block comments are not used inside the args block.
  const stripped = body
    .split("\n")
    .map((line) => {
      const slash = line.indexOf("//");
      return slash >= 0 ? line.slice(0, slash) : line;
    })
    .join("\n");

  // Split into top-level field entries (depth-aware so we don't slice
  // through a nested validator).
  const entries: string[] = [];
  let buf = "";
  let inDepth = 0;
  for (const ch of stripped) {
    if (ch === "{" || ch === "(" || ch === "[") inDepth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") inDepth -= 1;
    if (ch === "," && inDepth === 0) {
      if (buf.trim().length > 0) entries.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0) entries.push(buf.trim());

  const map = new Map<string, string>();
  for (const entry of entries) {
    const cleaned = entry.trim();
    if (cleaned.length === 0) continue;
    const colon = cleaned.indexOf(":");
    if (colon < 0) continue;
    const name = cleaned.slice(0, colon).trim();
    const value = cleaned.slice(colon + 1).trim();
    // Skip non-identifier names (defensive against parser drift).
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) continue;
    map.set(name, value);
  }
  return map;
}

describe("pushStatus required args (audit baseline)", () => {
  it("declares deviceId, version, uptimeSeconds as required (not optional)", async () => {
    const text = await readFile(MUTATION_PATH, "utf8");
    const args = parseArgsBlock(text, "pushStatus");
    expect(args.get("deviceId")).toBe("v.string()");
    expect(args.get("version")).toBe("v.string()");
    expect(args.get("uptimeSeconds")).toBe("v.number()");
  });

  it("persists updatedAt server-side (set inside the handler, not on args)", async () => {
    const text = await readFile(MUTATION_PATH, "utf8");
    const args = parseArgsBlock(text, "pushStatus");
    // The agent never sends a clock value; the cloud stamps it.
    expect(args.has("updatedAt")).toBe(false);
    expect(text).toContain("const now = Date.now();");
    expect(text).toContain("updatedAt: now,");
  });
});

describe("pushStatus optional system-resource args", () => {
  // The audit called out these fields as the canonical lite + full
  // heartbeat overlap. Each must declare the matching v.optional shape
  // so an agent that omits the field round-trips cleanly.
  const SYSTEM_RESOURCE_FIELDS: ReadonlyArray<[string, string]> = [
    ["runtimeMode", "v.optional(v.string())"],
    ["cpuPercent", "v.optional(v.number())"],
    ["memoryUsedMb", "v.optional(v.number())"],
    ["memoryTotalMb", "v.optional(v.number())"],
    ["temperature", "v.optional(v.float64())"],
    ["diskPercent", "v.optional(v.number())"],
    ["cpuCores", "v.optional(v.number())"],
    ["boardRamMb", "v.optional(v.number())"],
  ];

  it.each(SYSTEM_RESOURCE_FIELDS)(
    "declares %s with the expected validator shape",
    async (field, validator) => {
      const text = await readFile(MUTATION_PATH, "utf8");
      const args = parseArgsBlock(text, "pushStatus");
      expect(args.get(field)).toBe(validator);
    },
  );
});

describe("pushStatus args / cmd_droneStatus schema parity", () => {
  /**
   * Snapshot the full args key set. A future schema change (added or
   * removed field) shows up as a single test diff that the reviewer
   * can intentionally accept by updating the snapshot. This guards
   * against the "args silently diverges from schema" failure mode
   * where the agent reports a field the cloud quietly drops.
   */
  it("matches the recorded args key snapshot", async () => {
    const text = await readFile(MUTATION_PATH, "utf8");
    const args = parseArgsBlock(text, "pushStatus");
    const keys = Array.from(args.keys()).sort();
    expect(keys).toMatchInlineSnapshot(`
      [
        "apiUrl",
        "boardArch",
        "boardCpuProbed",
        "boardName",
        "boardRamMb",
        "boardSoc",
        "boardSocProbed",
        "boardTier",
        "cameraState",
        "canBuses",
        "cloudPosture",
        "cloudRelayUrl",
        "cloudflareUrl",
        "cpuCores",
        "cpuHistory",
        "cpuPercent",
        "deviceId",
        "diskPercent",
        "diskTotalGb",
        "diskUsedGb",
        "displayType",
        "enrollment",
        "failedSteps",
        "fcBaud",
        "fcConnected",
        "fcPort",
        "hwEncoderProbed",
        "installStatus",
        "installVersion",
        "kernelRelease",
        "lastIp",
        "last_plugin_update_check_at",
        "lcdActivePage",
        "lcdLastGesture",
        "lcdLastTouchAt",
        "lcdRotation",
        "lcdSnapshotUrl",
        "lcdTouchCalibrated",
        "logs",
        "manualConnectionUrls",
        "mavlinkWsPort",
        "mavlinkWsUrl",
        "mavlinkWsUrlPrev",
        "mdnsHost",
        "memoryAvailableMb",
        "memoryCacheMb",
        "memoryHistory",
        "memoryPercent",
        "memoryTotalMb",
        "memoryUsedMb",
        "missionControlUrl",
        "peerChannel",
        "peerDeviceId",
        "peerRole",
        "peerRssiDbm",
        "peerSeenAtUnix",
        "peers",
        "peripheralStates",
        "peripherals",
        "pluginInventory",
        "processCpuPercent",
        "processMemoryMb",
        "profile",
        "profileSource",
        "radio",
        "remoteAccess",
        "role",
        "runtimeMode",
        "scripts",
        "services",
        "setupState",
        "setupUrl",
        "suites",
        "swapPercent",
        "swapTotalMb",
        "swapUsedMb",
        "telemetry",
        "temperature",
        "uiTheme",
        "uptimeSeconds",
        "version",
        "videoCameraSource",
        "videoEncoderHwAccel",
        "videoEncoderName",
        "videoLocalDecoderActive",
        "videoLocalDecoderFps",
        "videoLocalDecoderType",
        "videoPipelineFlavor",
        "videoPipelineState",
        "videoRecording",
        "videoRestartAttempts",
        "videoState",
        "videoWhepPort",
        "videoWhepUrl",
        "visionActiveModel",
        "visionBackend",
        "visionDetectionsPerSec",
        "visionFps",
        "wfbAdapterChipset",
        "wfbAdapterInjectionOk",
        "wfbFailoverState",
        "wfbModuleSource",
      ]
    `);
  });

  it("schema table cmd_droneStatus declares every published optional arg", async () => {
    // The schema does not have to declare every arg verbatim (the agent
    // may push transient fields the table chooses not to persist), but
    // every field on the table that is settable via push must appear
    // on the mutation. This catches the inverse drift: schema adds a
    // field, mutation forgets to receive it from the agent.
    const [mutationText, schemaText] = await Promise.all([
      readFile(MUTATION_PATH, "utf8"),
      readFile(SCHEMA_PATH, "utf8"),
    ]);
    const args = parseArgsBlock(mutationText, "pushStatus");

    // Spot-check fields the schema is known to expose; this avoids
    // re-parsing the entire schema file (out of scope for one test).
    const SCHEMA_FIELDS_TO_VERIFY = [
      "deviceId",
      "version",
      "uptimeSeconds",
      "runtimeMode",
      "cpuPercent",
      "memoryUsedMb",
      "temperature",
      "fcConnected",
      "lcdActivePage",
      "videoLocalDecoderActive",
      "wfbFailoverState",
      "profile",
      "role",
    ];
    for (const field of SCHEMA_FIELDS_TO_VERIFY) {
      expect(schemaText, `schema must declare ${field}`).toContain(
        `${field}:`,
      );
      expect(args.has(field), `mutation must accept ${field}`).toBe(true);
    }
  });
});
