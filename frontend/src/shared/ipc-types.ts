/**
 * Entropic v2 — IPC message types for ZMQ command channel.
 * Matches IPC-PROTOCOL.md.
 */
import type { EffectInstance, Project } from "./types";

// --- Commands (Electron → Python) ---

export type Command =
  | { cmd: "ping"; id: string }
  | { cmd: "shutdown"; id: string }
  | { cmd: "flush_state"; id: string; project: Project }
  | { cmd: "ingest"; id: string; path: string }
  | { cmd: "seek"; id: string; path: string; time: number }
  | {
      cmd: "render_frame";
      id: string;
      path: string;
      time: number;
      chain: EffectInstance[];
      project_seed?: number;
    }
  | {
      cmd: "render_range";
      id: string;
      start: number;
      end: number;
      chain: EffectInstance[];
      fps: number;
    }
  | { cmd: "list_effects"; id: string }
  | {
      cmd: "apply_chain";
      id: string;
      frame_index: number;
      chain: EffectInstance[];
    }
  | {
      cmd: "export_start";
      id: string;
      path: string;
      codec: string;
      bitrate?: number;
      resolution?: [number, number];
      chain: EffectInstance[];
      in_point: number;
      out_point: number;
    }
  | { cmd: "export_status"; id: string; job_id: string }
  | { cmd: "export_cancel"; id: string; job_id: string }
  | {
      cmd: "audio_decode";
      id: string;
      asset_id: string;
      start: number;
      duration: number;
    }
  | { cmd: "audio_analyze"; id: string; asset_id: string; time: number };

// --- Responses (Python → Electron) ---

export type SuccessResponse = {
  id: string;
  ok: true;
  [key: string]: unknown;
};

export type ErrorResponse = {
  id: string;
  ok: false;
  error: string;
};

export type Response = SuccessResponse | ErrorResponse;

export interface PingResponse {
  id: string;
  status: "alive" | "busy";
  uptime_s: number;
  last_frame_ms: number;
}

export interface IngestResponse {
  id: string;
  ok: true;
  width: number;
  height: number;
  fps: number;
  duration_s: number;
  codec: string;
  has_audio: boolean;
  frame_count: number;
}
