"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useFleetStore } from "@/stores/fleet-store";
import { useDroneManager } from "@/stores/drone-manager";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { useAgentSystemStore } from "@/stores/agent-system-store";
import { usePairingStore, type PairedDrone } from "@/stores/pairing-store";
import { useCommandFleetStore, type CommandCloudStatus } from "@/stores/command-fleet-store";
import { useNodeRegistryStore } from "@/stores/node-registry";

const DEMO_AGENTS: PairedDrone[] = [
  {
    _id: "demo-agent-alpha",
    userId: "demo",
    deviceId: "demo-alpha",
    name: "Alpha Scout",
    apiKey: "demo",
    agentVersion: "0.9.10",
    board: "Reference Companion",
    tier: 3,
    os: "Linux",
    lastIp: "127.0.0.1",
    lastSeen: Date.now(),
    fcConnected: true,
    pairedAt: Date.now() - 86_400_000,
  },
  {
    _id: "demo-agent-bravo",
    userId: "demo",
    deviceId: "demo-bravo",
    name: "Bravo Survey",
    apiKey: "demo",
    agentVersion: "0.9.10",
    board: "Reference Companion",
    tier: 2,
    os: "Linux",
    lastIp: "127.0.0.1",
    lastSeen: Date.now(),
    fcConnected: true,
    pairedAt: Date.now() - 72_000_000,
  },
  {
    _id: "demo-agent-charlie",
    userId: "demo",
    deviceId: "demo-charlie",
    name: "Charlie Relay",
    apiKey: "demo",
    agentVersion: "0.9.10",
    board: "Ground Node",
    tier: 2,
    os: "Linux",
    lastIp: "127.0.0.1",
    lastSeen: Date.now() - 30_000,
    fcConnected: false,
    pairedAt: Date.now() - 60_000_000,
  },
  {
    _id: "demo-agent-delta",
    userId: "demo",
    deviceId: "demo-delta",
    name: "Delta Offline",
    apiKey: "demo",
    agentVersion: "0.9.8",
    board: "Reference Companion",
    tier: 1,
    os: "Linux",
    lastIp: "127.0.0.1",
    lastSeen: Date.now() - 120_000,
    fcConnected: false,
    pairedAt: Date.now() - 48_000_000,
  },
];

export function DemoProvider() {
  const demoMode = useSettingsStore((s) => s.demoMode);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated || !demoMode) return;

    let mounted = true;
    let engine: { start: (ms: number) => void; stop: () => void } | undefined;
    import("@/mock/engine").then((mod) => {
      if (!mounted) return;
      engine = mod.mockEngine;
      engine.start(200);
    });

    // Auto-connect the agent store in demo mode
    useAgentConnectionStore.getState().connect("mock://demo");
    usePairingStore.getState().setPairedDrones(DEMO_AGENTS);

    const updateCommandFleetDemo = () => {
      const now = Date.now();
      const statuses: CommandCloudStatus[] = DEMO_AGENTS.map((agent, index) => {
        const age = index === 2 ? 30_000 : index === 3 ? 120_000 : 0;
        return {
          deviceId: agent.deviceId,
          version: agent.agentVersion,
          uptimeSeconds: 7_200 + index * 900,
          boardName: agent.board,
          boardTier: agent.tier,
          boardSoc: index === 2 ? "ground-node" : "companion",
          boardArch: "arm64",
          cpuPercent: 28 + index * 11,
          memoryPercent: 42 + index * 7,
          diskPercent: 31 + index * 4,
          temperature: 44 + index * 2,
          fcConnected: !!agent.fcConnected,
          fcPort: agent.fcConnected ? "/dev/ttyACM0" : "",
          fcBaud: agent.fcConnected ? 115200 : 0,
          services: [
            { name: "ados-api", status: index === 3 ? "stopped" : "running" },
            { name: "ados-mavlink", status: agent.fcConnected ? "running" : "stopped" },
            { name: "ados-video", status: index < 2 ? "stopped" : "stopped" },
          ],
          lastIp: agent.lastIp,
          videoState: "stopped",
          videoWhepPort: 0,
          mavlinkWsPort: agent.fcConnected ? 8765 : 0,
          telemetry: {
            armed: index === 1,
            mode: index === 1 ? "AUTO" : index === 0 ? "LOITER" : "",
            position: {
              lat: 12.9716 + index * 0.004,
              lon: 77.5946 + index * 0.003,
              alt_rel: index < 2 ? 42 + index * 18 : 0,
              heading: 80 + index * 30,
            },
            velocity: {
              groundspeed: index === 1 ? 8.4 : index === 0 ? 2.1 : 0,
            },
            battery: {
              voltage: 15.8 - index * 0.4,
              remaining: Math.max(18, 86 - index * 17),
            },
            gps: {
              fix_type: index < 2 ? 3 : 0,
              satellites: index < 2 ? 16 - index : 0,
            },
            last_update: now - age,
          },
          updatedAt: now - age,
        };
      });
      useCommandFleetStore.getState().setCloudStatuses(statuses);
      for (const status of statuses) {
        if (status.telemetry) {
          useCommandFleetStore.getState().setTelemetry(status.deviceId, status.telemetry);
        }
      }
      usePairingStore.getState().setPairedDrones(
        DEMO_AGENTS.map((agent, index) => ({
          ...agent,
          lastSeen: now - (index === 2 ? 30_000 : index === 3 ? 120_000 : 0),
        })),
      );
    };

    updateCommandFleetDemo();
    const demoFleetInterval = setInterval(updateCommandFleetDemo, 2000);

    return () => {
      mounted = false;
      clearInterval(demoFleetInterval);
      engine?.stop();
      useAgentConnectionStore.getState().disconnect();
      // `disconnect()` already clears the agent system store, but call
      // it again explicitly so a future refactor of the connection store
      // can't silently re-introduce a stale mock status on the screen.
      useAgentSystemStore.getState().clear();
      useDroneManager.getState().clear();
      useFleetStore.getState().setDrones([]);
      useFleetStore.getState().clearAlerts();
      usePairingStore.getState().clear();
      useCommandFleetStore.getState().clear();
      // The demo seeds the node registry (the single fleet write target);
      // clear it too so toggling demo off leaves no ghost rows for the
      // FleetProjectionBridge to re-project.
      useNodeRegistryStore.getState().clear();
    };
  }, [demoMode, hasHydrated]);

  return null;
}
