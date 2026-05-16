/**
 * @module mqtt-broker-credential
 * @description Process-level singleton for the read-only MQTT broker
 * credential used by every in-browser MQTT client (MqttBridge,
 * CommandFleetMqttBridge, MqttMavlinkTransport, WebRTC signaling).
 *
 * The production broker enforces auth via the `gcs-viewer` username
 * + password published by Convex `clientConfig.getClientConfig`. A
 * bootstrap component (CommandShell) populates this singleton once
 * the public client config is available; transports then read it at
 * connect time without any prop drilling.
 *
 * On bench / OSS self-hosters with anonymous brokers, the credential
 * stays null and connect() falls back to anonymous.
 * @license GPL-3.0-only
 */

interface MqttBrokerCredential {
  username: string;
  password: string;
}

let current: MqttBrokerCredential | null = null;

/**
 * Set or clear the broker credential. Pass `null` (or an object with
 * missing username/password) to clear.
 */
export function setMqttBrokerCredential(
  next: { username?: string | null; password?: string | null } | null,
): void {
  if (next?.username && next?.password) {
    current = { username: next.username, password: next.password };
  } else {
    current = null;
  }
}

/**
 * Read the current broker credential. Returns `null` when no auth is
 * configured (bench / anonymous broker).
 */
export function getMqttBrokerCredential(): MqttBrokerCredential | null {
  return current;
}
