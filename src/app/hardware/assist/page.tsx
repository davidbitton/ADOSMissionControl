"use client";
import { useAgentConnectionStore } from "@/stores/agent-connection-store";
import { AssistTabBody } from "@/components/assist/AssistTabBody";

export default function HardwareAssistPage() {
  const agentUrl = useAgentConnectionStore((s) => s.agentUrl);
  const apiKey = useAgentConnectionStore((s) => s.apiKey);
  return (
    <AssistTabBody
      agentUrl={agentUrl}
      apiKey={apiKey}
      agentProfile="ground_station"
    />
  );
}
