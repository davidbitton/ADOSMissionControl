/**
 * @module fc-nav-items
 * @description Navigation item registry for the drone configure tab.
 * Lists every available FC sub-panel with its capability gate, section,
 * and per-firmware label overrides. Sub-component of DroneConfigureTab.
 * @license GPL-3.0-only
 */

"use client";

import type { ReactNode } from "react";
import type { ProtocolCapabilities } from "@/lib/protocol/types";
import {
  Cpu,
  Radio,
  SlidersHorizontal,
  ShieldAlert,
  Battery,
  Terminal,
  Activity,
  Cable,
  Monitor,
  Zap,
  Layers,
  Box,
  Shield,
  HeartPulse,
  Gauge,
  Move3d,
  Camera,
  BarChart3,
  Lightbulb,
  Wifi,
  Bug,
  Stethoscope,
  ToggleLeft,
  MapPin,
  Sliders,
  Settings,
  HardDrive,
  Network,
  Home,
} from "lucide-react";

export interface FcNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  requiredCapability?: keyof ProtocolCapabilities;
  section?: string;
  labelOverride?: Partial<Record<string, string>>;
}

export const FC_NAV_ITEMS: FcNavItem[] = [
  // Flight
  { id: "outputs", label: "Outputs", icon: <Cpu size={14} />, section: "Flight", labelOverride: { px4: "Actuators" } },
  { id: "receiver", label: "Receiver", icon: <Radio size={14} />, requiredCapability: "supportsReceiver", section: "Flight" },
  { id: "modes", label: "Flight Modes", icon: <SlidersHorizontal size={14} />, requiredCapability: "supportsFlightModes", section: "Flight" },
  { id: "aux-modes", label: "Aux Modes", icon: <ToggleLeft size={14} />, requiredCapability: "supportsAuxModes", section: "Flight" },
  { id: "bf-motors", label: "Motors & ESC", icon: <Cpu size={14} />, requiredCapability: "supportsBetaflightConfig", section: "Flight" },
  { id: "frame", label: "Frame", icon: <Box size={14} />, section: "Flight", labelOverride: { px4: "Airframe" } },
  // Safety
  { id: "failsafe", label: "Failsafe", icon: <ShieldAlert size={14} />, requiredCapability: "supportsFailsafe", section: "Safety" },
  { id: "geofence", label: "Geofence", icon: <Shield size={14} />, requiredCapability: "supportsGeoFence", section: "Safety" },
  { id: "safehome", label: "Safehome", icon: <Home size={14} />, requiredCapability: "supportsSafehome", section: "Safety" },
  { id: "geozone", label: "Geozones", icon: <MapPin size={14} />, requiredCapability: "supportsGeozone", section: "Safety" },
  { id: "health", label: "Health Check", icon: <HeartPulse size={14} />, section: "Safety" },
  // Sensors
  { id: "sensors", label: "Sensors", icon: <Gauge size={14} />, section: "Sensors" },
  { id: "power", label: "Power", icon: <Battery size={14} />, requiredCapability: "supportsPowerConfig", section: "Sensors" },
  { id: "gps-config", label: "GPS", icon: <MapPin size={14} />, requiredCapability: "supportsGpsConfig", section: "Sensors" },
  { id: "gimbal", label: "Gimbal", icon: <Move3d size={14} />, requiredCapability: "supportsGimbal", section: "Sensors" },
  { id: "camera", label: "Camera", icon: <Camera size={14} />, requiredCapability: "supportsCamera", section: "Sensors" },
  // Tuning
  { id: "pid", label: "PID Tuning", icon: <Activity size={14} />, requiredCapability: "supportsPidTuning", section: "Tuning" },
  { id: "rate-profiles", label: "Rate Profiles", icon: <Activity size={14} />, requiredCapability: "supportsRateProfiles", section: "Tuning" },
  { id: "adjustments", label: "Adjustments", icon: <Sliders size={14} />, requiredCapability: "supportsAdjustments", section: "Tuning" },
  { id: "sensor-graphs", label: "Sensor Graphs", icon: <BarChart3 size={14} />, section: "Tuning" },
  // Display
  { id: "osd", label: "OSD Editor", icon: <Layers size={14} />, requiredCapability: "supportsOsd", section: "Display" },
  { id: "led", label: "LED Strip", icon: <Lightbulb size={14} />, requiredCapability: "supportsLed", section: "Display" },
  { id: "vtx", label: "VTX", icon: <Radio size={14} />, requiredCapability: "supportsVtx", section: "Display" },
  // System
  { id: "ports", label: "Ports", icon: <Cable size={14} />, requiredCapability: "supportsPorts", section: "System" },
  { id: "radio", label: "Radio Config", icon: <Wifi size={14} />, section: "System" },
  { id: "bf-config", label: "Configuration", icon: <Settings size={14} />, requiredCapability: "supportsBetaflightConfig", section: "System" },
  { id: "signing", label: "MAVLink Signing", icon: <Shield size={14} />, section: "Security" },
  { id: "firmware", label: "Firmware", icon: <Zap size={14} />, requiredCapability: "supportsFirmwareFlash", section: "System" },
  { id: "cli", label: "CLI", icon: <Terminal size={14} />, requiredCapability: "supportsCliShell", section: "System", labelOverride: { px4: "Shell" } },
  // Debug
  { id: "mavlink", label: "MAVLink Inspector", icon: <Monitor size={14} />, requiredCapability: "supportsMavlinkInspector", section: "Debug" },
  { id: "blackbox", label: "Blackbox", icon: <HardDrive size={14} />, requiredCapability: "supportsBlackbox", section: "Debug" },
  { id: "debug", label: "Debug", icon: <Bug size={14} />, requiredCapability: "supportsDebugValues", section: "Debug" },
  { id: "diagnostics", label: "Diagnostics", icon: <Stethoscope size={14} />, section: "Debug" },
  { id: "logs", label: "Log Analysis", icon: <BarChart3 size={14} />, section: "Debug" },
  { id: "can", label: "DroneCAN Monitor", icon: <Network size={14} />, requiredCapability: "supportsCanFrame", section: "Debug" },
  // iNav-specific
  { id: "inav-nav-config", label: "Navigation Config", icon: <MapPin size={14} />, requiredCapability: "supportsSettings", section: "Flight" },
  { id: "inav-mission", label: "iNav Mission", icon: <MapPin size={14} />, requiredCapability: "supportsMultiMission", section: "Flight" },
  { id: "inav-mixer-profile", label: "Mixer Profiles", icon: <Cpu size={14} />, requiredCapability: "supportsMixerProfile", section: "Flight" },
  { id: "inav-output-mapping", label: "Output Mapping", icon: <Cpu size={14} />, requiredCapability: "supportsOutputMappingExt", section: "Flight" },
  { id: "inav-servos", label: "Servos (iNav)", icon: <Sliders size={14} />, requiredCapability: "supportsServoMixer", section: "Flight" },
  { id: "inav-failsafe", label: "Failsafe (iNav)", icon: <ShieldAlert size={14} />, requiredCapability: "supportsFailsafe", section: "Safety" },
  { id: "inav-battery-profile", label: "Battery Profiles", icon: <Battery size={14} />, requiredCapability: "supportsBatteryProfile", section: "Sensors" },
  { id: "inav-temp-sensors", label: "Temp Sensors", icon: <Gauge size={14} />, requiredCapability: "supportsTempSensors", section: "Sensors" },
  { id: "inav-control-profile", label: "Control Profiles", icon: <Activity size={14} />, requiredCapability: "supportsSettings", section: "Tuning" },
  { id: "inav-mc-braking", label: "MC Braking", icon: <Activity size={14} />, requiredCapability: "supportsMcBraking", section: "Tuning" },
  { id: "inav-rate-dynamics", label: "Rate Dynamics", icon: <Activity size={14} />, requiredCapability: "supportsRateDynamics", section: "Tuning" },
  { id: "inav-ez-tune", label: "EZ Tune", icon: <Sliders size={14} />, requiredCapability: "supportsEzTune", section: "Tuning" },
  { id: "inav-fw-approach", label: "FW Approach", icon: <MapPin size={14} />, requiredCapability: "supportsFwApproach", section: "Flight" },
  { id: "inav-osd", label: "OSD (iNav)", icon: <Layers size={14} />, requiredCapability: "supportsCustomOsd", section: "Display" },
  { id: "inav-custom-osd", label: "Custom OSD", icon: <Monitor size={14} />, requiredCapability: "supportsCustomOsd", section: "Display" },
  { id: "inav-logic-conditions", label: "Logic Conditions", icon: <Zap size={14} />, requiredCapability: "supportsLogicConditions", section: "Programming" },
  { id: "inav-global-variables", label: "Global Variables", icon: <Activity size={14} />, requiredCapability: "supportsGlobalVariables", section: "Programming" },
  { id: "inav-programming-pid", label: "Programming PIDs", icon: <Sliders size={14} />, requiredCapability: "supportsProgrammingPid", section: "Programming" },
  { id: "inav-nav-pid", label: "Nav PID", icon: <Activity size={14} />, requiredCapability: "supportsPidTuning", section: "Tuning" },
];
