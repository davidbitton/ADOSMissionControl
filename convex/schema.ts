import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.string(),
    role: v.union(
      v.literal("pending"),
      v.literal("investor"),
      v.literal("admin"),
      v.literal("rejected"),
      v.literal("pilot"),
      v.literal("alpha_tester")
    ),
fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    showName: v.optional(v.boolean()),
    showEmail: v.optional(v.boolean()),
    showLinkedin: v.optional(v.boolean()),
    showPhone: v.optional(v.boolean()),
    investorType: v.optional(v.string()),
    investorTypeOther: v.optional(v.string()),
    ticketSize: v.optional(v.string()),
    notifyUpdates: v.boolean(),
    notifyMilestones: v.boolean(),
  }).index("by_userId", ["userId"]),

  contactSubmissions: defineTable({
    name: v.string(),
    email: v.string(),
    subject: v.optional(v.string()),
    message: v.string(),
    source: v.optional(v.string()),
    company: v.optional(v.string()),
    investorType: v.optional(v.string()),
    linkedin: v.optional(v.string()),
  }),

  comments: defineTable({
    targetType: v.union(
      v.literal("update"),
      v.literal("milestone"),
      v.literal("document"),
      v.literal("general"),
      v.literal("grant"),
      v.literal("changelog"),
      v.literal("community_item")
    ),
    targetId: v.string(),
    authorId: v.id("profiles"),
    body: v.string(),
    deleted: v.optional(v.boolean()),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_author", ["authorId"]),

  // ── Community tables ────────────────────────────────────────

  community_changelog: defineTable({
    version: v.string(),
    title: v.string(),
    body: v.string(),
    bodyHtml: v.optional(v.string()),
    publishedAt: v.number(),
    authorId: v.id("profiles"),
    authorName: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    published: v.boolean(),
    source: v.optional(v.union(v.literal("auto"), v.literal("manual"))),
    commitShas: v.optional(v.array(v.string())),
    commitSha: v.optional(v.string()),
    commitUrl: v.optional(v.string()),
    commitDate: v.optional(v.number()),
    editedByAdmin: v.optional(v.boolean()),
    repo: v.optional(v.string()),
    translations: v.optional(v.record(v.string(), v.object({
      title: v.string(),
      description: v.string(),
    }))),
  })
    .index("by_publishedAt", ["published", "publishedAt"])
    .index("by_version", ["version"])
    .index("by_commitSha", ["commitSha"]),

  changelog_sync_state: defineTable({
    lastSyncedSha: v.string(),
    lastSyncedAt: v.number(),
    repo: v.string(),
  }).index("by_repo", ["repo"]),

  community_items: defineTable({
    type: v.union(v.literal("feature"), v.literal("bug")),
    title: v.string(),
    body: v.string(),
    authorId: v.id("profiles"),
    status: v.union(
      v.literal("backlog"),
      v.literal("in_discussion"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("released"),
      v.literal("wont_do"),
    ),
    category: v.union(
      v.literal("command"),
      v.literal("ados"),
      v.literal("website"),
      v.literal("general"),
    ),
    priority: v.optional(v.union(
      v.literal("low"), v.literal("medium"),
      v.literal("high"), v.literal("critical"),
    )),
    upvoteCount: v.number(),
    eta: v.optional(v.string()),
    resolvedVersion: v.optional(v.string()),
    translations: v.optional(v.record(v.string(), v.object({
      title: v.string(),
      description: v.string(),
    }))),
  })
    .index("by_type_status", ["type", "status"])
    .index("by_type_upvotes", ["type", "upvoteCount"])
    .index("by_category", ["category"])
    .index("by_status", ["status"]),

  community_upvotes: defineTable({
    itemId: v.id("community_items"),
    userId: v.string(),
  })
    .index("by_item", ["itemId"])
    .index("by_user_item", ["userId", "itemId"]),

  changelog_reactions: defineTable({
    changelogId: v.id("community_changelog"),
    userId: v.string(),
    reaction: v.string(),
  })
    .index("by_changelog", ["changelogId"])
    .index("by_user_changelog", ["userId", "changelogId"]),

  // ── Command GCS tables (cmd_ prefix) ───────────────────────

  cmd_missions: defineTable({
    userId: v.string(),
    name: v.string(),
    waypoints: v.array(v.object({
      id: v.string(),
      lat: v.number(),
      lon: v.number(),
      alt: v.number(),
      speed: v.optional(v.number()),
      holdTime: v.optional(v.number()),
      command: v.optional(v.string()),
      param1: v.optional(v.number()),
      param2: v.optional(v.number()),
      param3: v.optional(v.number()),
    })),
    droneId: v.optional(v.string()),
    suiteType: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  cmd_connectionPresets: defineTable({
    userId: v.string(),
    name: v.string(),
    type: v.union(v.literal("serial"), v.literal("websocket")),
    config: v.object({
      baudRate: v.optional(v.number()),
      url: v.optional(v.string()),
    }),
  }).index("by_userId", ["userId"]),

  cmd_flightLogs: defineTable({
    userId: v.string(),
    /** FlightRecord.id from the client (UUID). Stable across sync. */
    clientId: v.string(),
    droneId: v.string(),
    droneName: v.string(),
    suiteType: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    distance: v.number(),
    maxAlt: v.number(),
    maxSpeed: v.number(),
    avgSpeed: v.optional(v.number()),
    batteryUsed: v.number(),
    batteryStartV: v.optional(v.number()),
    batteryEndV: v.optional(v.number()),
    waypointCount: v.number(),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("aborted"),
      v.literal("emergency"),
    ),
    // Geo
    takeoffLat: v.optional(v.number()),
    takeoffLon: v.optional(v.number()),
    landingLat: v.optional(v.number()),
    landingLon: v.optional(v.number()),
    /** Downsampled track: [[lat, lon], ...]. */
    path: v.optional(v.array(v.array(v.number()))),
    // Recording linkage
    recordingId: v.optional(v.string()),
    hasTelemetry: v.optional(v.boolean()),
    // Analyzer (Phase 5)
    events: v.optional(
      v.array(
        v.object({
          t: v.number(),
          type: v.string(),
          severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
          label: v.string(),
          data: v.optional(v.any()),
        }),
      ),
    ),
    flags: v.optional(
      v.array(
        v.object({
          type: v.string(),
          severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
          message: v.string(),
          suggestion: v.optional(v.string()),
        }),
      ),
    ),
    health: v.optional(
      v.object({
        avgSatellites: v.optional(v.number()),
        avgHdop: v.optional(v.number()),
        maxVibrationRms: v.optional(v.number()),
        batteryHealthPct: v.optional(v.number()),
      }),
    ),
    // User metadata
    customName: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    favorite: v.optional(v.boolean()),
    // Frozen pilot/aircraft snapshot (Phase 7a)
    pilotFirstName: v.optional(v.string()),
    pilotLastName: v.optional(v.string()),
    pilotLicenseNumber: v.optional(v.string()),
    pilotLicenseIssuer: v.optional(v.string()),
    aircraftRegistration: v.optional(v.string()),
    aircraftSerial: v.optional(v.string()),
    aircraftMtomKg: v.optional(v.number()),
    // Sign-and-lock (Phase 7c-3)
    pilotSignedAt: v.optional(v.number()),
    pilotSignatureHash: v.optional(v.string()),
    // Phase 11 — origin tracking for imported records.
    source: v.optional(
      v.union(v.literal("live"), v.literal("dataflash"), v.literal("imported"), v.literal("ulog"), v.literal("tlog")),
    ),
    sourceFilename: v.optional(v.string()),
    // Phase 12c — frozen loadout snapshot at arm time.
    loadout: v.optional(
      v.object({
        batteryIds: v.optional(v.array(v.string())),
        propSetId: v.optional(v.string()),
        motorSetId: v.optional(v.string()),
        escSetId: v.optional(v.string()),
        cameraId: v.optional(v.string()),
        gimbalId: v.optional(v.string()),
        payloadId: v.optional(v.string()),
        frameId: v.optional(v.string()),
        rcTxId: v.optional(v.string()),
      }),
    ),
    // Phase 14a — sun / moon environmental snapshot.
    sunMoon: v.optional(
      v.object({
        computedAt: v.string(),
        lat: v.number(),
        lon: v.number(),
        sunriseIso: v.optional(v.string()),
        sunsetIso: v.optional(v.string()),
        civilDawnIso: v.optional(v.string()),
        civilDuskIso: v.optional(v.string()),
        goldenHourMorningStartIso: v.optional(v.string()),
        goldenHourMorningEndIso: v.optional(v.string()),
        goldenHourEveningStartIso: v.optional(v.string()),
        goldenHourEveningEndIso: v.optional(v.string()),
        daylightPhase: v.union(
          v.literal("day"),
          v.literal("civil_twilight"),
          v.literal("nautical_twilight"),
          v.literal("astronomical_twilight"),
          v.literal("night"),
        ),
        inGoldenHour: v.boolean(),
        sunAltitudeDeg: v.number(),
        sunAzimuthDeg: v.number(),
        moonPhase: v.number(),
        moonIllumination: v.number(),
        moonPhaseLabel: v.string(),
        moonAltitudeDeg: v.number(),
        moonAzimuthDeg: v.number(),
      }),
    ),
    // Phase 14b — METAR weather snapshot at arm time.
    weatherSnapshot: v.optional(
      v.object({
        observedAt: v.string(),
        stationIcao: v.string(),
        stationName: v.optional(v.string()),
        stationLat: v.optional(v.number()),
        stationLon: v.optional(v.number()),
        stationDistanceKm: v.optional(v.number()),
        tempC: v.optional(v.number()),
        dewPointC: v.optional(v.number()),
        windDirDeg: v.optional(v.number()),
        windKts: v.optional(v.number()),
        gustKts: v.optional(v.number()),
        visibilityMi: v.optional(v.number()),
        ceilingFtAgl: v.optional(v.number()),
        altimeterHpa: v.optional(v.number()),
        flightCategory: v.optional(
          v.union(
            v.literal("VFR"),
            v.literal("MVFR"),
            v.literal("IFR"),
            v.literal("LIFR"),
          ),
        ),
        rawMetar: v.optional(v.string()),
        error: v.optional(v.string()),
      }),
    ),
    // Phase 16b — mission adherence (intended vs actual).
    missionId: v.optional(v.string()),
    missionName: v.optional(v.string()),
    missionWaypoints: v.optional(
      v.array(
        v.object({
          lat: v.number(),
          lon: v.number(),
          alt: v.number(),
        }),
      ),
    ),
    adherence: v.optional(
      v.object({
        totalWaypoints: v.number(),
        waypointsReached: v.number(),
        maxCrossTrackErrorM: v.number(),
        meanCrossTrackErrorM: v.number(),
        deviationSegments: v.optional(
          v.array(
            v.object({
              startIdx: v.number(),
              endIdx: v.number(),
              maxErrorM: v.number(),
            }),
          ),
        ),
      }),
    ),
    // Phase 16c — geofence forensics.
    geofenceSnapshot: v.optional(
      v.object({
        enabled: v.boolean(),
        maxAltitude: v.optional(v.number()),
        minAltitude: v.optional(v.number()),
        zones: v.optional(
          v.array(
            v.object({
              id: v.string(),
              role: v.union(v.literal("inclusion"), v.literal("exclusion")),
              type: v.union(v.literal("polygon"), v.literal("circle")),
              polygonPoints: v.optional(v.array(v.array(v.number()))),
              circleCenter: v.optional(v.array(v.number())),
              circleRadius: v.optional(v.number()),
            }),
          ),
        ),
      }),
    ),
    geofenceBreaches: v.optional(
      v.array(
        v.object({
          startIdx: v.number(),
          endIdx: v.number(),
          type: v.union(
            v.literal("polygon_outside"),
            v.literal("polygon_inside"),
            v.literal("circle_outside"),
            v.literal("circle_inside"),
            v.literal("max_altitude"),
            v.literal("min_altitude"),
          ),
          zoneId: v.string(),
          maxBreachDistanceM: v.optional(v.number()),
          peakIdx: v.optional(v.number()),
        }),
      ),
    ),
    // Phase 16a — flight phase segmentation.
    phases: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("pre_arm"),
            v.literal("takeoff"),
            v.literal("climb"),
            v.literal("cruise"),
            v.literal("hover"),
            v.literal("descent"),
            v.literal("land"),
            v.literal("post_disarm"),
          ),
          startMs: v.number(),
          endMs: v.number(),
          avgSpeed: v.optional(v.number()),
          maxAlt: v.optional(v.number()),
        }),
      ),
    ),
    // Phase 16d — wind estimation from FC telemetry.
    windEstimate: v.optional(
      v.object({
        speedMs: v.number(),
        fromDirDeg: v.number(),
        sampleCount: v.number(),
        method: v.union(v.literal("vfr_diff"), v.literal("attitude_track")),
      }),
    ),
    // Phase 20a — media files linked to this flight (metadata only, blobs stay in IDB).
    media: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
          capturedAt: v.number(),
          lat: v.optional(v.number()),
          lon: v.optional(v.number()),
          alt: v.optional(v.number()),
          blobKey: v.string(),
        }),
      ),
    ),
    // Phase 26b — soft-delete.
    deleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    // Phase 15 — reverse-geocoded place names from takeoff / landing coords.
    takeoffPlaceName: v.optional(v.string()),
    landingPlaceName: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    locality: v.optional(v.string()),
    // Phase 13 — frozen pre-flight checklist + prearm bitmask snapshot.
    preflight: v.optional(
      v.object({
        checklistSessionId: v.optional(v.string()),
        checklistStartedAt: v.optional(v.number()),
        checklistComplete: v.optional(v.boolean()),
        checklistItems: v.optional(
          v.array(
            v.object({
              id: v.string(),
              category: v.string(),
              label: v.string(),
              status: v.union(
                v.literal("pending"),
                v.literal("pass"),
                v.literal("fail"),
                v.literal("skipped"),
              ),
              type: v.union(v.literal("auto"), v.literal("manual")),
              displayValue: v.optional(v.string()),
            }),
          ),
        ),
        sysStatusHealth: v.optional(v.number()),
        sysStatusPresent: v.optional(v.number()),
        sysStatusEnabled: v.optional(v.number()),
        prearmFailures: v.optional(v.array(v.string())),
      }),
    ),
    /** Last mutation time (client-side). Server uses this for last-write-wins conflict resolution. */
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"])
    .index("by_user_startTime", ["userId", "startTime"]),

  cmd_preferences: defineTable({
    userId: v.string(),
    preferences: v.object({
      mapTileSource: v.optional(v.string()),
      units: v.optional(v.string()),
      defaultAlt: v.optional(v.number()),
      defaultSpeed: v.optional(v.number()),
      defaultAcceptRadius: v.optional(v.number()),
      defaultFrame: v.optional(v.string()),
    }),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  cmd_ai_usage: defineTable({
    userId: v.string(),
    feature: v.string(),
    usedAt: v.number(),
  }).index("by_userId_feature", ["userId", "feature"]),

  // ── ADOS Pairing tables (cmd_ prefix) ──────────────────────

  cmd_drones: defineTable({
    userId: v.string(),
    deviceId: v.string(),
    name: v.string(),
    apiKey: v.string(),
    agentVersion: v.optional(v.string()),
    board: v.optional(v.string()),
    tier: v.optional(v.number()),
    os: v.optional(v.string()),
    mdnsHost: v.optional(v.string()),
    lastIp: v.optional(v.string()),
    lastSeen: v.optional(v.number()),
    fcConnected: v.optional(v.boolean()),
    // Backend variant. Synced from cmd_droneStatus heartbeats so the
    // fleet view can show a "Lite" pill without an extra query.
    runtimeMode: v.optional(v.string()),
    // Attached panel type derived from cmd_droneStatus.peripherals[].
    // Drives the "LCD" pill on the fleet drone card without an extra
    // query. One of "spi-lcd", "hdmi", "none", or undefined.
    attachedDisplayType: v.optional(v.string()),
    // How the agent landed on its current profile. Synced from
    // cmd_droneStatus heartbeats so the fleet card can render an
    // "auto" pill without an extra query. One of "detected",
    // "tiebreaker", "default", "override", "user", or undefined.
    profileSource: v.optional(v.string()),
    pairedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_deviceId", ["deviceId"]),

  // ── Cloud relay tables (cmd_ prefix) ──────────────────────

  cmd_droneStatus: defineTable({
    deviceId: v.string(),
    version: v.string(),
    uptimeSeconds: v.number(),
    boardName: v.optional(v.string()),
    boardTier: v.optional(v.number()),
    boardSoc: v.optional(v.string()),
    boardArch: v.optional(v.string()),
    cpuPercent: v.optional(v.number()),
    memoryPercent: v.optional(v.number()),
    diskPercent: v.optional(v.number()),
    temperature: v.optional(v.float64()),
    fcConnected: v.optional(v.boolean()),
    fcPort: v.optional(v.string()),
    fcBaud: v.optional(v.number()),
    // Absolute resource values
    memoryUsedMb: v.optional(v.number()),
    memoryTotalMb: v.optional(v.number()),
    diskUsedGb: v.optional(v.number()),
    diskTotalGb: v.optional(v.number()),
    cpuCores: v.optional(v.number()),
    boardRamMb: v.optional(v.number()),
    // Process-level totals (single-process architecture)
    processCpuPercent: v.optional(v.number()),
    processMemoryMb: v.optional(v.number()),
    // History arrays for sparkline charts (last 60 samples, 5s interval = 5 min)
    cpuHistory: v.optional(v.array(v.number())),
    memoryHistory: v.optional(v.array(v.number())),
    services: v.optional(v.array(v.object({
      name: v.string(),
      status: v.string(),
      cpuPercent: v.optional(v.number()),
      memoryMb: v.optional(v.number()),
      uptimeSeconds: v.optional(v.number()),
      pid: v.optional(v.number()),
      category: v.optional(v.string()),
    }))),
    lastIp: v.optional(v.string()),
    mdnsHost: v.optional(v.string()),
    setupUrl: v.optional(v.string()),
    apiUrl: v.optional(v.string()),
    missionControlUrl: v.optional(v.string()),
    // Video pipeline status for GCS auto-discovery
    videoState: v.optional(v.string()),
    videoWhepPort: v.optional(v.number()),
    videoWhepUrl: v.optional(v.string()),
    // Count of pipeline restarts since the last healthy interval.
    // Resets to zero on the agent side once video stays up for the
    // configured cool-down. The GCS surfaces a banner when the count
    // crosses an unhealthy threshold so operators can spot a flapping
    // pipeline without trawling logs.
    videoRestartAttempts: v.optional(v.number()),
    mavlinkWsPort: v.optional(v.number()),
    mavlinkWsUrl: v.optional(v.string()),
    // Previous MAVLink WebSocket URL the agent advertised. Populated
    // when the agent rotates its WebSocket binding (port change,
    // network move). Lets the GCS retry the prior URL once before
    // surfacing a connection error so a brief rotation doesn't drop
    // an in-flight session.
    mavlinkWsUrlPrev: v.optional(v.string()),
    remoteAccess: v.optional(v.any()),
    peripherals: v.optional(v.any()),
    scripts: v.optional(v.any()),
    suites: v.optional(v.any()),
    enrollment: v.optional(v.any()),
    peers: v.optional(v.any()),
    telemetry: v.optional(v.any()),
    logs: v.optional(v.any()),
    // Backend variant the agent process is running. "lite" hides
    // the plugin host, peripheral manager, scripting, and ROS surfaces
    // in Mission Control. Absent values default to "full".
    runtimeMode: v.optional(v.string()),
    // True when the agent's foxglove_bridge process failed to bind
    // its WebSocket port at last restart. Surfaced in the ROS tab so
    // operators can spot a port collision without opening journal
    // logs. Undefined for agents that predate the probe.
    foxgloveBindFailed: v.optional(v.boolean()),
    // Pairing/uplink failover state. "local" = steady wireless link.
    // "cloud_relay" = local supervisor fell over to the cloud heartbeat
    // path; the GCS shows a notice with a retry control. "failed" =
    // both paths down. Undefined for agents that predate the failover
    // supervisor; the GCS treats absent as "local".
    wfbFailoverState: v.optional(v.string()),
    // Setup wizard state on the agent. Live agents report "configured"
    // once the universal webapp wizard has been completed. Older agents
    // omit this and the GCS treats them as configured by default.
    setupState: v.optional(v.string()),
    // How the agent landed on its current profile. One of "detected"
    // (auto-detected by hardware fingerprint), "tiebreaker" (auto with
    // ambiguous signals), "default" (no detect signals, fell back),
    // "override" (forced via /etc/ados/board_override), or "user"
    // (operator picked in the setup webapp).
    profileSource: v.optional(v.string()),
    // Radio link snapshot from the air-side WFB-ng pipeline. Populated
    // from the agent heartbeat when the radio service is running. Field
    // names are camelCase here even though the agent emits snake_case
    // on the wire; the cloud relay HTTP action remaps the keys before
    // calling pushStatus.
    radio: v.optional(v.object({
      state: v.string(),
      iface: v.union(v.string(), v.null()),
      driver: v.union(v.string(), v.null()),
      channel: v.union(v.number(), v.null()),
      freqMhz: v.union(v.number(), v.null()),
      bandwidthMhz: v.number(),
      txPowerDbm: v.union(v.number(), v.null()),
      txPowerMaxDbm: v.number(),
      topology: v.string(),
      rssiDbm: v.union(v.number(), v.null()),
      bitrateKbps: v.union(v.number(), v.null()),
      fecRecovered: v.number(),
      fecLost: v.number(),
      packetsLost: v.number(),
      // Pair-state surface added in agent v0.16. Old rows from
      // pre-0.16 heartbeats lack these fields; the cloud relay
      // remap leaves them undefined and the GCS treats them as
      // "unpaired". v.optional + v.union(...,v.null()) covers both
      // shapes the relay may forward (missing key vs explicit null).
      paired: v.optional(v.boolean()),
      pairedWithDeviceId: v.optional(v.union(v.string(), v.null())),
      pairedAt: v.optional(v.union(v.string(), v.null())),
      publicKeyFingerprint: v.optional(v.union(v.string(), v.null())),
      autoPairEnabled: v.optional(v.union(v.boolean(), v.null())),
    })),
    // Local SPI LCD surface state. Reported by the agent's OLED/LCD
    // service when a panel is attached and the renderer is active.
    // All fields are optional so heartbeats from agents without a
    // local display (or pre-LCD agent versions) leave them undefined.
    lcdActivePage: v.optional(v.string()),
    lcdTouchCalibrated: v.optional(v.boolean()),
    lcdRotation: v.optional(v.number()),
    lcdSnapshotUrl: v.optional(v.string()),
    lcdLastTouchAt: v.optional(v.number()),
    lcdLastGesture: v.optional(v.string()),
    // Local on-board video surface (the LCD video page tap). Reports
    // whether the agent is decoding a stream locally for the panel and
    // whether a recording is in progress. Independent of the WHEP
    // browser stream advertised via videoState/videoWhepUrl.
    videoLocalDecoderActive: v.optional(v.boolean()),
    videoLocalDecoderType: v.optional(v.string()),
    videoLocalDecoderFps: v.optional(v.number()),
    videoRecording: v.optional(v.boolean()),
    // Operator-selected UI theme on the agent. Mirrored back so the
    // GCS can reflect the same theme on its own surfaces and the
    // welcome flow can detect drift.
    uiTheme: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_deviceId", ["deviceId"]),

  cmd_droneCommands: defineTable({
    deviceId: v.string(),
    userId: v.string(),
    command: v.string(),
    args: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    result: v.optional(v.object({
      success: v.boolean(),
      message: v.string(),
    })),
    data: v.optional(v.any()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_deviceId_status", ["deviceId", "status"])
    .index("by_deviceId_createdAt", ["deviceId", "createdAt"]),

  cmd_pairingRequests: defineTable({
    deviceId: v.optional(v.string()),
    pairingCode: v.string(),
    agentName: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    board: v.optional(v.string()),
    tier: v.optional(v.number()),
    os: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    mdnsHost: v.optional(v.string()),
    localIp: v.optional(v.string()),
    expiresAt: v.number(),
    // Agent-authoritative pairing-code expiry (epoch seconds) lifted
    // from the beacon body. The server-side expiresAt above is the
    // cloud-relay TTL; this field mirrors what the agent's local
    // wizard is showing the operator so the GCS countdown matches the
    // physical device. Optional so legacy beacons keep registering.
    pairingCodeExpiresAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
  })
    .index("by_pairingCode", ["pairingCode"])
    .index("by_deviceId", ["deviceId"])
    .index("by_createdBy", ["createdBy"]),

  // Legacy rows for MAVLink v2 signing-key cloud sync. New plaintext uploads
  // are disabled until encrypted storage is available. Function logs MUST NOT
  // echo keyHex. See convex/cmdSigningKeys.ts.
  cmd_signingKeys: defineTable({
    userId: v.string(),
    droneId: v.string(),
    keyHex: v.string(),                   // 64-char hex, plaintext (v1 trust model)
    keyId: v.string(),                    // 8-char sha256 fingerprint, log-safe
    linkIdOwner: v.number(),              // this row's owning link_id
    linkIdsInUse: v.array(v.number()),    // every link_id claimed by any device for this drone
    enrolledAt: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_drone", ["userId", "droneId"]),

  // Append-only audit log for signing events. Log-safe fields only:
  // keyId (8-char fingerprint) is stored, keyHex is NEVER stored here.
  // Compliance exports read this table to produce a timeline of every
  // signing action per drone per user.
  cmd_signingEvents: defineTable({
    userId: v.string(),
    droneId: v.string(),
    eventType: v.union(
      v.literal("enrollment"),
      v.literal("rotation"),
      v.literal("import"),
      v.literal("export"),
      v.literal("disable"),
      v.literal("cloud_sync_on"),
      v.literal("cloud_sync_off"),
      v.literal("clear_fc"),
      v.literal("key_mismatch_detected"),
      v.literal("user_purge_on_signout"),
      v.literal("fc_rejected_enrollment"),
      v.literal("require_on"),
      v.literal("require_off"),
    ),
    keyIdOld: v.optional(v.string()),
    keyIdNew: v.optional(v.string()),
    deviceFingerprint: v.string(),        // hashed browser id, not raw
    createdAt: v.number(),
  })
    .index("by_user_drone", ["userId", "droneId"])
    .index("by_user_created", ["userId", "createdAt"]),

  // Plugin install record. One row per (user, droneId, pluginId). The
  // GCS reads this to decide which plugins to mount and where; the
  // agent writes status updates through cloud relay or the user's
  // hosted Convex deployment.
  cmd_pluginInstalls: defineTable({
    userId: v.string(),
    droneId: v.optional(v.string()),       // null = GCS-only plugin
    pluginId: v.string(),                  // reverse-DNS, e.g. com.flir.thermal
    version: v.string(),                   // semver
    name: v.string(),
    risk: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    source: v.union(
      v.literal("local_file"),
      v.literal("git_url"),
      v.literal("registry"),
      v.literal("builtin")
    ),
    sourceUri: v.optional(v.string()),
    signerId: v.optional(v.string()),
    manifestHash: v.string(),              // sha256 of manifest yaml
    status: v.union(
      v.literal("installed"),              // unpacked, perms not granted
      v.literal("enabled"),                // perms granted, awaiting start
      v.literal("running"),
      v.literal("disabled"),
      v.literal("crashed"),
      v.literal("removed")
    ),
    bundleStorageId: v.optional(v.id("_storage")),  // GCS half blob, if any
    halves: v.array(v.union(v.literal("agent"), v.literal("gcs"))),
    installedAt: v.number(),
    enabledAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_plugin", ["userId", "pluginId"])
    .index("by_drone", ["droneId"])
    .index("by_installed_at", ["installedAt"]),

  // Per-permission grant. Two-stage install dialog records each
  // declared permission as a row with granted=false; operator approval
  // flips granted=true and stamps grantedAt + grantedBy.
  cmd_pluginPermissions: defineTable({
    userId: v.string(),
    pluginInstallId: v.id("cmd_pluginInstalls"),
    pluginId: v.string(),                  // denormalized for fast filter
    permissionId: v.string(),              // e.g. event.publish
    granted: v.boolean(),
    required: v.boolean(),
    grantedAt: v.optional(v.number()),
    grantedBy: v.optional(v.string()),     // userId of approver
    revokedAt: v.optional(v.number()),
  })
    .index("by_install", ["pluginInstallId"])
    .index("by_user_plugin", ["userId", "pluginId"])
    .index("by_install_perm", ["pluginInstallId", "permissionId"]),

  // Append-only event log per plugin: lifecycle, capability denials,
  // crashes, operator actions. TTL 30 days enforced by `cleanup_pluginEvents`
  // cron (added when the cleanup function lands).
  cmd_pluginEvents: defineTable({
    userId: v.string(),
    pluginInstallId: v.id("cmd_pluginInstalls"),
    pluginId: v.string(),
    type: v.union(
      v.literal("installed"),
      v.literal("enabled"),
      v.literal("disabled"),
      v.literal("removed"),
      v.literal("started"),
      v.literal("stopped"),
      v.literal("crashed"),
      v.literal("permission_granted"),
      v.literal("permission_revoked"),
      v.literal("permission_denied"),
      v.literal("update_available"),
      v.literal("update_applied"),
      v.literal("operator_note")
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error")
    ),
    message: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_install", ["pluginInstallId"])
    .index("by_user_plugin", ["userId", "pluginId"])
    .index("by_install_type", ["pluginInstallId", "type"])
    .index("by_user_created", ["userId", "createdAt"]),
});
